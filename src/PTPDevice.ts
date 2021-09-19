import EventEmitter from 'eventemitter3'
import PromiseQueue from 'promise-queue'

import {ResCode} from './PTPDatacode'
import {toHexString} from './util'

enum PTPType {
	Command = 0x1,
	Data = 0x2,
	Response = 0x3,
	Event = 0x4,
}

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

export type PTPEventCallback = (event: PTPEvent) => void

interface BulkInInfo {
	type: PTPType
	code: number
	transactionId: number
	payload: ArrayBuffer
}

const PTP_COMMAND_BYTES_MAX = 12 + 4 * 3

export class PTPDevice extends EventEmitter<Record<string, PTPEvent>> {
	private transactionId = 0x00000000

	private bulkOut = 0x0
	private bulkIn = 0x0
	private interruptIn = 0x0

	private _opened = false

	private bulkInQueue = new PromiseQueue(1, Infinity)

	public constructor(public device: USBDevice) {
		super()
	}

	public open = async (): Promise<void> => {
		await this.device.open()
		// Configurate
		let {configuration} = this.device
		if (!configuration) {
			await this.device.selectConfiguration(1)
			configuration = this.device.configuration
		}
		if (!configuration) throw new Error('Cannot configure PTPDevice')

		// Claim interface
		try {
			await this.device.claimInterface(0)
		} catch (err) {
			if (navigator.userAgent.match(/mac/i)) {
				console.error(
					'On macOS, you need to shut down other applications accessing the camera or run "killall -9 PTPCamera" in Terminal'
				)
			}
			throw err
		}

		// Determine endpoints number
		const endpoints = configuration.interfaces[0].alternates[0].endpoints

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

		this.bulkOut = endpointOut.endpointNumber
		this.bulkIn = endpointIn.endpointNumber
		this.interruptIn = endpointEvent.endpointNumber

		console.log(`PTPDevice = ${this.device.productName}`, this.device)

		this.listenInterruptIn()

		this._opened = true
	}

	public close = async (): Promise<void> => {
		if (this.device && this.device.opened) {
			await this.device.close()
		}
		this._opened = false
	}

	public get opened(): boolean {
		return this._opened
	}

	public onEventCode(eventCode: number, callback: PTPEventCallback) {
		const eventName = toHexString(eventCode, 2)
		this.on(eventName, callback)
	}

	public offEventCode(eventCode: number, callback?: PTPEventCallback) {
		const eventName = toHexString(eventCode, 2)
		this.off(eventName, callback)
	}

	public sendCommand = (option: PTPSendCommandOption): Promise<PTPResponse> => {
		return this.bulkInQueue.add(() => this.sendCommandNow(option))
	}

	public sendData = (option: PTPSendDataOption): Promise<PTPResponse> => {
		return this.bulkInQueue.add(() => this.sendDataNow(option))
	}

	public receiveData = (
		option: PTPReceiveDataOption
	): Promise<PTPDataResponse> => {
		return this.bulkInQueue.add(() => this.receiveDataNow(option))
	}

	private sendCommandNow = async (
		option: PTPSendCommandOption
	): Promise<PTPResponse> => {
		const {opcode, label, parameters, expectedResCodes} = {
			label: '',
			parameters: [],
			expectedResCodes: [ResCode.OK],
			...option,
		}
		const id = this.generateTransactionId()

		try {
			console.groupCollapsed(`Send Command [${label}]`)

			await this.transferOutCommand(opcode, id, parameters)

			const res = await this.waitBulkIn(id, PTP_COMMAND_BYTES_MAX)

			// Error checking
			if (res.type !== PTPType.Response) {
				throw new Error(
					`Expected response type: ${PTPType.Response}, got: ${res.type}`
				)
			}

			if (!expectedResCodes.includes(res.code)) {
				const expected = expectedResCodes.map(toHexString)
				const got = toHexString(res.code)
				throw new Error(`Expected rescode=[${expected}], got= ${got}`)
			}

			return {
				resCode: res.code,
				parameters: [...new Uint32Array(res.payload)],
			}
		} finally {
			console.groupEnd()
		}
	}

	private sendDataNow = async (
		option: PTPSendDataOption
	): Promise<PTPResponse> => {
		const {opcode, data, label, parameters, expectedResCodes} = {
			label: '',
			parameters: [],
			expectedResCodes: [ResCode.OK],
			...option,
		}
		const id = this.generateTransactionId()

		try {
			console.groupCollapsed(`Send Data [${label}]`)

			await this.transferOutCommand(opcode, id, parameters)
			await this.transferOutData(opcode, id, data)

			const res = await this.waitBulkIn(id, PTP_COMMAND_BYTES_MAX)

			// Error checking
			if (res.type !== PTPType.Response) {
				throw new Error(
					`Expected response type: ${PTPType.Response}, got: ${res.type}`
				)
			}

			if (!expectedResCodes.includes(res.code)) {
				const expected = expectedResCodes.map(toHexString)
				const got = toHexString(res.code)
				throw new Error(`Expected rescode=[${expected}], got=${got}`)
			}

			return {
				resCode: res.code,
				parameters: [...new Uint32Array(res.payload)],
			}
		} finally {
			console.groupEnd()
		}
	}

