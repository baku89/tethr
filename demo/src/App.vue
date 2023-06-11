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
			<button @click="toggleCameraConnection">
				{{ camera ? 'Disconnect' : 'Connect' }}
			</button>

			<h2>Actions</h2>
			<dl v-if="camera">
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
					<dd><button @click="runAutoFocus">Run</button></dd>
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
				<TethrConfig
					v-for="(config, name) in configs"
					:key="name"
					:label="name"
					:config="config"
				/>
			</dl>
		</aside>
	</div>
</template>

<script lang="ts">
import {saveAs} from 'file-saver'
import {TethrObject} from 'tethr'
import {defineComponent, ref} from 'vue'

import TethrConfig from './TethrConfig.vue'
import {useTethr} from './useTethr'

export default defineComponent({
	components: {
		TethrConfig,
	},
	setup() {
		const folderHandler = ref<FileSystemDirectoryHandle | null>(null)

		const setupSaveFolder = async () => {
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

		const onSave = async (object: TethrObject) => {
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

		return {
			setupSaveFolder,
			folderHandler,
			...useTethr(onSave),
		}
	},
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
	overflow-y scroll
	border-left 2px solid #2b2b2b

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
	row-gap 1em
	grid-template-columns 13rem 1fr

	&:deep(dt)
		height 2em
		line-height 2em

	&:deep(dd)
		display flex
		gap 0.2em

	&:deep(input),
	&:deep(select),
	&:deep(button)
		display block
		width 100%
		text-align center
</style>
