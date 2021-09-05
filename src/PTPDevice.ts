import {DeviceInfo} from './DeviceInfo'
import {
	DevicePropCode,
	EventCode,
	ObjectFormatCode,
	OpCode,
	ResCode,
} from './PTPDatacode'
import {PTPDecoder} from './PTPDecoder'

enum PTPContainerType {
	Command = 0x1,
	Data = 0x2,
	Response = 0x3,
	Event = 0x4,
}

interface PTPTransactionOption {
	label?: string
	opcode: number
	parameters?: number[]
	data?: ArrayBuffer
}

interface PTPTransactionResult {
	rescode: number
	parameters: number[]
	data?: ArrayBuffer
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

	public connect = async (): Promise<void> => {
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
		const result = await this.performTransaction({
			label: 'GetDeviceInfo',
			opcode: OpCode.for('GetDeviceInfo'),
		})

		if (!result.data) throw new Error()
		const decoder = new PTPDecoder(result.data)

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

	public performTransaction = async (
		option: PTPTransactionOption
	): Promise<PTPTransactionResult> => {
		const {opcode, data} = option
		const label = option.label ?? ''
		const parameters = option.parameters ?? []
		const transactionId = this.generateTransactionId()

		console.groupCollapsed(`Transaction [${label}]`)
		await this.sendRequest(opcode, transactionId, parameters)

		if (data) {
			await this.sendData(opcode, transactionId, data)
		}

		const result = await this.getResponse(transactionId)
		console.groupEnd()

		return result
	}

	public waitEvent = async (code: number): Promise<PTPEventDetail> => {
		return new Promise(resolve => {
			this.addEventListener(EventCode.nameFor(code), e => {
				const detail = (e as PTPEvent).detail
				resolve(detail)
			})
		})
	}

	private sendRequest = async (
		code: number,
		transactionId: number,
		parameters: number[]
	) => {
		if (!this.device) throw new Error()

		const length = 12 + parameters.length * 4

		const buffer = new ArrayBuffer(length)
		const dataView = new DataView(buffer)

		dataView.setUint32(0, length, true)
		dataView.setUint16(4, PTPContainerType.Command, false)
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
			sent
		)

		if (sent.status !== 'ok') throw new Error()
	}

	private sendData = async (
		code: number,
		transactionId: number,
		data: ArrayBuffer
	) => {
		if (!this.device) return false

		const length = 12 + data.byteLength

		const buffer = new ArrayBuffer(length)
		const dataView = new DataView(buffer)

		dataView.setUint32(0, length, true)
		dataView.setUint16(4, PTPContainerType.Data, false)
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

	private waitTransferIn = async (expectedTransactionId: number) => {
		if (!this.device) throw new Error()

		const res = await this.device.transferIn(this.bulkIn, 512)
		if (!res.data) throw new Error()
		if (res.status !== 'ok') new Error()

		const decoder = new PTPDecoder(res.data)

		const dataSize = decoder.getUint32()
		const type = decoder.getUint16()
		const code = decoder.getUint16()
		const transactionId = decoder.getUint32()
		const payload = decoder.getRest()

		if (transactionId !== expectedTransactionId) throw new Error()

		switch (type) {
			case PTPContainerType.Data:
				console.log('ReceiveData=', {
					dataSize,
					type,
					code: code.toString(16),
					transactionId,
					payload: new Uint8Array(payload),
				})
				break
			case PTPContainerType.Response: {
				console.log('Response=', {
					dataSize,
					type,
					rescode: ResCode.nameFor(code),
					transactionId,
					payload,
				})
				break
			}
			default:
				throw new Error()
		}

		return {
			type,
			code,
			payload,
		}
	}

	private getResponse = async (expectedTransactionId: number) => {
		const result: PTPTransactionResult = {
			rescode: 0x0,
			parameters: [],
		}

		let responsePhase = await this.waitTransferIn(expectedTransactionId)

		if (responsePhase.type === PTPContainerType.Data) {
			// Process data phase at first, then wait response
			const dataPhase = responsePhase

			result.data = dataPhase.payload

			responsePhase = await this.waitTransferIn(expectedTransactionId)
			if (responsePhase.type !== PTPContainerType.Response) throw new Error()
		}

		// Process response phase
		result.rescode = responsePhase.code
		result.parameters = [...new Uint32Array(responsePhase.payload)]

		return result
	}

	private checkForEvent = async () => {
		if (this.listeningEvent) return

		try {
			if (!this.device) throw new Error('Device is not initialized')

			this.listeningEvent = true
			const res = await this.device.transferIn(this.interruptIn, 512)
			this.listeningEvent = false

			if (!res.data) throw new Error('Invalid event')

			const decoder = new PTPDecoder(res.data)

			/*const dataSize = */ decoder.getUint32()
			const type = decoder.getUint16()
			const code = decoder.getUint16()
			const transactionId = decoder.getUint32()

			const parameters = []
			while (decoder.hasNext) {
				parameters.push(decoder.getUint32())
			}

			if (type !== PTPContainerType.Event) throw new Error('Invalid event')

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
