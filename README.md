<div align="center">
  <h1>Tethr</h1>
	<a href="https://baku89.github.io/tethr/">Demo</a>
	<br>
	<br>
</div>
  
Tethr is a JavaScript/TypeScript library designed to control USB-connected digital cameras directly from browsers.

It is built on top of the [WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/USB) and aims to provide support for cameras by various vendors. The library utilizes the Picture Transfer Protocol (PTP), which offers a means to access camera functionalities such as shutter control, aperture adjustment, ISO settings, and more via USB or TCP/IP connections. However, due to the varying vendor-specific extensions employed by different camera models, acheving compatibility among them has been challenging.

Tethr addreses this issue by acting as a bridge and offering a standarized and contemporary interface for developers. With Tethr, developers can interact with cameras seamlessly, abstracting away the underlying differences and complexities. The project takes inspiration from [libgphoto2](https://github.com/gphoto/libgphoto2) in its pursuit of providing a comprehensive camera control solution.

### Features

- 📸 Control camera functionalities such as shutter, aperture, ISO, and more.
- ⚡️ Access cameras via USB using the PTP (Picture Transfer Protocol) standard.
- 🌎 Vendor-specific support to fully access all features of each camera model.
- 🤳 Automatic fallback to web cameras when WebUSB is disabled or no USB camera is connected.

## Installation in Your Package

```
npm install https://github.com/baku89/tethr
yarn add https://github.com/baku89/tethr
```

## Supported Cameras

As mentioned, due to the vendor-specific extensions added to the PTP, comprehensive support for each camera model's features requires vendor-specific implementation. Without such support, the library can only access a limited set of configs exposed through standard device properties defined in the PTP specification.

In addition, the library offers fallback functionality to web cameras in situations where WebUSB is disabled or when no USB-connected camera is detected. This enables developers to seamlessly switch to using web cameras, such as those integrated into smartphones, as an alternative capture source.

Here's a list of camera models currently supported by the library:

| Vendor    | Camera   | Features                    |
| --------- | -------- | --------------------------- |
| Panasonic | Lumix S5 | Shutter, LV, AF, MF, Config |
| Sigma     | fp, fp L | Shutter, LV, AF, MF, Config |
| Ricoh     | Theta S  | Shutter, Config             |
| WebCam    |          | Shutter, LV, Config         |

\*\* LV: Liveview, AF: Auto Focus, MF: Manual Focus

## Sample Code

The project is in the early stages of development and lacks complete documentation. Here is a code sample to provide you with an understanding of how to utilize the library. it's important to note that all camera operations are asynchronous, and Tethr's instance methods return [Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).

```ts
import {detectCameras} from 'tethr'

const cameras = await detectCameras()

const cam = cameras[0]

await cam.init()

await cam.get('model')
// -> 'Lumix S5'

await cam.set('shutterSpeed', '1/1000')

const exposureModeDesc = await cam.getDesc('exposureMode')
console.log(exposureModeDesc)
/* -> {
	value: 'M',
	writable: false // Because this can be set by physical dial on a camera
	option: {
		type: 'enum',
		values: ['M', 'S', 'A', 'P']
	}
} */

const autoFocusResult = await cam.runAutoFocus()
// -> {status: 'ok'}

if (!autoFocusResult.status !== 'ok') {
	console.warn('AF failed')
}

const takePhotoResult = await cam.takePhoto({download: true})

if (takePhotoResult.status === 'ok') {
	const url = URL.createURLObject(takePhotoResult.value[0])
	$img.src = url
}

// Get storage informations
const storages = await cam.getStorages()

for (const storage of storages) {
	console.log('Storage ID: ' + storage.id)
	console.log('name=' + storage.name)
	console.log('free space in images=' + storage.freeSpaceInImages)
}

await cam.close()
```

## Configs

This is a list of ConfigName and their value types:

| ConfigName           | ConfigType             | Example                                                                                    |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| aperture             | `Aperture`             | `2.2`, `5.6`, `'auto'`                                                                     |
| autoFocusFrameCenter | `vec2`                 | The center of auto focus frame. Normalized from [0, 0] (top-left) to [1, 1] (bottom-right) |
| autoFocusFrameSize   | `string`               | `large`, `medium`, `small`, `64x64`                                                        |
| batteryLevel         | `BatteryLevel`         | `50`, `100`, `'ac'`, `'low'` (Represented in range `0-100`)                                |
| burstInterval        | `number`               |                                                                                            |
| burstNumber          | `number`               |                                                                                            |
| canRunAutoFocus      | `boolean`              |                                                                                            |
| canRunManualFocus    | `boolean`              |                                                                                            |
| canStartLiveview     | `boolean`              |                                                                                            |
| canTakePicture       | `boolean`              |                                                                                            |
| captureDelay         | `number`               |                                                                                            |
| colorMode            | `string`               | `V-Log`, `Teal and Orange`, `CineV`... (vendor-specific)                                   |
| colorTemperature     | `number`               | `2600`, `5500`                                                                             |
| contrast             | `number`               |                                                                                            |
| dateTime             | `Date`                 |                                                                                            |
| destinationToSave    | `string`               | 'camera', 'pc', 'camera,pc'                                                                |
| digitalZoom          | `number`               |                                                                                            |
| driveMode            | `DriveMode`            | `'normal'`, `'burst'`, `'interval'`                                                        |
| exposureComp         | `string`               | `'-1 1/3'` `'-1/2'`, `'0'`, `'+2 1/3'`                                                     |
| exposureMeteringMode | `ExposureMeteringMode` | `'average'`, '`multi-spot'`, `'center-spot'`...                                            |
| exposureMode         | `ExposureMode`         | `'P'`, `'A'`, `'S'`, `'M'`                                                                 |
| facingMode           | `string`               | `'user'`, `'environemnt'`... (Webcam fallback only)                                        |
| flashMode            | `FlashMode`            | `'auto'`, `'off'`, `'fill'`...                                                             |
| focalLength          | `FocalLength`          | `35`, `55`, `105`, `'spherical'` (= Theta S, Insta360)                                     |
| focusDistance        | `number`               |                                                                                            |
| focusMeteringMode    | `FocusMeteringMode`    | `'center-spot'`, `'multi-spot'`                                                            |
| focusMode            | `FocusMode`            |                                                                                            |
| functionalMode       | `FunctionalMode`       | `'standard'`, `'sleep'`                                                                    |
| imageAspect          | `string`               | `'16:9'`, `'3:2'`, `'a size'`                                                              |
| imageQuality         | `string`               | `'fine'`, `'raw,fine'`, `'raw'` (comma-separated)                                          |
| imageSize            | `string`               | `'L'`, `'M'`, `'S'`, `'1024x768'`                                                          |
| iso                  | `ISO`                  | `160`, `3200`, `'auto'`                                                                    |
| liveviewEnabled      | `boolean`              |                                                                                            |
| liveviewMagnifyRatio | `number`               |                                                                                            |
| liveviewSize         | `string`               |                                                                                            |
| manualFocusOptions   | `ManualFocusOption[]`  | `['near:2', 'near:1', 'far:1', 'far:2']` (`3` at max speed)                                |
| model                | `string`               |                                                                                            |
| sharpness            | `number`               |                                                                                            |
| shutterSpeed         | `string`               | `'30'`, `'1.5'`, `'1/200'`, `'1/6400'`                                                     |
| timelapseInterval    | `number`               |                                                                                            |
| timelapseNumber      | `number`               |                                                                                            |
| whiteBalance         | `WhiteBalance`         | `'auto'`, `'cloud'`, `'daylight'`...                                                       |

The `configName` mentioned in the subsequent sample code can be replaced with the names shown above.

### Getter/Setter

You can retrieve and modify configs like code shown below:

```ts
// 1. Specify a name of config as the first argument
tethr.get('configName'): Promise<ConfigType | null>
tethr.set('configName', value): Promise<OperationResult>

// Setters return the following object:
interface OperationResult {
	status: 'ok' | 'unsupported' | 'invalid parameter' | 'busy' | 'general error'
}
```

### Config Descriptor

If you want to obtain information about a config, such as its writability and a list of valid values, you can use the `cam.getDesc('configName')` methods. These methods return a descriptor object.

```ts
interface ConfigDesc<ConfigType> {
	writable: boolean
	value: ConfigType | null
	option?:
		| {type: 'enum'; values: ConfigType[]}
		| {type: 'range'; min: ConfigType; max: ConfigType; step: ConfigType}
}
```

### Watching Config Changes

Whenever a config is changed, a correspoinding `configNameChange` event will be fired. Since Tethr class inherits from [EventEmitter](https://github.com/primus/eventemitter3), you can monitor the value change using the following pattern:

```ts
tethr.on('apertureChange', (newValue: Aperture) => {
	// Handle the value change here
})

// Or watch once
tethr.once('shutterSpeedChange', callback)

// Delete event listener
tethr.off('apertureChange', callback)
```

An event `configNameChange` is triggered in the the following:

- When you manually set the value of the `configName`.
- When you modify other configs that have a side effect on the value of `configName`. For example, setting the `whiteBalance` to `'auto'` will make the `colorTemperature` read-only.
- When users change settings by camera buttons or dials.

## Development Environment

```
git clone https://github.com/baku89/tethr tethr
cd tethr
yarn install
yarn dev # Then open https://localhost:1234 in a browser
```

## License

This repository is published under an MIT License. See the included [LICENSE file](./LICENSE).
