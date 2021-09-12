import {parse as parseTimestamp} from 'date-format-parse'
import _ from 'lodash'

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

	public skip(bytes: number): void {
		if (this.byteOffset + bytes > this.buffer.byteLength) {
			throw new Error('Not enough byteLength to skip')
		}
		this.byteOffset += bytes
	}

	public goTo(offset: number): void {
		this.byteOffset = offset
	}

	public hasNext(bytes = 0): boolean {
		return this.byteOffset + bytes < this.buffer.byteLength
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

	public getInt16 = (): number => {
		const ret = this.dataView.getInt16(this.byteOffset)
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

	public getByteString = (): string => {
		const start = this.byteOffset
		let end = start
		while (end < this.buffer.byteLength) {
			if (this.dataView.getUint8(end) === 0x00) break
			end += 1
		}

		const chunk = this.buffer.slice(start, end)
		const ret = String.fromCharCode(...new Uint8Array(chunk))

		this.byteOffset = end + 1

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

	public getUint8Array = (): number[] => {
		return this.getArray(this.getUint8)
	}

	public getUint16Array = (): number[] => {
		return this.getArray(this.getUint16)
	}

	public getInt16Array = (): number[] => {
		return this.getArray(this.getInt16)
	}

	public getUint32Array = (): number[] => {
		return this.getArray(this.getUint32)
	}

	public getRest = (): ArrayBuffer => {
		return this.dataView.buffer.slice(this.byteOffset)
	}

	private getArray = (getFunc: () => number) => {
		const length = this.getUint32()
		return _.times(length, getFunc.bind(this))
	}
}