	private receiveDataNow = async (
		option: PTPReceiveDataOption
	): Promise<PTPDataResponse> => {
		const {opcode, label, parameters, expectedResCodes, maxByteLength} = {
			label: '',
			parameters: [],
			expectedResCodes: [ResCode.OK],
			maxByteLength: 10_000, // = 10KB. Looks enough for non-media data transfer
			...option,
		}
		const id = this.generateTransactionId()

		console.groupCollapsed(`Receive Data [${label}]`)

		try {
			await this.transferOutCommand(opcode, id, parameters)
			const res1 = await this.waitBulkIn(id, maxByteLength)

			if (res1.type === PTPType.Response) {
				if (expectedResCodes.includes(res1.code)) {
					console.groupEnd()
					return {
						resCode: res1.code,
						parameters: [],
						data: new ArrayBuffer(0),
					}
				}
			}

			if (res1.type !== PTPType.Data) {
				throw new Error(`Cannot receive data code=${toHexString(res1.code)}`)
			}

			const res2 = await this.waitBulkIn(id, PTP_COMMAND_BYTES_MAX)

			if (res2.type !== PTPType.Response) {
				throw new Error(
					`Expected response type: ${PTPType.Response}, but got: ${res2.type}`
				)
			}

			return {
				resCode: res2.code,
				parameters: [...new Uint32Array(res2.payload)],
				data: res1.payload,
			}
		} finally {
			console.groupEnd()
		}
	}

	public waitEvent = async (code: number): Promise<PTPEvent> => {
		const eventName = toHexString(code, 2)

		return new Promise(resolve => {
			this.once(eventName, resolve)
		})
	}

	private transferOutCommand = async (
		opcode: number,
		transactionId: number,
		parameters: number[]
	) => {
		if (!this.device) throw new Error('Device is not opened')

		const length = 12 + parameters.length * 4

		const buffer = new ArrayBuffer(length)
		const dataView = new DataView(buffer)

		dataView.setUint32(0, length, true)
		dataView.setUint16(4, PTPType.Command, true)
		dataView.setUint16(6, opcode, true)
		dataView.setUint32(8, transactionId, true)

		parameters.forEach((param, index) => {
			dataView.setUint32(12 + index * 4, param, true)
		})

		const sent = await this.device.transferOut(this.bulkOut, buffer)
		console.log(
			'transferOutBulk',
			'type=Command',
			'opcode=' + toHexString(opcode, 2),
			'id=' + transactionId,
			'params=' + parameters.map(v => toHexString(v, 4))
		)

		if (sent.status !== 'ok') throw new Error()
	}

	private transferOutData = async (
		opcode: number,
		transactionId: number,
		data: ArrayBuffer
	) => {
		if (!this.device) return false

		const length = 12 + data.byteLength

		const buffer = new ArrayBuffer(length)
		const dataView = new DataView(buffer)

		dataView.setUint32(0, length, true)
		dataView.setUint16(4, PTPType.Data, true)
		dataView.setUint16(6, opcode, true)
		dataView.setUint32(8, transactionId, true)

		const dataBytes = new Uint8Array(data)
		dataBytes.forEach((byte, offset) => dataView.setUint8(12 + offset, byte))

		const sent = await this.device.transferOut(this.bulkOut, buffer)
		console.log(
			'transferOutBulk',
			'type=Data',
			'opcode=' + toHexString(opcode, 2),
			'id=' + transactionId,
			'payload=' + toHexString(data)
		)

		return sent.status === 'ok'
	}

	private waitBulkIn = async (
		expectedTransactionId: number,
		maxByteLength: number
	): Promise<BulkInInfo> => {
		if (!this.device || !this.device.opened) throw new Error()

		const {data, status} = await this.device.transferIn(
			this.bulkIn,
			maxByteLength
		)

		// Error checking
		if (status !== 'ok') throw new Error(`BulkIn returned status: ${status}`)
		if (!data || data.byteLength < 12) throw new Error('Invalid bulkIn data')

		// Unpack packet
		const type = data.getUint16(4, true)
		const code = data.getUint16(6, true)
		const transactionId = data.getUint32(8, true)
		const payload = data.buffer.slice(12)

		console.log(
			'transferInBulk',
			'type=' + PTPType[type] ?? type,
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
		if (!this.device || !this.device.opened) return

		try {
			const {data, status} = await this.device.transferIn(
				this.interruptIn,
				0x800000
			)

			// Error checking
			if (status !== 'ok')
				throw new Error(`InterruptIn returned status: ${status}`)
			if (!data || data.byteLength < 12) {
				return
			}

			// Unpack packet
			const type = data.getUint16(4, true)
			const code = data.getUint16(6, true)
			const transactionId = data.getUint32(8, true)
			const parameters = new Uint32Array(data.buffer.slice(12))

			const eventName = toHexString(code, 2)

			console.log(
				'transferInInterrupt',
				'type=' + PTPType[type],
				'code=' + eventName,
				'id=' + transactionId,
				'parameters=' + [...parameters].map(v => toHexString(v, 4))
			)

			this.emit(eventName, {code, parameters})
		} finally {
			setTimeout(this.listenInterruptIn, 0)
		}
	}

	private generateTransactionId = (): number => {
		this.transactionId += 1
		if (this.transactionId > 0xfffffffe) {
			this.transactionId = 1
		}

		return this.transactionId
	}
}
