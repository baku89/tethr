<div align="center">
  <img src="docs/logo.svg" width="50%" />
  <br>
  <br>
  <h1>Tethr</h1>
</div>
  
Tethr is a JavaScript/TypeScript library for controlling USB-connected digital cameras from browsers.

It is built on the top of [WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/USB) and aims to support cameras from various vendors. There is a protocol called PTP (Picture Transfer Protocol), which provides a way to access cameras' functionalities such as shutter, aperture, ISO and so on via USB or TCP/IP. However, most of cameras adopt their own vendor extensions to communitate with PC and there's hardly any compatability between them. Tethr also aims to fill the gap and provide an uniform and modern interface for developers without worrying about the difference. The project is deeply inspired by [libgphoto2](https://github.com/gphoto/libgphoto2).

## Setup Development Environment

```
git clone https://github.com/baku89/tethr tethr
cd tethr
yarn install
yarn dev # Then open https://localhost:1234 with a browser
```

## Sample Code

This project is on very early stage of development and not yet documented. Here is the sample code for you to grasp how to use the library:

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
	options: ['M', 'S', 'A', 'P']
} */

const autoFocusResult = await cam.runAutoFocus()

if (!autoFocusResult.status !== 'ok') {
	console.warn('AF failed')
}

const takePictureResult = await cam.takePicture({download: true})

if (takePictureResult.status === 'ok') {
	const url = URL.createURLObject(pictures[0].blob)
	$img.src = url
}

await cam.close()

```