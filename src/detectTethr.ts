import {Tethr} from './Tethr'
import {initTethrUSBPTP} from './TethrPTPUSB'
import {isntNil} from './util'

const usb = navigator.usb

type TethrType = 'ptp/usb' | 'webcam'
type TethrDetectStrategy = 'first' | 'paired' | 'force'

type DetectTethrOption = {
	order?: TethrType[]
	strategy?: TethrDetectStrategy
}

export async function detectTethr({
	order = ['ptp/usb', 'webcam'],
	strategy = 'first',
}: DetectTethrOption = {}) {
	const tethrs: Tethr[] = []

	for await (const detectType of order) {
		if (strategy === 'first' && tethrs.length > 0) return tethrs

		switch (detectType) {
			case 'ptp/usb':
				tethrs.push(...(await detectTethrPTPUSB()))
		}
	}

	return tethrs

	async function detectTethrPTPUSB() {
		if (!navigator.usb) {
			return []
		}

		const pairedDevices = await usb.getDevices()

		const tethrs = (
			await Promise.all(pairedDevices.map(initTethrUSBPTP))
		).filter(isntNil)

		console.log(tethrs)

		if (strategy === 'first' && tethrs.length > 0) return tethrs
		if (strategy === 'paired') return tethrs

		// Show request modal
		const usbDevice = await usb.requestDevice({filters: []})
		const tethr = await initTethrUSBPTP(usbDevice)
		if (tethr) tethrs.push(tethr)

		return tethrs
	}
}
