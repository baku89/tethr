import {readonly, ref, watch} from 'vue'

import {connectCamera, Tethr} from '../src'
import {Aperture, ExposureMode, ISO, PropDesc} from '../src/Tethr/Tethr'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export function useTethr() {
	let camera: Tethr | null = null

	const connected = ref(false)

	const deviceInfo = ref('')

	const liveviewURL = ref(TransparentPng)
	const lastPictureURL = ref(TransparentPng)

	const exposureMode = ref<ExposureMode | null>(null)
	const exposureModeDesc = ref<PropDesc<ExposureMode>>({
		canRead: false,
		canWrite: false,
		range: [],
	})

	const aperture = ref<Aperture | null>(null)
	const apertureDesc = ref<PropDesc<Aperture>>({
		canRead: false,
		canWrite: false,
		range: [],
	})

	const shutterSpeed = ref<string | null>(null)
	const shutterSpeedDesc = ref<PropDesc<string>>({
		canRead: false,
		canWrite: false,
		range: [],
	})

	const iso = ref<ISO | null>(null)
	const isoDesc = ref<PropDesc<ISO>>({
		canRead: false,
		canWrite: false,
		range: [],
	})

	async function toggleCameraConnection() {
		if (camera && camera.opened) {
			await camera.close()
		} else {
			if (!camera) {
				camera = await connectCamera()
				connected.value = true
			}
			if (!camera.opened) {
				await camera.open()
			}

			;(window as any).cam = camera

			deviceInfo.value = JSON.stringify(await camera.getDeviceInfo())

			exposureMode.value = await camera.getExposureMode()
			exposureModeDesc.value = await camera.getExposureModeDesc()

			iso.value = await camera.getISO()
			isoDesc.value = await camera.getISODesc()

			aperture.value = await camera.getAperture()
			apertureDesc.value = await camera.getApertureDesc()

			shutterSpeed.value = await camera.getShutterSpeed()
			shutterSpeedDesc.value = await camera.getShutterSpeedDesc()

			watch(exposureMode, v => camera?.setExposureMode(v))
			watch(aperture, v => camera?.setAperture(v))
			watch(shutterSpeed, v => camera?.setShutterSpeed(v))
			watch(iso, v => camera?.setISO(v))
		}
	}

	async function runAutoFocus() {
		await camera?.runAutoFocus()
	}

	async function takePicture() {
		if (!camera) return

		const url = await camera.takePicture()
		if (url) lastPictureURL.value = url
	}

	const liveviewing = ref(false)

	async function toggleLiveview() {
		liveviewing.value = !liveviewing.value

		if (!camera) return

		if (liveviewing.value) {
			await camera.startLiveView()
			updateLiveview()
		} else {
			await camera.stopLiveView()
		}

		async function updateLiveview() {
			if (!liveviewing.value) return

			try {
				const url = await camera?.getLiveView()
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
		exposureModeDesc,
		aperture,
		apertureDesc,
		shutterSpeed,
		shutterSpeedDesc,
		iso,
		isoDesc,
		liveviewURL,
		liveviewing: readonly(liveviewing),
		lastPictureURL,
		runAutoFocus,
		toggleCameraConnection,
		toggleLiveview,
		takePicture,
	}
}
