import {PTPDevice} from './PTPDevice'
import {Tethr} from './Tethr'
import {TethrPanasonic} from './Tethr/panasonic/TethrPanasonic'
import {TethrRicoh} from './Tethr/ricoh/TethrRicoh'
import {TethrSigma} from './Tethr/sigma/TethrSigma'
import {DeviceInfo} from './Tethr/Tethr'

interface TethrDeviceDescriptorPTPUSB {
	type: 'ptp/usb'
	device: USBDevice
}

interface TethrDeviceDescriptorWebcam {
	type: 'webcam'
	device: MediaStream
}

type TethrDeviceDescriptor =
	| TethrDeviceDescriptorPTPUSB
	| TethrDeviceDescriptorWebcam

export async function listCameras(): Promise<TethrDeviceDescriptor[]> {
	const descs: TethrDeviceDescriptor[] = []

	if (navigator.usb) {
		const usbDevices = await navigator.usb.getDevices()
		const ds: TethrDeviceDescriptor[] = usbDevices.map(device => ({
			type: 'ptp/usb',
			device,
		}))
		descs.push(...ds)

		if (descs.length === 0) {
			const device = await navigator.usb.requestDevice({filters: []})
			descs.push({type: 'ptp/usb', device})
		}
	}

	// if (navigator.mediaDevices) {
	// 	try {
	// 		const device = await navigator.mediaDevices.getUserMedia({video: true})
	// 		descs.push({type: 'webcam', device})
	// 	} catch (err) {
	// 		null
	// 	}
	// }

	return descs
}

window.listCameras = listCameras

export async function connectCamera(
	descriptor: TethrDeviceDescriptor
): Promise<Tethr | null> {
	if (descriptor.type !== 'ptp/usb')
		throw new Error(
			`Tether interface ${descriptor.type} is not yet implemented`
		)

	return await initTethrWithUSBDevice(descriptor.device)
}

async function initTethrWithUSBDevice(usb: USBDevice): Promise<Tethr | null> {
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
			} else if (info.manufacturer.match(/ricoh/i)) {
				tethr = new TethrRicoh(device)
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
