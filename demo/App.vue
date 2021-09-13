<template>
	<div class="app">
		<main>
			<button @click="toggleCameraConnection">
				{{ connected ? 'Disconnect' : 'Connect' }}
			</button>
			<button @click="runAutoFocus">AF-S</button>
			<button @click="takePicture">Take Picture</button>
			<button @click="toggleLiveview">
				{{ liveviewing ? 'Stop LV' : 'Start LV' }}
			</button>

			<br />

			<img class="view lv" id="liveview" :src="liveviewURL" />

			<img class="view picture" id="imageViewer" :src="lastPictureURL" />
		</main>

		<aside>
			<h1>Tethr</h1>

			<h2>Device Props</h2>
			<dl>
				<template v-for="(dp, name) in deviceProps" :key="name">
					<TethrProp :label="name" :prop="dp" />
				</template>
			</dl>

			<h2>Device Info</h2>
			<pre>{{ deviceInfo }}</pre>
		</aside>
	</div>
</template>

<script lang="ts">
import {defineComponent} from 'vue'
import {useTethr} from './useTethr'
import TethrProp from './TethrProp.vue'

export default defineComponent({
	components: {
		TethrProp,
	},
	setup() {
		return useTethr()
	},
})
</script>
