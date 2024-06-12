import {ShutterSpeed} from './configs'

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

		return '0x' + data.toString(16).padStart(length, '0')
	} else {
		const arr = [...new Uint8Array(data)]
		return arr.map(byte => byte.toString(16).padStart(2, '0')).join(' ')
	}
}

export function isntNil<T>(value: T): value is NonNullable<T> {
	return value != null
}

export function sliceJpegData(buffer: ArrayBuffer): ArrayBuffer {
	const bytes = new Uint8Array(buffer)
	const len = bytes.length

	// look for the JPEG SOI marker (0xFFD8) in data
	let start: null | number = null

	for (let i = 0; i + 1 < len; i++) {
		if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
			// SOI found
			start = i
			break
		}
	}
	if (start === null) /* no SOI -> no JPEG */ throw new Error('SOI not found')

	// look for the JPEG SOI marker (0xFFD8) in data
	let end: null | number = null

	for (let i = start + 2; i + 1 < len; i++) {
		if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
			// EOI found
			end = i + 2
			break
		}
	}
	if (end === null)
		// no EOI -> no JPEG
		throw new Error('EOI not found')

	return buffer.slice(start, end)
}

export function computeShutterSpeedSeconds(ss: ShutterSpeed) {
	if (ss === 'bulb' || ss === 'sync') {
		return Infinity
	}

	if (ss.includes('/')) {
		const [fraction, denominator] = ss.split('/')
		return parseInt(fraction) / parseInt(denominator)
	}

	return parseFloat(ss)
}
