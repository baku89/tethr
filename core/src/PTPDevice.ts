import EventEmitter from 'eventemitter3'
import PQueue from 'p-queue'
import sleep from 'p-sleep'

import {ResCode} from './PTPDatacode'
import {PTPDataView} from './PTPDataView'
import {toHexString} from './util'

enum PTPBlockType {
	Command = 0x1,
	Data = 0x2,
	Response = 0x3,
	Event = 0x4,
}

const PTPCommandMaxByteLength = 12 + 4 * 3
const PTPDefaultTimeoutMs = 10000
const PTPTryCount = 30
const PTPTryAgainIntervalMs = 100

// When packet loss or out-of-order packets occur, we may receive containers
// with unexpected transaction IDs. To make the communication robust, we try
// to resync by discarding a limited number of mismatched packets and clearing
// halts on the IN endpoint instead of failing immediately.
const PTPResyncMaxSkips = 8
const PTPResyncClearHaltEvery = 4

const PTPQueueOptions = {
	timeout: PTPDefaultTimeoutMs,
	throwOnTimeout: true,
} as const

export interface PTPSendCommandOption {
	label?: string
	opcode: number
	parameters?: number[]
	expectedResCodes?: number[]
	/**
	 * Scheduling priority on the shared transaction queue. Higher runs first
	 * among *pending* (not-yet-started) transactions. Use this to keep the pipe
	 * fair when liveview and bulk transfers share it:
	 *
	 * - {@link PTPPriority.Interactive} (2): user-initiated get/set/actions
	 * - {@link PTPPriority.Liveview} (1): liveview frame fetches
	 * - {@link PTPPriority.Bulk} (0, default): large object-download chunks
	 *
	 * A long single transfer can't be preempted mid-flight, so pair this with
	 * chunked transfers (many small {@link PTPPriority.Bulk} items) to leave
	 * gaps a higher-priority frame can slip into.
	 */
	priority?: number
}

/** Scheduling lanes for {@link PTPSendCommandOption.priority}. */
export enum PTPPriority {
	Bulk = 0,
	Liveview = 1,
	Interactive = 2,
}

export type PTPSendDataOption = PTPSendCommandOption & {
	data: ArrayBuffer
}

export type PTPReceiveDataOption = PTPSendCommandOption & {
	maxByteLength?: number
}

export interface PTPResponse {
	resCode: number
	parameters: number[]
}

export type PTPDataResponse = PTPResponse & {
	data: ArrayBuffer
}

export interface PTPEvent {
	eventCode: number
	parameters: number[]
}

export type PTPEventCallback = (event: PTPEvent) => void

/**
 * Transport-independent description of a connected device, used to build a
 * {@link Tethr.identifier} and a display name without the protocol layer
 * reaching into a USB-specific object. A USB transport fills this from its
 * `USBDevice`; a mock/recorded transport fills it from a fixture.
 */
export interface PTPDeviceDescriptor {
	vendorId: number
	productId: number
	serialNumber?: string
	productName?: string
}

/**
 * The transport surface the PTP protocol layer ({@link TethrPTPUSB} and its
 * vendor subclasses) depends on. Decoupling protocol logic from the concrete
 * {@link PTPDevice} (WebUSB) lets a different transport — a future PTP/IP one,
 * or a recorded-transcript mock for hardware-free unit tests — be injected in
 * its place. Everything here is implemented by {@link PTPDevice}.
 */
export interface PTPTransport {
	readonly descriptor: PTPDeviceDescriptor

	open(): Promise<void>
	close(): Promise<void>
	get opened(): boolean
	setLog(log: boolean): void

	sendCommand(option: PTPSendCommandOption): Promise<PTPResponse | void>
	sendData(option: PTPSendDataOption): Promise<PTPResponse>
	receiveData(option: PTPReceiveDataOption): Promise<PTPDataResponse>

	onEventCode(eventCode: number, callback: PTPEventCallback): void
	offEventCode(eventCode: number, callback?: PTPEventCallback): void
	waitEvent(code: number): Promise<PTPEvent>

	on(event: 'idle' | 'disconnect', callback: () => void): unknown
	off(event: 'idle' | 'disconnect', callback: () => void): unknown

	/** Number of transactions currently waiting to start (not yet running). */
	get pendingCount(): number
	/** Number of transactions currently in flight. */
	get runningCount(): number
}

interface BulkInInfo {
	type: PTPBlockType
	code: number
	transactionId: number
	payload: ArrayBuffer
}

