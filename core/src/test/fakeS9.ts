import {OpCode, ResCode} from '../PTPDatacode'
import {FakePTPTransport} from './FakePTPTransport'
import fixture from './fixtures/panasonicS9.json'

export const Op = {
	OpenSession: 0x9102,
	CloseSession: 0x9103,
	GetDesc: 0x9108,
	Acknowledge: 0x9401,
	SetProp: 0x9403,
	Capture: 0x9404,
	GetLiveviewSettings: 0x9414,
	SetLiveviewSettings: 0x9415,
	ManualFocus: 0x9416,
} as const

export const Event = {
	Acknowledge: 0xc101,
	PropChanged: 0xc102,
	ObjectAdded: 0xc108,
	ObjectAddedSDRAM: 0xc109,
} as const

export function hexToBuffer(hex: string): ArrayBuffer {
	const bytes = new Uint8Array(hex.length / 2)
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
	}
	return bytes.buffer
}

function utf16Hex(text: string) {
	return [...text]
		.map(c => c.charCodeAt(0).toString(16).padStart(2, '0') + '00')
		.join('')
}

/** The body's device info, renamed if asked. Both names must be the same length. */
export function deviceInfoFixture(model = 'DC-S9') {
	return hexToBuffer(
		fixture.deviceInfo.replace(utf16Hex('DC-S9'), utf16Hex(model))
	)
}

/** "Param" codes are written; the property they belong to reports the value. */
const WrittenThrough = new Map([
	[0x02000011, 0x02000010],
	[0x02000021, 0x02000020],
	[0x02000031, 0x02000030],
	[0x02000041, 0x02000040],
	[0x02000051, 0x02000050],
	[0x02000061, 0x02000060],
])

export interface FakeObject {
	id: number
	format: number
	bytes: number
	filename: string
}

function encodeObjectInfo({format, bytes, filename}: FakeObject) {
	const name = [...filename, '\0']
	const date = [...'20261104T120000', '\0']
	const view = new DataView(new ArrayBuffer(52 + 1 + name.length * 2 + (1 + date.length * 2) * 2 + 1))
	let o = 0
	view.setUint32(o, 0x00010001, true)
	view.setUint16((o += 4), format, true)
	view.setUint32((o += 4), bytes, true)
	o += 4
	o += 2 + 4 + 4 + 4 + 4 + 4 + 4 // thumb format, size, size; image size, depth
	o += 4 + 2 + 4 // parent, association
	view.setUint32(o, 0, true) // sequence number
	o += 4

	for (const text of [name, date, date]) {
		view.setUint8(o++, text.length)
		for (const c of text) {
			view.setUint16(o, c.charCodeAt(0), true)
			o += 2
		}
	}
	return view.buffer
}

/**
 * Plays back what a real DC-S9 reported (firmware 1.9, serial removed): property
 * descriptors with their option lists, device info and liveview sizes. Writes
 * follow the body's rule that a value outside the option list is rejected.
 */
export function createFakeS9({model = 'DC-S9'} = {}) {
	const transport = new FakePTPTransport({vendorId: 0x04da, productId: 0x2382})

	const descs = new Map<number, ArrayBuffer>(
		Object.entries(fixture.desc).map(([code, hex]) => [
			Number(code),
			hexToBuffer(hex),
		])
	)

	transport.handle(OpCode.GetDeviceInfo, () => ({
		data: deviceInfoFixture(model),
	}))

	// The one standard property the S9 lists: battery level (0-100, at 80)
	transport.handle(OpCode.GetDevicePropDesc, () => ({
		data: new Uint8Array([
			0x01, 0x50, 0x02, 0x00, 0x00, 100, 80, 0x01, 0, 100, 1,
		]).buffer,
	}))

	transport.handle(Op.GetDesc, ({parameters: [code]}) => ({
		data: descs.get(code)?.slice(0),
		resCode: descs.has(code) ? ResCode.OK : ResCode.DevicePropNotSupported,
	}))

	transport.handle(Op.SetProp, ({data}) => {
		const payload = new DataView(data!)
		const written = payload.getUint32(0, true)
		const size = payload.getUint32(4, true)
		const value =
			size === 2 ? payload.getUint16(8, true) : payload.getUint32(8, true)

		const desc = descs.get(WrittenThrough.get(written) ?? written)
		if (!desc) return {resCode: ResCode.DevicePropNotSupported}

		const view = new DataView(desc)
		const read = (o: number) =>
			size === 2 ? view.getUint16(o, true) : view.getUint32(o, true)

		const valueOffset = view.getUint32(4, true) * 4 + 8
		const count = view.getUint32(valueOffset + size, true)
		const listOffset = valueOffset + size + 4

		// Some properties (color temperature) report no list at all
		const allowed = Array.from({length: count}, (_, i) =>
			read(listOffset + i * size)
		)
		if (count > 0 && !allowed.includes(value)) {
			return {resCode: ResCode.InvalidParameter}
		}

		if (size === 2) view.setUint16(valueOffset, value, true)
		else view.setUint32(valueOffset, value, true)
	})

	let liveviewSetting: ArrayBuffer | undefined

	transport.handle(Op.SetLiveviewSettings, ({data}) => {
		liveviewSetting = data
	})

	transport.handle(Op.GetLiveviewSettings, ({parameters: [code]}) => ({
		data:
			(code === 0x0d800011 ? liveviewSetting : undefined) ??
			hexToBuffer(
				(fixture.liveviewSettings as Record<string, string>)[
					`0x${code.toString(16)}`
				]
			),
	}))

	const objects = new Map<number, FakeObject>()

	/** Have the next capture announce these, as soon as the command arrives. */
	const announceOnCapture = (
		announced: FakeObject[],
		eventCode: number = Event.ObjectAdded
	) => {
		for (const object of announced) objects.set(object.id, object)
		transport.handle(Op.Capture, () => {
			for (const {id} of announced) transport.emitEvent(eventCode, id)
		})
	}

	transport.handle(OpCode.GetObjectInfo, ({parameters: [id]}) => ({
		data: encodeObjectInfo(objects.get(id)!),
	}))

	transport.handle(OpCode.GetPartialObject, ({parameters: [, offset, length]}) => ({
		data: new ArrayBuffer(Math.min(length, 1_000_000 - offset)),
	}))

	return {transport, announceOnCapture}
}

/** Last value written to the property, in the size it was written. */
export function lastWritten(transport: FakePTPTransport, code: number) {
	const call = transport
		.callsOf(Op.SetProp)
		.filter(({parameters}) => parameters[0] === code)
		.at(-1)
	if (!call) return undefined

	const view = new DataView(call.data!)
	return view.getUint32(4, true) === 2
		? view.getUint16(8, true)
		: view.getUint32(8, true)
}
