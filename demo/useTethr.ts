import {saveAs} from 'file-saver'
import {reactive, readonly, Ref, ref, shallowRef, watch} from 'vue'

import {ConfigDesc, ConfigType, detectTethr, Tethr} from '~/src'
import {ConfigName} from '~/src/configs'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export interface TethrConfig<T extends ConfigType[ConfigName]> {
	writable: boolean
	value: T | null
	update: (value: T) => void
	option: ConfigDesc<T>['option']
}

export function useTethrConfig<Name extends ConfigName>(
	camera: Ref<Tethr | null>,
	name: Name
) {
	const config = reactive({
		writable: false,
		value: null,
		update: () => null,
		option: undefined,
	}) as TethrConfig<ConfigType[Name]>

	watch(
		camera,
		async cam => {
			if (!cam) {
				config.writable = false
				config.value = null
				config.option = undefined
				return
			}

			const desc = await cam.getDesc(name)

			config.writable = desc.writable
			config.value = desc.value
			config.option = desc.option

			config.update = async (value: any) => {
				cam.set(name, value)
			}

			cam.on(`${name}Changed` as any, (desc: ConfigDesc<ConfigType[Name]>) => {
				config.value = desc.value
				config.writable = desc.writable
				config.option = desc.option
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
				if (cams.length === 0) {
					throw new Error('No camera detected')
				}
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
			cam.on('updateLiveviewStream', (ms: MediaStream | null) => {
				liveviewMediaStream.value = ms
			})
		}

		;(window as any).cam = camera.value
	}

	async function takePicture() {
		if (!camera.value) return

		const result = await camera.value.takePicture()

		if (result.status === 'ok') {
			for (const object of result.value) {
				if (object.format === 'raw') {
					saveAs(object.blob, object.filename)
				} else {
					lastPictureURL.value = URL.createObjectURL(object.blob)
				}
			}
		}
	}

	async function runAutoFocus() {
		await camera.value?.runAutoFocus()
	}

	async function toggleLiveview() {
		if (!camera.value) return

		const enabled = await camera.value.get('liveviewEnabled')

		if (enabled) {
			await camera.value.stopLiveview()
			liveviewMediaStream.value = null
		} else {
			const result = await camera.value.startLiveview()
			if (result.status === 'ok') {
				liveviewMediaStream.value = result.value
			}
		}
	}

	return {
		camera,

		// DPC
		configs: {
			manufacturer: useTethrConfig(camera, 'manufacturer'),
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
			facingMode: useTethrConfig(camera, 'facingMode'),
			focalLength: useTethrConfig(camera, 'focalLength'),
			liveviewMagnifyRatio: useTethrConfig(camera, 'liveviewMagnifyRatio'),
			liveviewEnabled: useTethrConfig(camera, 'liveviewEnabled'),
			liveviewSize: useTethrConfig(camera, 'liveviewSize'),
			batteryLevel: useTethrConfig(camera, 'batteryLevel'),

			canTakePicture: useTethrConfig(camera, 'canTakePicture'),
			canRunAutoFocus: useTethrConfig(camera, 'canRunAutoFocus'),
			canRunManualFocus: useTethrConfig(camera, 'canRunManualFocus'),
			canStartLiveview: useTethrConfig(camera, 'canStartLiveview'),
			manualFocusOptions: useTethrConfig(camera, 'manualFocusOptions'),
		},

		liveviewMediaStream,
		lastPictureURL,
		runAutoFocus,
		toggleCameraConnection,
		toggleLiveview,
		takePicture,
	}
}
