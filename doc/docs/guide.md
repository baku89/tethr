# Guide

## Installation

```sh
npm install tethr
```

## Connecting a camera

Tethr talks to cameras over PTP (WebUSB) or to webcams (WebRTC). Requesting a
camera must happen inside a user gesture (a click), because the browser shows a
device picker.

```ts
import {TethrManager} from 'tethr'

const manager = new TethrManager()

// Shows a USB device picker (or webcam picker with 'webcam')
const camera = await manager.requestCamera('ptpusb')
await camera.open()
```

To silently reconnect a previously paired camera (no picker, e.g. on page load),
pass its identifier and `{prompt: false}`:

```ts
const camera = await manager.requestCamera(savedIdentifier, {prompt: false})
```

## Reading and writing configs

Every property is accessed through `get` / `set` / `getDesc`:

```ts
const iso = await camera.get('iso')

const desc = await camera.getDesc('shutterSpeed')
// desc.writable, desc.value, desc.option (enum values or range)

await camera.set('whiteBalance', 'daylight')
```

The full list of property names is exported as `ConfigNameList`.

## Liveview, autofocus, capture

```ts
const {value: stream} = await camera.startLiveview()
videoEl.srcObject = stream
// …
await camera.stopLiveview()

await camera.runAutoFocus()

const {status, value} = await camera.takePhoto()
if (status === 'ok') {
	for (const object of value) {
		// object.blob, object.format, object.filename
	}
}
```

## Object Store

Browse and download files already on the camera's card:

```ts
const storages = await camera.getStorages()
const objects = await camera.getObjects({})
const {value} = await camera.getObject(objects[0].id)
```

## Vue 3 integration

The `@tethr/vue3` package wraps everything in reactive refs:

```ts
import {useTethr} from '@tethr/vue3'

const {camera, configs, requestCamera, toggleLiveview} = useTethr()
// configs.iso.value, configs.iso.set('400'), configs.iso.option …
```

See the [Capability Report](/report) and [Playground](/playground) for live
examples.
