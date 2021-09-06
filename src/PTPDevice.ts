import {DeviceInfo} from './DeviceInfo'
import {
	DevicePropCode,
	EventCode,
	ObjectFormatCode,
	OpCode,
	ResCode,
} from './PTPDatacode'
import {PTPDecoder} from './PTPDecoder'

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
	parameters: number[]
}

type PTPDataResponse = PTPResponse & {
	data: ArrayBuffer
}

interface PTPEventDetail {
	eventName: string
	code: number
	transactionId: number
	parameters: number[]
}

export type PTPEvent = CustomEvent<PTPEventDetail>

export class PTPDevice extends EventTarget {
	private device: USBDevice | undefined
	private transactionId = 0x00000000

	private bulkOut = 0x0
	private bulkIn = 0x0
	private interruptIn = 0x0
	private listeningEvent = false

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
		if (!configuration) throw new Error('Cannot configurate PTPDevice')

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

		console.log(`device=${device.productName}`, device)

		this.device = device

		// Listen event
		this.checkForEvent()
	}

	public close = async (): Promise<void> => {
		if (!this.device) return
		await this.device.close()
	}

	public getInfo = async (): Promise<DeviceInfo> => {
		const {data} = await this.receiveData({
			label: 'GetDeviceInfo',
			code: OpCode.for('GetDeviceInfo'),
		})

		const decoder = new PTPDecoder(data)

		const info: DeviceInfo = {
			StandardVersion: decoder.getUint16(),
			VendorExtensionID: decoder.getUint32(),
			VendorExtensionVersion: decoder.getUint16(),
			VendorExtensionDesc: decoder.getString(),
			FunctionalMode: decoder.getUint16(),
			OperationsSupported: decoder.getUint16Array(OpCode.nameFor),
			EventsSupported: decoder.getUint16Array(EventCode.nameFor),
			DevicePropertiesSupported: decoder.getUint16Array(DevicePropCode.nameFor),
			CaptureFormats: decoder.getUint16Array(ObjectFormatCode.nameFor),
			ImageFormats: decoder.getUint16Array(ObjectFormatCode.nameFor),
			Manufacturer: decoder.getString(),
			Model: decoder.getString(),
			DeviceVersion: decoder.getString(),
			SerialNumber: decoder.getString(),
		}

		return info
	}

	public sendCommand = async (option: PTPSendOption): Promise<PTPResponse> => {
		const {code} = option
		const label = option.label ?? ''
		const parameters = option.parameters ?? []
		const expectedResCodes = option.expectedResCodes ?? [ResCode.for('OK')]
		const id = this.generateTransactionId()

		console.groupCollapsed(`Send Command [${label}]`)

		await this.transferOutCommand(code, id, parameters)

		const {payload} = await this.waitTransferIn(
			this.bulkIn,
			PTPType.Response,
			expectedResCodes,
			id
		)

		console.groupEnd()

		return {
			parameters: [...new Uint32Array(payload)],
		}
	}

	public sendData = async (option: PTPSendDataOption): Promise<PTPResponse> => {
		const {code, data} = option
		const label = option.label ?? ''
		const parameters = option.parameters ?? []
		const expectedResCodes = option.expectedResCodes ?? [ResCode.for('OK')]
		const id = this.generateTransactionId()

		console.groupCollapsed(`Send Data [${label}]`)

		await this.transferOutCommand(code, id, parameters)
		await this.transferOutData(code, id, data)

		const {payload} = await this.waitTransferIn(
			this.bulkIn,
			PTPType.Response,
			expectedResCodes,
			id
		)

		console.groupEnd()

		return {
			parameters: [...new Uint32Array(payload)],
		}
	}

	public receiveData = async (
		option: PTPSendOption
	): Promise<PTPDataResponse> => {
		const {code} = option
		const label = option.label ?? ''
		const parameters = option.parameters ?? []
		const id = this.generateTransactionId()

		console.groupCollapsed(`Send Command [${label}]`)

		await this.transferOutCommand(code, id, parameters)
		const {payload: data} = await this.waitTransferIn(
			this.bulkIn,
			PTPType.Data,
			code,
			id
		)
		const {payload} = await this.waitTransferIn(
			this.bulkIn,
			PTPType.Response,
			ResCode.for('OK'),
			id
		)

		console.groupEnd()

		return {
			parameters: [...new Uint32Array(payload)],
			data,
		}
	}

	public waitEvent = async (code: number): Promise<PTPEventDetail> => {
		return new Promise(resolve => {
			this.addEventListener(
				EventCode.nameFor(code),
				e => {
					const detail = (e as PTPEvent).detail
					resolve(detail)
				},
				{once: true}
			)
		})
	}

	private transferOutCommand = async (
		code: number,
		transactionId: number,
		parameters: number[]
	) => {
		if (!this.device) throw new Error()

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
			'Request=',
			'0x' + code.toString(16),
			'id=' + transactionId,
			'parameters=' + parameters
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
			'SendData=',
			'0x' + code.toString(16),
			'id=' + transactionId,
			sent
		)

		return sent.status === 'ok'
	}

	private waitTransferIn = async (
		endpointNumber: number,
		expectedType: PTPType,
		expectedCode: null | number | number[] = null,
		expectedTransactionId: null | number = null
	) => {
		if (!this.device) throw new Error()

		const res = await this.device.transferIn(endpointNumber, 512)
		if (!res.data) throw new Error()
		if (res.status !== 'ok') throw new Error(`Status = ${res.status}`)

		const decoder = new PTPDecoder(res.data)

		/*const dataSize =*/ decoder.getUint32()
		const type = decoder.getUint16()
		const code = decoder.getUint16()
		const transactionId = decoder.getUint32()
		const payload = decoder.getRest()

		// Error checking
		if (
			expectedTransactionId !== null &&
			expectedTransactionId !== transactionId
		) {
			throw new Error('Different transaction ID')
		}
		if (expectedType !== type) {
			throw new Error(`Expected response type: ${expectedType}, got: ${type}`)
		}

		if (expectedCode !== null) {
			const codes = Array.isArray(expectedCode) ? expectedCode : [expectedCode]

			if (!codes.includes(code)) {
				const codesStr = codes.map(c => c.toString(16)).join(', ')
				throw new Error(
					`Expected response codes: [${codesStr}], ${code.toString(16)}`
				)
			}
		}

		return {code, transactionId, payload}
	}

	private checkForEvent = async () => {
		if (this.listeningEvent) return

		try {
			if (!this.device) throw new Error('Device is not initialized')

			this.listeningEvent = true
			const {code, payload, transactionId} = await this.waitTransferIn(
				this.interruptIn,
				PTPType.Event
			)
			this.listeningEvent = false

			const parameters = [...new Uint32Array(payload)]
			const eventName = EventCode.nameFor(code)

			const detail: PTPEventDetail = {
				eventName,
				code,
				transactionId,
				parameters,
			}

			console.log('Event received', detail)
			this.dispatchEvent(new CustomEvent(eventName, {detail}))
		} finally {
			this.checkForEvent()
		}
	}

	private generateTransactionId = (): number => {
		this.transactionId += 1
		if (this.transactionId >= 0xfffffffe) {
			this.transactionId = 1
		}

		return this.transactionId
	}
}
