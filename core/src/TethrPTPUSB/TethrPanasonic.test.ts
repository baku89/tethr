import {afterEach, describe, expect, it, vi} from 'vitest'

import {ConfigName} from '../configs'
import {OpCode, ResCode} from '../PTPDatacode'
import {FakePTPTransport} from '../test/FakePTPTransport'
import {
	createFakeS9,
	Event,
	lastWritten,
	Op,
} from '../test/fakeS9'
import {TethrPanasonic} from './TethrPanasonic'

const Prop = {
	Aperture: 0x02000041,
	ISO: 0x02000021,
	ShutterSpeed: 0x02000031,
	FocusMode: 0x02000071,
	ImageQuality: 0x020000a2,
	Exposure: 0x02000061,
} as const

const Format = {Jpeg: 0x3801, Raw: 0x3800, Association: 0x3001}

async function openS9(options?: {model?: string}) {
	const fake = createFakeS9(options)
	const camera = new TethrPanasonic(fake.transport)
	await camera.open()
	return {...fake, camera}
}

const jpeg = {id: 1, format: Format.Jpeg, bytes: 1000, filename: 'P1.JPG'}
const raw = {id: 2, format: Format.Raw, bytes: 2000, filename: 'P1.RW2'}
const folder = {
	id: 3,
	format: Format.Association,
	bytes: 0,
	filename: '100_PANA',
}

afterEach(() => {
	vi.useRealTimers()
})

describe('session', () => {
	it('opens the Panasonic session', async () => {
		const {transport} = await openS9()
		expect(transport.callsOf(Op.OpenSession)).toHaveLength(1)
	})

	it('closes without opening a new session', async () => {
		const {camera, transport} = await openS9()
		const opened = transport.callsOf(OpCode.OpenSession).length

		await camera.close()

		expect(transport.callsOf(Op.CloseSession)).toHaveLength(1)
		expect(transport.callsOf(OpCode.CloseSession)).toHaveLength(1)
		expect(transport.callsOf(OpCode.OpenSession)).toHaveLength(opened)
		expect(transport.opened).toBe(false)
	})

	it('removes its event listeners on close', async () => {
		const {camera, transport} = await openS9()
		await camera.close()

		expect(transport.listenerCount(Event.PropChanged)).toBe(0)
		expect(transport.listenerCount(Event.Acknowledge)).toBe(0)
	})
})

describe('configs reported by the body', () => {
	const expected: [ConfigName, unknown][] = [
		['aperture', 6.3],
		['shutterSpeed', '1/60'],
		['iso', 'auto'],
		['exposureComp', '-2/3'],
		['whiteBalance', 'auto cool'],
		['colorMode', 'Realtime LUT'],
		['imageAspect', '16:9'],
		['imageQuality', 'raw,fine'],
		['focusMode', 'af'],
		['exposureMode', 'M'],
		['model', 'DC-S9'],
		['manufacturer', 'Panasonic'],
		['liveviewSize', '640x480'],
	]

	it.each(expected)('%s reads as %s', async (name, value) => {
		const {camera} = await openS9()
		expect(await camera.get(name)).toEqual(value)
	})

	// Every value offered must survive a write and read back the same.
	it.each<ConfigName>([
		'aperture',
		'shutterSpeed',
		'iso',
		'exposureComp',
		'whiteBalance',
		'colorMode',
		'imageAspect',
		'imageQuality',
		'focusMode',
	])('every option of %s round-trips', async name => {
		const {camera} = await openS9()
		const {option} = await camera.getDesc(name)
		if (option?.type !== 'enum') throw new Error('Expected an enum')
		expect(option.values.length).toBeGreaterThan(1)

		for (const value of option.values) {
			expect(await camera.set(name, value as never)).toEqual({status: 'ok'})
			expect(await camera.get(name)).toEqual(value)
		}
	}, 20_000)
})

