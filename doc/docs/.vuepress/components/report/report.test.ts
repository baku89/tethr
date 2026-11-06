import {readdirSync, readFileSync} from 'node:fs'

import {describe, expect, it} from 'vitest'

import {createFakeS9} from '../../../../../core/src/test/fakeS9'
import {TethrPanasonic} from '../../../../../core/src/TethrPTPUSB/TethrPanasonic'
import {
	buildReport,
	createPullRequestLink,
	describeBrowser,
	describeCamera,
	MaxUrlLength,
	parseReport,
	Report,
	reportFilename,
	toYaml,
} from './reportFile'
import {
	CheckOptions,
	CheckSection,
	DefaultCheckOptions,
	runChecks,
	sampleValues,
} from './runChecks'

const environment = {tethr: '0.6.4', browser: 'Chrome 156', os: 'macOS'}
const date = new Date('2026-11-04T12:00:00Z')

async function checkS9(options: Partial<CheckOptions> = {}) {
	const fake = createFakeS9()
	const camera = new TethrPanasonic(fake.transport)
	await camera.open()

	const before = await camera.exportConfigs()
	const sections: CheckSection[] = []
	await runChecks(
		camera,
		{...DefaultCheckOptions, liveview: false, ...options},
		sections,
		{settleMs: 0}
	)
	return {...fake, camera, sections, before}
}

const row = (sections: CheckSection[], id: string, name: string) =>
	sections.find(s => s.id === id)!.rows.find(r => r.name === name)!

describe('runChecks', () => {
	it('round-trips writable configs on a body that behaves', async () => {
		const {sections} = await checkS9()

		expect(row(sections, 'configs', 'iso')).toMatchObject({
			status: 'ok',
			access: 'rw',
			options: 26,
			roundTrip: '12/12',
		})
		expect(sections.find(s => s.id === 'configs')!.rows.filter(r => r.status === 'fail')).toEqual([])
	}, 30_000)

	it('puts every config back', async () => {
		const {camera, before} = await checkS9()
		expect(await camera.exportConfigs()).toEqual(before)
	}, 30_000)

	it('reports what a body gets wrong instead of stopping', async () => {
		const fake = createFakeS9()
		const camera = new TethrPanasonic(fake.transport)
		await camera.open()
		// Accepts every write, but changes nothing
		fake.transport.handle(0x9403, () => {})

		const sections: CheckSection[] = []
		await runChecks(camera, {...DefaultCheckOptions, liveview: false}, sections, {
			settleMs: 0,
		})

		const iso = row(sections, 'configs', 'iso')
		expect(iso.status).toBe('fail')
		expect(iso.roundTrip).toBe('0/12')
		expect(iso.detail).toMatch(/reads as auto/)
	}, 30_000)

	it('writes nothing when not asked to', async () => {
		const {transport} = await checkS9({writeConfigs: false})
		expect(transport.callsOf(0x9403)).toHaveLength(0)
	})

	it('leaves the shutter and the lens alone unless asked', async () => {
		const {transport, sections} = await checkS9({writeConfigs: false})

		expect(transport.callsOf(0x9404)).toHaveLength(0) // Capture
		expect(transport.callsOf(0x9405)).toHaveLength(0) // AF
		expect(transport.callsOf(0x9416)).toHaveLength(0) // MF
		expect(row(sections, 'actions', 'takePhoto')).toMatchObject({
			status: 'skip',
			detail: 'not selected',
		})
	})

	it('fires the shutter when asked, and hands over the picture', async () => {
		const fake = createFakeS9()
		const camera = new TethrPanasonic(fake.transport)
		await camera.open()
		fake.announceOnCapture([
			{id: 1, format: 0x3801, bytes: 10, filename: 'P1.JPG'},
			{id: 2, format: 0x3800, bytes: 20, filename: 'P1.RW2'},
		])

		const sections: CheckSection[] = []
		let photo: Blob | undefined
		await runChecks(
			camera,
			{...DefaultCheckOptions, writeConfigs: false, liveview: false, shutter: true},
			sections,
			{onPhoto: blob => (photo = blob)}
		)

		expect(row(sections, 'actions', 'takePhoto')).toMatchObject({
			status: 'ok',
			detail: 'jpeg, raw',
		})
		expect(photo?.type).toBe('image/jpeg')
	})

	it('drives manual focus in MF, then goes back to AF', async () => {
		const fake = createFakeS9()
		const camera = new TethrPanasonic(fake.transport)
		await camera.open()
		// Like the real body: only in MF
		fake.transport.handle(0x9416, () =>
			fake.transport.calls.filter(c => c.opcode === 0x9403).length === 1
				? {}
				: {resCode: 0x201d}
		)

		const sections: CheckSection[] = []
		await runChecks(
			camera,
			{
				...DefaultCheckOptions,
				writeConfigs: false,
				liveview: false,
				manualFocus: true,
			},
			sections,
			{settleMs: 0}
		)

		expect(row(sections, 'actions', 'manualFocus').status).toBe('ok')
		expect(await camera.get('focusMode')).toBe('af')
	})

	it('adds rows through the array it was given, so reactive ones update', async () => {
		const pushed: unknown[] = []
		const sections = new Proxy([] as CheckSection[], {
			get(target, key, receiver) {
				const value = Reflect.get(target, key, receiver)
				if (typeof key === 'string' && /^\d+$/.test(key)) pushed.push(key)
				return value
			},
		})
		const fake = createFakeS9()
		const camera = new TethrPanasonic(fake.transport)
		await camera.open()

		await runChecks(
			camera,
			{...DefaultCheckOptions, writeConfigs: false, liveview: false},
			sections,
			{settleMs: 0}
		)

		expect(pushed.length).toBeGreaterThan(0)
	})
})