interface EventTypes {
	[name: `ptpevent:${string}`]: PTPEvent
	idle: void
	disconnect: void
}

interface PTPDeviceOptions {
	log?: boolean
}

export class PTPDevice extends EventEmitter<EventTypes> implements PTPTransport {
	#transactionId = 0x00000000

	#endpointNumberBulkOut = 0x0
	#endpointNumberBulkIn = 0x0
	#endpointerNumberInterruptIn = 0x0

	#opened = false

	#queue = new PQueue({concurrency: 1})

	#console = console as Pick<Console, 'groupCollapsed' | 'groupEnd' | 'info'>

	constructor(
		public readonly usb: USBDevice,
		{log = true}: PTPDeviceOptions = {}
	) {
		super()

		this.setLog(log)
		this.#queue.on('idle', () => this.emit('idle'))
	}

	get descriptor(): PTPDeviceDescriptor {
		const {vendorId, productId, serialNumber, productName} = this.usb
		return {
			vendorId,
			productId,
			serialNumber: serialNumber || undefined,
			productName: productName || undefined,
		}
	}

	open = async (): Promise<void> => {
		await this.usb.open()
		// Configurate
		let {configuration} = this.usb
		if (!configuration) {
			const num = this.usb.configurations[0].configurationValue
			await this.usb.selectConfiguration(num)
			configuration = this.usb.configuration
		}

		if (!configuration) throw new Error('Cannot configure PTPDevice')

		const usbInterface = configuration.interfaces[0]
		const interfaceNum = usbInterface.interfaceNumber

		// reset() re-enumerates the device; on a reconnect (e.g. the camera
		// briefly dropped during autofocus) the interface can still be mid
		// state-change right afterwards, which makes releaseInterface throw
		// "An operation that changes interface state is in progress." Neither
		// reset nor the defensive releaseInterface is essential — claimInterface
		// is the only call we actually need — so tolerate their failure and let
		// the claim itself be the hard requirement.
		try {
			await this.usb.reset()
		} catch {
			// ignore — device may not need / support reset on this platform
		}
		try {
			await this.usb.releaseInterface(interfaceNum)
		} catch {
			// ignore — no prior claim to release, or state still settling
		}

		await this.usb.claimInterface(interfaceNum)

		// Determine endpoints number
		const endpoints = usbInterface.alternates[0].endpoints

		const endpointOut = endpoints.find(
			e => e.type === 'bulk' && e.direction === 'out'
		)
		const endpointIn = endpoints.find(
			e => e.type === 'bulk' && e.direction === 'in'
		)
		const endpointEvent = endpoints.find(
			e => e.type === 'interrupt' && e.direction === 'in'
		)

		if (!endpointOut || !endpointIn || !endpointEvent)
			throw new Error('Invalid endpoints')

		this.#endpointNumberBulkOut = endpointOut.endpointNumber
		this.#endpointNumberBulkIn = endpointIn.endpointNumber
		this.#endpointerNumberInterruptIn = endpointEvent.endpointNumber

		// Recover from a dirty previous session. If the page was reloaded (or the
		// tab crashed) mid-transfer, the camera's PTP session is still open and a
		// bulk endpoint can be left halted — the next transferOut then rejects with
		// "A transfer error has occurred" before our stall handling ever runs. The
		// USB Still-Image class "Device Reset Request" (bRequest 0x66) aborts any
		// in-progress transaction and resets the camera's PTP state machine (this is
		// what Dragonframe's reset does); clearing the bulk halts mops up the rest.
		// All best-effort: not every camera implements 0x66, and a freshly plugged
		// device has nothing to clear.
		try {
			await this.usb.controlTransferOut({
				requestType: 'class',
				recipient: 'interface',
				request: 0x66, // Device Reset Request
				value: 0x0,
				index: interfaceNum,
			})
		} catch {
			// camera may not implement it; the clearHalt calls below are the fallback
		}
		try {
			await this.usb.clearHalt('out', this.#endpointNumberBulkOut)
		} catch {
			// no halt to clear
		}
		try {
			await this.usb.clearHalt('in', this.#endpointNumberBulkIn)
		} catch {
			// no halt to clear
		}

		this.#listenInterruptIn()
		this.#listenDisconnect()

		this.#opened = true
	}

	close = async (): Promise<void> => {
		this.#queue.clear()

		if (this.usb && this.usb.opened) {
			await this.usb.close()
		}
		this.#opened = false
	}

	get opened(): boolean {
		return this.#opened
	}

	setLog(log: boolean) {
		this.#console = log
			? console
			: {
					groupCollapsed: () => null,
					groupEnd: () => null,
					info: () => null,
				}
	}

	onEventCode(eventCode: number, callback: PTPEventCallback) {
		const eventName = toHexString(eventCode, 2)
		this.on(`ptpevent:${eventName}`, callback)
	}

	offEventCode(eventCode: number, callback?: PTPEventCallback) {
		const eventName = toHexString(eventCode, 2)
		this.off(`ptpevent:${eventName}`, callback)
	}

	sendCommand = (option: PTPSendCommandOption): Promise<PTPResponse | void> => {
		return this.#queue.add(async () => {
			this.#console.groupCollapsed(`Send Command [${option.label}]`)
			return this.#sendCommandNow(option).finally(this.#console.groupEnd)
		}, this.#queueOptions(option.priority))
	}

	sendData = (option: PTPSendDataOption): Promise<PTPResponse> => {
		return this.#queue.add(async () => {
			this.#console.groupCollapsed(`Send Data [${option.label}]`)
			return await this.#sendDataNow(option).finally(this.#console.groupEnd)
		}, this.#queueOptions(option.priority))
	}

