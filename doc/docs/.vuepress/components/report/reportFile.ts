import {dump, load} from 'js-yaml'
import {Tethr} from 'tethr'

import {CheckRow, CheckSection, CheckStatus, SectionId} from './runChecks'

export const ReportRepo = 'baku89/tethr'
export const ReportDir = 'doc/reports'

/**
 * GitHub answers 500 for a new-file URL somewhere between 4,000 and 7,000
 * characters (and 414 from around 12,000).
 */
export const MaxUrlLength = 4000

export interface ReportCamera {
	type: string
	manufacturer?: string
	model?: string
	firmware?: string
	/** `vendor:product` */
	usb?: string
}

export interface ReportEnvironment {
	tethr: string
	browser: string
	os: string
}

interface ReportEntry {
	status?: CheckStatus
	detail?: string
	access?: 'r' | 'rw'
	options?: number
	roundTrip?: string
}

export interface Report {
	schema: 1
	date: string
	camera: ReportCamera
	environment: ReportEnvironment
	summary: {ok: number; fail: number; skip: number}
	sections: Partial<Record<SectionId, Record<string, ReportEntry>>>
	notes?: string
}

/** Reads what identifies the model. Deliberately nothing about the unit. */
export async function describeCamera(camera: Tethr): Promise<ReportCamera> {
	const out: ReportCamera = {type: camera.type}

	const read = async (name: 'manufacturer' | 'model') => {
		try {
			return (await camera.get(name)) ?? undefined
		} catch {
			return undefined
		}
	}
	out.manufacturer = await read('manufacturer')
	out.model = await read('model')

	// Not a config, and only USB cameras have it
	const withInfo = camera as unknown as {
		getDeviceInfo?: () => Promise<{deviceVersion: string}>
	}
	try {
		out.firmware = (await withInfo.getDeviceInfo?.())?.deviceVersion
	} catch {
		// Stays unknown
	}

	const {identifier} = camera
	if (identifier.type === 'ptpusb' && identifier.usb) {
		const hex = (id: number) => id.toString(16).padStart(4, '0')
		out.usb = `${hex(identifier.usb.vendorId)}:${hex(identifier.usb.productId)}`
	}

	return out
}

export function describeBrowser(userAgent: string): {browser: string; os: string} {
	const browser =
		// Others claim to be Chrome and Safari as well, so they come first
		[/(Edg|OPR|Electron)\/(\d+)/, /(Chrome|Firefox|Safari)\/(\d+)/]
			.map(pattern => userAgent.match(pattern))
			.find(Boolean) ?? []
	const os =
		userAgent.match(/Mac OS X|Windows|Android|CrOS|Linux/)?.[0] ?? 'unknown'

	return {
		browser: browser[1] ? `${browser[1]} ${browser[2]}` : 'unknown',
		os: os === 'Mac OS X' ? 'macOS' : os,
	}
}

function entryOf({status, detail, access, options, roundTrip}: CheckRow) {
	const entry: ReportEntry = {}
	// A config that reads and writes fine is the common case: leave it out
	if (status !== 'ok' || access === undefined) entry.status = status
	if (detail) entry.detail = detail.slice(0, 120)
	if (access) entry.access = access
	if (options !== undefined) entry.options = options
	if (roundTrip) entry.roundTrip = roundTrip
	return entry
}

function localDate(date: Date) {
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function buildReport(
	camera: ReportCamera,
	environment: ReportEnvironment,
	sections: CheckSection[],
	{notes, date = new Date()}: {notes?: string; date?: Date} = {}
): Report {
	const summary = {ok: 0, fail: 0, skip: 0}
	const out: Report['sections'] = {}

	for (const {id, rows} of sections) {
		const section: Record<string, ReportEntry> = {}
		for (const row of rows) {
			summary[row.status]++
			section[row.name] = entryOf(row)
		}
		out[id] = section
	}

	const report: Report = {
		schema: 1,
		date: localDate(date),
		camera,
		environment,
		summary,
		sections: out,
	}
	if (notes?.trim()) report.notes = notes.trim()

	return report
}

export function toYaml(report: Report) {
	return dump(report, {
		// One line per config: keeps the file short enough for a link
		flowLevel: 3,
		lineWidth: -1,
		noRefs: true,
		sortKeys: false,
		quotingType: '"',
	})
}

export function parseReport(yaml: string) {
	return load(yaml) as Report
}

export function cameraTitle({manufacturer, model, type}: ReportCamera) {
	return [manufacturer, model].filter(Boolean).join(' ') || type
}

export function reportFilename({camera, date}: Report) {
	const slug = (text: string) =>
		text
			.toLowerCase()
			.replace(/[^a-z0-9.]+/g, '-')
			.replace(/^-|-$/g, '')

	const firmware = camera.firmware ? `-fw${camera.firmware}` : ''
	return `${slug(cameraTitle(camera) + firmware)}-${date.replaceAll('-', '')}.yaml`
}

export function pullRequestDescription({camera, environment, summary}: Report) {
	return [
		`Checked ${cameraTitle(camera)} on the capability report page.`,
		'',
		`- Tethr ${environment.tethr}, ${environment.browser}, ${environment.os}`,
		`- ${summary.ok} ok, ${summary.fail} failed, ${summary.skip} skipped`,
	].join('\n')
}

export interface PullRequestLink {
	url: string
	filename: string
	yaml: string
	/**
	 * Whether the link carries the report. If it would be too long for GitHub, it
	 * doesn't, and the report has to be pasted into the page it opens.
	 */
	inlined: boolean
}

/**
 * A link to GitHub's new-file page with the report filled in. Committing there
 * offers a pull request, through a fork for anyone without write access.
 */
export function createPullRequestLink(
	report: Report,
	{maxLength = MaxUrlLength} = {}
): PullRequestLink {
	const filename = reportFilename(report)
	const yaml = toYaml(report)

	const url = (value?: string) => {
		const params = new URLSearchParams({
			filename: `${ReportDir}/${filename}`,
			message: `report: ${cameraTitle(report.camera)}`,
			description: pullRequestDescription(report),
		})
		if (value !== undefined) params.set('value', value)
		return `https://github.com/${ReportRepo}/new/main?${params}`
	}

	const full = url(yaml)
	return full.length <= maxLength
		? {url: full, filename, yaml, inlined: true}
		: {url: url(), filename, yaml, inlined: false}
}
