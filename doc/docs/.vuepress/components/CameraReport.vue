<script lang="ts" setup>
import {useTethr} from '@tethr/vue3'
import {saveAs} from 'file-saver'
import {ConfigNameList} from 'tethr'
import * as Tq from 'tweeq'
import {computed, reactive, ref, shallowRef, watch} from 'vue'

type Status = 'ok' | 'fail' | 'skip' | 'pending'

interface Row {
	label: string
	status: Status
	detail?: string
}

interface Section {
	title: string
	rows: Row[]
}

const CAPABILITY_FLAGS = [
	'canTakePhoto',
	'canStartLiveview',
	'canRunAutoFocus',
	'canRunManualFocus',
] as const

const {camera, pairedCameras, requestCamera, isConnecting} = useTethr()

const running = ref(false)
const sections = reactive<Section[]>([])
const liveviewStream = shallowRef<MediaStream | null>(null)
const photoURL = ref<string | null>(null)

const summary = computed(() => {
	let ok = 0,
		fail = 0,
		skip = 0
	for (const s of sections) {
		for (const r of s.rows) {
			if (r.status === 'ok') ok++
			else if (r.status === 'fail') fail++
			else if (r.status === 'skip') skip++
		}
	}
	return {ok, fail, skip, total: ok + fail + skip}
})

function statusIcon(status: Status) {
	switch (status) {
		case 'ok':
			return 'mdi:check-circle'
		case 'fail':
			return 'mdi:close-circle'
		case 'skip':
			return 'mdi:minus-circle'
		default:
			return 'mdi:dots-horizontal-circle'
	}
}

function errMessage(e: unknown) {
	return e instanceof Error ? e.message : String(e)
}

// Auto-run a full sweep whenever a camera is (re)connected.
watch(camera, cam => {
	if (cam) runReport()
	else {
		sections.splice(0)
		liveviewStream.value = null
		photoURL.value = null
	}
})

