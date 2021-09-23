import {saveAs} from 'file-saver'
import {reactive, readonly, Ref, ref, shallowRef, watch} from 'vue'

import {detectTethr, Tethr} from '../src'
import {PropType} from '../src/props'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export interface TethrProp<T extends PropType[keyof PropType]> {
	writable: boolean
	value: T | null
	updating: boolean
	update: (value: T) => void
	options: T[]
}

export function useTethrProp<Name extends keyof PropType>(
	camera: Ref<Tethr | null>,
	name: Name
) {
	const prop = reactive({
		writable: false,
		value: null,
		updating: false,
		update: () => null,
		options: [],
	}) as TethrProp<PropType[Name]>

	watch(
		camera,
		async cam => {
			if (!cam) {
				prop.writable = false
				prop.value = null
				prop.options = []
				return
			}

			const desc = await cam.getDesc(name)

			prop.writable = desc.writable
			prop.value = desc.value
			prop.options = desc.options

			prop.update = async (value: any) => {
				prop.updating = true
				prop.value = (await cam.set(name, value)).value
				prop.updating = false
			}

			cam.on(`${name}Changed`, (desc: any) => {
				prop.value = desc.value
				prop.writable = desc.writable
				prop.options = desc.options
			})
		},
		{immediate: true}
	)

	return readonly(prop)
}

export function useTethr() {
	const camera = shallowRef<Tethr | null>(null)

	const deviceInfo = ref('')
	watch(camera, cam => {
		if (!cam) deviceInfo.value = ''
	})

	const liveviewMediaStream = ref<null | MediaStream>(null)
	const lastPictureURL = ref(TransparentPng)

	async function toggleCameraConnection() {
		if (camera.value && camera.value.opened) {
			await camera.value.close()
			camera.value = null
			return
		}

		if (!camera.value) {
			const cams = await detectTethr()
			if (cams.length === 0) throw new Error('No cameras')
			if (cams.length > 1) throw new Error('Multiple cameras')

			const cam = cams[0]
			console.log(cam.open)
			await cam.open()

			camera.value = cam

			cam.on('disconnect', () => {
				camera.value = null
			})
		}

		deviceInfo.value = JSON.stringify(
			await camera.value.getDeviceInfo(),
			undefined,
			' '
		)
		;(window as any).cam = camera.value
	}

	async function runAutoFocus() {
		await camera.value?.runAutoFocus()
	}

	async function takePicture() {
		if (!camera.value) return

		const objects = await camera.value.takePicture()

		if (objects) {
			for (const object of objects) {
				if (object.format === 'raw') {
					saveAs(object.blob, object.filename)
				} else {
					lastPictureURL.value = URL.createObjectURL(object.blob)
				}
			}
		}
	}

	const liveviewing = ref(false)
	watch(camera, cam => {
		if (!cam) liveviewing.value = false
	})

	async function toggleLiveview() {
		liveviewing.value = !liveviewing.value

		if (!camera.value) return

		if (liveviewing.value) {
			await camera.value.startLiveview()
			liveviewMediaStream.value = await camera.value.getLiveview()
		} else {
			await camera.value.stopLiveview()
			liveviewMediaStream.value = null
		}
	}

	return {
		camera,
		deviceInfo,

		// DPC
		deviceProps: {
			exposureMode: useTethrProp(camera, 'exposureMode'),
			driveMode: useTethrProp(camera, 'driveMode'),
			aperture: useTethrProp(camera, 'aperture'),
			shutterSpeed: useTethrProp(camera, 'shutterSpeed'),
			iso: useTethrProp(camera, 'iso'),
			exposureComp: useTethrProp(camera, 'exposureComp'),
			whiteBalance: useTethrProp(camera, 'whiteBalance'),
			colorTemperature: useTethrProp(camera, 'colorTemperature'),
			colorMode: useTethrProp(camera, 'colorMode'),
			imageSize: useTethrProp(camera, 'imageSize'),
			imageAspect: useTethrProp(camera, 'imageAspect'),
			imageQuality: useTethrProp(camera, 'imageQuality'),
			captureDelay: useTethrProp(camera, 'captureDelay'),
			timelapseNumber: useTethrProp(camera, 'timelapseNumber'),
			timelapseInterval: useTethrProp(camera, 'timelapseInterval'),
			focalLength: useTethrProp(camera, 'focalLength'),
			batteryLevel: useTethrProp(camera, 'batteryLevel'),
		},

		liveviewMediaStream,
		liveviewing: readonly(liveviewing),
		lastPictureURL,
		runAutoFocus,
		toggleCameraConnection,
		toggleLiveview,
		takePicture,
	}
}
