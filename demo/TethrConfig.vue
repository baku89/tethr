<template>
	<template v-if="config.value !== null">
		<dt>{{ label }}</dt>
		<dd style="font-family: monospace">
			<template v-if="config.writable">
				<template v-if="config.option.type === 'enum'">
					<select :value="valueIndex" @change.prevent="update">
						<option
							v-for="(v, i) in config.option.values"
							:key="i"
							:label="v"
							:value="i"
							:data-index="i"
						>
							{{ v }}
						</option>
					</select>
				</template>
				<template v-if="config.option.type === 'range'">
					<input
						type="number"
						:min="config.option.min"
						:max="config.option.max"
						:step="config.option.step"
					/>
				</template>
			</template>
			<input v-else :value="config.value" disabled />
		</dd>
	</template>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'
import {TethrConfig} from './useTethr'

export default defineComponent({
	props: {
		label: String,
		config: {
			type: Object as PropType<TethrConfig<any>>,
			required: true,
		},
	},
	inheritAttrs: false,
	setup(props) {
		const valueIndex = computed(() => {
			const {config} = props
			if (config.options) {
				return config.options.indexOf(config.value)
			}
			return 0
		})

		function update(e: InputEvent) {
			if (!props.config.options) return
			const index = parseInt((e.target as HTMLSelectElement).value)
			const value = props.config.options[index]
			props.config.update(value)
		}

		return {
			valueIndex,
			update,
		}
	},
})
</script>
