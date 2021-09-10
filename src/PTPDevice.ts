import EventEmitter from 'eventemitter3'

import {ResCode} from './PTPDatacode'

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

interface PTPInTransferResult {
	type: PTPType
	code: number
	transactionId: number
	payload: ArrayBuffer
}

export class PTPDevice extends EventEmitter {
	private device: USBDevice | undefined
	private transactionId = 0x00000000

	private bulkOut = 0x0
	private bulkIn = 0x0
	private interruptIn = 0x0
	private _opened = false

	public open = async (): Promise<void> => {
		let [device] = await navigator.usb.getDevices()
		if (!device) {
			device = await navigator.usb.requestDevice({filters: []})
		}

		await device.open()

		// Configurate
		let {configuration} = device
		if (!configuration) {
			await device.selectConfiguration(1)
			configuration = device.configuration
		}
		if (!configuration) throw new Error('Cannot configure PTPDevice')

		// Claim interface
		await device.claimInterface(0)

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
		const {code} = option
		const label = option.label ?? ''
		const parameters = option.parameters ?? []
		const expectedResCodes = option.expectedResCodes ?? [ResCode.OK]
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
		const {code, data} = option
		const label = option.label ?? ''
		const parameters = option.parameters ?? []
		const expectedResCodes = option.expectedResCodes ?? [ResCode.OK]
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
		const {code} = option
		const label = option.label ?? ''
		const parameters = option.parameters ?? []
		const expectedResCodes = option.expectedResCodes ?? [ResCode.OK]
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

	public waitEvent = (code: number): Promise<PTPInTransferResult> => {
		return this.onceAsync(
			'event:0x' + code.toString(16)
		) as Promise<PTPInTransferResult>
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
		dataView.setUint16(4, PTPType.Command, false)
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
			'id= ' + transactionId
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
		dataView.setUint16(4, PTPType.Data, false)
		dataView.setUint16(6, code, true)
		dataView.setUint32(8, transactionId, true)

		const dataBytes = new Uint8Array(data)
		dataBytes.forEach((byte, offset) => dataView.setUint8(12 + offset, byte))

		const sent = await this.device.transferOut(this.bulkOut, buffer)
		console.log(
			'transferOutBulk',
			'type= Data',
			'code= 0x' + code.toString(16),
			'id= ' + transactionId
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
			this.emit(eventName, {type, code, transactionId, payload})
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
			const payload = data.buffer.slice(12)

			console.log(
				'transferInInterrupt',
				'type= ' + type,
				'code= 0x' + code.toString(16),
				'id= ' + transactionId,
				'payload= ',
				payload
			)

			const eventName = 'event:0x' + code.toString(16)
			this.emit(eventName, {type, code, transactionId, payload})
		} finally {
			setTimeout(this.listenInterruptIn, 0)
		}
	}

	private waitBulkIn = async (transactionId: number) => {
		if (!this.device) throw new Error('Device is not opened')

		const eventName = transactionId.toString()

		return (await this.onceAsync(eventName)) as PTPInTransferResult
	}

	private generateTransactionId = (): number => {
		this.transactionId += 1
		if (this.transactionId >= 0xfffffffe) {
			this.transactionId = 1
		}

		return this.transactionId
	}

	private onceAsync = (event: string | symbol) => {
		return new Promise(resolve => {
			this.once(event, resolve)
		})
	}
}
