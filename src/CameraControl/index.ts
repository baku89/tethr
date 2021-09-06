import {PTPDevice} from '../PTPDevice'
import {CameraControl} from './CameraControl'
import {CameraControlPanasnoic} from './CameraControlPanasnoic'
import {CameraControlSigma} from './CameraControlSigma'

export async function connectCamera(): Promise<CameraControl> {
	const device = new PTPDevice()
	await device.open()

	const info = await CameraControl.getDeviceInfo(device)

	let camera: CameraControl | null = null

	switch (info.VendorExtensionID) {
		case 0x00000006: // Microsoft / Sigma
			if (info.VendorExtensionDesc === 'SIGMA') {
				camera = new CameraControlSigma(device)
			}
			break
		case 0x0000001c: // Panasnoic
			camera = new CameraControlPanasnoic(device)
			break
	}

	if (!camera) {
		camera = new CameraControl(device)
	}

	await camera.open()

	return camera
}

export {CameraControl}
