<template>
	<div class="app">
		<main>
			<h1>Tethr Demo</h1>
			<a href="https://github.com/baku89/tethr">Fork Me on GitHub</a>
			<video
				class="view"
				:srcObject.prop="liveviewMediaStream"
				autoplay
				muted
				playsinline
			/>
			<img class="view" :src="photoURL" />
		</main>

		<aside>
			<dl>
				<dt>Connect to</dt>
				<dd class="connect-to">
					<button class="connect-button" @click="requestCameras('usbptp')">
						USB
					</button>
					<button class="connect-button" @click="requestCameras('webcam')">
						Webcam
					</button>
				</dd>
			</dl>
			<ul class="webcam-list">
				<li v-for="(cam, i) in pairedCameras" :key="i">
					<button @click="onClickPairedCamera(cam)">
						[{{ cam.type }}] {{ cam.name }}
					</button>
				</li>
			</ul>

			<template v-if="camera">
				<h2>Actions</h2>
				<dl>
					<template v-if="configs.canTakePhoto.value">
						<dt>saveFolder</dt>
						<dd>
							<button @click="setupSaveFolder">
								{{ folderHandler ? folderHandler.name : '(None)' }}
							</button>
						</dd>
						<dt>takePhoto</dt>
						<dd><button class="red" @click="takePhoto">Shutter</button></dd>
					</template>
					<template v-if="configs.canRunAutoFocus.value">
						<dt>autoFocus</dt>
						<dd><button @click="camera.runAutoFocus">Run</button></dd>
					</template>
					<template v-if="configs.canRunManualFocus.value">
						<dt>manualFocus</dt>
						<dd
							style="
								display: grid;
								grid-template-rows: 1fr 1fr;
								grid-auto-flow: column;
							"
						>
							<button
								v-if="configs.manualFocusOptions.value?.includes('far:1')"
								@click="camera.runManualFocus('far:1')"
							>
								↑
							</button>
							<button
								v-if="configs.manualFocusOptions.value?.includes('near:1')"
								@click="camera.runManualFocus('near:1')"
							>
								↓
							</button>
							<button
								v-if="configs.manualFocusOptions.value?.includes('far:2')"
								@click="camera.runManualFocus('far:2')"
							>
								↑↑
							</button>
							<button
								v-if="configs.manualFocusOptions.value?.includes('near:2')"
								@click="camera.runManualFocus('near:2')"
							>
								↓↓
							</button>
							<button
								v-if="configs.manualFocusOptions.value?.includes('far:3')"
								@click="camera.runManualFocus('far:3')"
							>
								↑↑↑
							</button>
							<button
								v-if="configs.manualFocusOptions.value?.includes('near:3')"
								@click="camera.runManualFocus('near:3')"
							>
								↓↓↓
							</button>
						</dd>
					</template>
					<template v-if="configs.canStartLiveview.value">
						<dt>liveview</dt>
						<dd>
							<button @click="toggleLiveview">
								{{ configs.liveviewEnabled.value ? 'Stop' : 'Start' }}
							</button>
						</dd>
					</template>
				</dl>

				<h2>Configs</h2>
				<dl>
					<template v-for="(config, name) in configs">
						<TethrConfig
							v-if="config.value !== null"
							:key="name"
							:label="name"
							:config="config"
						/>
					</template>
				</dl>
			</template>
		</aside>
	</div>
</template>

<script lang="ts" setup>
import {useTethr} from '@tethr/vue3'
import {saveAs} from 'file-saver'
import {Tethr, TethrObject} from 'tethr'
import {ref, watchEffect} from 'vue'

import TethrConfig from './TethrConfig.vue'

const folderHandler = ref<FileSystemDirectoryHandle | null>(null)

async function setupSaveFolder() {
	const handler = await window.showDirectoryPicker({
		id: 'saveFile',
	})

	const option: FileSystemHandlePermissionDescriptor = {
		mode: 'readwrite',
	}

	const permission = await handler.queryPermission(option)

	if (permission !== 'granted') {
		await handler.requestPermission(option)
	}

	folderHandler.value = handler
}

async function onSave(object: TethrObject) {
	if (folderHandler.value) {
		// Use File System Access API
		const h = await folderHandler.value.getFileHandle(object.filename, {
			create: true,
		})
		const w = await h.createWritable()
		await w.write(object.blob)
		await w.close()
	} else {
		// Just download to the default directory
		saveAs(object.blob, object.filename)
	}
}

const {
	pairedCameras,
	camera,
	openCamera,
	closeCamera,
	requestCameras,
	configs,
	liveviewMediaStream,
	photoURL,
	toggleLiveview,
} = useTethr()

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
	if (cam.opened) {
		closeCamera(cam)
	} else {
		openCamera(cam)
	}
}

watchEffect(() => {
	;(window as any).cam = camera.value
})
</script>

<style lang="stylus" scoped>
.app
	display grid
	height 100vh
	grid-template-columns 1fr 30rem

	@media (max-width 700px)
		display block

	& > *
		padding 1em

aside
	display grid
	overflow-y scroll
	border-left 2px solid #2b2b2b
	grid-template-columns min-content 1fr
	grid-template-rows repeat(10000, min-content)

.connect-button, h2, dl
	grid-column 1 / 3

h2
	margin 2em 0 0.5em

.view
	display block
	margin-top 0.5em
	width 100%
	border-radius 0.5em
	background-color #2b2b2b
	aspect-ratio 16 / 9
	object-fit contain

dl
	display grid
	column-gap 0.5em
	row-gap 1rem
	grid-template-columns subgrid

	&:deep(dt)
		height 2em
		line-height 2em
		white-space nowrap

	&:deep(dd)
		display flex
		gap 0.2em

	&:deep(input),
	&:deep(select),
	&:deep(button)
		display block
		width 100%
		text-align center

.connect-to
	display: flex
	gap: 1em
	margin-bottom 1em

.webcam-list
	grid-column: 1 / span 2

	li
		margin-bottom 0.2em

	button
		width 100%
</style>
../../integrations/vue3/useTethr
