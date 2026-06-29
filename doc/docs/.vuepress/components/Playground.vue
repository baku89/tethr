<script lang="ts" setup>
import {useTethr} from '@tethr/vue3'
import {saveAs} from 'file-saver'
import {ConfigName, Tethr, TethrObject} from 'tethr'
import * as Tq from 'tweeq'
import {computed, ref, shallowRef} from 'vue'

import TethrConfig from './playground/TethrConfig.vue'

const {
	camera,
	open,
	close,
	pairedCameras,
	requestCamera,
	configs,
	toggleLiveview,
	isConnecting,
} = useTethr()

const folderHandler = shallowRef<FileSystemDirectoryHandle | null>(null)
const photoURL = ref<string | null>(null)

// A curated, ordered subset (mirrors koma's CameraControl) with labels + icons.
const configLabels: Partial<
	Record<ConfigName, {label: string; icon: string; hint?: string}>
> = {
	exposureMode: {
		label: 'Mode',
		icon: 'material-symbols:settings-photo-camera',
		hint: 'Exposure mode (P / A / S / M)',
	},
	exposureComp: {
		label: 'Exp.',
		icon: 'material-symbols:exposure',
		hint: 'Exposure compensation',
	},
	focalLength: {label: 'F.L.', icon: 'lucide:focus', hint: 'Focal length'},
	focusDistance: {
		label: 'F.D.',
		icon: 'tabler:frustum',
		hint: 'Focus distance',
	},
	aperture: {label: 'Apr.', icon: 'ph:aperture', hint: 'Aperture'},
	shutterSpeed: {
		label: 'SS',
		icon: 'material-symbols:shutter-speed',
		hint: 'Shutter speed',
	},
	whiteBalance: {label: 'WB', icon: 'subway:black-white', hint: 'White balance'},
	colorTemperature: {
		label: 'C.Temp.',
		icon: 'mdi:temperature',
		hint: 'Color temperature',
	},
	iso: {label: 'ISO', icon: 'carbon:iso', hint: 'ISO sensitivity'},
	imageQuality: {label: 'Quality', icon: 'mdi:image', hint: 'Image quality'},
	colorMode: {label: 'Color', icon: 'mdi:palette', hint: 'Color mode'},
	imageAspect: {
		label: 'Aspect',
		icon: 'mdi:aspect-ratio',
		hint: 'Image aspect ratio',
	},
	destinationToSave: {
		label: 'Save',
		icon: 'mdi:content-save',
		hint: 'Destination to save captures',
	},
	focusPeaking: {
		label: 'Peaking',
		icon: 'material-symbols:center-focus-strong',
		hint: 'Focus peaking',
	},
	liveviewMagnifyRatio: {
		label: 'LV Zoom',
		icon: 'material-symbols:zoom-in',
		hint: 'Live view magnification',
	},
}

const configNames = Object.keys(configLabels) as ConfigName[]

// Only show a row the camera can actually read or write.
const visibleConfigNames = computed(() =>
	configNames.filter(name => {
		const c = (configs as any)[name]
		return c && (c.writable || c.value !== null)
	})
)

const manualFocusSteps: {option: any; icon: string; label: string}[] = [
	{option: 'far:3', icon: 'mdi:chevron-triple-up', label: 'far ×3'},
	{option: 'far:2', icon: 'mdi:chevron-double-up', label: 'far ×2'},
	{option: 'far:1', icon: 'mdi:chevron-up', label: 'far ×1'},
	{option: 'near:1', icon: 'mdi:chevron-down', label: 'near ×1'},
	{option: 'near:2', icon: 'mdi:chevron-double-down', label: 'near ×2'},
	{option: 'near:3', icon: 'mdi:chevron-triple-down', label: 'near ×3'},
]
const manualFocusOptions = computed(
	() => (configs.manualFocusOptions.value as string[] | null) ?? []
)

async function setupSaveFolder() {
	const handler = await window.showDirectoryPicker({id: 'saveFile'})
	const option: FileSystemHandlePermissionDescriptor = {mode: 'readwrite'}
	if ((await handler.queryPermission(option)) !== 'granted') {
		await handler.requestPermission(option)
	}
	folderHandler.value = handler
}

async function onSave(object: TethrObject) {
	if (folderHandler.value) {
		const h = await folderHandler.value.getFileHandle(object.filename, {
			create: true,
		})
		const w = await h.createWritable()
		await w.write(object.blob)
		await w.close()
	} else {
		saveAs(object.blob, object.filename)
	}
}

async function takePhoto() {
	if (!camera.value) return
	const result = await camera.value.takePhoto()
	if (result.status === 'ok') {
		for (const object of result.value) {
			if (object.format !== 'raw') {
				photoURL.value = URL.createObjectURL(object.blob)
			}
			onSave(object)
		}
	}
}

