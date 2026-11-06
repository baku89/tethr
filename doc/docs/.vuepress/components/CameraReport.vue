<script lang="ts" setup>
import {useTethr} from '@tethr/vue3'
import {saveAs} from 'file-saver'
import * as Tq from 'tweeq'
import {computed, reactive, ref, shallowRef, watch} from 'vue'

import corePackage from '../../../../core/package.json'
import {
	buildReport,
	createPullRequestLink,
	describeBrowser,
	describeCamera,
	PullRequestLink,
	Report,
	ReportCamera,
	toYaml,
} from './report/reportFile'
import ReportList from './report/ReportList.vue'
import {
	CheckOptions,
	CheckSection,
	CheckStatus,
	DefaultCheckOptions,
	runChecks,
} from './report/runChecks'

const {camera, requestCamera, isConnecting} = useTethr()

const options = reactive<CheckOptions>({...DefaultCheckOptions})
const notes = ref('')

const running = ref(false)
const crashed = ref<string | null>(null)
const sections = reactive<CheckSection[]>([])
const identity = ref<ReportCamera | null>(null)
const liveview = shallowRef<MediaStream | null>(null)
const photoUrl = ref<string | null>(null)
const copied = ref(false)

const StatusIcons: Record<CheckStatus, string> = {
	ok: 'mdi:check-circle',
	fail: 'mdi:close-circle',
	skip: 'mdi:minus-circle',
}

const OptionRows: {
	key: keyof CheckOptions
	label: string
	hint: string
}[] = [
	{
		key: 'writeConfigs',
		label: 'Settings',
		hint: 'Writes values and reads them back, then puts each one back.',
	},
	{key: 'liveview', label: 'Liveview', hint: 'Runs liveview for a moment.'},
	{key: 'autoFocus', label: 'Autofocus', hint: 'Moves the lens.'},
	{key: 'manualFocus', label: 'Manual focus', hint: 'Moves the lens a step.'},
	{
		key: 'shutter',
		label: 'Shutter',
		hint: 'Takes a picture, which stays on the card.',
	},
	{
		key: 'listObjects',
		label: 'Card contents',
		hint: 'Reads the info of every file. Slow on a full card.',
	},
]

function clear() {
	sections.splice(0)
	crashed.value = null
	liveview.value = null
	photoUrl.value = null
	copied.value = false
}

watch(camera, cam => {
	clear()
	identity.value = null
	if (cam) describeCamera(cam).then(found => (identity.value = found))
})

async function run() {
	const cam = camera.value
	if (!cam || running.value) return

	running.value = true
	clear()
	try {
		identity.value = await describeCamera(cam)
		await runChecks(cam, options, sections, {
			onLiveview: stream => (liveview.value = stream),
			onPhoto: image => (photoUrl.value = URL.createObjectURL(image)),
		})
	} catch (e) {
		crashed.value = e instanceof Error ? e.message : String(e)
	} finally {
		running.value = false
	}
}

const report = computed<Report | null>(() => {
	if (!identity.value || running.value || sections.length === 0) return null
	return buildReport(
		identity.value,
		{tethr: corePackage.version, ...describeBrowser(navigator.userAgent)},
		sections,
		{notes: notes.value}
	)
})

const link = computed<PullRequestLink | null>(
	() => report.value && createPullRequestLink(report.value)
)

function exportYaml() {
	if (!report.value || !link.value) return
	const blob = new Blob([toYaml(report.value)], {type: 'text/yaml'})
	saveAs(blob, link.value.filename)
}

async function openPullRequest() {
	if (!link.value) return
	// Must happen in the click, or the browser blocks the new tab
	const tab = window.open(link.value.url, '_blank', 'noopener')
	if (!link.value.inlined) {
		await navigator.clipboard.writeText(link.value.yaml)
		copied.value = true
	}
	void tab
}
</script>

