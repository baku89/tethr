import {Tethr} from './Tethr'
import {initTethrUSBPTP} from './TethrPTPUSB'
import {initTethrWebcam} from './TethrWebcam'
import {usb} from './usb'
import {isntNil} from './util'

export async function detectCameras(): Promise<Tethr[]> {
	const cameras: Tethr[] = []

	cameras.push(...(await detectPairedPTPUSBCameras()))

	if (cameras.length > 0) return cameras

	cameras.push(...(await requestPTPUSBCameras()))

	if (cameras.length > 0) return cameras

	cameras.push(...(await detectWebcams()))

	return cameras

	async function detectPairedPTPUSBCameras() {
		if (!usb) return []

		const devices = await usb.getDevices()
		const promises = await Promise.all(devices.map(initTethrUSBPTP))
		const cameras = promises.filter(isntNil)

		console.log(devices, promises, cameras)

		return cameras
	}

	async function requestPTPUSBCameras() {
		if (!usb) return []

		let usbDevice: USBDevice
		try {
			usbDevice = await usb.requestDevice({filters: []})
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
}