describe('shutter speed', () => {
	it.each([
		['1/60', 60_000],
		['1/1.3', 1300],
		['1/2.5', 2500],
		['1/3.2', 3200],
		['1/8000', 8_000_000],
		['2.5', 0x800009c4],
		['60', 0x8000ea60],
	])('writes %s as %i', async (value, code) => {
		const {camera, transport} = await openS9()
		await camera.set('shutterSpeed', value as never)
		expect(lastWritten(transport, Prop.ShutterSpeed)).toBe(code)
	})

	it('reads the S9 bulb code as bulb and writes it back', async () => {
		const {camera, transport} = await openS9()
		const {option} = await camera.getDesc('shutterSpeed')
		if (option?.type !== 'enum') throw new Error('Expected an enum')

		expect(option.values[0]).toBe('bulb')
		expect(option.values).not.toContain('2147483.646')

		await camera.set('shutterSpeed', 'bulb')
		expect(lastWritten(transport, Prop.ShutterSpeed)).toBe(0xfffffffe)
	})
})

describe('exposure compensation', () => {
	it.each([
		['0', 0],
		['+1/3', 1],
		['-2/3', 0x8002],
		['+1 2/3', 5],
		['-5', 0x800f],
	])('writes %s as %i', async (value, code) => {
		const {camera, transport} = await openS9()
		await camera.set('exposureComp', value)
		expect(lastWritten(transport, Prop.Exposure)).toBe(code)
	})
})

describe('image quality', () => {
	it.each([
		['fine', 0],
		['standard', 1],
		['raw', 3],
		['raw,fine', 4],
		['raw,standard', 5],
	])('writes %s as %i on the S9', async (value, code) => {
		const {camera, transport} = await openS9()
		await camera.set('imageQuality', value)
		expect(lastWritten(transport, Prop.ImageQuality)).toBe(code)
	})

	it('keeps the older codes on other bodies', async () => {
		const {camera} = await openS9({model: 'DC-S5'})
		expect(await camera.get('imageQuality')).toBe('raw,standard')
	})
})

describe('writes the body refuses', () => {
	const rejectingFirst = (transport: FakePTPTransport, times: number) => {
		let left = times
		transport.handle(Op.SetProp, () => {
			if (left-- > 0) return {resCode: ResCode.InvalidParameter}
		})
	}

	it('retries a rejected value once, while the last change settles', async () => {
		const {camera, transport} = await openS9()
		rejectingFirst(transport, 1)

		expect(await camera.set('aperture', 8)).toEqual({status: 'ok'})
		expect(transport.callsOf(Op.SetProp)).toHaveLength(2)
	})

	it('reports invalid parameter instead of throwing', async () => {
		const {camera, transport} = await openS9()
		rejectingFirst(transport, 2)

		expect(await camera.set('aperture', 8)).toEqual({
			status: 'invalid parameter',
		})
		expect(transport.callsOf(Op.SetProp)).toHaveLength(2)
	})

	it('reports busy', async () => {
		const {camera, transport} = await openS9()
		transport.handle(Op.SetProp, () => ({resCode: ResCode.DeviceBusy}))

		expect(await camera.set('aperture', 8)).toEqual({status: 'busy'})
	})

	it('does not send a value it cannot encode', async () => {
		const {camera, transport} = await openS9()
		expect(await camera.set('imageAspect', '5:4' as never)).toEqual({
			status: 'invalid parameter',
		})
		expect(transport.callsOf(Op.SetProp)).toHaveLength(0)
	})
})

describe('descriptors without data', () => {
	it('reads again when the body answers OK with no data', async () => {
		const {camera, transport} = await openS9()
		const answer = transport.handlerOf(Op.GetDesc)!
		let empties = 2
		transport.handle(Op.GetDesc, call =>
			empties-- > 0 ? {} : answer(call)
		)

		expect(await camera.get('aperture')).toBe(6.3)
		expect(transport.callsOf(Op.GetDesc)).toHaveLength(3)
	})

	it('gives up with no value instead of throwing', async () => {
		const {camera, transport} = await openS9()
		transport.handle(Op.GetDesc, () => ({}))

		expect(await camera.getDesc('aperture')).toEqual({
			writable: false,
			value: null,
		})
	})
})

