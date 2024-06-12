import {DeviceInfo} from '../DeviceInfo'
import {TethrPanasonic} from './TethrPanasonic'
import {TethrPTPUSB} from './TethrPTPUSB'
import {TethrRicohTheta} from './TethrRicohTheta'
import {TethrSigma} from './TethrSigma'

/**
 * Return the vendor-specific PTPUSB subclass for the given device info.
 * @param info The device info to check
 * @returns The vendor-specific PTPUSB class or undefined if no vendor-specific class is found
 */
export function getVendorSpecificPTPUSBClass(
	info: DeviceInfo
): typeof TethrPTPUSB | undefined {
	switch (info.vendorExtensionID) {
		case 0x00000006: // Microsoft / Sigma / Ricoh
			if (info.vendorExtensionDesc === 'SIGMA') {
				return TethrSigma
			} else if (info.model.match(/theta/i)) {
				return TethrRicohTheta
			}
			break
		case 0x0000001c: // Panasnoic
			return TethrPanasonic
			break
	}
}
