import {PTPDevice} from '../PTPDevice'
import {DeviceInfo, Tethr} from './Tethr'
import {TethrPanasonic} from './TethrPanasonic'
import {TethrRicohTheta} from './TethrRicohTheta'
import {TethrSigma} from './TethrSigma'

export interface TethrDeviceDescriptorPTPUSB {
	type: 'ptp/usb'
	device: USBDevice
}

export async function initTethrWithUSBDevice(
	usb: USBDevice
): Promise<Tethr | null> {
	const device = new PTPDevice(usb)
	let info: DeviceInfo

	try {
		await device.open()
		info = await Tethr.getDeviceInfo(device)
	} catch {
		return null
	}

	let tethr: Tethr | null = null

	switch (info.vendorExtensionID) {
		case 0x00000006: // Microsoft / Sigma / Ricoh
			if (info.vendorExtensionDesc === 'SIGMA') {
				tethr = new TethrSigma(device)
			} else if (info.model.match(/theta/i)) {
				tethr = new TethrRicohTheta(device)
			}
			break
		case 0x0000001c: // Panasnoic
			tethr = new TethrPanasonic(device)
			break
	}

	if (!tethr) {
		tethr = new Tethr(device)
	}

	return tethr
}

export {Tethr}
