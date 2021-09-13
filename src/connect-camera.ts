import {PTPDevice} from './PTPDevice'
import {Tethr} from './Tethr'
import {TethrPanasnoic} from './Tethr/panasonic/TethrPanasonic'
import {TethrSigma} from './Tethr/sigma/TethrSigma'

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

	if (navigator.mediaDevices) {
		try {
			const device = await navigator.mediaDevices.getUserMedia({video: true})
			descs.push({type: 'webcam', device})
		} catch (err) {
			null
		}
	}

	return descs
}

window.listCameras = listCameras

export async function connectCamera(
	descriptor: TethrDeviceDescriptor
): Promise<Tethr> {
	if (descriptor.type !== 'ptp/usb')
		throw new Error(
			`Tether interface ${descriptor.type} is not yet implemented`
		)

	const device = new PTPDevice(descriptor.device)
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
