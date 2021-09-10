import {PTPDevice} from './PTPDevice'
import {Tethr} from './Tethr'
import {TethrPanasnoic} from './Tethr/panasonic/TethrPanasonic'
import {TethrSigma} from './Tethr/sigma/TethrSigma'

export async function connectCamera(): Promise<Tethr> {
	const device = new PTPDevice()
	await device.open()

	const info = await Tethr.getDeviceInfo(device)

	let camera: Tethr | null = null

	switch (info.vendorExtensionID) {
		case 0x00000006: // Microsoft / Sigma
			if (info.vendorExtensionDesc === 'SIGMA') {
				camera = new TethrSigma(device)
			}
			break
		case 0x0000001c: // Panasnoic
			camera = new TethrPanasnoic(device)
			break
	}

	if (!camera) {
		camera = new Tethr(device)
	}

	await camera.open()
	return camera
}

export {Tethr}
