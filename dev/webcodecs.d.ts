// The slice of WebCodecs the demo's streaming loader uses. TypeScript 4.9's DOM
// types predate WebCodecs; newer ones ship these and this file can go.

type AudioDecoderConfig = {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  description?: BufferSource;
};

interface AudioData {
  readonly numberOfFrames: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly timestamp: number;
  copyTo(destination: BufferSource, options: { planeIndex: number; format?: "f32-planar" }): void;
  close(): void;
}

declare class EncodedAudioChunk {
  constructor(init: { type: "key" | "delta"; timestamp: number; data: BufferSource });
}

declare class AudioDecoder {
  constructor(init: { output: (data: AudioData) => void; error: (error: DOMException) => void });
  static isConfigSupported(config: AudioDecoderConfig): Promise<{ supported: boolean }>;
  configure(config: AudioDecoderConfig): void;
  decode(chunk: EncodedAudioChunk): void;
  flush(): Promise<void>;
  close(): void;
}
