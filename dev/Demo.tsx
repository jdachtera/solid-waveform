import {
  Component,
  createEffect,
  createResource,
  createSignal,
  For,
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
      <h1>Solid Waveform</h1>
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
        strokeStyle="#121212"
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

      <Oscilloscope style={{ height: "300px" }} analyzerNode={analyser} scale={2}></Oscilloscope>

      <h2>Info:</h2>
      <button onClick={togglePlay}>{isPlaying() ? "Pause" : "Play"}</button>
      <div>
        <label>Audio URL:</label>
        <input value={inputUrl()} onChange={(event) => setInputUrl(event.currentTarget.value)} />
        <button onClick={() => setUrl(inputUrl())}>Update</button>
      </div>

      <div>
        <label>Position:</label>
        <input
          value={position().toFixed(3)}
          onInput={(event) => setPosition(event.currentTarget.valueAsNumber)}
        />
      </div>
      <div>
        <label>Mode:</label>
        <select
          value={mode()}
          onChange={(event) =>
            setMode(
              event.currentTarget.options[event.currentTarget.selectedIndex].value as WaveformMode,
            )
          }
        >
          <option value="peak">Peak</option>
          <option value="rms">RMS</option>
        </select>
      </div>

      <div>
        <label>Playhead Position: {playHeadPosition().toFixed(3)}</label>
        <br />
        <input
          type="checkbox"
          checked={syncPlayHead()}
          onChange={() => setSyncPlayHead(!syncPlayHead())}
        />
        Follow <br />
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

      <div>
        <label>Zoom:</label>
        <input
          type="number"
          value={zoom().toFixed(3)}
          onInput={(event) => {
            if (isNaN(event.currentTarget.valueAsNumber)) return;
            setZoom(Math.max(0, event.currentTarget.valueAsNumber));
          }}
        />
      </div>

      <div>
        <label>Scale:</label>
        <input
          value={scale().toFixed(3)}
          onInput={(event) => setScale(event.currentTarget.valueAsNumber)}
        />
      </div>

      <div>
        <label>
          Logarithmic
          <input type="checkbox" checked={logScale()} onChange={() => setLogScale(!logScale())} />
        </label>
      </div>

      <h2>Regions:</h2>
      <table style={{ width: "500px" }}>
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
                  <button onClick={() => playRegion(region())}>Play</button>
                </td>
              </tr>
            )}
          </Index>
        </tbody>
      </table>
    </div>
  );
};

export default Demo;
