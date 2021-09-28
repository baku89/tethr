import {parse as parseTimestamp} from 'date-format-parse'
import {times} from 'lodash'

const DEFAULT_BUFFER_SIZE = 2048

/**
 * DataView-like class that adds automatic read & write offset tracking, string operations, and useful methods for PTP packet encoding/decoding. Uses little-endian as default
 */
export class PTPDataView {
	private currentByteOffset = 0
	private currentByteLength = 0

	private dataView: DataView
	private buffer: ArrayBufferLike

	public constructor(
		bufferOrSize: ArrayBufferLike | number = DEFAULT_BUFFER_SIZE
	) {
		if (typeof bufferOrSize === 'number') {
			this.buffer = new ArrayBuffer(bufferOrSize)
		} else {
			this.buffer = bufferOrSize
		}

		this.dataView = new DataView(this.buffer)
	}

	public skip(bytes: number) {
		if (this.currentByteOffset + bytes > this.buffer.byteLength) {
			throw new Error('Not enough byteLength to skip')
		}
		this.currentByteOffset += bytes

		return this
	}

	public goto(offset: number) {
		this.currentByteOffset = offset
		return this
	}

	public readUint8 = () => {
		const off = this.currentByteOffset
		this.currentByteOffset += 1
		return this.dataView.getUint8(off)
	}

	public readInt8 = () => {
		const off = this.currentByteOffset
		this.currentByteOffset += 1
		return this.dataView.getInt8(off)
	}

	public readUint16 = () => {
		const off = this.currentByteOffset
		this.currentByteOffset += 2
		return this.dataView.getUint16(off, true)
	}

	public readInt16 = () => {
		const off = this.currentByteOffset
		this.currentByteOffset += 2
		return this.dataView.getInt16(off, true)
	}

	public readUint32 = () => {
		const off = this.currentByteOffset
		this.currentByteOffset += 4
		return this.dataView.getUint32(off, true)
	}

	public readUint64 = (): bigint => {
		const off = this.currentByteOffset
		this.currentByteOffset += 8
		return this.dataView.getBigUint64(off, true)
	}

	public readAsciiString = (): string => {
		const start = this.currentByteOffset
		let end = start

		for (end = start; end < this.buffer.byteLength; end++) {
			if (this.dataView.getUint8(end) === 0x00) break
		}

		const chunk = this.buffer.slice(start, end)

		this.currentByteOffset = end + 1

		const str = String.fromCharCode(...new Uint8Array(chunk))
		return str
	}

	public readFixedUTF16String = (): string => {
		const strLen = this.readUint8()

		if (strLen === 0) {
			return ''
		}

		const strBuffer = this.buffer.slice(
			this.currentByteOffset,
			this.currentByteOffset + (strLen - 1) * 2
		)

		this.currentByteOffset += strLen * 2

		const str = String.fromCharCode(...new Uint16Array(strBuffer))
		return str
	}

	public readUTF16StringNT = (): string => {
		this.skip(2)

		let str = ''
		while (this.currentByteOffset < this.dataView.byteLength) {
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
		return this.buffer.slice(this.currentByteOffset)
	}

	private readArray = (getFunc: () => number) => {
		const length = this.readUint32()
		return times(length, getFunc.bind(this))
	}

	// Write methods
	public writeUint8(value: number) {
		this.resizeBuffer(this.currentByteOffset + 1)
		this.dataView.setUint8(this.currentByteOffset, value)
		this.currentByteOffset += 1
		this.currentByteLength = Math.max(this.currentByteOffset)
	}

	public writeInt8(value: number) {
		this.resizeBuffer(this.currentByteOffset + 1)
		this.dataView.setInt8(this.currentByteOffset, value)
		this.currentByteOffset += 1
		this.currentByteLength = Math.max(this.currentByteOffset)
	}

	public writeUint16(value: number) {
		this.resizeBuffer(this.currentByteOffset + 2)
		this.dataView.setUint16(this.currentByteOffset, value, true)
		this.currentByteOffset += 2
		this.currentByteLength = Math.max(this.currentByteOffset)
	}

	public writeInt16(value: number) {
		this.resizeBuffer(this.currentByteOffset + 2)
		this.dataView.setInt16(this.currentByteOffset, value, true)
		this.currentByteOffset += 2
		this.currentByteLength = Math.max(this.currentByteOffset)
	}

	public writeUint32(value: number) {
		this.resizeBuffer(this.currentByteOffset + 4)
		this.dataView.setUint32(this.currentByteOffset, value, true)
		this.currentByteOffset += 4
		this.currentByteLength = Math.max(this.currentByteOffset)
	}

	public writeInt32(value: number) {
		this.resizeBuffer(this.currentByteOffset + 4)
		this.dataView.setInt32(this.currentByteOffset, value, true)
		this.currentByteOffset += 4
		this.currentByteLength = Math.max(this.currentByteOffset)
	}

	public writeBigUint64(value: bigint) {
		this.resizeBuffer(this.currentByteOffset + 8)
		this.dataView.setBigUint64(this.currentByteOffset, value, true)
		this.currentByteOffset += 8
		this.currentByteLength = Math.max(this.currentByteOffset)
	}

	public writeBigInt64(value: bigint) {
		this.resizeBuffer(this.currentByteOffset + 8)
		this.dataView.setBigInt64(this.currentByteOffset, value, true)
		this.currentByteOffset += 8
		this.currentByteLength = Math.max(this.currentByteOffset)
	}

	public toBuffer() {
		return this.buffer.slice(0, this.currentByteLength)
	}

	private resizeBuffer(byteLength: number) {
		if (byteLength <= this.buffer.byteLength) {
			return
		}

		const oldBufferArray = new Uint8Array(this.buffer)

		// Reallocate buffer then initialize dataView
		this.buffer = new ArrayBuffer(byteLength)
		this.dataView = new DataView(this.buffer)

		// Copy all existing data to newly allocated buffer
		const newBufferArray = new Uint8Array(this.buffer)
		newBufferArray.set(oldBufferArray, 0)
	}
}
