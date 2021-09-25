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

			<video
				class="view lv"
				id="liveview"
				:srcObject.prop="liveviewMediaStream"
				autoplay
			/>

			<img class="view picture" id="imageViewer" :src="lastPictureURL" />
		</main>

		<aside>
			<h1>Tethr</h1>

			<h2>Device Configs</h2>
			<dl>
				<template v-for="(config, name) in configs" :key="name">
					<TethrConfig :label="name" :config="config" />
				</template>
			</dl>

			<h2>Device Info</h2>
			<pre>{{ deviceInfo }}</pre>
		</aside>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref, watch} from 'vue'
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
