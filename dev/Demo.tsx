import {
  Component,
  createEffect,
  createResource,
  createSignal,
  Index,
  Show,
  onMount,
  untrack,
} from "solid-js";

import styles from "./App.module.css";
import { Region, PlayHead, Waveform, Oscilloscope, Regions } from "../src";
import { WaveformMode } from "src/createCachedWaveformPeaks";

const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
};

const Demo: Component = () => {
  let audioSource: AudioBufferSourceNode | undefined;
  let audioSourcePlayStart = 0;

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

  const gainNode = new GainNode(audioCtx, {
    gain: 0.5,
  });

  const analyser = new AnalyserNode(audioCtx, {
    smoothingTimeConstant: 1,
    fftSize: 2048,
  });

  gainNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  const [url, setUrl] = createSignal("/jam_session.m4a");
  const [inputUrl, setInputUrl] = createSignal(untrack(() => url()));

  const [audioBuffer] = createResource(url, async (url) => {
    const context = new AudioContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return context.decodeAudioData(arrayBuffer);
  });

  const [position, setPosition] = createSignal(0);
  const [playHeadPosition, setPlayHeadPosition] = createSignal(0);
  const [syncPlayHead, setSyncPlayHead] = createSignal(false);
  const [isPlaying, setIsPlaying] = createSignal(false);

  const [zoom, setZoom] = createSignal(1);
  const [scale, setScale] = createSignal(1);
  const [mode, setMode] = createSignal<WaveformMode>("peak");
  const [logScale, setLogScale] = createSignal(false);
  const [oscLatency, setOscLatency] = createSignal(250);
  const [regions, setRegions] = createSignal<Region[]>([]);

  const duration = () => audioBuffer()?.duration ?? 0;

  const handleEnded = () => {
    setIsPlaying(false);
    setPlayHeadPosition(audioCtx.currentTime - audioSourcePlayStart);
  };

  const play = (start: number = 0, duration?: number) => {
    audioSourcePlayStart = audioCtx.currentTime - start;
    setIsPlaying(true);
    audioSource?.removeEventListener("ended", handleEnded);
    audioSource?.stop();
    audioSource = new AudioBufferSourceNode(audioCtx, {
      buffer: audioBuffer(),
    });
    audioSource.connect(gainNode);
    audioSource.start(0, start, duration);
    audioSource.addEventListener("ended", handleEnded);
  };

  const togglePlay = () => {
    if (isPlaying()) {
      audioSource?.stop();
      setIsPlaying(false);
    } else {
      play(playHeadPosition());
    }
  };

  const playRegion = (region: Region) => {
    play(region.start, region.end - region.start);
  };

  const zoomBy = (factor: number) => setZoom((z) => Math.max(1, Math.min(100000, z * factor)));

  let animationFrame: number;

  createEffect(() => {
    if (isPlaying()) {
      const updatePlayHead = () => {
        animationFrame = requestAnimationFrame(updatePlayHead);
        setPlayHeadPosition(audioCtx.currentTime - audioSourcePlayStart);
      };
      updatePlayHead();
    } else {
      cancelAnimationFrame(animationFrame);
    }
  });

  onMount(() => {});

  return (
    <div class={styles.App}>
      <header class={styles.header}>
        <h1 class={styles.title}>Solid Waveform</h1>
        <p class={styles.subtitle}>
          Interactive, zoomable audio waveforms & oscilloscope for SolidJS.
        </p>
      </header>

      <div class={styles.board}>
        <div class={styles.boardMain}>
          <div class={`${styles.panel} ${styles.panelWave}`}>
        <div class={styles.panelHead}>
          <span class={styles.panelTitle}>Waveform</span>
          <span class={styles.panelMeta}>
            <span class={styles.time}>{fmtTime(playHeadPosition())}</span>
            <span class={styles.metaSep}>/</span>
            <span class={styles.time}>{fmtTime(duration())}</span>
          </span>
        </div>
        <div class={styles.stage}>
          <Show
            when={!audioBuffer.loading && !audioBuffer.error}
            fallback={
              <div class={styles.stagePlaceholder}>
                {audioBuffer.error ? "Failed to load audio" : "Decoding audio…"}
              </div>
            }
          >
            <Waveform
              style={{ height: "100%" }}
              buffer={audioBuffer()}
              position={position()}
              zoom={zoom()}
              scale={scale()}
              logScale={logScale()}
              mode={mode()}
              onPositionChange={setPosition}
              onZoomChange={setZoom}
              onScaleChange={setScale}
              strokeStyle="#6ea8fe"
            >
              <Regions
                regions={regions()}
                onUpdateRegion={(region) => {
                  const index = regions().findIndex(({ id }) => id === region.id);
                  setRegions([
                    ...regions().slice(0, index),
                    region,
                    ...regions().slice(index + 1),
                  ]);
                }}
                onCreateRegion={(region) => {
                  setRegions([...regions(), region]);
                }}
                onClickRegion={playRegion}
              />
              <PlayHead
                playHeadPosition={playHeadPosition()}
                sync={syncPlayHead()}
                onPlayHeadPositionChange={(newPlayheadPosition) => {
                  setPlayHeadPosition(newPlayheadPosition);
                  if (isPlaying()) {
                    play(newPlayheadPosition);
                  }
                }}
              />
            </Waveform>
          </Show>
        </div>
      </div>

          <div class={`${styles.panel} ${styles.panelOsc}`}>
            <div class={styles.panelHead}>
              <span class={styles.panelTitle}>Oscilloscope</span>
              <span class={styles.panelMeta}>{isPlaying() ? "● live" : "idle"}</span>
            </div>
            <div class={styles.oscFill}>
              <Oscilloscope
                style={{ height: "100%" }}
                analyzerNode={analyser}
                scale={2}
                mode={mode()}
                slowNessFactor={oscLatency()}
                strokeStyle="#6ea8fe"
              ></Oscilloscope>
            </div>
          </div>
        </div>

        <div class={styles.boardSide}>
      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>Controls</h2>

        <div class={styles.transport}>
          <button class={`${styles.button} ${styles.primary}`} onClick={togglePlay}>
            {isPlaying() ? "⏸ Pause" : "▶ Play"}
          </button>
          <div class={styles.transportTime}>
            <span class={styles.time}>{fmtTime(playHeadPosition())}</span>
            <span class={styles.metaSep}>/</span>
            <span class={styles.timeMuted}>{fmtTime(duration())}</span>
          </div>
        </div>

        <div class={styles.controls}>
          <div class={`${styles.control} ${styles.urlRow}`} style={{ "grid-column": "1 / -1" }}>
            <input
              value={inputUrl()}
              onChange={(event) => setInputUrl(event.currentTarget.value)}
              placeholder="Audio URL"
            />
            <button class={styles.button} onClick={() => setUrl(inputUrl())}>
              Load
            </button>
          </div>

          <div class={styles.control}>
            <label>Mode</label>
            <div class={styles.segmented}>
              <button
                class={`${styles.seg} ${mode() === "peak" ? styles.segActive : ""}`}
                onClick={() => setMode("peak")}
              >
                Peak
              </button>
              <button
                class={`${styles.seg} ${mode() === "rms" ? styles.segActive : ""}`}
                onClick={() => setMode("rms")}
              >
                RMS
              </button>
            </div>
          </div>

          <div class={styles.control}>
            <label>Amplitude scale</label>
            <div class={styles.segmented}>
              <button
                class={`${styles.seg} ${!logScale() ? styles.segActive : ""}`}
                onClick={() => setLogScale(false)}
              >
                Linear
              </button>
              <button
                class={`${styles.seg} ${logScale() ? styles.segActive : ""}`}
                onClick={() => setLogScale(true)}
              >
                Log
              </button>
            </div>
          </div>

          <div class={styles.control}>
            <label>Zoom — {zoom().toFixed(1)}×</label>
            <div class={styles.zoomRow}>
              <button class={styles.iconButton} onClick={() => zoomBy(1 / 1.6)}>
                −
              </button>
              <button class={styles.button} onClick={() => setZoom(1)}>
                Fit
              </button>
              <button class={styles.iconButton} onClick={() => zoomBy(1.6)}>
                +
              </button>
            </div>
          </div>

          <div class={styles.control}>
            <label>Position</label>
            <input
              type="number"
              value={position().toFixed(3)}
              onInput={(event) => {
                if (!isNaN(event.currentTarget.valueAsNumber))
                  setPosition(event.currentTarget.valueAsNumber);
              }}
            />
          </div>

          <div class={styles.control}>
            <label>Vertical scale — {scale().toFixed(1)}×</label>
            <input
              type="range"
              min={0.1}
              max={4}
              step={0.1}
              value={scale()}
              onInput={(event) => setScale(event.currentTarget.valueAsNumber)}
            />
          </div>

          <div class={styles.control} style={{ "grid-column": "1 / -1" }}>
            <label>Playhead — {fmtTime(playHeadPosition())}</label>
            <input
              type="range"
              min={0}
              max={duration() || undefined}
              step={0.001}
              value={playHeadPosition()}
              onInput={(event) => {
                setPlayHeadPosition(event.currentTarget.valueAsNumber);
                if (isPlaying()) {
                  play(event.currentTarget.valueAsNumber);
                }
              }}
            />
          </div>

          <div class={styles.control} style={{ "grid-column": "1 / -1" }}>
            <label>Oscilloscope latency — {oscLatency()}ms</label>
            <input
              type="range"
              min={0}
              max={1000}
              step={10}
              value={oscLatency()}
              onInput={(event) => setOscLatency(event.currentTarget.valueAsNumber)}
            />
          </div>

          <div class={`${styles.control} ${styles.checkRow}`}>
            <input
              type="checkbox"
              checked={syncPlayHead()}
              onChange={() => setSyncPlayHead(!syncPlayHead())}
            />
            <label>Follow playhead</label>
          </div>
        </div>
      </div>

      <div class={`${styles.panel} ${styles.panelRegions}`}>
        <div class={styles.panelHead}>
          <span class={styles.sectionTitle} style={{ margin: 0 }}>
            Regions
          </span>
          <Show when={regions().length > 0}>
            <button class={`${styles.button} ${styles.danger}`} onClick={() => setRegions([])}>
              Clear all
            </button>
          </Show>
        </div>
        <Show
          when={regions().length > 0}
          fallback={<p class={styles.empty}>Drag on the waveform to create a region.</p>}
        >
          <div class={styles.tableWrap}>
          <table class={styles.table}>
            <thead>
              <tr>
                <th></th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <Index each={regions()}>
                {(region) => (
                  <tr>
                    <td>
                      <span class={styles.swatch} style={{ background: region().color }} />
                    </td>
                    <td>{fmtTime(region().start)}</td>
                    <td>{fmtTime(region().end)}</td>
                    <td>{fmtTime(region().end - region().start)}</td>
                    <td class={styles.rowActions}>
                      <button class={styles.button} onClick={() => playRegion(region())}>
                        ▶
                      </button>
                      <button
                        class={`${styles.iconButton} ${styles.danger}`}
                        onClick={() =>
                          setRegions(regions().filter(({ id }) => id !== region().id))
                        }
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )}
              </Index>
            </tbody>
          </table>
          </div>
        </Show>
      </div>
        </div>
      </div>

      <footer class={styles.footer}>
        <a class={styles.link} href="https://github.com/jdachtera/solid-waveform" target="_blank">
          GitHub
        </a>
        <a class={styles.link} href="https://www.npmjs.com/package/solid-waveform" target="_blank">
          npm
        </a>
        <span class={styles.footerMuted}>Waveform UI control for SolidJS</span>
      </footer>
    </div>
  );
};

export default Demo;
