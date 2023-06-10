import {times} from 'lodash'

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
			default:
				throw new Error(`Type ${IFDType[type]} is not yet supported`)
		}

		result[entryScheme.name] = value
	}

	return result as IFDDecodeResult<Scheme>
}
