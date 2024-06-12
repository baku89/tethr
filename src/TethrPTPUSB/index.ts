import {DeviceInfo} from '../DeviceInfo'
import {PTPDevice} from '../PTPDevice'
import {getVendorSpecificPTPUSBClass} from './getVendorSpecificPTPUSB'
import {TethrPTPUSB} from './TethrPTPUSB'

/**
 * Try to initialize the given usb device as a PTP camera.
 * @param usb The USB device to initialize
 * @returns The initialized TethrPTPUSB object or null if the device is not a PTP camera
 */
export async function initTethrUSBPTP(
	usb: USBDevice
): Promise<TethrPTPUSB | null> {
	const device = new PTPDevice(usb)
	let info: DeviceInfo

	try {
		if (!device.opened) {
			await device.open()
		}
		info = await TethrPTPUSB.getDeviceInfo(device)
	} catch (err) {
		if (
			err instanceof DOMException &&
			err.message.match(/Unable to claim interface/) &&
			navigator.userAgent.match(/mac/i)
		) {
			throw new Error(
				`Unable to claim interface. On macOS, you need run "while ; do; kill -9 $(ps aux | grep '[p]tpcamera' | awk '{print $2}'); done" in Terminal during connecting to a camera via USB.`
			)
		}
		return null
	}

	const TethrVendor = getVendorSpecificPTPUSBClass(info) ?? TethrPTPUSB

	return new TethrVendor(device)
}

export {TethrPTPUSB}
