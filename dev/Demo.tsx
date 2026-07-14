import {
  Component,
  createEffect,
  createResource,
  createSignal,
  Index,
  onMount,
  untrack,
} from "solid-js";

import styles from "./App.module.css";
import { Region, PlayHead, Waveform, Oscilloscope, Regions } from "../src";
import { WaveformMode } from "src/createCachedWaveformPeaks";

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
  const [regions, setRegions] = createSignal<Region[]>([]);

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

      <div class={styles.panel}>
        <Waveform
          style={{ height: "300px" }}
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
              setRegions([...regions().slice(0, index), region, ...regions().slice(index + 1)]);
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
      </div>

      <div class={styles.panel}>
        <Oscilloscope
          style={{ height: "300px" }}
          analyzerNode={analyser}
          scale={2}
          mode={mode()}
        ></Oscilloscope>
      </div>

      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>Controls</h2>

        <div class={styles.transport}>
          <button class={`${styles.button} ${styles.primary}`} onClick={togglePlay}>
            {isPlaying() ? "⏸ Pause" : "▶ Play"}
          </button>
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
            <label>Position</label>
            <input
              value={position().toFixed(3)}
              onInput={(event) => setPosition(event.currentTarget.valueAsNumber)}
            />
          </div>

          <div class={styles.control}>
            <label>Mode</label>
            <select
              value={mode()}
              onChange={(event) =>
                setMode(
                  event.currentTarget.options[event.currentTarget.selectedIndex]
                    .value as WaveformMode,
                )
              }
            >
              <option value="peak">Peak</option>
              <option value="rms">RMS</option>
            </select>
          </div>

          <div class={styles.control}>
            <label>Zoom</label>
            <input
              type="number"
              value={zoom().toFixed(3)}
              onInput={(event) => {
                if (isNaN(event.currentTarget.valueAsNumber)) return;
                setZoom(Math.max(0, event.currentTarget.valueAsNumber));
              }}
            />
          </div>

          <div class={styles.control}>
            <label>Scale</label>
            <input
              value={scale().toFixed(3)}
              onInput={(event) => setScale(event.currentTarget.valueAsNumber)}
            />
          </div>

          <div class={styles.control} style={{ "grid-column": "1 / -1" }}>
            <label>Playhead — {playHeadPosition().toFixed(3)}s</label>
            <input
              type="range"
              min={0}
              max={audioBuffer()?.duration}
              value={playHeadPosition()}
              onInput={(event) => {
                setPlayHeadPosition(event.currentTarget.valueAsNumber);
                if (isPlaying()) {
                  play(event.currentTarget.valueAsNumber);
                }
              }}
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

          <div class={`${styles.control} ${styles.checkRow}`}>
            <input type="checkbox" checked={logScale()} onChange={() => setLogScale(!logScale())} />
            <label>Logarithmic scale</label>
          </div>
        </div>
      </div>

      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>Regions</h2>
        <table class={styles.table}>
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <Index each={regions()}>
              {(region) => (
                <tr>
                  <td>{region().start.toFixed(3)}</td>
                  <td>{region().end.toFixed(3)}</td>
                  <td>{(region().end - region().start).toFixed(3)}</td>
                  <td>
                    <button class={styles.button} onClick={() => playRegion(region())}>
                      Play
                    </button>
                  </td>
                </tr>
              )}
            </Index>
          </tbody>
        </table>
        {regions().length === 0 && (
          <p class={styles.empty}>Drag on the waveform to create a region.</p>
        )}
      </div>
    </div>
  );
};

export default Demo;
