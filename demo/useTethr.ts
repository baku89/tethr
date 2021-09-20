import {saveAs} from 'file-saver'
import {reactive, readonly, Ref, ref, shallowRef, watch} from 'vue'

import {connectCamera, Tethr} from '../src'
import {listCameras} from '../src/connect-camera'
import {PropNames, PropType} from '../src/Tethr/Tethr'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export interface TethrProp<T extends PropType[PropNames]> {
	writable: boolean
	value: T | null
	updating: boolean
	update: (value: T) => void
	supportedValues: T[]
}

export function useTethrProp<Name extends PropNames>(
	camera: Ref<Tethr | null>,
	name: Name
) {
	const prop = reactive({
		writable: false,
		value: null,
		updating: false,
		update: () => null,
		supportedValues: [],
	}) as TethrProp<PropType[Name]>

	watch(
		camera,
		async cam => {
			if (!cam) return

			const desc = await cam.getDesc(name)

			prop.writable = desc.writable
			prop.value = desc.value
			prop.supportedValues = desc.supportedValues

			prop.update = async (value: any) => {
				prop.updating = true
				prop.value = (await cam.set(name, value)).value
				prop.updating = false
			}

			cam.on(`${name}Changed`, (desc: any) => {
				prop.value = desc.value
				prop.writable = desc.writable
				prop.supportedValues = desc.supportedValues
			})
		},
		{immediate: true}
	)

	return readonly(prop)
}

export function useTethr() {
	const camera = shallowRef<Tethr | null>(null)

	const connected = ref(false)

	const deviceInfo = ref('')

	const liveviewURL = ref(TransparentPng)
	const lastPictureURL = ref(TransparentPng)

	async function toggleCameraConnection() {
		if (camera.value && camera.value.opened) {
			await camera.value.close()
		} else {
			if (!camera.value) {
				const cams = await listCameras()
				if (cams.length === 0) throw new Error('No cameras')
				const cam = await connectCamera(cams[0])
				if (!cam.open) {
					await cam.open()
				}
				camera.value = cam
				connected.value = true
			}

			deviceInfo.value = JSON.stringify(await camera.value.getDeviceInfo())
			;(window as any).cam = camera.value
		}
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

	async function toggleLiveview() {
		liveviewing.value = !liveviewing.value

		if (!camera.value) return

		if (liveviewing.value) {
			await camera.value.startLiveview()
			updateLiveview()
		} else {
			await camera.value.stopLiveview()
		}

		async function updateLiveview() {
			if (!liveviewing.value || !camera.value) return

			try {
				const liveview = await camera.value.getLiveview()
				if (liveview) {
					URL.revokeObjectURL(liveviewURL.value)
					liveviewURL.value = URL.createObjectURL(liveview.image)
				}
			} finally {
				requestAnimationFrame(updateLiveview)
			}
		}
	}

	return {
		connected,
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
			imageResolution: useTethrProp(camera, 'imageResolution'),
			aspectRatio: useTethrProp(camera, 'aspectRatio'),
			imageQuality: useTethrProp(camera, 'imageQuality'),
			captureDelay: useTethrProp(camera, 'captureDelay'),
			timelapseNumber: useTethrProp(camera, 'timelapseNumber'),
			timelapseInterval: useTethrProp(camera, 'timelapseInterval'),
			focalLength: useTethrProp(camera, 'focalLength'),
			batteryLevel: useTethrProp(camera, 'batteryLevel'),
		},

		liveviewURL,
		liveviewing: readonly(liveviewing),
		lastPictureURL,
		runAutoFocus,
		toggleCameraConnection,
		toggleLiveview,
		takePicture,
	}
}
