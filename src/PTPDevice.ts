import {PTPDecoder} from './PTPDecoder'
import {ResponseCodeTable} from './Table'

enum PTPContainerType {
	Command = 0x1,
	Data = 0x2,
	Response = 0x3,
}

interface PTPTransactionOption {
	operationCode: number
	parameters?: number[]
	data?: ArrayBuffer
}

interface PTPTransactionResult {
	responseCode: number
	parameters: number[]
	data?: ArrayBuffer
}

export class PTPDevice {
	private device: USBDevice | undefined
	private transactionId = 0

	async connect(): Promise<void> {
		let [device] = await navigator.usb.getDevices()
		if (!device) {
			device = await navigator.usb.requestDevice({filters: []})
		}

		await device.open()

		if (!device.configuration) {
			await device.selectConfiguration(1)
		}

		await device.claimInterface(0)

		this.device = device
		console.log(`device=${device.productName}`, device)
	}

	async close(): Promise<void> {
		if (!this.device) return
		await this.device.close()
	}

	async performTransaction(
		option: PTPTransactionOption
	): Promise<PTPTransactionResult> {
		const {operationCode, data} = option
		const parameters = option.parameters || []
		const transactionId = this.generateTransactionId()

		await this.sendRequest(operationCode, transactionId, parameters)

		if (data) {
			await this.sendData(operationCode, transactionId, data)
		}

		return await this.getResponse(transactionId)
	}

	private async sendRequest(
		code: number,
		transactionId: number,
		parameters: number[]
	) {
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

		const sent = await this.device.transferOut(1, buffer)
		console.log(
			'Request=',
			'0x' + code.toString(16),
			'id=' + transactionId,
			sent
		)

		if (sent.status !== 'ok') throw new Error()
	}

	private async sendData(
		code: number,
		transactionId: number,
		data: ArrayBuffer
	) {
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

		const sent = await this.device.transferOut(1, buffer)
		console.log(
			'SendData=',
			'0x' + code.toString(16),
			'id=' + transactionId,
			sent
		)

		return sent.status === 'ok'
	}

	private async waitTransferIn(expectedTransactionId: number) {
		if (!this.device) throw new Error()

		const res = await this.device.transferIn(0x2, 512)
		if (!res.data) throw new Error()

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
				const rescode = ResponseCodeTable[code]
				console.log('Response=', {
					dataSize,
					type,
					rescode,
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

	private async getResponse(expectedTransactionId: number) {
		const result: PTPTransactionResult = {
			responseCode: 0x0,
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
		result.responseCode = responsePhase.code
		result.parameters = [...new Uint32Array(responsePhase.payload)]

		return result
	}

	private generateTransactionId(): number {
		this.transactionId += 1
		if (this.transactionId >= 0xfffffffe) {
			this.transactionId = 1
		}

		return this.transactionId
	}
}
