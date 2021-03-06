import {Tethr} from './Tethr'
import {initTethrUSBPTP} from './TethrPTPUSB'
import {initTethrWebcam} from './TethrWebcam'
import {usb} from './usb'
import {isntNil} from './util'

type TethrDetectStrategy = 'first' | 'all'

type DetectTethrOption = {
	strategy?: TethrDetectStrategy
}

export async function detectTethr({
	strategy = 'first',
}: DetectTethrOption = {}) {
	const tethrs: Tethr[] = []

	const shouldDetectUSB =
		strategy === 'first' && !navigator.userAgent.match(/android/i)

	if (shouldDetectUSB) {
		tethrs.push(...(await detectPairedTethrPTPUSB()))

		if (strategy === 'first' && tethrs.length > 0) return tethrs

		tethrs.push(...(await requestTethrPTPUSB()))

		if (strategy === 'first' && tethrs.length > 0) return tethrs
	}

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
		if (!('navigator' in globalThis)) return []
		if (!('mediaDevices' in navigator)) return []

		const tethr = initTethrWebcam()

		return [tethr]
	}
}