async function runReport() {
	const cam = camera.value
	if (!cam || running.value) return

	running.value = true
	sections.splice(0)
	liveviewStream.value = null
	photoURL.value = null

	try {
		// 1. Identity
		const identity: Section = {title: 'Identity', rows: []}
		sections.push(identity)
		identity.rows.push({label: 'type', status: 'ok', detail: cam.type})
		identity.rows.push({label: 'name', status: 'ok', detail: cam.name})
		identity.rows.push({
			label: 'identifier',
			status: 'ok',
			detail: JSON.stringify(cam.identifier),
		})

		// 2. Capability flags
		const caps: Section = {title: 'Capabilities', rows: []}
		sections.push(caps)
		for (const flag of CAPABILITY_FLAGS) {
			try {
				const desc = await cam.getDesc(flag)
				caps.rows.push({
					label: flag,
					status: desc.value ? 'ok' : 'skip',
					detail: String(desc.value),
				})
			} catch (e) {
				caps.rows.push({label: flag, status: 'fail', detail: errMessage(e)})
			}
		}

		// 3. All configurable props (gettable / writable / options)
		const props: Section = {title: 'Properties', rows: []}
		sections.push(props)
		const flagSet = new Set<string>(CAPABILITY_FLAGS)
		for (const name of ConfigNameList) {
			if (flagSet.has(name)) continue
			try {
				const desc = await cam.getDesc(name)
				const gettable = desc.value !== null && desc.value !== undefined
				const bits: string[] = []
				bits.push(desc.writable ? 'writable' : 'read-only')
				if (desc.option?.type === 'enum') {
					bits.push(`enum(${desc.option.values.length})`)
				} else if (desc.option?.type === 'range') {
					bits.push(
						`range ${desc.option.min}–${desc.option.max} / ${desc.option.step}`
					)
				}
				if (gettable) bits.push(`= ${formatValue(desc.value)}`)
				props.rows.push({
					label: name,
					status: gettable ? 'ok' : 'skip',
					detail: bits.join(' · '),
				})
			} catch (e) {
				props.rows.push({label: name, status: 'fail', detail: errMessage(e)})
			}
		}

		// 4. Actions (Liveview / AutoFocus / takePhoto)
		const actions: Section = {title: 'Actions', rows: []}
		sections.push(actions)

		// Liveview
		try {
			const r = await cam.startLiveview()
			if (r.status === 'ok' && r.value) {
				liveviewStream.value = r.value
				actions.rows.push({
					label: 'startLiveview',
					status: 'ok',
					detail: 'MediaStream received',
				})
				await sleep(1200)
				await cam.stopLiveview()
			} else {
				actions.rows.push({
					label: 'startLiveview',
					status: 'skip',
					detail: r.status,
				})
			}
		} catch (e) {
			actions.rows.push({
				label: 'startLiveview',
				status: 'fail',
				detail: errMessage(e),
			})
		}

		// AutoFocus
		try {
			const canAF = (await cam.getDesc('canRunAutoFocus')).value
			if (canAF) {
				const r = await cam.runAutoFocus()
				actions.rows.push({
					label: 'runAutoFocus',
					status: r.status === 'ok' ? 'ok' : 'fail',
					detail: r.status,
				})
			} else {
				actions.rows.push({
					label: 'runAutoFocus',
					status: 'skip',
					detail: 'unsupported',
				})
			}
		} catch (e) {
			actions.rows.push({
				label: 'runAutoFocus',
				status: 'fail',
				detail: errMessage(e),
			})
		}

		// takePhoto — fires the physical shutter
		try {
			const canShoot = (await cam.getDesc('canTakePhoto')).value
			if (canShoot) {
				const r = await cam.takePhoto()
				if (r.status === 'ok' && r.value) {
					const preview = r.value.find(o => o.format !== 'raw') ?? r.value[0]
					if (preview?.blob) photoURL.value = URL.createObjectURL(preview.blob)
					actions.rows.push({
						label: 'takePhoto',
						status: 'ok',
						detail: r.value.map(o => o.format).join(', '),
					})
				} else {
					actions.rows.push({
						label: 'takePhoto',
						status: 'fail',
						detail: r.status,
					})
				}
			} else {
				actions.rows.push({
					label: 'takePhoto',
					status: 'skip',
					detail: 'unsupported',
				})
			}
		} catch (e) {
			actions.rows.push({
				label: 'takePhoto',
				status: 'fail',
				detail: errMessage(e),
			})
		}

		// 5. Object Store
		const store: Section = {title: 'Object Store', rows: []}
		sections.push(store)
		try {
			const storages = await cam.getStorages()
			store.rows.push({
				label: 'getStorages',
				status: 'ok',
				detail: `${storages.length} storage(s)`,
			})
		} catch (e) {
			store.rows.push({
				label: 'getStorages',
				status: 'fail',
				detail: errMessage(e),
			})
		}
		try {
			const objects = await cam.getObjects({})
			store.rows.push({
				label: 'getObjects',
				status: 'ok',
				detail: `${objects.length} object(s)`,
			})
		} catch (e) {
			store.rows.push({
				label: 'getObjects',
				status: 'fail',
				detail: errMessage(e),
			})
		}
	} finally {
		running.value = false
	}
}

