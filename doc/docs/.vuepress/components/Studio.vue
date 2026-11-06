<script lang="ts" setup>
import {useTethr} from '@tethr/vue3'
import {saveAs} from 'file-saver'
import {TethrObject} from 'tethr'
import * as Tq from 'tweeq'
import {useActionsStore} from 'tweeq/stores/actions'
import {computed, onBeforeUnmount, ref, shallowRef} from 'vue'
import {withBase} from 'vuepress/client'

import {
	CameraConfigNames,
	CameraConfigs,
	ManualFocusSteps,
} from './cameraConfigs'
import TethrConfig from './playground/TethrConfig.vue'

interface Shot {
	id: number
	url: string
	filename: string
}

const {
	camera,
	close,
	configs,
	isConnecting,
	open,
	pairedCameras,
	requestCamera,
	toggleLiveview,
} = useTethr()

const shots = ref<Shot[]>([])
const selected = ref<Shot | null>(null)
const onionskin = ref(0)
const isShooting = ref(false)
const error = ref<string | null>(null)
const folder = shallowRef<FileSystemDirectoryHandle | null>(null)
// The content of a PaneZUI is zoomed as a whole, and has no size of its own
const previewSize = ref<readonly number[]>([0, 0])

const lastShot = computed(() => shots.value.at(-1) ?? null)

const visibleConfigs = computed(() =>
	CameraConfigNames.filter(name => {
		const config = (configs as any)[name]
		return config && (config.writable || config.value !== null)
	})
)

const focusSteps = computed(() => {
	const offered = (configs.manualFocusOptions.value as string[] | null) ?? []
	return ManualFocusSteps.filter(step => offered.includes(step.option))
})

async function save(object: TethrObject) {
	if (!folder.value) {
		saveAs(object.blob, object.filename)
		return
	}
	const handle = await folder.value.getFileHandle(object.filename, {
		create: true,
	})
	const writable = await handle.createWritable()
	await writable.write(object.blob)
	await writable.close()
}

async function shoot() {
	if (!camera.value || isShooting.value) return

	isShooting.value = true
	error.value = null
	try {
		const result = await camera.value.takePhoto()
		if (result.status !== 'ok') {
			error.value = result.message ?? `Could not shoot: ${result.status}`
			return
		}
		const files = result.value ?? []
		await Promise.all(files.map(save))

		const image = files.find(o => o.format !== 'raw')
		if (image) {
			shots.value.push({
				id: Date.now(),
				url: URL.createObjectURL(image.blob),
				filename: image.filename,
			})
			selected.value = null
		}
	} catch (e) {
		error.value = e instanceof Error ? e.message : String(e)
	} finally {
		isShooting.value = false
	}
}

async function chooseFolder() {
	folder.value = await window.showDirectoryPicker({
		id: 'tethr-studio',
		mode: 'readwrite',
	})
}

function toggleOnionskin() {
	onionskin.value = onionskin.value > 0 ? 0 : 0.5
}

const actions = useActionsStore()
actions.register([
	{
		id: 'studio',
		label: 'Studio',
		icon: 'mdi:camera',
		children: [
			{
				id: 'shoot',
				label: 'Shoot',
				icon: 'mdi:camera-iris',
				bind: 'enter',
				perform: shoot,
			},
			{
				id: 'toggle_liveview',
				label: 'Toggle Liveview',
				icon: 'mdi:video',
				bind: 'l',
				perform: () => toggleLiveview(),
			},
			{
				id: 'run_autofocus',
				label: 'Run Autofocus',
				icon: 'mdi:focus-auto',
				bind: 'f',
				perform: () => camera.value?.runAutoFocus(),
			},
			{
				id: 'toggle_onionskin',
				label: 'Toggle Onion Skin',
				icon: 'mdi:layers',
				bind: 'o',
				perform: toggleOnionskin,
			},
			{
				id: 'back_to_live',
				label: 'Back to Live',
				icon: 'mdi:video-outline',
				bind: 'esc',
				perform: () => (selected.value = null),
			},
		],
	},
])

onBeforeUnmount(() => {
	for (const {url} of shots.value) URL.revokeObjectURL(url)
})
</script>

