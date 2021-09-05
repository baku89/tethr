import {PTPDevice} from '../PTPDevice'
import {CameraControl} from './CameraControl'
import {CameraControlSigma} from './CameraControlSigma'

export async function connectCamera(): Promise<CameraControl> {
	const device = new PTPDevice()

	await device.connect()

	const info = await device.getInfo()

	let camera: CameraControl | null = null

	switch (info.VendorExtensionID) {
		case 0x00000006: // Microsoft / Sigma
			if (info.VendorExtensionDesc === 'SIGMA') {
				camera = new CameraControlSigma(device)
			}
	}

	if (!camera) {
		camera = new CameraControl(device)
	}

	await camera.open()

	return camera
}

export {CameraControl}
