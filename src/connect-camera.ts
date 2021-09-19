import {Tethr} from './Tethr'

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

	return await Tethr.initWithUSBDevice(descriptor.device)
}

export {Tethr}