describe('focus', () => {
	it('switches between AF and MF', async () => {
		const {camera, transport} = await openS9()

		await camera.set('focusMode', 'mf')
		expect(lastWritten(transport, Prop.FocusMode)).toBe(3)
		expect(await camera.get('focusMode')).toBe('mf')

		await camera.set('focusMode', 'af')
		expect(lastWritten(transport, Prop.FocusMode)).toBe(4)
	})

	it('offers AF once, though the body has AF-S and AF-C', async () => {
		const {camera} = await openS9()
		const {option} = await camera.getDesc('focusMode')
		expect(option).toEqual({type: 'enum', values: ['af', 'mf']})
	})

	it.each([
		['far:2', 1],
		['far:1', 2],
		['near:1', 3],
		['near:2', 4],
	] as const)('drives %s with mode %i', async (option, mode) => {
		const {camera, transport} = await openS9()
		await camera.runManualFocus(option)

		const {data} = transport.callsOf(Op.ManualFocus)[0]
		expect(new DataView(data!).getUint16(8, true)).toBe(mode)
	})

	it('reports a refused drive when the body is not in MF', async () => {
		const {camera, transport} = await openS9()
		transport.handle(Op.ManualFocus, () => ({
			resCode: ResCode.InvalidParameter,
		}))

		expect((await camera.runManualFocus('near:1')).status).toBe(
			'invalid parameter'
		)
	})
})

describe('liveview size', () => {
	it('lists what the body offers', async () => {
		const {camera} = await openS9()
		const {option} = await camera.getDesc('liveviewSize')
		expect(option).toEqual({
			type: 'enum',
			values: ['640x480', '960x720', '1280x960'],
		})
	})

	it('sends the matching setting', async () => {
		const {camera, transport} = await openS9()
		expect(await camera.set('liveviewSize', '1280x960')).toEqual({status: 'ok'})

		const view = new DataView(
			transport.callsOf(Op.SetLiveviewSettings)[0].data!
		)
		expect(view.getUint16(8, true)).toBe(960)
		expect(view.getUint16(10, true)).toBe(1280)
	})

	it('refuses a size the body does not offer', async () => {
		const {camera} = await openS9()
		expect(await camera.set('liveviewSize', '123x45')).toEqual({
			status: 'invalid parameter',
		})
	})
})

