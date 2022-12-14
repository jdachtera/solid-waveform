<p>
  <img width="100%" src="https://assets.solidjs.com/banner?type=solid-waveform&background=tiles&project=%20" alt="solid-waveform">
</p>

# solid-waveform

[![yarn](https://img.shields.io/badge/maintained%20with-yarn-cc00ff.svg?style=for-the-badge&logo=yarn)](https://yarnpkg.com/)

[Demo](https://solid-waveform.netlify.app/)

Waveform UI Control for Solid JS apps

## Quick start

Install it:

```bash
npm i solid-waveform
# or
yarn add solid-waveform
# or
pnpm add solid-waveform
```

Use it:

### Interactive waveform

```tsx
import { Waveform, Regions, PlayHead, Region } from "solid-waveform";

const [audioBuffer] = createResource(...);

const [position, setPosition] = createSignal(0);
const [playHeadPosition, setPlayHeadPosition] = createSignal(0);
const [zoom, setZoom] = createSignal(1);
const [scale, setScale] = createSignal(1);
const [logScale, setLogScale] = createSignal(false);
const [regions, setRegions] = createSignal<Region[]>([]);

<Waveform
  style={{ height: "300px" }}

  buffer={audioBuffer()}
  position={position()}
  zoom={zoom()}
  scale={scale()}

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
    sync
    onPlayHeadPositionChange={(newPlayheadPosition) => {
      setPlayHeadPosition(newPlayheadPosition);
    }}
  />
</Waveform>;
```

### Oscilloscope

```tsx
import { Oscilloscope } from "solid-waveform";

const analyzerNode = new AnalyzerNode(...)

<Oscilloscope
  style={{ height: "300px" }}
  analyzerNode={analyzerNode}
/>;

```
