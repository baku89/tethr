import {DeviceInfo} from '../DeviceInfo'
import {PTPDevice} from '../PTPDevice'
import {OperationResult} from '../Tethr'
import {getVendorSpecificPTPUSBClass} from './getVendorSpecificPTPUSB'
import {TethrPTPUSB} from './TethrPTPUSB'

const OpenMaxAttempts = 3
const OpenRetryDelayMs = 300

/**
 * Retry budget for an *interactive* connect. On macOS a manual connect usually
 * can't claim the interface until the user frees it from `ptpcamerad`; retrying
 * patiently lets the click "just work" once they run the kill loop (or kill it
 * once) — the claim succeeds on the next attempt — instead of giving up after
 * ~1 s. Auto-reconnect keeps the fast default so page load never stalls on it.
 */
export const PatientOpenOptions = {maxAttempts: 15, retryDelayMs: 1000} as const

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Whether an open() failure is one a retry can recover from. Connecting to a PTP
 * camera fails transiently in several ways, all of which clear on a fresh attempt
 * (each retry re-fetches the current handle *and* re-runs the self-healing
 * `PTPDevice.open()`, which resets a stuck session):
 * - `claimInterface` throws "Unable to claim interface" while macOS `ptpcamerad`
 *   holds the device (a kill loop frees it between tries).
 * - A mid-connect USB re-enumeration (ptpcamerad grabbing/releasing, or a device
 *   reset) invalidates the handle: "The device was disconnected" / a transfer
 *   error — a re-fetched handle is live.
 * - Reloading the page mid-session leaves the camera's PTP state dangling, so the
 *   first GetDeviceInfo reads a truncated reply ("Offset is outside the bounds of
 *   the DataView") or times out; the device-reset the retry issues clears it.
 * - The first bulk transfer right after USB enumeration sometimes drops, so the
 *   opening GetDeviceInfo exhausts PTPDevice's own retries ("Cannot receive data"
 *   / "Cannot send …"); a fresh transaction after the reset goes through.
 * - Stale bytes from a reload-interrupted transfer can exhaust the bulk-in
 *   resync ("Invalid container length" / "Invalid bulkIn data" / "Transaction ID
 *   mismatch" / repeated stalls); the reset plus another drain clears them.
 */
function isRetriableOpenError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err)
	return /disconnected|transfer error|claim interface|outside the bounds|timeout|cannot (send|receive)|invalid container|invalid bulkin|transaction id mismatch|stalled/i.test(
		message
	)
}

/**
 * Re-fetch the same physical camera's *current* USBDevice. After a re-enumeration
 * the handle we started with is dead and `navigator.usb.getDevices()` lists a
 * fresh one for the same device; match it by serial when the camera exposes one,
 * else by vendor+product.
 */
async function refetchDevice(ref: USBDevice): Promise<USBDevice | null> {
	const devices = await navigator.usb.getDevices()
	const bySerial = ref.serialNumber
		? devices.find(
				d =>
					d.vendorId === ref.vendorId &&
					d.productId === ref.productId &&
					d.serialNumber === ref.serialNumber
			)
		: undefined
	return (
		bySerial ??
		devices.find(
			d => d.vendorId === ref.vendorId && d.productId === ref.productId
		) ??
		null
	)
}

/**
 * Try to initialize the given usb device as a PTP camera.
 *
 * Opening is retried a few times because a mid-connect USB re-enumeration (see
 * {@link isRetriableOpenError}) is common on macOS: each retry drops the dead
 * handle, waits briefly, and rebinds to the camera's current handle from
 * `getDevices()` before trying again.
 *
 * @param usb The USB device to initialize
 * @param opts Retry budget — bump it (see {@link PatientOpenOptions}) for
 *   interactive connects that may wait on the user freeing ptpcamerad
 * @returns The initialized TethrPTPUSB object, or an error result if it never opened
 */
export async function initTethrUSBPTP(
	usb: USBDevice,
	{
		maxAttempts = OpenMaxAttempts,
		retryDelayMs = OpenRetryDelayMs,
	}: {maxAttempts?: number; retryDelayMs?: number} = {}
): Promise<OperationResult<TethrPTPUSB>> {
	let device = new PTPDevice(usb)
	let info: DeviceInfo | undefined
	let lastError: unknown

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			if (!device.opened) {
				await device.open()
			}
			info = await TethrPTPUSB.getDeviceInfo(device)
			break
		} catch (err) {
			lastError = err
			if (attempt >= maxAttempts || !isRetriableOpenError(err)) break

			// Drop the (likely dead) handle, let ptpcamerad's grab/release or the
			// reset's re-enumeration settle, then rebind to the camera's current
			// handle and try again.
			try {
				await device.close()
			} catch {
				// The handle may already be gone; nothing to release.
			}
			await delay(retryDelayMs)
			device = new PTPDevice((await refetchDevice(usb)) ?? usb)
		}
	}

	if (!info) {
		let message = 'Unable to connect to camera'
		if (
			lastError instanceof DOMException &&
			lastError.message.match(/Unable to claim interface/) &&
			navigator.userAgent.match(/mac/i)
		) {
			message = `Unable to claim interface. On macOS, you need run "while ; do; kill -9 $(ps aux | grep "[p]tpcamera" | awk '{print $2}'); sleep 1; done" in Terminal during connecting to a camera via USB.`
		} else if (lastError instanceof Error) {
			message = lastError.message
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
