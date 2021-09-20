import {PTPDevice} from '../PTPDevice'
import {TethrPanasonic} from './panasonic/TethrPanasonic'
import {TethrRicohTheta} from './ricoh/TethrRicohTheta'
import {TethrSigma} from './sigma/TethrSigma'
import {DeviceInfo, Tethr} from './Tethr'

export interface TethrDeviceDescriptorPTPUSB {
	type: 'ptp/usb'
	device: USBDevice
}

export async function initTethrWithUSBDevice(
	usb: USBDevice
): Promise<Tethr | null> {
	const device = new PTPDevice(usb)
	await device.open()

	let info: DeviceInfo

	try {
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

	await tethr.open()

	return tethr
}

export {Tethr}