<template>
	<Tq.Viewport class="CameraReport">
		<section class="connect">
			<Tq.InputGroup>
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
			</Tq.InputGroup>
			<span v-if="isConnecting" class="muted">Connecting…</span>
			<strong v-else-if="identity">
				{{ [identity.manufacturer, identity.model].filter(Boolean).join(' ') }}
				<span v-if="identity.firmware" class="muted">
					firmware {{ identity.firmware }}
				</span>
			</strong>
		</section>

		<section v-if="camera">
			<h3>What to check</h3>
			<Tq.ParameterGrid>
				<Tq.Parameter
					v-for="row in OptionRows"
					:key="row.key"
					:label="row.label"
				>
					<div class="option">
						<Tq.InputSwitch v-model="options[row.key]" :disabled="running" />
						<span class="muted">{{ row.hint }}</span>
					</div>
				</Tq.Parameter>
			</Tq.ParameterGrid>
			<div class="run">
				<Tq.InputButton
					:label="running ? 'Checking…' : 'Run Check'"
					icon="mdi:play"
					:disabled="running"
					@click="run"
				/>
			</div>
		</section>

		<p v-if="crashed" class="error">{{ crashed }}</p>

		<div v-if="liveview || photoUrl" class="previews">
			<video
				v-if="liveview"
				class="preview"
				:srcObject.prop="liveview"
				autoplay
				muted
				playsinline
			/>
			<img v-if="photoUrl" class="preview" :src="photoUrl" />
		</div>

		<section v-if="report" class="share">
			<div class="summary">
				<Tq.IconIndicator inline :icon="StatusIcons.ok" />
				<span>{{ report.summary.ok }} ok</span>
				<Tq.IconIndicator inline :icon="StatusIcons.fail" />
				<span>{{ report.summary.fail }} failed</span>
				<Tq.IconIndicator inline :icon="StatusIcons.skip" />
				<span>{{ report.summary.skip }} skipped</span>
			</div>

			<Tq.ParameterGrid>
				<Tq.Parameter label="Notes">
					<Tq.InputString
						v-model="notes"
						placeholder="Anything the check can't see: did the picture look right?"
					/>
				</Tq.Parameter>
			</Tq.ParameterGrid>

			<div class="run">
				<Tq.InputButton
					label="Create Pull Request"
					icon="mdi:source-pull"
					@click="openPullRequest"
				/>
				<Tq.InputButton
					label="Save YAML"
					icon="mdi:download"
					subtle
					@click="exportYaml"
				/>
			</div>

			<p class="muted">
				Opens GitHub with this report as
				<code>doc/reports/{{ link?.filename }}</code
				>. Nothing is sent until you commit it there. The report has the model
				and firmware, but no serial number, pictures or file names.
			</p>
			<p v-if="link && !link.inlined" class="muted">
				This report is too long to fit in a link, so it's copied instead: paste
				it into the page that opens.
				<strong v-if="copied">Copied.</strong>
			</p>
		</section>

		<section v-for="section in sections" :key="section.id">
			<h3>{{ section.title }}</h3>
			<Tq.ParameterGrid>
				<Tq.Parameter
					v-for="row in section.rows"
					:key="row.name"
					:label="row.name"
				>
					<div class="row" :class="row.status">
						<Tq.IconIndicator inline :icon="StatusIcons[row.status]" />
						<span v-if="row.access" class="fact">{{ row.access }}</span>
						<span v-if="row.options !== undefined" class="fact">
							{{ row.options }} values
						</span>
						<span v-if="row.roundTrip" class="fact">
							wrote {{ row.roundTrip }}
						</span>
						<span v-if="row.detail" class="detail" :title="row.detail">
							{{ row.detail }}
						</span>
					</div>
				</Tq.Parameter>
			</Tq.ParameterGrid>
		</section>

		<ReportList />
	</Tq.Viewport>
</template>

<style lang="stylus" scoped>
.CameraReport
	display block
	padding 1rem
	border-radius 0.5rem
	border 1px solid var(--tq-color-border)

section
	margin-top 1.5rem

	&:first-child
		margin-top 0

h3
	margin-bottom 0.5rem

.connect
	display flex
	flex-wrap wrap
	align-items center
	gap 1rem

.muted
	opacity 0.7
	font-size 0.85em
	font-weight normal

.option
	display flex
	align-items center
	gap 0.5rem
	min-width 0

.run
	display flex
	gap 0.5rem
	margin-top 0.75rem

.error
	color var(--tq-color-error, #e5484d)

.summary
	display flex
	align-items center
	gap 0.4rem
	margin-bottom 0.75rem
	font-variant-numeric tabular-nums

.previews
	display flex
	flex-wrap wrap
	gap 0.5rem
	margin-top 1rem

.preview
	width 100%
	max-width 22rem
	border-radius 0.5rem
	background #000
	aspect-ratio 3 / 2
	object-fit contain

.row
	display flex
	align-items center
	gap 0.5rem
	min-width 0
	font-size 0.85em

	.fact
		opacity 0.7
		white-space nowrap
		font-variant-numeric tabular-nums

	.detail
		overflow hidden
		text-overflow ellipsis
		white-space nowrap
		opacity 0.85

	&.fail .detail
		color var(--tq-color-error, #e5484d)
		opacity 1
</style>
