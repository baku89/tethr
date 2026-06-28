import {ObjectFormatCode} from './PTPDatacode'

/**
 * Human-readable name for a (possibly vendor-specific) PTP object format code.
 *
 * Standard codes resolve via {@link ObjectFormatCode}. Unknown codes — notably
 * vendor RAW formats found on memory cards (CR3, ARW, …) — fall back to a hex
 * string instead of throwing. (The previous `ObjectFormatCode[code].toLowerCase()`
 * crashed with "Cannot read properties of undefined" on any code not in the
 * standard enum, which is exactly what real card contents contain.)
 *
 * Vendor format codes collide across manufacturers (e.g. 0xb101 means different
 * things to Canon and Sony), so they can't live in a global table — pass a
 * vendor resolver to map them.
 *
 * @param code The object format code
 * @param vendor Optional per-vendor resolver for codes outside the standard set
 */
export function getObjectFormatName(
	code: number,
	vendor?: (code: number) => string | undefined
): string {
	return (
		vendor?.(code) ??
		(ObjectFormatCode[code] as string | undefined)?.toLowerCase() ??
		`0x${code.toString(16).padStart(4, '0')}`
	)
}

/** Best-effort MIME type for a format name from {@link getObjectFormatName}. */
const MimeByFormatName: Record<string, string> = {
	jpeg: 'image/jpeg',
	jfif: 'image/jpeg',
	tiff: 'image/tiff',
	tiffep: 'image/tiff',
	png: 'image/png',
	bmp: 'image/bmp',
	gif: 'image/gif',
	// Vendor RAW
	crw: 'image/x-canon-crw',
	cr2: 'image/x-canon-cr2',
	cr3: 'image/x-canon-cr3',
	arw: 'image/x-sony-arw',
	sr2: 'image/x-sony-sr2',
	srf: 'image/x-sony-srf',
	nef: 'image/x-nikon-nef',
	nrw: 'image/x-nikon-nrw',
	raf: 'image/x-fuji-raf',
	orf: 'image/x-olympus-orf',
	rw2: 'image/x-panasonic-rw2',
	dng: 'image/x-adobe-dng',
}

export function getMimeForObjectFormat(name: string | number): string {
	if (typeof name === 'number') return 'application/octet-stream'
	return MimeByFormatName[name] ?? 'application/octet-stream'
}
