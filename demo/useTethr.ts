import {ref, watch} from 'vue'

import {connectCamera, Tethr} from '../src/Tethr'
import {Aperture, ExposureMode, ISO, PropDescEnum} from '../src/Tethr/Tethr'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export function useTethr() {
	let camera: Tethr | null = null

	const connected = ref(false)

	const liveviewURL = ref(TransparentPng)
	const lastPictureURL = ref(TransparentPng)

	const exposureMode = ref<ExposureMode | null>(null)
	const exposureModeDesc = ref<PropDescEnum<ExposureMode>>({
		canRead: false,
		canWrite: false,
		range: [],
	})

	const aperture = ref<Aperture | null>(null)
	const apertureDesc = ref<PropDescEnum<Aperture>>({
		canRead: false,
		canWrite: false,
		range: [],
	})

	const shutterSpeed = ref<string | null>(null)
	const shutterSpeedDesc = ref<PropDescEnum<string>>({
		canRead: false,
		canWrite: false,
		range: [],
	})

	const iso = ref<ISO | null>(null)
	const isoDesc = ref<PropDescEnum<ISO>>({
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

			exposureMode.value = await camera.getExposureMode()
			exposureModeDesc.value = await camera.getExposureModeDesc()

			iso.value = await camera.getISO()
			isoDesc.value = await camera.getISODesc()

			aperture.value = await camera.getAperture()
			apertureDesc.value = await camera.getApertureDesc()

			watch(exposureMode, v => camera?.setExposureMode(v))
			watch(aperture, v => camera?.setAperture(v))
			watch(shutterSpeed, v => camera?.setShutterSpeed(v))
			watch(iso, v => camera?.setISO(v))
		}
	}

	async function takePicture() {
		if (!camera) return

		const url = await camera.takePicture()
		if (url) lastPictureURL.value = url
	}

	return {
		connected,
		exposureMode,
		exposureModeDesc,
		aperture,
		apertureDesc,
		shutterSpeed,
		shutterSpeedDesc,
		iso,
		isoDesc,
		liveviewURL,
		lastPictureURL,
		toggleCameraConnection,
		takePicture,
	}
}
