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
			<dt>Exposure Mode</dt>
			<dd>
				<template v-if="exposureMode.writable">
					<div v-for="v in exposureMode.supportedValues" :key="v">
						<input
							type="radio"
							:id="v"
							:value="v"
							:modelValue="exposureMode.value"
							@input="exposureMode.update($event.target.value)"
						/>
						<label :for="v">{{ v }}</label>
					</div>
				</template>
				<template v-else>{{ exposureMode.value }}</template>
			</dd>
			<dt>Aperture</dt>
			<dd>
				<template v-if="aperture.writable">
					<select
						:modelValue="aperture.value"
						@change="aperture.update($event.target.value)"
						:disabled="aperture.updating"
					>
						<option v-for="v in aperture.supportedValues" :key="v" :value="v">
							{{ v.toString() }}
						</option>
					</select>
				</template>
				<template v-else>{{ aperture.value }} </template>
			</dd>
			<dt>ShutterSpeed</dt>
			<dd>
				<template v-if="shutterSpeed.writable">
					<select
						:modelValue="shutterSpeed.value"
						@change="shutterSpeed.update($event.target.value)"
						:disabled="shutterSpeed.updating"
					>
						<option
							v-for="v in shutterSpeed.supportedValues"
							:key="v"
							:value="v"
						>
							{{ v.toString() }}
						</option>
					</select>
				</template>
				<template v-else>{{ shutterSpeed.value }} </template>
			</dd>
			<dt>ISO</dt>
			<dd>
				<template v-if="iso.writable">
					<select
						:modelValue="iso.value"
						@change="iso.update($event.target.value)"
						:disabled="iso.updating"
					>
						<option v-for="v in iso.supportedValues" :key="v" :value="v">
							{{ v.toString() }}
						</option>
					</select>
				</template>
				<template v-else>{{ iso.value }}</template>
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