describe('sampleValues', () => {
	it('keeps a short list', () => {
		expect(sampleValues([1, 2, 3], 12)).toEqual([1, 2, 3])
	})

	it('spreads across a long one, ends included', () => {
		const values = Array.from({length: 59}, (_, i) => i)
		const sampled = sampleValues(values, 12)

		expect(sampled).toHaveLength(12)
		expect(sampled[0]).toBe(0)
		expect(sampled.at(-1)).toBe(58)
	})
})

describe('the report', () => {
	async function reportS9(notes?: string): Promise<Report> {
		const {camera, sections} = await checkS9()
		return buildReport(await describeCamera(camera), environment, sections, {
			notes,
			date,
		})
	}

	it('names the model and firmware', async () => {
		expect((await reportS9()).camera).toEqual({
			type: 'ptpusb',
			manufacturer: 'Panasonic',
			model: 'DC-S9',
			firmware: '1.9',
			usb: '04da:2382',
		})
	}, 30_000)

	it('says nothing about the unit: no serial number, no file names', async () => {
		const fake = createFakeS9()
		const camera = new TethrPanasonic(fake.transport)
		await camera.open()
		// The real identifier carries the serial, and it must not get through
		Object.defineProperty(camera, 'identifier', {
			value: {
				type: 'ptpusb',
				usb: {vendorId: 0x04da, productId: 0x2382, serialNumber: 'SECRET123'},
			},
		})
		fake.announceOnCapture([
			{id: 1, format: 0x3801, bytes: 10, filename: 'PRIVATE.JPG'},
		])
		await camera.set('imageQuality', 'fine')

		const sections: CheckSection[] = []
		await runChecks(
			camera,
			{...DefaultCheckOptions, writeConfigs: false, liveview: false, shutter: true},
			sections
		)
		const yaml = toYaml(
			buildReport(await describeCamera(camera), environment, sections, {date})
		)

		expect(yaml).not.toContain('SECRET123')
		expect(yaml).not.toContain('PRIVATE')
	})

	it('survives YAML', async () => {
		const report = await reportS9('Works: "great": yes\nSecond line')
		expect(parseReport(toYaml(report))).toEqual(report)
	}, 30_000)

	it('counts every row', async () => {
		const report = await reportS9()
		const rows = Object.values(report.sections).flatMap(Object.values)
		const {ok, fail, skip} = report.summary
		expect(ok + fail + skip).toBe(rows.length)
	}, 30_000)

	it('leaves out blank notes', async () => {
		expect(await reportS9('   ')).not.toHaveProperty('notes')
	}, 30_000)

	it('gets a file name that is safe, and unique per model, firmware and day', async () => {
		expect(reportFilename(await reportS9())).toBe(
			'panasonic-dc-s9-fw1.9-20261104.yaml'
		)
	}, 30_000)

	it.each([
		['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', 'Chrome 156', 'macOS'],
		['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'Edg 150', 'Windows'],
		['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 'Chrome 150', 'Linux'],
	])('reads the browser from %s', (ua, browser, os) => {
		expect(describeBrowser(ua)).toEqual({browser, os})
	})
})

describe('the pull request link', () => {
	const report: Report = {
		schema: 1,
		date: '2026-11-04',
		camera: {type: 'ptpusb', manufacturer: 'Panasonic', model: 'DC-S9'},
		environment,
		summary: {ok: 1, fail: 0, skip: 0},
		sections: {capabilities: {canTakePhoto: {status: 'ok'}}},
	}

	it('fills in the new-file page', () => {
		const {url, inlined, yaml} = createPullRequestLink(report)
		const parsed = new URL(url)

		expect(inlined).toBe(true)
		expect(parsed.pathname).toBe('/baku89/tethr/new/main')
		expect(parsed.searchParams.get('filename')).toBe(
			'doc/reports/panasonic-dc-s9-20261104.yaml'
		)
		expect(parsed.searchParams.get('value')).toBe(yaml)
		expect(parsed.searchParams.get('message')).toBe('report: Panasonic DC-S9')
		expect(parsed.searchParams.get('description')).toContain('1 ok')
	})

	it('leaves the report out rather than making a link GitHub rejects', () => {
		const {url, inlined, yaml} = createPullRequestLink(report, {maxLength: 200})

		expect(inlined).toBe(false)
		expect(new URL(url).searchParams.has('value')).toBe(false)
		expect(yaml).toContain('DC-S9')
	})

	it('fits a full S9 report', async () => {
		const {camera, sections} = await checkS9()
		const full = buildReport(await describeCamera(camera), environment, sections, {
			date,
		})
		const {url, inlined} = createPullRequestLink(full)

		expect(inlined).toBe(true)
		expect(url.length).toBeLessThanOrEqual(MaxUrlLength)
	}, 30_000)
})

describe('the reports in the repository', () => {
	const dir = new URL('../../../../reports/', import.meta.url)
	const names = readdirSync(dir).filter(name => name.endsWith('.yaml'))

	it.each(names)('%s is well-formed and named after its content', name => {
		const text = readFileSync(new URL(name, dir), 'utf8')
		const report = parseReport(text)

		expect(report.schema).toBe(1)
		expect(report.camera.type).toBeTruthy()
		expect(reportFilename(report)).toBe(name)
		expect(text).not.toMatch(/serial/i)
	})
})
