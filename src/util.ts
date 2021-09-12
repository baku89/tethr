export function getHexString(buffer: ArrayBuffer): string {
	const arr = [...new Uint8Array(buffer)]
	return arr.map(byte => ('00' + byte.toString(16)).substr(-2)).join(' ')
}

export function isntNil<T>(value: T): value is NonNullable<T> {
	return value != null
}
