import {
	ConfigDesc,
	ConfigDescOption,
	ConfigName,
	ConfigType,
	detectCameras,
	Tethr,
	TethrObject,
} from 'tethr'
import {reactive, readonly, Ref, ref, shallowRef, watch} from 'vue'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export interface TethrConfig<T extends ConfigType[ConfigName]> {
	writable: boolean
	value: T | null
	update: (value: T) => void
	option?: ConfigDescOption<T>
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
			if (desc.writable) {
				config.option = desc.option
			}

			config.update = async (value: any) => {
				cam.set(name, value)
			}

			cam.on(`${name}Changed` as any, (desc: ConfigDesc<ConfigType[Name]>) => {
				config.value = desc.value
				config.writable = desc.writable
				if (desc.writable) {
					config.option = desc.option
				}
			})
		},
		{immediate: true}
	)

	return readonly(config)
}

export function useTethr(onSave: (object: TethrObject) => void) {
	const camera = shallowRef<Tethr | null>(null)
	const liveviewMediaStream = ref<null | MediaStream>(null)
	const photoURL = ref(TransparentPng)
	async function toggleCameraConnection() {
		if (camera.value && camera.value.opened) {
			await camera.value.close()
			camera.value = null
			return
		}
		if (!camera.value) {
			let cams: Tethr[]
			try {
				cams = await detectCameras()
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
			cam.on('liveviewStreamUpdate', (ms: MediaStream | null) => {
				liveviewMediaStream.value = ms
			})
		}
		;(window as any).cam = camera.value
	}
	async function takePhoto() {
		if (!camera.value) return
		const result = await camera.value.takePhoto()
		if (result.status === 'ok') {
			for (const object of result.value) {
				if (object.format !== 'raw') {
					photoURL.value = URL.createObjectURL(object.blob)
				}
				onSave(object)
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
			serialNumber: useTethrConfig(camera, 'serialNumber'),
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
			focusDistance: useTethrConfig(camera, 'focusDistance'),
			liveviewMagnifyRatio: useTethrConfig(camera, 'liveviewMagnifyRatio'),
			liveviewEnabled: useTethrConfig(camera, 'liveviewEnabled'),
			liveviewSize: useTethrConfig(camera, 'liveviewSize'),
			destinationToSave: useTethrConfig(camera, 'destinationToSave'),
			batteryLevel: useTethrConfig(camera, 'batteryLevel'),
			canTakePhoto: useTethrConfig(camera, 'canTakePhoto'),
			canRunAutoFocus: useTethrConfig(camera, 'canRunAutoFocus'),
			canRunManualFocus: useTethrConfig(camera, 'canRunManualFocus'),
			canStartLiveview: useTethrConfig(camera, 'canStartLiveview'),
			manualFocusOptions: useTethrConfig(camera, 'manualFocusOptions'),
		},
		liveviewMediaStream,
		photoURL,
		runAutoFocus,
		toggleCameraConnection,
		toggleLiveview,
		takePhoto,
	}
}
