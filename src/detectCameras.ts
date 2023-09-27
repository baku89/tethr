import {Tethr} from './Tethr'
import {initTethrUSBPTP} from './TethrPTPUSB'
import {initTethrWebcam} from './TethrWebcam'
import {isntNil} from './util'

async function detectPairedPTPUSBCameras() {
	const devices = await navigator.usb.getDevices()
	const promises = await Promise.all(devices.map(initTethrUSBPTP))
	const cameras = promises.filter(isntNil)

	return cameras
}

async function requestPTPUSBCameras() {
	let usbDevice: USBDevice
	try {
		usbDevice = await navigator.usb.requestDevice({filters: []})
	} catch {
		return []
	}

	const camera = await initTethrUSBPTP(usbDevice)

	if (!camera) return []

	return [camera]
}

async function detectWebcams() {
	const camera = initTethrWebcam()

	return [camera]
}

export async function detectCameras(): Promise<Tethr[]> {
	const cameras: Tethr[] = []

	cameras.push(...(await detectPairedPTPUSBCameras()))

	if (cameras.length > 0) return cameras

	cameras.push(...(await requestPTPUSBCameras()))

	if (cameras.length > 0) return cameras

	cameras.push(...(await detectWebcams()))

	return cameras
}
