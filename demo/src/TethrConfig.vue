<template>
	<template v-if="config.value !== null">
		<dt>{{ label }}</dt>
		<dd>
			<template v-if="config.writable">
				<template v-if="config.option?.type === 'enum'">
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
				<template v-if="config.option?.type === 'range'">
					<InputRange
						:modelValue="config.value"
						:min="config.option.min"
						:max="config.option.max"
						:step="config.option.step"
						@change="update"
					/>
				</template>
			</template>
			<template v-else>
				<InputRange
					v-if="config.option?.type === 'range'"
					:min="config.option?.min"
					:max="config.option?.max"
					:modelValue="config.value"
					disabled
				/>
				<input v-else :value="config.value" disabled />
			</template>
		</dd>
	</template>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import InputRange from './InputRange.vue'
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
			if (config.option?.type === 'enum') {
				return config.option.values.indexOf(config.value)
			}
			return 0
		})
		function update(e: Event) {
			if (!props.config.option) return
			const str = (e.target as HTMLSelectElement).value
			if (props.config.option.type === 'enum') {
				const index = parseInt(str)
				const value = props.config.option.values[index]
				props.config.update(value)
			} else {
				const value = parseInt(str)
				props.config.update(value)
			}
		}
		return {
			valueIndex,
			update,
		}
	},
	components: {InputRange},
})
</script>
