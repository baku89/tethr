<template>
	<div>
		<h1>Tethr</h1>

		<button @click="toggleCameraConnection">
			{{ connected ? 'Dionnect' : 'Connect' }}
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
			<dt>Exposure Mode</dt>
			<dd>
				<div v-for="mode in exposureModeDesc.range" :key="mode">
					<input type="radio" :id="mode" :value="mode" v-model="exposureMode" />
					<label :for="mode">{{ mode }}</label>
				</div>
			</dd>
			<dt>Aperture</dt>
			<dd>
				<select v-model="aperture">
					<option v-for="f in apertureDesc.range" :key="f" :value="f">
						{{ f.toString() }}
					</option>
				</select>
			</dd>
			<dt>ShutterSpeed</dt>
			<dd>
				<select v-model="shutterSpeed">
					<option v-for="f in shutterSpeedDesc.range" :key="f" :value="f">
						{{ f.toString() }}
					</option>
				</select>
			</dd>
			<dt>ISO</dt>
			<dd>
				<select v-model="iso">
					<option v-for="f in isoDesc.range" :key="f" :value="f">
						{{ f.toString() }}
					</option>
				</select>
			</dd>
		</dl>

		<h2>Device Info</h2>
		<div>{{ deviceInfo }}</div>
	</div>
</template>

<script lang="ts">
import {defineComponent} from 'vue'
import {useTethr} from './useTethr'

export default defineComponent({
	setup() {
		return useTethr()
	},
})
</script>
