import _ from 'lodash'

export function toHexString(
	data: number | ArrayBuffer,
	bytes: number | 'auto' = 'auto'
): string {
	if (typeof data === 'number') {
		const hex = data.toString(16)
		let length

		if (bytes === 'auto') {
			length = hex.length
		} else {
			length = bytes
		}

		return '0x' + _.padStart(hex, length, '0')
	} else {
		const arr = [...new Uint8Array(data)]
		return arr.map(byte => _.padStart(byte.toString(16), 2, '0')).join(' ')
	}
}

export function isntNil<T>(value: T): value is NonNullable<T> {
	return value != null
}
