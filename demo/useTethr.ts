import {ref, watch} from 'vue'

import {connectCamera, Tethr} from '../src/Tethr'
import {Aperture, ExposureMode, PropDescEnum} from '../src/Tethr/Tethr'

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

			shutterSpeed.value = await camera.getShutterSpeed()
			shutterSpeedDesc.value = await camera.getShutterSpeedDesc()
			console.log('shutterspeed', shutterSpeed.value, shutterSpeedDesc.value)

			aperture.value = await camera.getAperture()
			apertureDesc.value = await camera.getApertureDesc()

			watch(exposureMode, v => camera?.setExposureMode(v))
			watch(shutterSpeed, v => camera?.setShutterSpeed(v))
			watch(aperture, v => camera?.setAperture(v))
		}
	}

	async function takePicture() {
		if (!camera) return

		const url = await camera.takePicture()
		if (url) lastPictureURL.value = url
	}

	return {
		connected,
		aperture,
		apertureDesc,
		shutterSpeed,
		shutterSpeedDesc,
		exposureMode,
		exposureModeDesc,
		liveviewURL,
		lastPictureURL,
		toggleCameraConnection,
		takePicture,
	}
}
