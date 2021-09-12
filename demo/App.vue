<template>
	<div>
		<h1>Tethr</h1>

		<button @click="toggleCameraConnection">
			{{ connected ? 'Disconnect' : 'Connect' }}
		</button>
		<button @click="runAutoFocus">AF-S</button>
		<button @click="takePicture">Take Picture</button>
		<button @click="toggleLiveview">
			{{ liveviewing ? 'Stop LV' : 'Start LV' }}
		</button>

		<br />

		<img
			id="liveview"
			style="width: 25%; background: whiteSmoke"
			:src="liveviewURL"
		/>

		<img
			id="imageViewer"
			style="width: 25%; background: gray"
			:src="lastPictureURL"
		/>

		<h2>Device Props</h2>
		<dl>
			<template v-for="(dp, name) in deviceProps" :key="name">
				<TethrProp :label="name" :prop="dp" />
			</template>
		</dl>

		<h2>Device Info</h2>
		<div>{{ deviceInfo }}</div>
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
