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
import { Region, Waveform, Oscilloscope } from "../src";

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
  const [followPlayHead, setFollowPlayHead] = createSignal(true);
  const [isPlaying, setIsPlaying] = createSignal(false);

  const [zoom, setZoom] = createSignal(1);
  const [scale, setScale] = createSignal(1);
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
        playHeadPosition={playHeadPosition()}
        followPlayHead={followPlayHead()}
        regions={regions()}
        zoom={zoom()}
        scale={scale()}
        logScale={logScale()}
        onPositionChange={setPosition}
        onPlayHeadPositionChange={(newPlayheadPosition) => {
          setPlayHeadPosition(newPlayheadPosition);
          if (isPlaying()) {
            play(newPlayheadPosition);
          }
        }}
        onZoomChange={setZoom}
        onScaleChange={setScale}
        onUpdateRegion={(region) => {
          const index = regions().findIndex(({ id }) => id === region.id);
          setRegions([...regions().slice(0, index), region, ...regions().slice(index + 1)]);
        }}
        onCreateRegion={(region) => {
          setRegions([...regions(), region]);
        }}
        onClickRegion={playRegion}
        strokeStyle="#121212"
      />

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
        <input value={position().toFixed(3)} />
      </div>
      <div>
        <label>Playhead Position: {playHeadPosition().toFixed(3)}</label>
        <br />
        <input
          type="checkbox"
          checked={followPlayHead()}
          onChange={() => setFollowPlayHead(!followPlayHead())}
        />{" "}
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
        <input value={zoom().toFixed(3)} />
      </div>

      <div>
        <label>Scale:</label>
        <input value={scale().toFixed(3)} />
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
