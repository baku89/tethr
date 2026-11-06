import {ConfigName, ConfigNameList, Tethr} from 'tethr'

export type CheckStatus = 'ok' | 'fail' | 'skip'

export interface CheckRow {
	name: string
	status: CheckStatus
	detail?: string
	/** For configs: `r` (read-only) or `rw`. */
	access?: 'r' | 'rw'
	/** For configs with a list of values: how many the camera offers. */
	options?: number
	/** For written configs: `passed/tried`. */
	roundTrip?: string
}

export type SectionId = 'capabilities' | 'configs' | 'actions' | 'storage'

export interface CheckSection {
	id: SectionId
	title: string
	rows: CheckRow[]
}

export interface CheckOptions {
	/** Write values and read them back. Each is put back afterwards. */
	writeConfigs: boolean
	liveview: boolean
	/** Moves the lens. */
	autoFocus: boolean
	/** Moves the lens. */
	manualFocus: boolean
	/** Fires the shutter, leaving a frame on the card. */
	shutter: boolean
	/** Walks every file on the card, which can take a while. */
	listObjects: boolean
}

export const DefaultCheckOptions: CheckOptions = {
	writeConfigs: true,
	liveview: true,
	autoFocus: false,
	manualFocus: false,
	shutter: false,
	listObjects: false,
}

export interface CheckHooks {
	onLiveview?: (stream: MediaStream | null) => void
	onPhoto?: (image: Blob) => void
	/** Time for the camera to apply a write before it's read back. */
	settleMs?: number
}

const CapabilityFlags = [
	'canTakePhoto',
	'canStartLiveview',
	'canRunAutoFocus',
	'canRunManualFocus',
] as const

/**
 * Writable, but not for a test to touch: the first two move the lens, and the
 * last can leave a camera with nowhere to save.
 */
const NeverWritten = new Set<ConfigName>([
	'focusDistance',
	'focalLength',
	'destinationToSave',
])

const MaxValuesPerConfig = 12

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function message(e: unknown) {
	return e instanceof Error ? e.message || e.name : String(e)
}

// Some camera operations never settle (the Sigma fp runs its autofocus motor but
// never reports completion), and one of those must not stop the whole check.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
	let timer: ReturnType<typeof setTimeout>
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`${label} timed out (${ms} ms)`)),
				ms
			)
		}),
	]).finally(() => clearTimeout(timer))
}

/**
 * A camera can offer values its lens can't reach and use the closest one: the S9
 * lists f/9.4 in tenths, and a lens in third stops lands on f/9.5.
 */
function isNearestStop(written: unknown, read: unknown) {
	return (
		typeof written === 'number' &&
		typeof read === 'number' &&
		read !== written &&
		Math.abs(read - written) / written < 0.1
	)
}

/** Up to `count` values spread evenly across the list. */
export function sampleValues<T>(values: T[], count: number): T[] {
	if (values.length <= count) return values
	return Array.from(
		{length: count},
		(_, i) => values[Math.round((i * (values.length - 1)) / (count - 1))]
	)
}

function candidateValues(
	desc: Awaited<ReturnType<Tethr['getDesc']>>
): unknown[] {
	const {option, value} = desc

	if (option?.type === 'enum') {
		return sampleValues(
			option.values.filter(v => v !== value),
			MaxValuesPerConfig
		)
	}

	if (option?.type === 'range' && typeof value === 'number') {
		const {min, max, step} = option as {min: number; max: number; step: number}
		const next = value + step <= max ? value + step : value - step
		return next >= min ? [next] : []
	}

	return []
}

/**
 * Exercises a connected camera, filling `sections` as it goes. Only ever reports
 * what a config can do and whether it worked, never file names or serial
 * numbers, as the result is meant to be published.
 *
 * `sections` may be reactive: rows are added through it.
 */
