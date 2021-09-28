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

	const entryCount = dataView.getUint32(4, true)
	const result: Record<string, string | number[] | ArrayBuffer> = {}

	for (let i = 0; i < entryCount; i++) {
		const offset = 8 + 12 * i

		const tag = dataView.getUint16(offset, true)
		const type = dataView.getUint16(offset + 2, true)
		const count = dataView.getUint32(offset + 4, true)
		const valueOffset = dataView.getUint32(offset + 8, true)

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
				const off = count > 4 ? valueOffset : offset
				const buf = data.slice(off, off + count)
				value = [...new Uint8Array(buf)]
				break
			}
			case IFDType.Ascii: {
				const buf = data.slice(valueOffset, valueOffset + count - 1)
				value = asciiDecoder.decode(buf)
				break
			}
			case IFDType.Short: {
				// SHORT
				const off = count > 2 ? valueOffset : offset
				const buf = data.slice(off, off + count * 2)
				value = [...new Uint16Array(buf)]
				break
			}
			case IFDType.Undefined: {
				const off = count > 4 ? valueOffset : offset
				value = data.slice(off, off + count)
				break
			}
			case IFDType.SignedShort: {
				// Signed SHORT
				const off = count > 2 ? valueOffset : offset
				value = times(count, i => {
					const f = dataView.getUint8(off + i * 2)
					const d = dataView.getInt8(off + i * 2 + 1)

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
