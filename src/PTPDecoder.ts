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

	public skip(bytes: number) {
		if (this.byteOffset + bytes > this.buffer.byteLength) {
			throw new Error('Not enough byteLength to skip')
		}
		this.byteOffset += bytes

		return this
	}

	public goto(offset: number) {
		this.byteOffset = offset

		return this
	}

	public hasNext(bytes = 0): boolean {
		return this.byteOffset + bytes < this.buffer.byteLength
	}

	public readUint8 = (): number => {
		const ret = this.dataView.getUint8(this.byteOffset)
		this.byteOffset += 1
		return ret
	}

	public readInt8 = (): number => {
		const ret = this.dataView.getInt8(this.byteOffset)
		this.byteOffset += 1
		return ret
	}

	public readUint16 = (): number => {
		const ret = this.dataView.getUint16(this.byteOffset, true)
		this.byteOffset += 2
		return ret
	}

	public readInt16 = (): number => {
		const ret = this.dataView.getInt16(this.byteOffset)
		this.byteOffset += 2
		return ret
	}

	public readUint32 = (): number => {
		const ret = this.dataView.getUint32(this.byteOffset, true)
		this.byteOffset += 4
		return ret
	}

	public readUint64 = (): bigint => {
		const ret = this.dataView.getBigUint64(this.byteOffset, true)
		this.byteOffset += 8
		return ret
	}

	public readByteString = (): string => {
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

	public readString = (): string => {
		const numChars = this.readUint8()

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

	public readDate = (): Date => {
		const timestamp = this.readString()
		return parseTimestamp(timestamp, 'YYYYMMDDThhmmss')
	}

	public readUint8Array = (): number[] => {
		return this.readArray(this.readUint8)
	}

	public readUint16Array = (): number[] => {
		return this.readArray(this.readUint16)
	}

	public readInt16Array = (): number[] => {
		return this.readArray(this.readInt16)
	}

	public readUint32Array = (): number[] => {
		return this.readArray(this.readUint32)
	}

	public peekRest = (): ArrayBuffer => {
		return this.dataView.buffer.slice(this.byteOffset)
	}

	private readArray = (getFunc: () => number) => {
		const length = this.readUint32()
		return _.times(length, getFunc.bind(this))
	}
}
