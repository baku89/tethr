---
home: true
title: Home
heroImage: /logo.svg
actions:
  - text: Guide
    link: /guide
    type: primary
  - text: Capability Report
    link: /report
    type: secondary
  - text: API
    link: /api/
    type: secondary
features:
  - title: Unified camera control
    details: One API for PTP-over-USB cameras and webcams, with capability-based vendor detection.
  - title: Liveview & capture
    details: Start a liveview MediaStream, run autofocus, and take photos straight from the browser.
  - title: Object Store
    details: Browse, download, and stream files on the camera's storage with chunked transfer.
footer: MIT Licensed | Copyright © Baku Hashimoto
---

Tethr is a JavaScript/TypeScript library for controlling digital cameras from the
browser over WebUSB (PTP) and WebRTC (webcam).

```ts
import {TethrManager} from 'tethr'

const manager = new TethrManager()
const camera = await manager.requestCamera('ptpusb')
await camera.open()

await camera.set('shutterSpeed', '1/30')
const result = await camera.takePhoto()
```

See the [**Capability Report**](/report) to probe everything a connected camera
can do, or the [**Playground**](/playground) for a hands-on demo.