async function onClickPairedCamera(cam: Tethr) {
	if (cam.opened) close()
	else open(cam)
}
</script>

<template>
	<Tq.Viewport class="Playground">
		<main class="view-pane">
			<video
				class="view"
				:srcObject.prop="configs.liveview.value"
				autoplay
				muted
				playsinline
			/>
			<img v-if="photoURL" class="view" :src="photoURL" />
		</main>

		<aside class="control-pane">
			<Tq.ParameterGrid>
				<Tq.Parameter label="Connect" icon="mdi:camera-plus">
					<Tq.InputGroup>
						<Tq.InputButton
							label="USB"
							icon="mdi:usb"
							:disabled="isConnecting"
							@click="requestCamera('ptpusb')"
						/>
						<Tq.InputButton
							label="Webcam"
							icon="mdi:webcam"
							:disabled="isConnecting"
							@click="requestCamera('webcam')"
						/>
					</Tq.InputGroup>
				</Tq.Parameter>

				<Tq.Parameter
					v-if="pairedCameras.length"
					label="Paired"
					icon="mdi:devices"
				>
					<Tq.InputGroup>
						<Tq.InputButton
							v-for="(cam, i) in pairedCameras"
							:key="i"
							:label="cam.name"
							:icon="cam.opened ? 'mdi:link-off' : 'mdi:link'"
							@click="onClickPairedCamera(cam)"
						/>
					</Tq.InputGroup>
				</Tq.Parameter>
			</Tq.ParameterGrid>

			<template v-if="camera">
				<Tq.ParameterGroup name="actions" label="Actions">
					<Tq.Parameter
						v-if="configs.canTakePhoto.value"
						label="Shutter"
						icon="mdi:camera-iris"
					>
						<Tq.InputButton
							label="Take Photo"
							icon="mdi:camera"
							@click="takePhoto"
						/>
					</Tq.Parameter>

					<Tq.Parameter
						v-if="configs.canTakePhoto.value"
						label="Save"
						icon="mdi:folder"
					>
						<Tq.InputButton
							:label="folderHandler ? folderHandler.name : 'Save to…'"
							icon="mdi:folder-open"
							subtle
							@click="setupSaveFolder"
						/>
					</Tq.Parameter>

					<Tq.Parameter
						v-if="configs.canStartLiveview.value"
						label="Liveview"
						icon="mdi:video"
					>
						<Tq.InputButton
							:label="configs.liveview.value ? 'Stop' : 'Start'"
							:icon="configs.liveview.value ? 'mdi:stop' : 'mdi:play'"
							@click="toggleLiveview"
						/>
					</Tq.Parameter>

					<Tq.Parameter
						v-if="configs.canRunAutoFocus.value"
						label="AF"
						icon="mdi:focus-auto"
					>
						<Tq.InputButton label="Run AF" @click="camera.runAutoFocus()" />
					</Tq.Parameter>

					<Tq.Parameter
						v-if="configs.canRunManualFocus.value"
						label="MF"
						icon="mdi:focus-field"
					>
						<Tq.InputGroup>
							<Tq.InputButton
								v-for="step in manualFocusSteps"
								v-show="manualFocusOptions.includes(step.option)"
								:key="step.option"
								:icon="step.icon"
								subtle
								narrow
								@click="camera.runManualFocus(step.option)"
							/>
						</Tq.InputGroup>
					</Tq.Parameter>
				</Tq.ParameterGroup>

				<Tq.ParameterGroup name="configs" label="Configs">
					<Tq.Parameter
						v-for="name in visibleConfigNames"
						:key="name"
						:label="configLabels[name]!.label"
						:icon="configLabels[name]!.icon"
						:hint="configLabels[name]!.hint"
					>
						<TethrConfig :config="(configs as any)[name]" :name="name" />
					</Tq.Parameter>
				</Tq.ParameterGroup>
			</template>
		</aside>
	</Tq.Viewport>
</template>

<style lang="stylus" scoped>
.Playground
	display grid
	gap 1.5rem
	grid-template-columns minmax(0, 1fr) minmax(28rem, 38rem)
	align-items start

	@media (max-width 900px)
		grid-template-columns 1fr

.view-pane
	background transparent

	// Keep the preview visible while scrolling the (often long) config list.
	@media (min-width 901px)
		position sticky
		top 1rem

.view
	display block
	width 100%
	margin-bottom 0.5rem
	border-radius 0.5rem
	background #000
	aspect-ratio 3 / 2
	object-fit contain

.control-pane
	min-width 0

	// Let the Tweeq inputs fill their cell instead of overflowing it.
	:deep(.TethrConfig)
		width 100%
		min-width 0
</style>
