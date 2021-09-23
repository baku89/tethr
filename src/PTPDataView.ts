import {parse as parseTimestamp} from 'date-format-parse'
import _ from 'lodash'

/**
 * DataView's subclass with some utility methods for PTP packet decoding
 */
export class PTPDataView extends DataView {
	private currentReadOffset = 0

	public constructor(
		buffer: ArrayBufferLike,
		byteOffset?: number,
		byteLength?: number
	) {
		super(buffer, byteOffset, byteLength)
	}

	public skip(bytes: number) {
		if (this.currentReadOffset + bytes > this.byteLength) {
			throw new Error('Not enough byteLength to skip')
		}
		this.currentReadOffset += bytes

		return this
	}

	public goto(offset: number) {
		this.currentReadOffset = offset
		return this
	}

	public readUint8 = () => {
		const off = this.currentReadOffset
		this.currentReadOffset += 1
		return this.getUint8(off)
	}

	public readInt8 = () => {
		const off = this.currentReadOffset
		this.currentReadOffset += 1
		return this.getInt8(off)
	}

	public readUint16 = () => {
		const off = this.currentReadOffset
		this.currentReadOffset += 2
		return this.getUint16(off, true)
	}

	public readInt16 = () => {
		const off = this.currentReadOffset
		this.currentReadOffset += 2
		return this.getInt16(off, true)
	}

	public readUint32 = () => {
		const off = this.currentReadOffset
		this.currentReadOffset += 4
		return this.getUint32(off, true)
	}

	public readUint64 = (): bigint => {
		const off = this.currentReadOffset
		this.currentReadOffset += 8
		return this.getBigUint64(off, true)
	}

	public readAsciiString = (): string => {
		const start = this.currentReadOffset
		let end = start

		for (end = start; end < this.byteLength; end++) {
			if (this.getUint8(end) === 0x00) break
		}

		const chunk = this.buffer.slice(start, end)

		this.currentReadOffset = end + 1

		const str = String.fromCharCode(...new Uint8Array(chunk))
		return str
	}

	public readFixedUTF16String = (): string => {
		const strLen = this.readUint8()

		if (strLen === 0) {
			return ''
		}

		const strBuffer = this.buffer.slice(
			this.currentReadOffset,
			this.currentReadOffset + (strLen - 1) * 2
		)

		this.currentReadOffset += strLen * 2

		const str = String.fromCharCode(...new Uint16Array(strBuffer))
		return str
	}

	public readUTF16StringNT = (): string => {
		this.skip(2)

		let str = ''
		while (this.currentReadOffset < this.byteLength) {
			const charCode = this.readUint16()
			if (charCode === 0x0000) break

			str += String.fromCharCode(charCode)
		}

		return str
	}

	public readDate = (): Date => {
		const timestamp = this.readFixedUTF16String()
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
		return this.buffer.slice(this.currentReadOffset)
	}

	private readArray = (getFunc: () => number) => {
		const length = this.readUint32()
		return _.times(length, getFunc.bind(this))
	}
}
