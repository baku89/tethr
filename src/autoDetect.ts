import {ITethr} from './ITethr'
import {initTethrUSBPTP} from './TethrPTPUSB'
import {isntNil} from './util'

const usb = navigator.usb

export async function autoDetect() {
	const tethrs: ITethr[] = []

	if (usb) {
		const usbDevices = await usb.getDevices()

		const usbTethrs = (
			await Promise.all(usbDevices.map(initTethrUSBPTP))
		).filter(isntNil)

		// Request accessing if there's no available paired devices,
		if (usbTethrs.length === 0) {
			const usbDevice = await usb.requestDevice({filters: []})
			const tethr = await initTethrUSBPTP(usbDevice)

			if (tethr) usbTethrs.push(tethr)
		}

		tethrs.push(...usbTethrs)
	}

	return tethrs
}
