<div align="center">
  <img src="docs/logo.svg" width="50%" />
  <br>
  <br>
  <h1>Tethr</h1>
	<a href="https://baku89.github.io/tethr/">Demo</a>
	<br>
	<br>
</div>
  
Tethr is a JavaScript/TypeScript library for controlling USB-connected digital cameras from browsers.

It is built on top of the [WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/USB) and aims to support cameras from various vendors. There is a protocol called PTP (Picture Transfer Protocol) that provides a way to access camera functionalities such as shutter, aperture, ISO, and more via USB or TCP/IP. However, most cameras use their own vendor extensions to communicate with PCs, resulting in little compatibility between them. Tethr aims to bridge this gap and provide a uniform and modern interface for developers, without having to worry about the differences. The project draws inspiration from [libgphoto2](https://github.com/gphoto/libgphoto2).

## Installation in Your Package

```
npm install https://github.com/baku89/tethr
yarn add https://github.com/baku89/tethr
```

## Supported Cameras

As mentioned above, most vendors add their own extensions to PTP. Therefore, vendor-specific support is required to fully access all the features of each camera model. Otherwise, the library can only access a limited number of configurations exposed as standard device properties defined in the PTP specification. The library also supports fallback to web cameras in case WebUSB is disabled or no camera is connected, such as a smartphone.

Here's a list of supported camera models:

| Vendor    | Camera   | Features                    |
| --------- | -------- | --------------------------- |
| Panasonic | Lumix S5 | Shutter, LV, AF, MF, Config |
| Sigma     | fp       | Shutter, LV, AF, Config     |
| Ricoh     | Theta S  | Shutter, Config             |
| WebCam    |          | Shutter, LV, Config         |

\*\* LV: Liveview, AF: Auto Focus, MF: Manual Focus

## Sample Code

This project is in the very early stages of development and is not yet fully documented. Here is a sample code to give you an idea of how to use the library. Note that all camera operations are asynchronous, and Tethr's instance methods return Promises.

```ts
import {detectTethr} from 'tethr'

const cameras = await detectTethr()

const cam = cameras[0]

await cam.init()

await cam.get('model') // 'Lumix S5'
await cam.getModel()

await cam.set('shutterSpeed', '1/1000')
await cam.setShutterSpeed('1/1000')

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

| ConfigName           | Type                   | Example                                                     |
| -------------------- | ---------------------- | ----------------------------------------------------------- |
| aperture             | `Aperture`             | `2.2`, `5.6`, `'auto'`                                      |
| batteryLevel         | `BatteryLevel`         | `50`, `100`, `'ac'`, `'low'` (Represented in range `0-100`) |
| burstInterval        | `number`               |                                                             |
| burstNumber          | `number`               |                                                             |
| canRunAutoFocus      | `boolean`              |                                                             |
| canRunManualFocus    | `boolean`              |                                                             |
| canStartLiveview     | `boolean`              |                                                             |
| canTakePicture       | `boolean`              |                                                             |
| captureDelay         | `number`               |                                                             |
| colorMode            | `string`               | `V-Log`, `Teal and Orange`, `CineV`... (vendor-specific)    |
| colorTemperature     | `number`               | `2600`, `5500`                                              |
| contrast             | `number`               |                                                             |
| dateTime             | `Date`                 |                                                             |
| destinationToSave    | `string`               | 'camera', 'pc', 'camera,pc'                                 |
| digitalZoom          | `number`               |                                                             |
| driveMode            | `DriveMode`            | `'normal'`, `'burst'`, `'interval'`                         |
| exposureComp         | `string`               | `'-1 1/3'` `'-1/2'`, `'0'`, `'+2 1/3'`                      |
| exposureMeteringMode | `ExposureMeteringMode` | `'average'`, '`multi-spot'`, `'center-spot'`...             |
| exposureMode         | `ExposureMode`         | `'P'`, `'A'`, `'S'`, `'M'`                                  |
| facingMode           | `string`               | `'user'`, `'environemnt'`... (Webcam fallback only)         |
| flashMode            | `FlashMode`            | `'auto'`, `'off'`, `'fill'`...                              |
| focalLength          | `FocalLength`          | `35`, `55`, `105`, `'spherical'` (= Theta S, Insta360)      |
| focusDistance        | `number`               |                                                             |
| focusMeteringMode    | `FocusMeteringMode`    | `'center-spot'`, `'multi-spot'`                             |
| focusMode            | `FocusMode`            |                                                             |
| functionalMode       | `FunctionalMode`       | `'standard'`, `'sleep'`                                     |
| imageAspect          | `string`               | `'16:9'`, `'3:2'`, `'a size'`                               |
| imageQuality         | `string`               | `'fine'`, `'raw,fine'`, `'raw'` (comma-separated)           |
| imageSize            | `string`               | `'L'`, `'M'`, `'S'`, `'1024x768'`                           |
| iso                  | `ISO`                  | `160`, `3200`, `'auto'`                                     |
| liveviewEnabled      | `boolean`              |                                                             |
| liveviewMagnifyRatio | `number`               |                                                             |
| liveviewSize         | `string`               |                                                             |
| manualFocusOptions   | `ManualFocusOption[]`  | `['near:2', 'near:1', 'far:1', 'far:2']` (`3` at max speed) |
| model                | `string`               |                                                             |
| sharpness            | `number`               |                                                             |
| shutterSpeed         | `string`               | `'30'`, `'1.5'`, `'1/200'`, `'1/6400'`                      |
| timelapseInterval    | `number`               |                                                             |
| timelapseNumber      | `number`               |                                                             |
| whiteBalance         | `WhiteBalance`         | `'auto'`, `'cloud'`, `'daylight'`...                        |

### Getter/Setter

You can retrieve and modify configurations by two ways shown below:

```ts
// 1. Specify a kind of config as argument
tethr.get('<configName>'): Promise<ConfigType | null>
tethr.set('<configName>'): Promise<Result>

// 1. Directly call a getter/setter methods defined per config
tethr.get<ConfigName>(): Promise<ConfigType | null>
tethr.set<ConfigName>(): Promise<Result>

interface Result {
	status: 'ok' | 'unsupported' | 'invalid parameter' | 'busy' | 'general error'
}

// '<configName>' is a name of config written in camelCase ('batteryLevel'),
// and <ConfigName> in CapitalCase (BatteryLevel)
```

### Config Discriptor

If you want to obtain information about a config, such as its writability and valid options, you can use the `tethr.getDesc('<configName>')` or 1tethr.getConfigNameDesc1 methods. These methods return a descriptor object.

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

Whenever a value of configuration is changed, a correspoinding `${configName}Changed` event will be fired. Since Tethr class inherits from [EventEmitter](https://github.com/primus/eventemitter3), you can monitor the value change as follows:

```ts
function callback(desc: ConfigDesc<Aperture>) {
	console.log(`Current aperture=${desc.value}`)
}

// Register the callback
tethr.on('apertureChanged', callback)

// Or watch once
tethr.once('shutterSpeedChanged', callback)

// Delete event listener
tethr.off('apertureChanged', callback)
```

A event `${configName}Changed` is triggered out in the case:

- When you manually set the value of config itself.
- When you modify other configs which will affect the config value as a side effect. For example, setting 'whiteBalance' to 'auto' makes 'colorTemperature' read-only.
- When users change settings by camera buttons or dials physically.

## Development Environment

```
git clone https://github.com/baku89/tethr tethr
cd tethr
yarn install
yarn dev # Then open https://localhost:1234 in a browser
```
