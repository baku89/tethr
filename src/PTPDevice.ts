import EventEmitter from 'eventemitter3'

import {ResCode} from './PTPDatacode'
import {getHexString} from './util'

enum PTPType {
	Command = 0x1,
	Data = 0x2,
	Response = 0x3,
	Event = 0x4,
}

interface PTPSendOption {
	label?: string
	code: number
	parameters?: number[]
	expectedResCodes?: number[]
}

type PTPSendDataOption = PTPSendOption & {
	data: ArrayBuffer
}

interface PTPResponse {
	code: number
	parameters: number[]
}

type PTPDataResponse = PTPResponse & {
	data: ArrayBuffer
}

export interface PTPDeviceEvent {
	code: number
	parameters: number[]
}

interface PTPDeviceBulkInEvent {
	type: PTPType
	code: number
	transactionId: number
	payload: ArrayBuffer
}

export class PTPDevice extends EventEmitter<Record<string, PTPDeviceEvent>> {
	private device: USBDevice | undefined
	private transactionId = 0x00000000

	private bulkOut = 0x0
	private bulkIn = 0x0
	private interruptIn = 0x0

	private bulkInEventEmitter = new EventEmitter<
		Record<string, PTPDeviceBulkInEvent>
	>()

	private _opened = false

	public open = async (): Promise<void> => {
		// let [device] = await navigator.usb.getDevices()
		const device: USBDevice = await navigator.usb.requestDevice({filters: []})

		console.log(device)

		await device.open()

		// Configurate
		let {configuration} = device
		if (!configuration) {
			await device.selectConfiguration(1)
			configuration = device.configuration
		}
		if (!configuration) throw new Error('Cannot configure PTPDevice')

		// Claim interface
		try {
			await device.claimInterface(0)
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

		console.log(`PTPDevice = ${device.productName}`, device)

		this.device = device

		// Listen event
		this.listenBulkIn()
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

	public sendCommand = async (option: PTPSendOption): Promise<PTPResponse> => {
		const {code, label, parameters, expectedResCodes} = {
			label: '',
			parameters: [],
			expectedResCodes: [ResCode.OK],
			...option,
		}
		const id = this.generateTransactionId()

		try {
			console.groupCollapsed(`Send Command [${label}]`)

			await this.transferOutCommand(code, id, parameters)

			const res = await this.waitBulkIn(id)

			// Error checking
			if (res.type !== PTPType.Response) {
				throw new Error(
					`Expected response type: ${PTPType.Response}, got: ${res.type}`
				)
			}

			if (!expectedResCodes.includes(res.code)) {
				throw new Error(
					`Expected rescode=0x[${expectedResCodes.map(c =>
						c.toString(16)
					)}], got= ${res.code.toString(16)}`
				)
			}

			return {
				code: res.code,
				parameters: [...new Uint32Array(res.payload)],
			}
		} finally {
			console.groupEnd()
		}
	}

	public sendData = async (option: PTPSendDataOption): Promise<PTPResponse> => {
		const {code, data, label, parameters, expectedResCodes} = {
			label: '',
			parameters: [],
			expectedResCodes: [ResCode.OK],
			...option,
		}
		const id = this.generateTransactionId()

		try {
			console.groupCollapsed(`Send Data [${label}]`)

			await this.transferOutCommand(code, id, parameters)
			await this.transferOutData(code, id, data)

			const res = await this.waitBulkIn(id)

			// Error checking
			if (res.type !== PTPType.Response) {
				throw new Error(
					`Expected response type: ${PTPType.Response}, got: ${res.type}`
				)
			}

			if (!expectedResCodes.includes(res.code)) {
				throw new Error(
					`Expected rescode=[${expectedResCodes.map(s =>
						s.toString(16)
					)}], got= ${res.code.toString(16)}`
				)
			}

			return {
				code: res.code,
				parameters: [...new Uint32Array(res.payload)],
			}
		} finally {
			console.groupEnd()
		}
	}

	public receiveData = async (
		option: PTPSendOption
	): Promise<PTPDataResponse> => {
		const {code, label, parameters, expectedResCodes} = {
			label: '',
			parameters: [],
			expectedResCodes: [ResCode.OK],
			...option,
		}
		const id = this.generateTransactionId()

		console.groupCollapsed(`Send Command [${label}]`)

		try {
			await this.transferOutCommand(code, id, parameters)
			const res1 = await this.waitBulkIn(id)

			if (res1.type === PTPType.Response) {
				if (expectedResCodes.includes(res1.code)) {
					return {
						code: res1.code,
						parameters: [],
						data: new ArrayBuffer(0),
					}
				}
			}

			if (res1.type !== PTPType.Data) {
				throw new Error(`Cannot receive data code=0x${res1.code.toString(16)}`)
			}

			const res2 = await this.waitBulkIn(id)

			if (res2.type !== PTPType.Response) {
				throw new Error(
					`Expected response type: ${PTPType.Response}, but got: ${res2.type}`
				)
			}

			return {
				code: res2.code,
				parameters: [...new Uint32Array(res2.payload)],
				data: res1.payload,
			}
		} finally {
			console.groupEnd()
		}
	}

	public waitEvent = async (code: number): Promise<PTPDeviceEvent> => {
		const eventName = '0x' + ('0000' + code.toString(16)).substr(-4)

		return new Promise(resolve => {
			this.once(eventName, resolve)
		})
	}

	private transferOutCommand = async (
		code: number,
		transactionId: number,
		parameters: number[]
	) => {
		if (!this.device) throw new Error('Device is not opened')

		const length = 12 + parameters.length * 4

		const buffer = new ArrayBuffer(length)
		const dataView = new DataView(buffer)

		dataView.setUint32(0, length, true)
		dataView.setUint16(4, PTPType.Command, true)
		dataView.setUint16(6, code, true)
		dataView.setUint32(8, transactionId, true)

		parameters.forEach((param, index) => {
			dataView.setUint32(12 + index * 4, param, true)
		})

		const sent = await this.device.transferOut(this.bulkOut, buffer)
		console.log(
			'transferOutBulk',
			'type= Command',
			'code= 0x' + code.toString(16),
			'id= ' + transactionId,
			'params= ' + parameters.map(v => v.toString(16)).join(',')
		)

		if (sent.status !== 'ok') throw new Error()
	}

	private transferOutData = async (
		code: number,
		transactionId: number,
		data: ArrayBuffer
	) => {
		if (!this.device) return false

		const length = 12 + data.byteLength

		const buffer = new ArrayBuffer(length)
		const dataView = new DataView(buffer)

		dataView.setUint32(0, length, true)
		dataView.setUint16(4, PTPType.Data, true)
		dataView.setUint16(6, code, true)
		dataView.setUint32(8, transactionId, true)

		const dataBytes = new Uint8Array(data)
		dataBytes.forEach((byte, offset) => dataView.setUint8(12 + offset, byte))

		const sent = await this.device.transferOut(this.bulkOut, buffer)
		console.log(
			'transferOutBulk',
			'type=Data',
			'code=0x' + code.toString(16),
			'id=' + transactionId,
			'payload=' + getHexString(data)
		)

		return sent.status === 'ok'
	}

	private listenBulkIn = async () => {
		if (!this.device || !this.device.opened) return

		try {
			const {data, status} = await this.device.transferIn(this.bulkIn, 0x800000)

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
				'type= ' + type,
				'code= 0x' + code.toString(16),
				'id= ' + transactionId,
				'payload= ',
				payload
			)

			const eventName = transactionId.toString()
			const event = {
				type,
				code,
				transactionId,
				payload,
			}
			this.bulkInEventEmitter.emit(eventName, event)
		} finally {
			setTimeout(this.listenBulkIn, 0)
		}
	}

	private listenInterruptIn = async () => {
		if (!this.device || !this.device.opened) return

		try {
			const {data, status} = await this.device.transferIn(this.interruptIn, 64)

			// Error checking
			if (status !== 'ok')
				throw new Error(`InterruptIn returned status: ${status}`)
			if (!data || data.byteLength < 12)
				throw new Error('Invalid interruptIn data')

			// Unpack packet
			const type = data.getUint16(4, true)
			const code = data.getUint16(6, true)
			const transactionId = data.getUint32(8, true)
			const parameters = new Uint32Array(data.buffer.slice(12))

			const eventName = '0x' + ('0000' + code.toString(16)).substr(-4)

			console.log(
				'transferInInterrupt',
				'type= ' + type,
				'code= ' + eventName,
				'id= ' + transactionId,
				'parameters= ',
				[...parameters].map(v => v.toString(16)).join(' ')
			)

			this.emit(eventName, {code, parameters})
		} finally {
			setTimeout(this.listenInterruptIn, 0)
		}
	}

	private waitBulkIn = async (
		transactionId: number
	): Promise<PTPDeviceBulkInEvent> => {
		const eventName = transactionId.toString()
		return new Promise(resolve => {
			this.bulkInEventEmitter.once(eventName, resolve)
		})
	}

	private generateTransactionId = (): number => {
		this.transactionId += 1
		if (this.transactionId > 0xfffffffe) {
			this.transactionId = 1
		}

		return this.transactionId
	}
}