export async function runChecks(
	camera: Tethr,
	options: CheckOptions,
	sections: CheckSection[],
	{onLiveview, onPhoto, settleMs = 150}: CheckHooks = {}
) {
	const addSection = (id: SectionId, title: string) => {
		sections.push({id, title, rows: []})
		return sections[sections.length - 1]
	}

	const capabilities = addSection('capabilities', 'Capabilities')
	const can: Record<string, boolean> = {}

	for (const flag of CapabilityFlags) {
		try {
			const {value} = await withTimeout(camera.getDesc(flag), 5000, flag)
			can[flag] = !!value
			capabilities.rows.push({
				name: flag,
				status: value ? 'ok' : 'skip',
				detail: String(value),
			})
		} catch (e) {
			capabilities.rows.push({name: flag, status: 'fail', detail: message(e)})
		}
	}

	const configs = addSection('configs', 'Configs')
	const originals = new Map<ConfigName, unknown>()

	for (const name of ConfigNameList) {
		if ((CapabilityFlags as readonly string[]).includes(name)) continue

		const rowIndex = configs.rows.length
		try {
			const desc = await withTimeout(camera.getDesc(name), 5000, name)

			const readable = desc.value !== null && desc.value !== undefined
			if (!desc.writable && !readable && !desc.option) continue

			configs.rows.push({
				name,
				status: 'ok',
				access: desc.writable ? 'rw' : 'r',
				options:
					desc.option?.type === 'enum' ? desc.option.values.length : undefined,
			})
			const row = configs.rows[rowIndex]

			const canWrite =
				options.writeConfigs &&
				desc.writable &&
				!NeverWritten.has(name) &&
				typeof desc.value !== 'object'
			if (!canWrite) continue

			const values = candidateValues(desc)
			if (values.length === 0) continue

			originals.set(name, desc.value)

			const failures: string[] = []
			let snapped = 0
			for (const value of values) {
				try {
					const result = await withTimeout(
						camera.set(name, value as never),
						5000,
						name
					)
					await sleep(settleMs)
					const read = await withTimeout(camera.get(name), 5000, name)
					if (result.status !== 'ok') {
						failures.push(`${value}: ${result.status}`)
					} else if (isNearestStop(value, read)) {
						snapped++
					} else if (read !== value) {
						failures.push(`${value}: reads as ${read}`)
					}
				} catch (e) {
					failures.push(`${value}: ${message(e)}`)
				}
			}

			row.roundTrip = `${values.length - failures.length}/${values.length}`
			if (failures.length > 0) {
				row.status = 'fail'
				row.detail = failures.slice(0, 3).join('; ')
			} else if (snapped > 0) {
				row.detail = `${snapped} moved to the nearest stop`
			}

			await withTimeout(camera.set(name, desc.value as never), 5000, name)
			await sleep(settleMs)
		} catch (e) {
			configs.rows.push({name, status: 'fail', detail: message(e)})
		}
	}

	// A config can move when another changes (exposure mode, for one), so only
	// now is it clear whether everything is as it was.
	for (const [name, original] of originals) {
		try {
			if ((await camera.get(name)) === original) continue
			await camera.set(name, original as never)
			if ((await camera.get(name)) === original) continue
		} catch {
			// Reported below
		}
		const row = configs.rows.find(r => r.name === name)!
		row.status = 'fail'
		row.detail = `Could not be restored to ${original}`
	}

	const actions = addSection('actions', 'Actions')

	const runAction = async (
		name: string,
		enabled: boolean,
		supported: boolean,
		ms: number,
		perform: () => Promise<string | void>
	) => {
		if (!enabled || !supported) {
			actions.rows.push({
				name,
				status: 'skip',
				detail: supported ? 'not selected' : 'unsupported',
			})
			return
		}
		try {
			const detail = await withTimeout(perform(), ms, name)
			actions.rows.push({name, status: 'ok', detail: detail ?? undefined})
		} catch (e) {
			actions.rows.push({name, status: 'fail', detail: message(e)})
		}
	}

	const expectOk = (result: {status: string; message?: string}) => {
		if (result.status !== 'ok') {
			throw new Error(result.message ?? result.status)
		}
	}

	await runAction(
		'liveview',
		options.liveview,
		can.canStartLiveview,
		10_000,
		async () => {
			const result = await camera.startLiveview()
			expectOk(result)
			onLiveview?.(result.value!)
			await sleep(1500)
			expectOk(await camera.stopLiveview())
			onLiveview?.(null)
		}
	)

	await runAction(
		'autoFocus',
		options.autoFocus,
		can.canRunAutoFocus,
		10_000,
		async () => {
			expectOk(await camera.runAutoFocus())
			// Reports done before the lens has settled
			await sleep(1000)
		}
	)

	await runAction(
		'manualFocus',
		options.manualFocus,
		can.canRunManualFocus,
		10_000,
		async () => {
			const steps = (await camera.get('manualFocusOptions')) ?? []
			if (steps.length === 0) throw new Error('Offers no steps')

			// Some bodies only take these in MF
			const focusMode = await camera.getDesc('focusMode')
			const switchToManual = focusMode.writable && focusMode.value === 'af'
			if (switchToManual) {
				expectOk(await camera.set('focusMode', 'mf'))
				await sleep(settleMs)
			}

			// There and back, so the point of focus stays about where it was
			const [near, far] = [
				steps.find(s => s.startsWith('near')),
				steps.find(s => s.startsWith('far')),
			]
			if (near) expectOk(await camera.runManualFocus(near))
			await sleep(300)
			if (far) expectOk(await camera.runManualFocus(far))

			if (switchToManual) {
				await sleep(settleMs)
				expectOk(await camera.set('focusMode', 'af'))
			}
		}
	)

	await runAction('takePhoto', options.shutter, can.canTakePhoto, 60_000, async () => {
		const result = await camera.takePhoto()
		expectOk(result)

		const files = result.value ?? []
		const image = files.find(o => o.format !== 'raw') ?? files[0]
		if (image?.blob) onPhoto?.(image.blob)
		return files.map(o => o.format).join(', ')
	})

	const storage = addSection('storage', 'Storage')

	try {
		const storages = await withTimeout(camera.getStorages(), 8000, 'getStorages')
		storage.rows.push({
			name: 'getStorages',
			status: 'ok',
			detail: `${storages.length} storage(s)`,
		})
	} catch (e) {
		storage.rows.push({name: 'getStorages', status: 'fail', detail: message(e)})
	}

	if (options.listObjects) {
		try {
			const objects = await withTimeout(camera.getObjects({}), 60_000, 'getObjects')
			storage.rows.push({
				name: 'getObjects',
				status: 'ok',
				detail: `${objects.length} object(s)`,
			})
		} catch (e) {
			storage.rows.push({name: 'getObjects', status: 'fail', detail: message(e)})
		}
	} else {
		storage.rows.push({
			name: 'getObjects',
			status: 'skip',
			detail: 'not selected',
		})
	}
}
