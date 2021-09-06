import {parse as parseTimestamp} from 'date-format-parse'

export class PTPDecoder {
	private buffer: ArrayBuffer
	private dataView: DataView
	private byteOffset: number

	public constructor(buffer: DataView | ArrayBuffer) {
		if (buffer instanceof DataView) {
			this.buffer = buffer.buffer
			this.dataView = buffer
		} else {
			this.buffer = buffer
			this.dataView = new DataView(buffer)
		}
		this.byteOffset = 0
	}

	public get hasNext(): boolean {
		return this.byteOffset < this.buffer.byteLength
	}

	public skip(bytes: number): void {
		if (this.byteOffset + bytes > this.buffer.byteLength) {
			throw new Error('Not enough byteLength to skip')
		}
		this.byteOffset += bytes
	}

	public getUint8 = (): number => {
		const ret = this.dataView.getUint8(this.byteOffset)
		this.byteOffset += 1
		return ret
	}

	public getInt8 = (): number => {
		const ret = this.dataView.getInt8(this.byteOffset)
		this.byteOffset += 1
		return ret
	}

	public getUint16 = (): number => {
		const ret = this.dataView.getUint16(this.byteOffset, true)
		this.byteOffset += 2
		return ret
	}

	public getUint32 = (): number => {
		const ret = this.dataView.getUint32(this.byteOffset, true)
		this.byteOffset += 4
		return ret
	}

	public getUint64 = (): bigint => {
		const ret = this.dataView.getBigUint64(this.byteOffset, true)
		this.byteOffset += 8
		return ret
	}

	public getString = (): string => {
		const numChars = this.getUint8()

		if (numChars == 0) {
			return ''
		}

		const strBuffer = this.buffer.slice(
			this.byteOffset,
			this.byteOffset + (numChars - 1) * 2
		)
		const ret = String.fromCharCode(...new Uint16Array(strBuffer))

		this.byteOffset += numChars * 2

		return ret
	}

	public getDate = (): Date => {
		const timestamp = this.getString()
		return parseTimestamp(timestamp, 'YYYYMMDDThhmmss')
	}

	public getUint16Array(): number[] {
		return this.getArray(this.getUint16)
	}

	public getUint32Array(): number[] {
		return this.getArray(this.getUint32)
	}

	public getRest(): ArrayBuffer {
		return this.dataView.buffer.slice(this.byteOffset)
	}

	private getArray(getFunc: () => number) {
		const length = this.getUint32()
		return new Array(length).fill(0).map(getFunc.bind(this))
	}
}
