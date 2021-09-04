export class PTPDecoder {

	private buffer: ArrayBuffer
	private dataView: DataView
	private byteOffset: number

	constructor(dataView: DataView) {
		this.dataView = dataView
		this.buffer = dataView.buffer
		this.byteOffset = 0
	}

	getUint8(): number {
		const ret = this.dataView.getUint8(this.byteOffset)
		this.byteOffset += 1
		return ret
	}

	getUint16(): number {
		const ret = this.dataView.getUint16(this.byteOffset, true)
		this.byteOffset += 2
		return ret
	}

	getUint32(): number {
		const ret = this.dataView.getUint32(this.byteOffset, true)
		this.byteOffset += 4
		return ret
	}

	getUint64(): bigint {
		const ret = this.dataView.getBigUint64(this.byteOffset, true)
		this.byteOffset += 8
		return ret
	}

	getString(): string {
		const numChars = this.getUint8()

		if (numChars == 0) {
			return ''
		}
		
		const strBuffer = this.buffer.slice(this.byteOffset, this.byteOffset + (numChars - 1) * 2)
		const ret = String.fromCharCode(...new Uint16Array(strBuffer))

		this.byteOffset += numChars * 2

		return ret
	}

	getUint16Array<T = number>(fmap: ((x: number) => T) = x => x as never): T[] {
		const length = this.getUint32()

		const arr = new Array(length).fill(0)
			.map(() => this.getUint16())
			.map(fmap)

		return arr
	}

	getRest(): ArrayBuffer {
		return this.dataView.buffer.slice(this.byteOffset)
	}
}