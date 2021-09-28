```ts
import * as tethr from 'tethr'

const cameras = tethr.autoDetect({type: 'ptp/usb'})

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

await cam.run('doAutoFocus')
const afSucceed = await cam.doAutoFocus()

if (!afSucceed) {
	console.warn('AF failed')
}


await cam.run('takePicture', {download: true})
const pictures = await cam.takePicture({download: true})

const url = URL.createURLObject(pictures[0].blob)
$img.src = url

await cam.close()

```