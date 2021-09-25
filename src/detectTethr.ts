import {Tethr} from './Tethr'
import {initTethrUSBPTP} from './TethrPTPUSB'
import {initTethrWebcam} from './TethrWebcam'
import {isntNil} from './util'

const usb = navigator.usb

type TethrDetectStrategy = 'first' | 'all'

type DetectTethrOption = {
	strategy?: TethrDetectStrategy
}

export async function detectTethr({
	strategy = 'first',
}: DetectTethrOption = {}) {
	const tethrs: Tethr[] = []

	tethrs.push(...(await detectPairedTethrPTPUSB()))

	if (strategy === 'first' && tethrs.length > 0) return tethrs

	tethrs.push(...(await requestTethrPTPUSB()))

	if (strategy === 'first' && tethrs.length > 0) return tethrs

	tethrs.push(...(await detectTethrWebcam()))

	return tethrs

	async function detectPairedTethrPTPUSB() {
		if (!usb) return []

		const pairedDevices = await usb.getDevices()
		const pairedPromises = Promise.all(pairedDevices.map(initTethrUSBPTP))
		const tethrs = (await pairedPromises).filter(isntNil)

		return tethrs
	}

	async function requestTethrPTPUSB() {
		if (!usb) return []

		let usbDevice: USBDevice
		try {
			usbDevice = await usb.requestDevice({filters: []})
		} catch {
			return []
		}

		const tethr = await initTethrUSBPTP(usbDevice)

		if (!tethr) return []

		return [tethr]
	}

	async function detectTethrWebcam() {
		if (!navigator.mediaDevices?.getUserMedia) return []

		const media = await navigator.mediaDevices.getUserMedia({video: true})
		const tethr = initTethrWebcam(media)

		return [tethr]
	}
}
