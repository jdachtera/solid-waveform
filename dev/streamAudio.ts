// Progressive audio loading for the demo: decode an .m4a/.mp4 (AAC) while it is
// still downloading, so the waveform can draw as the audio arrives.
//
// It works when the file is "fast start" — its index (the moov box) comes before
// the audio (mdat) — and the browser has WebCodecs' AudioDecoder. The index lists
// every AAC packet's size and position, so each packet can be decoded the moment
// its bytes are in. Anything else (no AudioDecoder, the index at the end, another
// format, a parse it can't follow) falls back to downloading the whole file and
// decodeAudioData, reported through the same callbacks.

export type StreamedAudio = {
  duration: number;
  sampleRate: number;
  /** One array per channel, allocated at full length and filled as audio decodes. */
  channels: Float32Array[];
};

export type StreamCallbacks = {
  /** The duration is known and the arrays are allocated (still empty). */
  onStart: (audio: StreamedAudio) => void;
  /** Frames 0..loaded of every channel now hold audio. */
  onProgress: (loaded: number) => void;
  signal?: AbortSignal;
};

/** Streams `url` into the callbacks and resolves with the complete AudioBuffer. */
export async function streamAudio(
  url: string,
  context: BaseAudioContext,
  callbacks: StreamCallbacks,
): Promise<AudioBuffer> {
  const response = await fetch(url, { signal: callbacks.signal });
  if (!response.ok || !response.body) throw new Error(`Failed to load ${url}: ${response.status}`);

  const total = Number(response.headers.get("content-length")) || 0;
  const bytes = new GrowingBytes(total);
  const reader = response.body.getReader();

  const read = async () => {
    const { done, value } = await reader.read();
    if (value) bytes.append(value);
    return !done;
  };

  // Read until the index is in, or until it's clear it won't come first.
  let index: Mp4AudioIndex | undefined;
  let streamable = typeof AudioDecoder !== "undefined";
  let more = true;
  while (streamable && !index && more) {
    more = await read();
    const found = findTopLevelBox(bytes.view(), "moov");
    if (found === "absent") streamable = false; // mdat first, or not an MP4 at all
    else if (found) {
      try {
        index = parseMp4AudioIndex(bytes.view(), found.start, found.end);
        const support = await AudioDecoder.isConfigSupported(index.config);
        if (!support.supported) index = undefined;
      } catch {
        index = undefined;
      }
      if (!index) streamable = false;
    }
  }

  console.info(
    index
      ? `streamAudio: decoding ${url} as it downloads (${index.config.codec}, ${index.packets.length} packets)`
      : `streamAudio: ${url} can't be streamed here; decoding it once downloaded`,
  );

  if (!index) {
    while (more) more = await read();
    return decodeWhole(bytes.view(), context, callbacks);
  }

  return decodeStreaming(index, bytes, read, more, context, callbacks);
}

async function decodeWhole(
  data: Uint8Array,
  context: BaseAudioContext,
  { onStart, onProgress }: StreamCallbacks,
) {
  // decodeAudioData detaches what it is given, so hand it a copy.
  const buffer = await context.decodeAudioData(data.slice().buffer);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  onStart({ duration: buffer.duration, sampleRate: buffer.sampleRate, channels });
  onProgress(buffer.length);
  return buffer;
}

async function decodeStreaming(
  index: Mp4AudioIndex,
  bytes: GrowingBytes,
  read: () => Promise<boolean>,
  more: boolean,
  context: BaseAudioContext,
  { onStart, onProgress, signal }: StreamCallbacks,
): Promise<AudioBuffer> {
  let channels: Float32Array[] | undefined;
  let sampleRate = 0;
  let written = 0;
  // Leading frames the edit list says to skip (the encoder's priming delay).
  let toSkip = 0;
  let failure: unknown;

  // Progress is reported at most once a frame; the waveform redraws on each.
  let progressScheduled = false;
  const reportProgress = () => {
    if (progressScheduled) return;
    progressScheduled = true;
    requestAnimationFrame(() => {
      progressScheduled = false;
      onProgress(written);
    });
  };

  const decoder = new AudioDecoder({
    output: (audio) => {
      try {
        if (!channels) {
          sampleRate = audio.sampleRate;
          toSkip = Math.round(index.skipSeconds * sampleRate);
          const length = Math.ceil(index.duration * sampleRate);
          channels = Array.from({ length: audio.numberOfChannels }, () => new Float32Array(length));
          onStart({ duration: index.duration, sampleRate, channels });
        }
        const frames = audio.numberOfFrames;
        const skip = Math.min(toSkip, frames);
        toSkip -= skip;
        const count = Math.min(frames - skip, channels[0].length - written);
        if (count > 0) {
          const plane = new Float32Array(frames);
          channels.forEach((channel, c) => {
            audio.copyTo(plane, { planeIndex: c, format: "f32-planar" });
            channel.set(plane.subarray(skip, skip + count), written);
          });
          written += count;
          reportProgress();
        }
      } finally {
        audio.close();
      }
    },
    error: (error) => (failure = error),
  });
  decoder.configure(index.config);

  let next = 0;
  const decodeAvailable = () => {
    while (next < index.packets.length) {
      const packet = index.packets[next];
      if (packet.offset + packet.size > bytes.length) break;
      decoder.decode(
        new EncodedAudioChunk({
          type: "key",
          timestamp: packet.timestamp,
          data: bytes.view().subarray(packet.offset, packet.offset + packet.size),
        }),
      );
      next++;
    }
  };

  decodeAvailable();
  while (more && next < index.packets.length) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (failure) throw failure;
    more = await read();
    decodeAvailable();
  }
  await decoder.flush();
  decoder.close();
  if (failure) throw failure;
  if (!channels) throw new Error("No audio decoded");

  // Done: any frames the allocation had beyond what decoded are silence, not
  // audio still to come.
  onProgress(channels[0].length);
  const buffer = context.createBuffer(channels.length, Math.max(1, written), sampleRate);
  channels.forEach((channel, c) => buffer.copyToChannel(channel.subarray(0, written), c));
  return buffer;
}

