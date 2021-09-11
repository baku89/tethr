import {reactive, readonly, Ref, ref, shallowRef, watch} from 'vue'

import {connectCamera, Tethr} from '../src'
import {BasePropType} from '../src/Tethr/Tethr'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export function useTethrProp<Name extends keyof BasePropType>(
	camera: Ref<Tethr | null>,
	name: Name
) {
	const propDesc = reactive({
		writable: false,
		value: Tethr.Unknown as any,
		updating: false,
		update(value: any) {
			return
		},
		supportedValues: null as null | any[],
	})

	watch(camera, async cam => {
		if (!cam) return

		const desc = await cam.getDesc(name)

		propDesc.writable = desc.writable
		propDesc.value = desc.value

		propDesc.update = async (value: any) => {
			propDesc.updating = true
			propDesc.value = await cam.set(name, value)
			propDesc.updating = false
		}

		if (desc.writable) {
			propDesc.supportedValues = desc.supportedValues
		}
	})

	return readonly(propDesc)
}

export function useTethr() {
	const camera = shallowRef<Tethr | null>(null)

	const connected = ref(false)

	const deviceInfo = ref('')

	const liveviewURL = ref(TransparentPng)
	const lastPictureURL = ref(TransparentPng)

	const exposureMode = useTethrProp(camera, 'exposureMode')
	const aperture = useTethrProp(camera, 'aperture')
	const shutterSpeed = useTethrProp(camera, 'shutterSpeed')
	const iso = useTethrProp(camera, 'iso')

	async function toggleCameraConnection() {
		if (camera.value && camera.value.opened) {
			await camera.value.close()
		} else {
			if (!camera.value) {
				camera.value = await connectCamera()
				connected.value = true
			}
			if (!camera.value.open) {
				await camera.value.open()
			}

			;(window as any).cam = camera.value
		}
	}

	async function runAutoFocus() {
		await camera.value?.runAutoFocus()
	}

	async function takePicture() {
		if (!camera.value) return

		const url = await camera.value.takePicture()
		if (url) lastPictureURL.value = url
	}

	const liveviewing = ref(false)

	async function toggleLiveview() {
		liveviewing.value = !liveviewing.value

		if (!camera.value) return

		if (liveviewing.value) {
			await camera.value.startLiveView()
			updateLiveview()
		} else {
			await camera.value.stopLiveView()
		}

		async function updateLiveview() {
			if (!liveviewing.value || !camera.value) return

			try {
				const url = await camera.value.getLiveView()
				if (url) {
					URL.revokeObjectURL(liveviewURL.value)
					liveviewURL.value = url
				}
			} finally {
				requestAnimationFrame(updateLiveview)
			}
		}
	}

	return {
		connected,
		deviceInfo,
		exposureMode,
		aperture,
		shutterSpeed,
		iso,
		liveviewURL,
		liveviewing: readonly(liveviewing),
		lastPictureURL,
		runAutoFocus,
		toggleCameraConnection,
		toggleLiveview,
		takePicture,
	}
}
