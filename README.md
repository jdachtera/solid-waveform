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

```tsx
import { Waveform, Region } from "solid-waveform";

const [audioBuffer] = createResource(...);

const [position, setPosition] = createSignal(0);
const [zoom, setZoom] = createSignal(1);
const [scale, setScale] = createSignal(1);
const [logScale, setLogScale] = createSignal(false);
const [regions, setRegions] = createSignal<Region[]>([]);

<Waveform
  style={{ height: "300px" }}

  buffer={audioBuffer()}
  position={position()}
  regions={regions()}
  zoom={zoom()}
  scale={scale()}

  onPositionChange={setPosition}
  onZoomChange={setZoom}
  onScaleChange={setScale}

  onUpdateRegion={...}
  onCreateRegion={...}
  onClickRegion={...}
  strokeStyle="#121212"
/>;
```