// ---------------------------------------------------------------------------
// Bytes as they arrive, addressable by file offset.

class GrowingBytes {
  private data: Uint8Array;
  length = 0;

  constructor(expected: number) {
    this.data = new Uint8Array(expected || 1 << 20);
  }

  append(chunk: Uint8Array) {
    if (this.length + chunk.length > this.data.length) {
      const grown = new Uint8Array(Math.max(this.data.length * 2, this.length + chunk.length));
      grown.set(this.data.subarray(0, this.length));
      this.data = grown;
    }
    this.data.set(chunk, this.length);
    this.length += chunk.length;
  }

  view() {
    return this.data.subarray(0, this.length);
  }
}

// ---------------------------------------------------------------------------
// Just enough MP4 to find one AAC track's packets.

type Mp4AudioIndex = {
  config: AudioDecoderConfig;
  /** In seconds, from the track's media header. */
  duration: number;
  /** Leading media time to drop, from the edit list (the encoder delay). */
  skipSeconds: number;
  /** In decode order: file offset, size, and timestamp in microseconds. */
  packets: { offset: number; size: number; timestamp: number }[];
};

type Box = { type: string; start: number; end: number; body: number };

function* boxes(data: Uint8Array, start: number, end: number): Generator<Box> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(data[at + 4], data[at + 5], data[at + 6], data[at + 7]);
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) size = end - at;
    if (size < header) return;
    yield { type, start: at, end: at + size, body: at + header };
    at += size;
  }
}

/** The moov box's extent once all of it has arrived; "absent" once the audio (or
 *  something that isn't an MP4) comes first; undefined while it's too soon to say. */
export function findTopLevelBox(data: Uint8Array, type: string) {
  for (const box of boxes(data, 0, Number.MAX_SAFE_INTEGER)) {
    if (box.type === type) return box.end <= data.length ? box : undefined;
    if (box.type === "mdat" || !/^[\x20-\x7e]{4}$/.test(box.type)) return "absent" as const;
    if (box.end > data.length) return undefined;
  }
  return undefined;
}

const child = (data: Uint8Array, parent: Box, type: string) => {
  for (const box of boxes(data, parent.body, parent.end)) if (box.type === type) return box;
  return undefined;
};

const path = (data: Uint8Array, parent: Box | undefined, ...types: string[]) =>
  types.reduce<Box | undefined>((box, type) => box && child(data, box, type), parent);

