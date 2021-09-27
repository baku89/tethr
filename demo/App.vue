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
				<dt>takePicture</dt>
				<dd><button class="red" @click="takePicture">Shutter</button></dd>
				<dt>liveview</dt>
				<dd>
					<button @click="toggleLiveview">
						{{ liveviewing ? 'Stop' : 'Start' }}
					</button>
				</dd>
				<dt>autoFocus</dt>
				<dd><button @click="runAutoFocus">Run</button></dd>
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
