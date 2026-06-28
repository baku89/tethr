import {DeviceInfo} from '../DeviceInfo'
import {TethrPanasonic} from './TethrPanasonic'
import {TethrPTPUSB} from './TethrPTPUSB'
import {TethrRicohTheta} from './TethrRicohTheta'
import {TethrSigma} from './TethrSigma'

/**
 * Standard PTP vendor extension IDs reported in {@link DeviceInfo.vendorExtensionID}.
 * Note these are *not* a reliable sole basis for picking a vendor class:
 * - Sony Alpha bodies usually enumerate under the generic MTP id, not `Sony`.
 * - Canon's id covers both EOS (event-driven protocol) and PowerShot/legacy.
 * - Sigma and Ricoh also ride on the MTP id.
 * So detection below leans on operationsSupported / manufacturer first.
 */
enum VendorExtensionID {
	MTP = 0x00000006,
	Nikon = 0x0000000a,
	Canon = 0x0000000b,
	Sony = 0x00000011,
	Panasonic = 0x0000001c,
}

/** EOS-only op (GetEvent). Present on EOS bodies, absent on PowerShot/legacy. */
const OpCanonEOSGetEvent = 0x9116
/** Sony PC-remote handshake op; present on Alpha bodies even when they show as MTP. */
const OpSonySDIOGetExtDeviceInfo = 0x9202

/**
 * Whether this is a Canon EOS body (the event-driven "EOS" PTP extension),
 * as opposed to a PowerShot/legacy Canon which speaks a different dialect.
 */
function isCanonEOS(info: DeviceInfo): boolean {
	return (
		info.vendorExtensionID === VendorExtensionID.Canon &&
		info.operationsSupported.includes(OpCanonEOSGetEvent)
	)
}

/**
 * Whether this is a Sony Alpha body speaking the PC-remote PTP extension.
 * These frequently enumerate under the generic MTP extension id, so key off
 * the SDIO handshake op (and the manufacturer string as a backstop) rather
 * than the Sony extension id.
 */
function isSonyAlpha(info: DeviceInfo): boolean {
	return (
		info.vendorExtensionID === VendorExtensionID.Sony ||
		info.operationsSupported.includes(OpSonySDIOGetExtDeviceInfo) ||
		/sony/i.test(info.manufacturer)
	)
}

/**
 * Return the vendor-specific PTPUSB subclass for the given device info.
 *
 * Detection is capability/manufacturer-first (robust against vendors that
 * masquerade under the generic MTP extension id) with vendor-extension-id
 * fallbacks. Returns undefined when no vendor-specific class applies, in which
 * case the caller falls back to the generic {@link TethrPTPUSB}.
 *
 * @param info The device info to check
 */
export function getVendorSpecificPTPUSBClass(
	info: DeviceInfo
): typeof TethrPTPUSB | undefined {
	// 1. Capability-based detection (most reliable).
	if (isCanonEOS(info)) {
		// TODO: return TethrCanon once Canon EOS support lands. Until then fall
		// through to the generic class so standard device props still work.
	}
	if (isSonyAlpha(info)) {
		// TODO: return TethrSony once Sony support lands.
	}

	// 2. Vendor-extension-id / model fallbacks.
	switch (info.vendorExtensionID) {
		case VendorExtensionID.MTP: // Microsoft MTP — also Sigma / Ricoh
			if (info.vendorExtensionDesc === 'SIGMA') {
				return TethrSigma
			} else if (info.model.match(/theta/i)) {
				return TethrRicohTheta
			}
			break
		case VendorExtensionID.Panasonic:
			return TethrPanasonic
	}

	return undefined
}