function formatValue(v: unknown) {
	if (typeof v === 'object') return JSON.stringify(v)
	const s = String(v)
	return s.length > 40 ? s.slice(0, 40) + '…' : s
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function exportJSON() {
	const report = {
		generatedAt: new Date().toISOString(),
		camera: camera.value
			? {
					type: camera.value.type,
					name: camera.value.name,
					identifier: camera.value.identifier,
				}
			: null,
		summary: summary.value,
		sections,
	}
	const blob = new Blob([JSON.stringify(report, null, 2)], {
		type: 'application/json',
	})
	const stamp = new Date().toISOString().replace(/[:.]/g, '-')
	saveAs(blob, `tethr-report-${stamp}.json`)
}
</script>

<template>
	<Tq.Viewport class="CameraReport">
		<div class="toolbar">
			<Tq.InputButton
				label="Connect USB"
				icon="mdi:usb"
				:disabled="isConnecting || running"
				@click="requestCamera('ptpusb')"
			/>
			<Tq.InputButton
				label="Connect Webcam"
				icon="mdi:webcam"
				:disabled="isConnecting || running"
				@click="requestCamera('webcam')"
			/>
			<Tq.InputButton
				v-if="camera"
				label="Re-run"
				icon="mdi:refresh"
				:disabled="running"
				@click="runReport"
			/>
			<Tq.InputButton
				v-if="sections.length"
				label="Export JSON"
				icon="mdi:download"
				:disabled="running"
				@click="exportJSON"
			/>
		</div>

		<ul v-if="pairedCameras.length" class="paired">
			<li v-for="(cam, i) in pairedCameras" :key="i">{{ cam.name }}</li>
		</ul>

		<p v-if="!camera && !isConnecting" class="hint">
			Connect a camera to generate a capability report. The sweep runs
			automatically and <strong>fires the physical shutter</strong> when the
			camera supports <code>takePhoto</code>.
		</p>

		<p v-if="isConnecting" class="hint">Connecting…</p>
		<p v-if="running" class="hint">Running capability sweep…</p>

		<div v-if="summary.total" class="summary">
			<Tq.IconIndicator inline icon="mdi:check-circle" />
			<span>{{ summary.ok }} pass</span>
			<Tq.IconIndicator inline icon="mdi:close-circle" />
			<span>{{ summary.fail }} fail</span>
			<Tq.IconIndicator inline icon="mdi:minus-circle" />
			<span>{{ summary.skip }} skip</span>
		</div>

		<div v-if="liveviewStream || photoURL" class="previews">
			<video
				v-if="liveviewStream"
				class="preview"
				:srcObject.prop="liveviewStream"
				autoplay
				muted
				playsinline
			/>
			<img v-if="photoURL" class="preview" :src="photoURL" />
		</div>

		<section v-for="section in sections" :key="section.title" class="section">
			<h3>{{ section.title }}</h3>
			<Tq.ParameterGrid>
				<Tq.Parameter
					v-for="row in section.rows"
					:key="row.label"
					:label="row.label"
				>
					<div class="row" :class="row.status">
						<Tq.IconIndicator inline :icon="statusIcon(row.status)" />
						<span class="detail">{{ row.detail }}</span>
					</div>
				</Tq.Parameter>
			</Tq.ParameterGrid>
		</section>
	</Tq.Viewport>
</template>

<style lang="stylus" scoped>
.CameraReport
	display block
	padding 1rem
	border-radius 0.5rem
	border 1px solid var(--tq-color-border)

.toolbar
	display flex
	flex-wrap wrap
	gap 0.5rem

.paired
	margin 0.5rem 0
	padding-left 1rem
	opacity 0.7
	font-size 0.85em

.hint
	margin 1rem 0
	opacity 0.8

.summary
	display flex
	align-items center
	gap 0.4rem
	margin 1rem 0
	font-variant-numeric tabular-nums

.previews
	display flex
	flex-wrap wrap
	gap 0.5rem
	margin 1rem 0

.preview
	width 100%
	max-width 22rem
	border-radius 0.5rem
	background #000
	aspect-ratio 3 / 2
	object-fit contain

.section
	margin-top 1.5rem

	h3
		margin-bottom 0.5rem

.row
	display flex
	align-items center
	gap 0.4rem
	min-width 0

	.detail
		overflow hidden
		text-overflow ellipsis
		white-space nowrap
		opacity 0.85
		font-size 0.85em

	&.fail .detail
		color var(--tq-color-error, #e5484d)
		opacity 1
</style>
