import {saveAs} from 'file-saver'
import {reactive, readonly, Ref, ref, shallowRef, watch} from 'vue'

import {ConfigDesc} from '@/Tethr'

import {detectTethr, Tethr} from '../src'
import {ConfigType} from '../src/configs'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export interface TethrConfig<T extends ConfigType[keyof ConfigType]> {
	writable: boolean
	value: T | null
	update: (value: T) => void
	options: T[]
}

export function useTethrConfig<Name extends keyof ConfigType>(
	camera: Ref<Tethr | null>,
	name: Name
) {
	const config = reactive({
		writable: false,
		value: null,
		update: () => null,
		options: [],
	}) as TethrConfig<ConfigType[Name]>

	watch(
		camera,
		async cam => {
			if (!cam) {
				config.writable = false
				config.value = null
				config.options = []
				return
			}

			const desc = await cam.getDesc(name)

			config.writable = desc.writable
			config.value = desc.value
			config.options = desc.options

			config.update = async (value: any) => {
				cam.set(name, value)
			}

			cam.on(`${name}Changed` as any, (desc: ConfigDesc<ConfigType[Name]>) => {
				config.value = desc.value
				config.writable = desc.writable
				config.options = desc.options
			})
		},
		{immediate: true}
	)

	return readonly(config)
}

export function useTethr() {
	const camera = shallowRef<Tethr | null>(null)

	const liveviewMediaStream = ref<null | MediaStream>(null)
	const lastPictureURL = ref(TransparentPng)

	async function toggleCameraConnection() {
		if (camera.value && camera.value.opened) {
			await camera.value.close()
			camera.value = null
			return
		}

		if (!camera.value) {
			let cams: Tethr[]

			try {
				cams = await detectTethr()
			} catch (err) {
				if (err instanceof Error) {
					alert(err.message)
				}
				return
			}

			const cam = cams[0]
			await cam.open()

			camera.value = cam

			cam.on('disconnect', () => {
				camera.value = null
			})
		}

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
			liveviewMediaStream.value = await camera.value.startLiveview()
		} else {
			await camera.value.stopLiveview()
			liveviewMediaStream.value = null
		}
	}

	return {
		camera,

		// DPC
		configs: {
			model: useTethrConfig(camera, 'model'),
			exposureMode: useTethrConfig(camera, 'exposureMode'),
			driveMode: useTethrConfig(camera, 'driveMode'),
			aperture: useTethrConfig(camera, 'aperture'),
			shutterSpeed: useTethrConfig(camera, 'shutterSpeed'),
			iso: useTethrConfig(camera, 'iso'),
			exposureComp: useTethrConfig(camera, 'exposureComp'),
			whiteBalance: useTethrConfig(camera, 'whiteBalance'),
			colorTemperature: useTethrConfig(camera, 'colorTemperature'),
			colorMode: useTethrConfig(camera, 'colorMode'),
			imageSize: useTethrConfig(camera, 'imageSize'),
			imageAspect: useTethrConfig(camera, 'imageAspect'),
			imageQuality: useTethrConfig(camera, 'imageQuality'),
			captureDelay: useTethrConfig(camera, 'captureDelay'),
			timelapseNumber: useTethrConfig(camera, 'timelapseNumber'),
			timelapseInterval: useTethrConfig(camera, 'timelapseInterval'),
			focalLength: useTethrConfig(camera, 'focalLength'),
			liveviewMagnifyRatio: useTethrConfig(camera, 'liveviewMagnifyRatio'),
			batteryLevel: useTethrConfig(camera, 'batteryLevel'),
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
