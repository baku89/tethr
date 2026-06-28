import EventEmitter from 'eventemitter3'

import {
	OperationResult,
	Tethr,
	TethrDeviceType,
	TethrIdentifier,
} from './Tethr'
import {initTethrUSBPTP, TethrPTPUSB} from './TethrPTPUSB'
import {TethrWebcam} from './TethrWebcam'

/**
 * Whether a DOMException from a permission/selection prompt means the user
 * cancelled (dismissed the USB picker, denied/closed the camera prompt) rather
 * than a real failure worth surfacing.
 */
export function isUserCancelledError(err: unknown): boolean {
	return (
		err instanceof DOMException &&
		['NotFoundError', 'NotAllowedError', 'AbortError'].includes(err.name)
	)
}

type TethrManagerEvents = {
	pairedCameraChange: (cameras: Tethr[]) => void
}
export class TethrManager extends EventEmitter<TethrManagerEvents> {
	#ptpusbCameras: Map<USBDevice, TethrPTPUSB> = new Map()
	#webcam: TethrWebcam | null = null

	constructor() {
		super()

		this.#init()
	}

	async #init() {
		Promise.allSettled([
			this.#initPairedUSBPTPCameras(),
			this.#refreshPairedWebcam(),
		]).then(() => this.#emitPairedCameras())

		// Detect USB PTP camera changes
		navigator.usb.addEventListener('connect', async event => {
			const result = await initTethrUSBPTP(event.device)
			if (result.status === 'ok') {
				this.#ptpusbCameras.set(event.device, result.value)
				this.#emitPairedCameras()
			}
		})

		navigator.usb.addEventListener('disconnect', event => {
			const camera = this.#ptpusbCameras.get(event.device)
			if (camera) {
				this.#ptpusbCameras.delete(event.device)
				this.#emitPairedCameras()
			}
		})

		// Detect webcam changes
		navigator.mediaDevices.addEventListener('devicechange', async () => {
			await this.#refreshPairedWebcam()
			this.#emitPairedCameras()
		})
	}

	/**
	 * Initialize paired USB PTP cameras and add them to the manager. This should be called once during initialization.
	 */
	async #initPairedUSBPTPCameras() {
		const usbDevices = await navigator.usb.getDevices()
		const results = await Promise.allSettled(usbDevices.map(initTethrUSBPTP))

		// Key the map by the USBDevice we already hold here, rather than reaching
		// into the camera's (now transport-private) device — keep the index
		// association from usbDevices.
		results.forEach((promise, i) => {
			if (promise.status === 'fulfilled' && promise.value.status === 'ok') {
				this.#ptpusbCameras.set(usbDevices[i], promise.value.value)
			}
		})
	}

	async #refreshPairedWebcam(): Promise<TethrWebcam | null> {
		const devices = await this.#enumerateWebcamDeviceInfo()

		const videoDevices = devices.filter(
			device => device.kind === 'videoinput' && device.deviceId !== ''
		)

		if (!this.#webcam && videoDevices.length > 0) {
			this.#webcam = new TethrWebcam()
		}

		return this.#webcam
	}

	#emitPairedCameras() {
		this.emit('pairedCameraChange', this.pairedCameras)
	}

	get pairedCameras(): Tethr[] {
		return [
			...this.#ptpusbCameras.values(),
			...(this.#webcam ? [this.#webcam] : []),
		]
	}

	/**
	 * Connect to a camera, either by type (prompting the user to pick one) or by a
	 * {@link TethrIdentifier} (reconnecting to a remembered device).
	 *
	 * When given an identifier it first looks among the already-paired devices and
	 * returns a silent match if found. Only if none is found — and `prompt` is not
	 * `false` — does it show a picker (narrowed to the remembered device's
	 * vendor/product for USB). Pass `{prompt: false}` from contexts that are not a
	 * user gesture (e.g. auto-reconnect on load), where `requestDevice()` /
	 * `getUserMedia()` would otherwise throw.
	 *
	 * @returns The (not-yet-opened) camera instance, or null if none matched.
	 */
	async requestCamera(
		query: TethrDeviceType | TethrIdentifier,
		{prompt = true}: {prompt?: boolean} = {}
	): Promise<Tethr | null> {
		const type = typeof query === 'string' ? query : query.type
		const id = typeof query === 'string' ? null : query

		let camera: Tethr | null = null

		if (type === 'ptpusb') {
			// 1. Reuse an already-paired device matching the identifier (silent).
			if (id) camera = await this.#findPairedPTPUSB(id)

			// 2. Otherwise prompt (if allowed).
			if (!camera && prompt) {
				const result = await this.#requestUSBPTPCamera(id)
				if (result.status === 'ok') {
					this.#ptpusbCameras.set(result.value.usb, result.value.camera)
					camera = result.value.camera
				} else if (result.status !== 'cancelled') {
					alert(result.message)
				}
			}
		} else {
			// webcam — Tethr can't distinguish individual webcams.
			camera = this.#webcam
			if (!camera && prompt) {
				try {
					camera = await this.#requestWebcam()
				} catch (err) {
					// Denying/closing the camera-permission prompt is a cancel, not
					// an error.
					if (!isUserCancelledError(err)) {
						alert(
							err instanceof Error ? err.message : 'Unable to connect to webcam'
						)
					}
				}
			}
		}

		if (camera) {
			this.#emitPairedCameras()
		}

		return camera
	}

	async #findPairedPTPUSB(id: TethrIdentifier): Promise<TethrPTPUSB | null> {
		if (id.type !== 'ptpusb') return null

		const cameras = [...this.#ptpusbCameras.values()]

		// Exact body via USB serial.
		if (id.usb?.serialNumber) {
			const m = cameras.find(
				c => c.identifier.usb?.serialNumber === id.usb!.serialNumber
			)
			if (m) return m
		}
		// Same model via vendor+product (can't tell identical bodies apart).
		if (id.usb) {
			const m = cameras.find(
				c =>
					c.identifier.usb?.vendorId === id.usb!.vendorId &&
					c.identifier.usb?.productId === id.usb!.productId
			)
			if (m) return m
		}
		// Legacy fallback: match by model name.
		if (id.model) {
			for (const c of cameras) {
				if ((await c.getModel()) === id.model) return c
			}
		}
		return null
	}

	async #requestUSBPTPCamera(
		id?: TethrIdentifier | null
	): Promise<OperationResult<{camera: TethrPTPUSB; usb: USBDevice}>> {
		// Narrow the picker to the remembered device's model when we have one.
		const filters =
			id && id.type === 'ptpusb' && id.usb
				? [{vendorId: id.usb.vendorId, productId: id.usb.productId}]
				: [{classCode: 6}] // Still Image class

		let usbDevice: USBDevice
		try {
			usbDevice = await navigator.usb.requestDevice({filters})
		} catch (err) {
			// The user dismissed the device picker — a normal cancel, not an error.
			if (isUserCancelledError(err)) {
				return {status: 'cancelled'}
			}
			return {status: 'general error', message: 'Unable to connect to camera'}
		}

		const result = await initTethrUSBPTP(usbDevice)
		if (result.status !== 'ok') return result

		return {status: 'ok', value: {camera: result.value, usb: usbDevice}}
	}

	async #requestWebcam() {
		const media = await navigator.mediaDevices.getUserMedia({video: true})
		media.getTracks().forEach(track => track.stop())

		return this.#refreshPairedWebcam()
	}

	async #enumerateWebcamDeviceInfo() {
		const devices = await navigator.mediaDevices.enumerateDevices()
		const webcams = devices.filter(device => device.kind === 'videoinput')
		return webcams
	}
}
