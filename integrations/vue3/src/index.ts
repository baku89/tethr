import {
	ConfigDesc,
	ConfigDescOption,
	ConfigName,
	ConfigType,
	Tethr,
	TethrManager,
} from 'tethr'
import {
	onUnmounted,
	readonly,
	Ref,
	ref,
	shallowReactive,
	shallowRef,
	watch,
} from 'vue'

import {useDebounceAsync} from './useDebounceAsync'

export interface TethrConfig<T> {
	writable: boolean
	value: T | null
	target: T | null
	set: (value: T) => void
	option?: ConfigDescOption<T>
}

function useTethrConfig<N extends ConfigName>(
	camera: Ref<Tethr | null>,
	name: N
): TethrConfig<ConfigType[N]> {
	const config = shallowReactive<TethrConfig<ConfigType[N]>>({
		writable: false,
		value: null,
		target: null,
		set: () => null,
		option: undefined,
	})

	watch(
		camera,
		async camera => {
			if (!camera) {
				config.writable = false
				config.value = null
				config.option = undefined
				return
			}

			const desc = await camera.getDesc(name)

			config.writable = desc.writable
			config.value = desc.value
			config.option = desc.option

			const {fn: set} = useDebounceAsync(
				(value: ConfigType[N]) => {
					config.value = value
					return camera.set(name, value)
				},
				{
					onQueue(value) {
						config.target = value
					},
					onFinish() {
						config.target = null
					},
				}
			)

			config.set = set

			camera.on(`${name}Change` as any, (desc: ConfigDesc<ConfigType[N]>) => {
				const isSetting = config.target !== null && config.target !== desc.value

				if (isSetting) return

				config.value = desc.value
				config.writable = desc.writable
				config.option = desc.option
			})
		},
		{immediate: true}
	)

	return readonly(config) as TethrConfig<ConfigType[N]>
}

export function useTethr() {
	const manager = new TethrManager()

	const pairedCameras = shallowRef<Tethr[]>([])
	const camera = shallowRef<Tethr | null>(null)

	manager.addListener('pairedCameraChange', cameras => {
		pairedCameras.value = cameras
	})

	const liveviewMediaStream = ref<null | MediaStream>(null)

	function onDisconnect() {
		camera.value = null
	}

	function onLivewviewStreamUpdate(ms: MediaStream | null) {
		liveviewMediaStream.value = ms
	}

	async function open(cam: Tethr) {
		if (camera.value) {
			close()
		}

		await cam.open()
		camera.value = cam
		cam.on('disconnect', onDisconnect)
		cam.on('liveviewStreamUpdate', onLivewviewStreamUpdate)
	}

	async function close() {
		if (!camera.value) return

		camera.value.off('disconnect', onDisconnect)
		camera.value.off('liveviewStreamUpdate', onLivewviewStreamUpdate)
		await camera.value.close()

		camera.value = null
	}

	async function requestCamera(type: 'usbptp' | 'webcam') {
		let cam: Tethr | null
		try {
			cam = await manager.requestCamera(type)
			if (!cam) return
		} catch (err) {
			if (err instanceof Error) {
				alert(err.message)
			}
			return
		}

		await open(cam)
	}

	async function toggleLiveview() {
		if (!camera.value) return
		const enabled = await camera.value.getLiveviewEnabled()

		if (enabled === null) return

		if (enabled) {
			await camera.value.stopLiveview()
		} else {
			await camera.value.startLiveview()
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
		requestCamera,
		open,
		close,
		camera,
		liveviewMediaStream,
		toggleLiveview,
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
	}
}
