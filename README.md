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

### Markers (warp / cue points)

`Markers` overlays draggable point markers on the waveform — a play‑start / cue / warp
point inside a region, distinct from `Region`'s span‑with‑edges. Each `MarkerTick`
renders a thin labelled line: **drag** to move it, **double‑click** to delete, and
**Option/Alt‑click** empty space to add one. Positions are in the waveform's time units.

```tsx
import { Waveform, Markers, type Marker } from "solid-waveform";

const [markers, setMarkers] = createSignal<Marker[]>([]);

<Waveform buffer={audioBuffer()} position={position()} zoom={zoom()} scale={scale()}>
  <Markers
    markers={markers()}
    onAddMarker={(position) => setMarkers([...markers(), { id: crypto.randomUUID(), position }])}
    onUpdateMarker={(index, position) =>
      setMarkers(markers().map((m, i) => (i === index ? { ...m, position } : m)))
    }
    onRemoveMarker={(index) => setMarkers(markers().filter((_, i) => i !== index))}
    onClickMarker={(index, event) => {/* audition marker index */}}
  />
</Waveform>;
```

A `Marker` is `{ id: string; position: number; color?: string; label?: string }`. Use
`MarkerTick` directly if you want to render/handle individual markers yourself. Built for
sample‑slicer / warp‑marker UIs (e.g. a breakbeat re‑sequencer mapping markers to keys).

**Composes with `Regions`.** Drop `<Markers>` and `<Regions>` into the same `<Waveform>`
(order doesn't matter) and they don't fight over the pointer: the `Markers` overlay is
`pointer-events: none`, so a plain drag falls straight through to a region‑create drag,
while the ticks stay grabbable on their own z‑index. The one gesture `Markers` claims —
Option/Alt‑click to add — is caught in the capture phase, bounded to the waveform, so it
wins over the region surface without blocking anything else.

```tsx
<Waveform buffer={audioBuffer()} position={position()} zoom={zoom()} scale={scale()}>
  <Regions regions={regions()} onCreateRegion={...} onUpdateRegion={...} />
  <Markers markers={markers()} onAddMarker={...} onUpdateMarker={...} onRemoveMarker={...} />
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