describe('takePhoto', () => {
	it('returns both files of RAW + JPEG, typed by format', async () => {
		const {camera, announceOnCapture} = await openS9()
		announceOnCapture([jpeg, raw])

		const result = await camera.takePhoto()
		if (result.status !== 'ok') throw new Error(result.status)

		expect(
			result.value.map(({format, filename, blob}) => [
				format,
				filename,
				blob.type,
				blob.size,
			])
		).toEqual([
			['jpeg', 'P1.JPG', 'image/jpeg', 1000],
			['raw', 'P1.RW2', 'image/x-panasonic-rw2', 2000],
		])
	})

	it('waits for one file when only JPEG is recorded', async () => {
		const {camera, announceOnCapture} = await openS9()
		await camera.set('imageQuality', 'fine')
		announceOnCapture([jpeg])

		const result = await camera.takePhoto()
		expect(result.status).toBe('ok')
		expect(result.value).toHaveLength(1)
	})

	it('ignores a new folder announced like an image', async () => {
		const {camera, announceOnCapture} = await openS9()
		announceOnCapture([folder, jpeg, raw])

		const result = await camera.takePhoto()
		expect(result.value?.map(o => o.format)).toEqual(['jpeg', 'raw'])
	})

	it('hears images saved to RAM', async () => {
		const {camera, announceOnCapture} = await openS9()
		announceOnCapture([jpeg, raw], Event.ObjectAddedSDRAM)

		expect((await camera.takePhoto()).status).toBe('ok')
	})

	it('skips the download when asked', async () => {
		const {camera, announceOnCapture, transport} = await openS9()
		announceOnCapture([jpeg, raw])

		expect(await camera.takePhoto({doDownload: false})).toEqual({
			status: 'ok',
			value: [],
		})
		expect(transport.callsOf(OpCode.GetPartialObject)).toHaveLength(0)
	})

	it('stops listening when it has what it needs', async () => {
		const {camera, announceOnCapture, transport} = await openS9()
		announceOnCapture([jpeg, raw])
		await camera.takePhoto()

		expect(transport.listenerCount(Event.ObjectAdded)).toBe(0)
		expect(transport.listenerCount(Event.ObjectAddedSDRAM)).toBe(0)
	})

	it('reports an error when the shutter never fires (AF-S out of focus)', async () => {
		vi.useFakeTimers()
		const {camera, transport} = await openS9()

		const taking = camera.takePhoto()
		await vi.advanceTimersByTimeAsync(10_100)

		expect((await taking).status).toBe('general error')
		expect(transport.listenerCount(Event.ObjectAdded)).toBe(0)
	})

	it('tries again when refused for a moment after autofocus', async () => {
		const {camera, transport, announceOnCapture} = await openS9()
		announceOnCapture([jpeg, raw])
		const announce = transport.handlerOf(Op.Capture)!
		let refusals = 1
		transport.handle(Op.Capture, call =>
			refusals-- > 0 ? {resCode: ResCode.GeneralError} : announce(call)
		)

		expect((await camera.takePhoto()).status).toBe('ok')
		expect(transport.callsOf(Op.Capture)).toHaveLength(2)
	})

	it('reports a refusal that does not go away', async () => {
		const {camera, transport} = await openS9()
		transport.handle(Op.Capture, () => ({resCode: ResCode.GeneralError}))

		expect(await camera.takePhoto()).toEqual({
			status: 'general error',
			message: 'The camera refused to shoot.',
		})
		expect(transport.listenerCount(Event.ObjectAdded)).toBe(0)
	})

	it('allows for the exposure time before giving up', async () => {
		vi.useFakeTimers()
		const {camera, transport} = await openS9()
		await camera.set('shutterSpeed', '30')

		let settled = false
		const taking = camera.takePhoto().finally(() => (settled = true))

		await vi.advanceTimersByTimeAsync(39_000)
		expect(settled).toBe(false)
		expect(transport.listenerCount(Event.ObjectAdded)).toBe(1)

		await vi.advanceTimersByTimeAsync(1100)
		expect((await taking).status).toBe('general error')
	})
})

describe('events', () => {
	it('reports a changed property', async () => {
		const {camera, transport} = await openS9()
		const onChange = vi.fn()
		camera.on('apertureChange', onChange)

		transport.emitEvent(Event.PropChanged, 0x02000040)

		await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce())
		expect(onChange.mock.calls[0][0].value).toBe(6.3)
	})

	it('survives a failed read while reporting a change', async () => {
		const {transport} = await openS9()
		transport.handle(Op.GetDesc, () => ({resCode: ResCode.GeneralError}))

		// An unhandled rejection would fail this test run
		transport.emitEvent(Event.PropChanged, 0x02000040)
		await new Promise(resolve => setTimeout(resolve, 10))
	})

	it('acknowledges 0xC101, as LUMIX Tether does', async () => {
		const {transport} = await openS9()

		transport.emitEvent(Event.Acknowledge, 0x01000010)

		await vi.waitFor(() =>
			expect(transport.callsOf(Op.Acknowledge)[0]?.parameters).toEqual([
				0x01000010,
			])
		)
	})
})
