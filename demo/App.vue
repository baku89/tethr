<template>
	<div class="app">
		<main>
			<video class="view lv" :srcObject.prop="liveviewMediaStream" autoplay />
			<img class="view picture" :src="lastPictureURL" />
		</main>

		<aside>
			<button @click="toggleCameraConnection">
				{{ camera ? 'Disconnect' : 'Connect' }}
			</button>

			<h2>Actions</h2>
			<dl v-if="camera">
				<template v-if="configs.canTakePicture.value">
					<dt>takePicture</dt>
					<dd><button class="red" @click="takePicture">Shutter</button></dd>
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
							v-if="configs.manualFocusOptions.value.includes('far:1')"
							@click="camera.runManualFocus('far:1')"
						>
							↑
						</button>
						<button
							v-if="configs.manualFocusOptions.value.includes('near:1')"
							@click="camera.runManualFocus('near:1')"
						>
							↓
						</button>
						<button
							v-if="configs.manualFocusOptions.value.includes('far:2')"
							@click="camera.runManualFocus('far:2')"
						>
							↑↑
						</button>
						<button
							v-if="configs.manualFocusOptions.value.includes('near:2')"
							@click="camera.runManualFocus('near:2')"
						>
							↓↓
						</button>
						<button
							v-if="configs.manualFocusOptions.value.includes('far:3')"
							@click="camera.runManualFocus('far:3')"
						>
							↑↑↑
						</button>
						<button
							v-if="configs.manualFocusOptions.value.includes('near:3')"
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
					template
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
import {defineComponent} from 'vue'
import {useTethr} from './useTethr'
import TethrConfig from './TethrConfig.vue'

export default defineComponent({
	components: {
		TethrConfig,
	},
	setup() {
		return useTethr()
	},
})
</script>
