import {ref, watch} from 'vue'

import {Aperture, CameraControl, connectCamera} from '../src/CameraControl'
import {ExposureMode, PropDescEnum} from '../src/CameraControl/CameraControl'

const TransparentPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export function useCameraControl() {
	let camera: CameraControl | null = null

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

			exposureMode.value = await camera.getExposureMode()
			exposureModeDesc.value = await camera.getExposureModeDesc()

			aperture.value = await camera.getAperture()
			apertureDesc.value = await camera.getApertureDesc()

			watch(exposureMode, mode => camera?.setExposureMode(mode))
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
		exposureMode,
		exposureModeDesc,
		liveviewURL,
		lastPictureURL,
		toggleCameraConnection,
		takePicture,
	}
}