export function parseMp4AudioIndex(data: Uint8Array, start: number, end: number): Mp4AudioIndex {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u32 = (at: number) => view.getUint32(at);
  const moov: Box = { type: "moov", start, end, body: start + 8 };

  const track = [...boxes(data, moov.body, moov.end)].find((box) => {
    if (box.type !== "trak") return false;
    const hdlr = path(data, box, "mdia", "hdlr");
    return (
      !!hdlr && String.fromCharCode(...data.subarray(hdlr.body + 8, hdlr.body + 12)) === "soun"
    );
  });
  if (!track) throw new Error("No audio track");

  const mdhd = path(data, track, "mdia", "mdhd")!;
  const v1 = data[mdhd.body] === 1;
  const timescale = u32(mdhd.body + (v1 ? 20 : 12));
  const mediaDuration = v1 ? Number(view.getBigUint64(mdhd.body + 24)) : u32(mdhd.body + 16);

  // Edit list: a media_time > 0 on the first entry is the priming delay to skip.
  let skipMedia = 0;
  const elst = path(data, track, "edts", "elst");
  if (elst && u32(elst.body + 4) > 0) {
    const ev1 = data[elst.body] === 1;
    const mediaTime = ev1
      ? Number(view.getBigInt64(elst.body + 8 + 8))
      : view.getInt32(elst.body + 8 + 4);
    if (mediaTime > 0) skipMedia = mediaTime;
  }

  const stbl = path(data, track, "mdia", "minf", "stbl")!;
  const stsd = child(data, stbl, "stsd")!;
  const entry = [...boxes(data, stsd.body + 8, stsd.end)][0];
  if (!entry || entry.type !== "mp4a") throw new Error(`Unsupported codec ${entry?.type}`);
  const channels = view.getUint16(entry.body + 16);
  const sampleRate = u32(entry.body + 24) >>> 16;
  // QuickTime sound descriptions v1/v2 carry extra fields before the child boxes.
  const soundVersion = view.getUint16(entry.body + 8);
  const childrenAt = entry.body + 28 + (soundVersion === 1 ? 16 : soundVersion === 2 ? 36 : 0);
  const entryBox: Box = { ...entry, body: childrenAt };
  const esds = child(data, entryBox, "esds") ?? path(data, child(data, entryBox, "wave"), "esds");
  if (!esds) throw new Error("No esds");
  const { objectType, specificConfig } = parseEsds(data, esds.body + 4, esds.end);

  // Packet sizes, how they group into chunks, and where each chunk starts.
  const stsz = child(data, stbl, "stsz")!;
  const fixedSize = u32(stsz.body + 4);
  const count = u32(stsz.body + 8);
  const sizeOf = (i: number) => fixedSize || u32(stsz.body + 12 + i * 4);

  const stsc = child(data, stbl, "stsc")!;
  const runs = Array.from({ length: u32(stsc.body + 4) }, (_, i) => ({
    firstChunk: u32(stsc.body + 8 + i * 12),
    perChunk: u32(stsc.body + 12 + i * 12),
  }));

  const stco = child(data, stbl, "stco");
  const co64 = child(data, stbl, "co64");
  const chunkTable = (stco ?? co64)!;
  const chunkCount = u32(chunkTable.body + 4);
  const chunkOffset = (i: number) =>
    stco ? u32(stco.body + 8 + i * 4) : Number(view.getBigUint64(co64!.body + 8 + i * 8));

  const stts = child(data, stbl, "stts")!;
  const deltas: number[] = [];
  for (let i = 0, n = u32(stts.body + 4); i < n; i++) {
    const runCount = u32(stts.body + 8 + i * 8);
    const delta = u32(stts.body + 12 + i * 8);
    for (let j = 0; j < runCount; j++) deltas.push(delta);
  }

  const packets: Mp4AudioIndex["packets"] = [];
  let sample = 0;
  let time = 0;
  for (let chunk = 0; chunk < chunkCount && sample < count; chunk++) {
    const run = runs.filter((r) => r.firstChunk <= chunk + 1).pop();
    let offset = chunkOffset(chunk);
    for (let k = 0; k < (run?.perChunk ?? 1) && sample < count; k++, sample++) {
      const size = sizeOf(sample);
      packets.push({ offset, size, timestamp: Math.round((time / timescale) * 1e6) });
      offset += size;
      time += deltas[sample] ?? deltas[deltas.length - 1] ?? 1024;
    }
  }

  return {
    config: {
      codec: `mp4a.40.${objectType}`,
      sampleRate,
      numberOfChannels: channels,
      description: specificConfig,
    },
    duration: (mediaDuration - skipMedia) / timescale,
    skipSeconds: skipMedia / timescale,
    packets,
  };
}

/** The AudioSpecificConfig inside an esds box, and the AAC object type it names. */
function parseEsds(data: Uint8Array, start: number, end: number) {
  let at = start;
  const readLength = () => {
    let length = 0;
    for (let i = 0; i < 4; i++) {
      const byte = data[at++];
      length = (length << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return length;
  };

  while (at < end) {
    const tag = data[at++];
    const length = readLength();
    if (tag === 0x03) {
      // ES_Descriptor: ES_ID, then flags saying which optional fields follow.
      at += 2;
      const flags = data[at++];
      if (flags & 0x80) at += 2;
      if (flags & 0x40) at += 1 + data[at];
      if (flags & 0x20) at += 2;
    } else if (tag === 0x04) {
      // DecoderConfigDescriptor: its fixed part, then the specific info inside.
      at += 13;
    } else if (tag === 0x05) {
      const specificConfig = data.slice(at, at + length);
      let objectType = specificConfig[0] >> 3;
      if (objectType === 31)
        objectType = 32 + (((specificConfig[0] & 7) << 3) | (specificConfig[1] >> 5));
      return { objectType, specificConfig };
    } else at += length;
  }
  throw new Error("No AudioSpecificConfig");
}
