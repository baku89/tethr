import EventEmitter from 'eventemitter3'
import PQueue from 'p-queue'
import sleep from 'sleep-promise'

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

const PTPQueueOptions = {
	timeout: PTPDefaultTimeoutMs,
	throwOnTimeout: true,
} as const

interface PTPSendCommandOption {
	label?: string
	opcode: number
	parameters?: number[]
	expectedResCodes?: number[]
}

type PTPSendDataOption = PTPSendCommandOption & {
	data: ArrayBuffer
}

type PTPReceiveDataOption = PTPSendCommandOption & {
	maxByteLength?: number
}

interface PTPResponse {
	resCode: number
	parameters: number[]
}

type PTPDataResponse = PTPResponse & {
	data: ArrayBuffer
}

export interface PTPEvent {
	eventCode: number
	parameters: number[]
}

type PTPEventCallback = (event: PTPEvent) => void

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

export class PTPDevice extends EventEmitter<EventTypes> {
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

		// Claim interface (Ignore error)
		const usbInterface = configuration.interfaces[0]
		const interfaceNum = usbInterface.interfaceNumber
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

		this.listenInterruptIn()
		this.listenDisconnect()

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
			try {
				this.#console.groupCollapsed(`Send Command [${option.label}]`)
				return await this.#sendCommandNow(option)
			} finally {
				this.#console.groupEnd()
			}
		}, PTPQueueOptions)
	}

	sendData = (option: PTPSendDataOption): Promise<PTPResponse> => {
		return this.#queue.add(async () => {
			try {
				this.#console.groupCollapsed(`Send Data [${option.label}]`)
				return await this.#sendDataNow(option)
			} finally {
				this.#console.groupEnd()
			}
		}, PTPQueueOptions)
	}

	receiveData = (option: PTPReceiveDataOption): Promise<PTPDataResponse> => {
		return this.#queue.add(async () => {
			try {
				this.#console.groupCollapsed(`Receive Data [${option.label}]`)
				return await this.#receiveDataNow(option)
			} finally {
				this.#console.groupEnd()
			}
		}, PTPQueueOptions) as Promise<PTPDataResponse>
	}

	async #sendCommandNow(option: PTPSendCommandOption): Promise<PTPResponse> {
		const {opcode, parameters, expectedResCodes} = {
			parameters: [],
			expectedResCodes: [ResCode.OK],
			...option,
		}

		for (let i = 0; i < PTPTryCount; i++) {
			const id = this.generateTransactionId()

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
			const id = this.generateTransactionId()

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
			maxByteLength: 10_000, // = 10KB. Looks enough for non-media data transfer
			...option,
		}

		for (let i = 0; i < PTPTryCount; i++) {
			const id = this.generateTransactionId()

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

			// Check rescode

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
		if (!this.usb || !this.usb.opened) throw new Error()

		const {data, status} = await this.usb.transferIn(
			this.#endpointNumberBulkIn,
			maxByteLength
		)

		// Error checking
		if (status !== 'ok') {
			if (status === 'stall') {
				await this.usb.clearHalt('in', this.#endpointNumberBulkIn)
			}
			throw new Error(`BulkIn returned status: ${status}`)
		}
		if (!data || data.byteLength < 12) throw new Error('Invalid bulkIn data')

		// Unpack packet
		const type = data.getUint16(4, true)
		const code = data.getUint16(6, true)
		const transactionId = data.getUint32(8, true)
		const payload = data.buffer.slice(12)

		this.#console.info(
			'transferInBulk',
			'type=' + PTPBlockType[type],
			'code=' + toHexString(code, 2),
			'id=' + transactionId,
			'payload=',
			payload
		)

		if (transactionId !== expectedTransactionId)
			throw new Error(
				`Transaction ID mismatch. Expected=${expectedTransactionId},` +
					` got=${transactionId}`
			)

		return {
			type,
			code,
			transactionId,
			payload,
		}
	}

	private listenInterruptIn = async () => {
		if (!this.usb || !this.usb.opened) return

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
			if (
				err instanceof DOMException &&
				err.message.match(/The transfer was cancelled./) &&
				!this.#opened
			) {
				return
			}
			throw err
		} finally {
			setTimeout(this.listenInterruptIn, 0)
		}
	}

	private listenDisconnect() {
		navigator.usb.addEventListener('disconnect', ev => {
			if (ev.device === this.usb) {
				this.emit('disconnect')
			}
		})
	}

	private generateTransactionId = (): number => {
		this.#transactionId += 1
		if (this.#transactionId > 0xfffffffe) {
			this.#transactionId = 1
		}

		return this.#transactionId
	}
}