	receiveData = (option: PTPReceiveDataOption): Promise<PTPDataResponse> => {
		return this.#queue.add(async () => {
			this.#console.groupCollapsed(`Receive Data [${option.label}]`)
			return await this.#receiveDataNow(option).finally(this.#console.groupEnd)
		}, this.#queueOptions(option.priority))
	}

	#queueOptions(priority = PTPPriority.Interactive) {
		return {...PTPQueueOptions, priority}
	}

	/** Number of transactions currently waiting to start (not yet running). */
	get pendingCount(): number {
		return this.#queue.size
	}

	/** Number of transactions currently in flight. */
	get runningCount(): number {
		return this.#queue.pending
	}

	async #sendCommandNow(option: PTPSendCommandOption): Promise<PTPResponse> {
		const {opcode, parameters, expectedResCodes} = {
			parameters: [],
			expectedResCodes: [ResCode.OK],
			...option,
		}

		for (let i = 0; i < PTPTryCount; i++) {
			const id = this.#generateTransactionId()

			await this.#transferOutCommand(opcode, id, parameters)

			const res = await this.#waitBulkIn(id, PTPCommandMaxByteLength)

			// Error checking
			if (res.type !== PTPBlockType.Response) {
				throw new Error(
					`Expected response type: ${PTPBlockType.Response}, got: ${res.type}`
				)
			}

			// When the device is busy, try again
			const tryAgain =
				!expectedResCodes.includes(ResCode.DeviceBusy) &&
				res.code === ResCode.DeviceBusy

			if (tryAgain) {
				await sleep(PTPTryAgainIntervalMs)
				continue
			}

			// Check rescode
			if (!expectedResCodes.includes(res.code)) {
				const expected = expectedResCodes.map(toHexString)
				const got = toHexString(res.code)
				throw new Error(`Expected rescode=[${expected}], got= ${got}`)
			}

			return {
				resCode: res.code,
				parameters: [...new Uint32Array(res.payload)],
			}
		}

		throw new Error('Cannot send command')
	}

	async #sendDataNow(option: PTPSendDataOption): Promise<PTPResponse> {
		const {opcode, data, parameters, expectedResCodes} = {
			parameters: [],
			expectedResCodes: [ResCode.OK],
			...option,
		}

		for (let i = 0; i < PTPTryCount; i++) {
			const id = this.#generateTransactionId()

			await this.#transferOutCommand(opcode, id, parameters)
			await this.#transferOutData(opcode, id, data)

			const res = await this.#waitBulkIn(id, PTPCommandMaxByteLength)

			// Error checking
			if (res.type !== PTPBlockType.Response) {
				throw new Error(
					`Expected response type: ${PTPBlockType.Response}, got: ${res.type}`
				)
			}

			// When the device is busy, try again
			const tryAgain =
				!expectedResCodes.includes(ResCode.DeviceBusy) &&
				res.code === ResCode.DeviceBusy

			if (tryAgain) {
				await sleep(PTPTryAgainIntervalMs)
				continue
			}

			// Check rescode
			if (!expectedResCodes.includes(res.code)) {
				const expected = expectedResCodes.map(toHexString)
				const got = toHexString(res.code)
				throw new Error(`Expected rescode=[${expected}], got=${got}`)
			}

			return {
				resCode: res.code,
				parameters: [...new Uint32Array(res.payload)],
			}
		}

		throw new Error('Cannot send data')
	}

	async #receiveDataNow(
		option: PTPReceiveDataOption
	): Promise<PTPDataResponse> {
		const {opcode, parameters, expectedResCodes, maxByteLength} = {
			parameters: [],
			expectedResCodes: [ResCode.OK],
			maxByteLength: 10_000_000, // = 10MB. Increased for media data transfer
			...option,
		}

		for (let i = 0; i < PTPTryCount; i++) {
			const id = this.#generateTransactionId()

			await this.#transferOutCommand(opcode, id, parameters)
			const res1 = await this.#waitBulkIn(id, maxByteLength)

			if (res1.type === PTPBlockType.Response) {
				if (expectedResCodes.includes(res1.code)) {
					return {
						resCode: res1.code,
						parameters: [],
						data: new ArrayBuffer(0),
					}
				}
			}

			if (res1.type !== PTPBlockType.Data) {
				throw new Error(`Cannot receive data code=${toHexString(res1.code)}`)
			}

			const res2 = await this.#waitBulkIn(id, PTPCommandMaxByteLength)

			if (res2.type !== PTPBlockType.Response) {
				throw new Error(
					`Expected response type: ${PTPBlockType.Response}, but got: ${res2.type}`
				)
			}
			// When the device is busy, try again
			const tryAgain =
				!expectedResCodes.includes(ResCode.DeviceBusy) &&
				res2.code === ResCode.DeviceBusy

			if (tryAgain) {
				await sleep(PTPTryAgainIntervalMs)
				continue
			}

			return {
				resCode: res2.code,
				parameters: [...new Uint32Array(res2.payload)],
				data: res1.payload,
			}
		}

		throw new Error('Cannot receive data')
	}

	waitEvent = async (code: number): Promise<PTPEvent> => {
		const eventName = toHexString(code, 2)

		return new Promise(resolve => {
			this.once(`ptpevent:${eventName}`, resolve)
		})
	}

	async #transferOutCommand(
		opcode: number,
		transactionId: number,
		parameters: number[]
	) {
		if (!this.usb) throw new Error('Device is not opened')

		const length = 12 + parameters.length * 4

		const dataView = new PTPDataView()

		dataView.writeUint32(length)
		dataView.writeUint16(PTPBlockType.Command)
		dataView.writeUint16(opcode)
		dataView.writeUint32(transactionId)

		parameters.forEach(param => dataView.writeUint32(param))

		const sent = await this.usb.transferOut(
			this.#endpointNumberBulkOut,
			dataView.toBuffer()
		)
		this.#console.info(
			'transferOutBulk',
			'type=Command',
			'opcode=' + toHexString(opcode, 2),
			'id=' + transactionId,
			'params=' + parameters.map(v => toHexString(v, 4))
		)

		if (sent.status !== 'ok') {
			if (sent.status === 'stall') {
				await this.usb.clearHalt('out', this.#endpointNumberBulkOut)
			}
			throw new Error(`transferOutBulk failed: ${sent.status}`)
		}
	}

	async #transferOutData(
		opcode: number,
		transactionId: number,
		data: ArrayBuffer
	) {
		if (!this.usb) return false

		const dataView = new PTPDataView()

		const length = 12 + data.byteLength

		dataView.writeUint32(length)
		dataView.writeUint16(PTPBlockType.Data)
		dataView.writeUint16(opcode)
		dataView.writeUint32(transactionId)

		const dataBytes = new Uint8Array(data)
		dataBytes.forEach(byte => dataView.writeUint8(byte))

		const sent = await this.usb.transferOut(
			this.#endpointNumberBulkOut,
			dataView.toBuffer()
		)
		this.#console.info(
			'transferOutBulk',
			'type=Data',
			'opcode=' + toHexString(opcode, 2),
			'id=' + transactionId,
			'payload=' + toHexString(data)
		)

		if (sent.status === 'stall') {
			await this.usb.clearHalt('out', this.#endpointNumberBulkOut)
		}

		return sent.status === 'ok'
	}

	async #waitBulkIn(
		expectedTransactionId: number,
		maxByteLength: number
	): Promise<BulkInInfo> {
		if (!this.usb || !this.usb.opened) {
			throw new Error('Device is not opened')
		}

		let mismatches = 0

		for (;;) {
			const {data, status} = await this.usb.transferIn(
				this.#endpointNumberBulkIn,
				maxByteLength
			)

			// Error checking
			if (status !== 'ok') {
				if (status === 'stall') {
					await this.usb.clearHalt('in', this.#endpointNumberBulkIn)
					mismatches += 1
					if (mismatches >= PTPResyncMaxSkips) {
						throw new Error('BulkIn stalled repeatedly')
					}
					continue
				}
				throw new Error(`BulkIn returned status: ${status}`)
			}
			if (!data || data.byteLength < 12) {
				mismatches += 1
				if (mismatches % PTPResyncClearHaltEvery === 0) {
					await this.usb.clearHalt('in', this.#endpointNumberBulkIn)
				}
				if (mismatches >= PTPResyncMaxSkips) {
					throw new Error('Invalid bulkIn data')
				}
				continue
			}

			// Unpack packet
			const type = data.getUint16(4, true)
			const code = data.getUint16(6, true)
			const transactionId = data.getUint32(8, true)
			// Ensure ArrayBuffer payload (avoid SharedArrayBuffer type widening)
			const viewBytes = new Uint8Array(data.buffer, 12)
			const payloadCopy = new Uint8Array(viewBytes.byteLength)
			payloadCopy.set(viewBytes)
			const payload = payloadCopy.buffer

			this.#console.info(
				'transferInBulk',
				'type=' + PTPBlockType[type],
				'code=' + toHexString(code, 2),
				'id=' + transactionId,
				'expectedId=' + expectedTransactionId,
				'payload=',
				payload
			)

			if (transactionId !== expectedTransactionId) {
				mismatches += 1
				if (mismatches % PTPResyncClearHaltEvery === 0) {
					await this.usb.clearHalt('in', this.#endpointNumberBulkIn)
				}
				if (mismatches >= PTPResyncMaxSkips) {
					throw new Error(
						`Transaction ID mismatch after ${mismatches} skips. Expected=${expectedTransactionId}, got=${transactionId}`
					)
				}
				continue
			}

			return {
				type,
				code,
				transactionId,
				payload,
			}
		}
	}

	#listenInterruptIn = async () => {
		// Stop the loop once the device is closed/disconnected instead of
		// throwing (which would leave an unhandled rejection) or rescheduling
		// forever against a dead endpoint (which busy-loops the main thread).
		if (!this.#opened || !this.usb || !this.usb.opened) {
			return
		}

		try {
			const {data, status} = await this.usb.transferIn(
				this.#endpointerNumberInterruptIn,
				0x800000
			)

			// Error checking
			if (status !== 'ok') {
				if (status === 'stall') {
					await this.usb.clearHalt('in', this.#endpointerNumberInterruptIn)
				}
				throw new Error(`InterruptIn returned status: ${status}`)
			}
			if (!data || data.byteLength < 12) {
				return
			}

			// Unpack packet
			const type = data.getUint16(4, true)
			const code = data.getUint16(6, true)
			const transactionId = data.getUint32(8, true)
			const parameters = new Uint32Array(data.buffer.slice(12))

			const eventName = toHexString(code, 2)

			this.#console.info(
				'transferInInterrupt',
				'type=' + PTPBlockType[type],
				'code=' + eventName,
				'id=' + transactionId,
				'parameters=' + [...parameters].map(v => toHexString(v, 4))
			)

			this.emit(`ptpevent:${eventName}`, {code, parameters})
		} catch (err) {
			// If the error has risen because of disconnection of the device,
			// just ignore the error.
			if (!this.#opened || !this.usb || !this.usb.opened) {
				return
			}
			if (
				err instanceof DOMException &&
				err.message.match(/The transfer was cancelled./)
			) {
				return
			}
			throw err
		} finally {
			// Only keep polling while the device is still open; otherwise the
			// loop would spin forever after a disconnect.
			if (this.#opened && this.usb && this.usb.opened) {
				setTimeout(this.#listenInterruptIn, 0)
			}
		}
	}

	#listenDisconnect() {
		navigator.usb.addEventListener('disconnect', ev => {
			if (ev.device === this.usb) {
				// Tear down internal state so the bulk/interrupt loops stop
				// instead of hammering the now-dead device and freezing the UI.
				this.#opened = false
				this.#queue.clear()
				this.emit('disconnect')
			}
		})
	}

	#generateTransactionId = (): number => {
		this.#transactionId += 1
		if (this.#transactionId > 0xfffffffe) {
			this.#transactionId = 1
		}

		return this.#transactionId
	}
}
