import {times} from 'lodash'

import {PTPDataView} from './PTPDataView'

export enum IFDType {
	Byte = 0x1,
	Ascii = 0x2,
	Short = 0x3,
	Long = 0x4,
	Rational = 0x5,
	Undefined = 0x7,
	SignedShort = 0x8,
	Slong = 0x9,
	Srational = 0xa,
	Float = 0xb,
	Double = 0xc,
}

export type IFDValue<Type extends IFDType> = Type extends IFDType.Ascii
	? string
	: Type extends IFDType.Undefined
	? ArrayBuffer
	: number[]

export interface IFDScheme {
	[name: string]: {tag: number; type: IFDType}
}

export type IFDDecodeResult<Scheme extends IFDScheme> = {
	[K in keyof Scheme]: IFDValue<Scheme[K]['type']>
}

export function decodeIFD<Scheme extends IFDScheme>(
	data: ArrayBuffer,
	scheme: Scheme
): IFDDecodeResult<Scheme> {
	const dataView = new DataView(data)
	const asciiDecoder = new TextDecoder('ascii')

	const tagToEntry = new Map(
		Object.entries(scheme).map(([name, {tag, type}]) => {
			return [tag, {name, type}]
		})
	)

	const result: Record<string, string | number[] | ArrayBuffer> = {}

	// The first 4 byte represents the size of packet.
	const entryCount = dataView.getUint32(4, true)

	for (let i = 0; i < entryCount; i++) {
		// (packet size::Uint32) + (entry count::Uint32) = 8
		const entryOffset = 8 + 12 * i

		// Read a directory entry
		const tag = dataView.getUint16(entryOffset, true)
		const type = dataView.getUint16(entryOffset + 2, true)
		const count = dataView.getUint32(entryOffset + 4, true)

		// If the data size exceeds 4 bytes, this represents a offset
		// to the data. Oterwise, it's data itself.
		const valueOffset = dataView.getUint32(entryOffset + 8, true)

		const entryScheme = tagToEntry.get(tag)
		if (!entryScheme) continue
		if (type !== entryScheme.type)
			throw new Error(
				`Invalid IFD: Tag type for entry ${
					entryScheme.name
				} does not match. Expected ${IFDType[entryScheme.type]}, got ${
					IFDType[type]
				}`
			)

		let value: null | string | number[] | ArrayBuffer = null

		switch (type) {
			case IFDType.Byte: {
				const offset = count > 4 ? valueOffset : entryOffset + 8
				const buf = data.slice(offset, offset + count)
				value = [...new Uint8Array(buf)]
				break
			}
			case IFDType.Ascii: {
				const buf = data.slice(valueOffset, valueOffset + count - 1)
				value = asciiDecoder.decode(buf)
				break
			}
			case IFDType.Short: {
				const offset = count > 2 ? valueOffset : entryOffset + 8
				const buf = data.slice(offset, offset + count * 2)
				value = [...new Uint16Array(buf)]
				break
			}
			case IFDType.Long: {
				const offset = count > 1 ? valueOffset : entryOffset + 8
				const buf = data.slice(offset, offset + count * 4)
				value = [...new Uint32Array(buf)]
				break
			}
			case IFDType.Undefined: {
				const offset = count > 4 ? valueOffset : entryOffset + 8
				value = data.slice(offset, offset + count)
				break
			}
			case IFDType.SignedShort: {
				// Signed SHORT
				const offset = count > 2 ? valueOffset : entryOffset + 8
				value = times(count, i => {
					const f = dataView.getUint8(offset + i * 2)
					const d = dataView.getInt8(offset + i * 2 + 1)

					return d + f / 0x100
				})
				break
			}
			case IFDType.Float: {
				const offset = count > 1 ? valueOffset : entryOffset + 8
				const buf = data.slice(offset, offset + count * 4)
				value = [...new Float32Array(buf)]
				break
			}
			default:
				throw new Error(`Type ${IFDType[type]} is not yet supported`)
		}

		result[entryScheme.name] = value
	}

	return result as IFDDecodeResult<Scheme>
}

export interface IFDData {
	[name: string]:
		| {
				tag: number
				type: IFDType.Ascii
				value: string
		  }
		| {
				tag: number
				type: IFDType.Undefined
				value: ArrayBuffer
		  }
		| {
				tag: number
				type: Exclude<IFDType, IFDType.Ascii | IFDType.Undefined>
				value: number[]
		  }
}

export function encodeIFD(data: IFDData): ArrayBuffer {
	const dataView = new PTPDataView()

	const entries = Object.values(data).sort((a, b) => {
		if (a.tag === b.tag) throw new Error('Same tag has found')
		return a.tag < b.tag ? 1 : -1
	})

	const entryCount = entries.length

	// the first 4 bytes represents the packet size,
	// but it somehow works just to fill 'em with zeros, at least in Sigma fp
	dataView.goto(4)

	dataView.writeUint32(entryCount)

	let dataOffset = 8 + entries.length * 12

	for (const [index, entry] of entries.entries()) {
		const entryOffset = 8 + index * 12

		dataView.goto(entryOffset)
		dataView.writeUint16(entry.tag)
		dataView.writeUint16(entry.type)

		const count =
			entry.value instanceof ArrayBuffer
				? entry.value.byteLength
				: entry.value.length
		dataView.writeUint32(count)

		switch (entry.type) {
			case IFDType.Byte: {
				if (count > 4) {
					throw new Error('Not yet supported')
				} else {
					for (let i = 0; i < 4; i++) {
						dataView.writeUint8(entry.value[i])
					}
				}
				break
			}
			case IFDType.Short: {
				if (entry.value.length > 2) {
					dataView.writeUint32(dataOffset)
					dataView.goto(dataOffset)
					for (let i = 0; i < entry.value.length; i++) {
						dataView.writeUint16(entry.value[i])
					}
					dataOffset += entry.value.length * 2
				} else {
					for (let i = 0; i < 2; i++) {
						dataView.writeUint16(entry.value[i])
					}
				}
				break
			}
			default:
				throw new Error(`Type ${IFDType[entry.type]} is not yet supported`)
		}
	}

	dataView.writeCheckSum()

	return dataView.toBuffer()
}

;(window as any).encodeIFD = encodeIFD
