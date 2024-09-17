import {DeviceInfo} from '../DeviceInfo'
import {PTPDevice} from '../PTPDevice'
import {OperationResult} from '../Tethr'
import {getVendorSpecificPTPUSBClass} from './getVendorSpecificPTPUSB'
import {TethrPTPUSB} from './TethrPTPUSB'

/**
 * Try to initialize the given usb device as a PTP camera.
 * @param usb The USB device to initialize
 * @returns The initialized TethrPTPUSB object or null if the device is not a PTP camera
 */
export async function initTethrUSBPTP(
	usb: USBDevice
): Promise<OperationResult<TethrPTPUSB>> {
	const device = new PTPDevice(usb)
	let info: DeviceInfo

	try {
		if (!device.opened) {
			await device.open()
		}
		info = await TethrPTPUSB.getDeviceInfo(device)
	} catch (err) {
		let message = 'Unable to connect to camera'
		if (
			err instanceof DOMException &&
			err.message.match(/Unable to claim interface/) &&
			navigator.userAgent.match(/mac/i)
		) {
			message = `Unable to claim interface. On macOS, you need run "while ; do; kill -9 $(ps aux | grep "[p]tpcamera" | awk '{print $2}'); sleep 1; done" in Terminal during connecting to a camera via USB.`
		} else if (err instanceof Error) {
			message = err.message
		}

		return {
			status: 'general error',
			message,
		}
	}

	const TethrVendor = getVendorSpecificPTPUSBClass(info) ?? TethrPTPUSB

	return {
		status: 'ok',
		value: new TethrVendor(device),
	}
}

export {TethrPTPUSB}
