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
			<TethrProp label="Exposure Mode" :prop="exposureMode" />
			<TethrProp label="Aperture" :prop="aperture" />
			<TethrProp label="Shutter Speed" :prop="shutterSpeed" />
			<TethrProp label="ISO" :prop="iso" />
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
