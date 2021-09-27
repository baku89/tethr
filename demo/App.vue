<template>
	<div class="app">
		<main>
			<button @click="toggleCameraConnection">
				{{ camera ? 'Disconnect' : 'Connect' }}
			</button>
			<button @click="runAutoFocus">AF-S</button>
			<button @click="takePicture">Take Picture</button>
			<button @click="toggleLiveview">
				{{ liveviewing ? 'Stop LV' : 'Start LV' }}
			</button>

			<br />

			<video class="view lv" :srcObject.prop="liveviewMediaStream" autoplay />

			<img class="view picture" :src="lastPictureURL" />
		</main>

		<aside>
			<h2>Device Configs</h2>
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