<template>
	<Tq.App class="Studio">
		<template #title>
			<Tq.TitleBar name="Tethr Studio" :icon="withBase('/logo.svg')">
				<template #left>
					<Tq.InputGroup>
						<Tq.InputButton
							icon="mdi:usb"
							label="USB"
							subtle
							:disabled="isConnecting"
							@click="requestCamera('ptpusb')"
						/>
						<Tq.InputButton
							icon="mdi:webcam"
							label="Webcam"
							subtle
							:disabled="isConnecting"
							@click="requestCamera('webcam')"
						/>
					</Tq.InputGroup>
					<Tq.InputButton
						v-for="(cam, i) in pairedCameras"
						:key="i"
						:label="cam.name"
						:icon="cam.opened ? 'mdi:link' : 'mdi:link-off'"
						subtle
						@click="cam.opened ? close() : open(cam)"
					/>
				</template>
				<template #center>
					<Tq.InputButton
						label="Shoot"
						icon="mdi:camera-iris"
						:disabled="!configs.canTakePhoto.value || isShooting"
						@click="shoot"
					/>
					<Tq.InputButton
						:label="configs.liveview.value ? 'Stop' : 'Live'"
						:icon="configs.liveview.value ? 'mdi:stop' : 'mdi:video'"
						subtle
						:disabled="!configs.canStartLiveview.value"
						@click="toggleLiveview"
					/>
				</template>
				<template #right>
					<a class="docs" :href="withBase('/')">Docs</a>
				</template>
			</Tq.TitleBar>
		</template>

		<template #default>
			<Tq.PaneSplit
				name="studio.vertical"
				direction="vertical"
				fixed="second"
				:size="132"
				:scroll="[false, false]"
			>
				<template #first>
					<Tq.PaneSplit
						name="studio.horizontal"
						direction="horizontal"
						fixed="second"
						:size="340"
						:scroll="[false, true]"
					>
						<template #first>
							<Tq.PaneZUI
								class="preview"
								@update:size="previewSize = $event"
							>
								<div
									class="frame"
									:style="{
										width: `${previewSize[0]}px`,
										height: `${previewSize[1]}px`,
									}"
								>
									<template v-if="selected">
										<img class="layer" :src="selected.url" />
									</template>
									<template v-else>
										<video
											v-if="configs.liveview.value"
											class="layer"
											:srcObject.prop="configs.liveview.value"
											autoplay
											muted
											playsinline
										/>
										<img
											v-else-if="lastShot"
											class="layer"
											:src="lastShot.url"
										/>
										<img
											v-if="lastShot && configs.liveview.value"
											class="layer"
											:src="lastShot.url"
											:style="{opacity: onionskin}"
										/>
									</template>
									<p
										v-if="!camera && !selected && !lastShot"
										class="placeholder"
									>
										Connect a camera from the title bar.
									</p>
								</div>
							</Tq.PaneZUI>
						</template>

						<template #second>
							<div class="controls">
								<p v-if="error" class="error">{{ error }}</p>

								<Tq.ParameterGroup name="studio.shoot" label="Shoot">
									<Tq.Parameter label="Onion" icon="mdi:layers">
										<Tq.InputNumber
											v-model="onionskin"
											:min="0"
											:max="1"
											:step="0.01"
										/>
									</Tq.Parameter>
									<Tq.Parameter label="Save" icon="mdi:folder">
										<Tq.InputButton
											:label="folder ? folder.name : 'Downloads'"
											icon="mdi:folder-open"
											subtle
											@click="chooseFolder"
										/>
									</Tq.Parameter>
									<Tq.Parameter
										v-if="configs.canRunAutoFocus.value"
										label="AF"
										icon="mdi:focus-auto"
									>
										<Tq.InputButton
											label="Run AF"
											subtle
											@click="camera?.runAutoFocus()"
										/>
									</Tq.Parameter>
									<Tq.Parameter
										v-if="focusSteps.length"
										label="MF"
										icon="mdi:focus-field"
									>
										<Tq.InputGroup>
											<Tq.InputButton
												v-for="step in focusSteps"
												:key="step.option"
												:icon="step.icon"
												subtle
												narrow
												@click="camera?.runManualFocus(step.option)"
											/>
										</Tq.InputGroup>
									</Tq.Parameter>
								</Tq.ParameterGroup>

								<Tq.ParameterGroup
									v-if="camera"
									name="studio.camera"
									label="Camera"
								>
									<Tq.Parameter
										v-for="name in visibleConfigs"
										:key="name"
										:label="CameraConfigs[name]!.label"
										:icon="CameraConfigs[name]!.icon"
										:hint="CameraConfigs[name]!.hint"
									>
										<TethrConfig
											:config="(configs as any)[name]"
											:name="name"
										/>
									</Tq.Parameter>
								</Tq.ParameterGroup>
							</div>
						</template>
					</Tq.PaneSplit>
				</template>

				<template #second>
					<div class="shots">
						<button
							class="shot live"
							:class="{active: !selected}"
							title="Back to live"
							@click="selected = null"
						>
							Live
						</button>
						<button
							v-for="(shot, i) in shots"
							:key="shot.id"
							class="shot"
							:class="{active: selected?.id === shot.id}"
							:title="shot.filename"
							@click="selected = shot"
						>
							<img :src="shot.url" />
							<span class="number">{{ i + 1 }}</span>
						</button>
					</div>
				</template>
			</Tq.PaneSplit>
		</template>
	</Tq.App>
</template>

<style lang="stylus" scoped>
.Studio
	z-index 100

.docs
	color var(--tq-color-text-mute)
	font-size 0.85em
	-webkit-app-region no-drag

.preview
	background #000

.frame
	position absolute
	top 0
	left 0

.layer
	position absolute
	inset 0
	width 100%
	height 100%
	object-fit contain

.placeholder
	position absolute
	inset 0
	display grid
	place-items center
	margin 0
	color #888

.controls
	padding var(--tq-gap-section, 12px)

.error
	margin 0 0 0.75rem
	color var(--tq-color-error, #e5484d)
	font-size 0.85em

.shots
	display flex
	gap 4px
	height 100%
	padding 8px
	overflow-x auto
	box-sizing border-box

.shot
	position relative
	flex 0 0 auto
	aspect-ratio 3 / 2
	height 100%
	padding 0
	border 2px solid transparent
	border-radius 4px
	background #000
	color #aaa
	cursor pointer
	overflow hidden

	&.active
		border-color var(--tq-color-accent)

	img
		display block
		width 100%
		height 100%
		object-fit cover

.number
	position absolute
	left 4px
	bottom 2px
	color #fff
	font-size 11px
	text-shadow 0 0 2px #000
</style>
