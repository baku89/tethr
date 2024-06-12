import {
	ConfigDesc,
	ConfigDescOption,
	ConfigName,
	ConfigType,
	Tethr,
	TethrManager,
} from 'tethr'
import {onUnmounted, reactive, readonly, Ref, ref, shallowRef, watch} from 'vue'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export interface TethrConfig<T> {
	writable: boolean
	value: T | null
	update: (value: T) => void
	option?: ConfigDescOption<T>
}

export function useTethrConfig<N extends ConfigName>(
	camera: Ref<Tethr | null>,
	name: N
) {
	const config = reactive({
		writable: false,
		value: null,
		update: () => null,
		option: undefined,
	}) as TethrConfig<ConfigType[N]>

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

			config.update = (value: ConfigType[N]) => cam.set(name, value)

			cam.on(`${name}Change` as any, (desc: ConfigDesc<ConfigType[N]>) => {
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
	const manager = new TethrManager()

	const pairedCameras = shallowRef<Tethr[]>([])

	manager.addListener('pairedCameraChange', cameras => {
		pairedCameras.value = cameras
	})

	const camera = shallowRef<Tethr | null>(null)

	const liveviewMediaStream = ref<null | MediaStream>(null)

	const photoURL = ref(TransparentPng)

	function onDisconnect() {
		camera.value = null
	}

	function onLivewviewStreamUpdate(ms: MediaStream | null) {
		liveviewMediaStream.value = ms
	}

	async function openCamera(cam: Tethr) {
		if (camera.value) {
			await closeCamera(camera.value)
		}

		await cam.open()
		camera.value = cam
		cam.on('disconnect', onDisconnect)
		cam.on('liveviewStreamUpdate', onLivewviewStreamUpdate)
	}

	async function closeCamera(cam: Tethr) {
		if (!camera.value) return

		camera.value.off('disconnect', onDisconnect)
		camera.value.off('liveviewStreamUpdate', onLivewviewStreamUpdate)
		await camera.value.close()

		if (camera.value === cam) {
			camera.value = null
		}
	}

	async function requestCameras(type: 'usbptp' | 'webcam') {
		let cam: Tethr | null
		try {
			cam = await manager.requestCamera(type)
			if (!cam) {
				return
			}
		} catch (err) {
			if (err instanceof Error) {
				alert(err.message)
			}
			return
		}

		await openCamera(cam)
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

	onUnmounted(() => {
		if (camera.value) {
			camera.value.close()
			camera.value = null
		}
	})

	return {
		pairedCameras,
		openCamera,
		closeCamera,
		camera,
		requestCameras,
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
			focusMeteringMode: useTethrConfig(camera, 'focusMeteringMode'),
			focusPeaking: useTethrConfig(camera, 'focusPeaking'),
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
			shutterSound: useTethrConfig(camera, 'shutterSound'),
		},
		liveviewMediaStream,
		photoURL,
		toggleLiveview,
	}
}
