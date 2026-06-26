import {
	ConfigDesc,
	ConfigDescOption,
	ConfigName,
	ConfigNameList,
	ConfigType,
	isUserCancelledError,
	Tethr,
	TethrDeviceType,
	TethrIdentifier,
	TethrManager,
} from 'tethr'
import {
	onUnmounted,
	readonly,
	ref,
	Ref,
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

	// True while a connection is being established. Exposed so consumers (e.g.
	// auto-reconnect) can avoid racing an in-flight connect: requestCamera mutates
	// pairedCameras before the camera is actually opened.
	const isConnecting = ref(false)

	manager.addListener('pairedCameraChange', cameras => {
		pairedCameras.value = cameras
	})

	async function open(cam: Tethr) {
		if (camera.value) {
			await close()
		}

		await cam.open()
		camera.value = cam

		cam.on('disconnect', () => {
			camera.value = null
		})
	}

	async function close() {
		if (!camera.value) return

		camera.value.removeAllListeners()
		await camera.value.close()

		camera.value = null
	}

	async function requestCamera(
		query: TethrDeviceType | TethrIdentifier,
		opts?: {prompt?: boolean}
	) {
		if (isConnecting.value) return
		isConnecting.value = true
		try {
			const cam = await manager.requestCamera(query, opts)
			if (cam) await open(cam)
		} catch (err) {
			if (err instanceof Error && !isUserCancelledError(err)) {
				alert(err.message)
			}
		} finally {
			isConnecting.value = false
		}
	}

	async function toggleLiveview() {
		if (!camera.value) return
		const liveview = await camera.value.getLiveview()

		if (liveview) {
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
		isConnecting: readonly(isConnecting),
		open,
		close,
		camera,
		toggleLiveview,
		// DPC
		configs: Object.fromEntries(
			ConfigNameList.map(name => [name, useTethrConfig(camera, name)])
		) as {[N in ConfigName]: TethrConfig<ConfigType[N]>},
	}
}
