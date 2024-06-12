<template>
	<div class="TethrConfig">
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
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import InputRange from './InputRange.vue'

interface Props {
	label: string
	config: any
}

const props = defineProps<Props>()

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
		const value = parseFloat(str)
		props.config.update(value)
	}
}
</script>

<style lang="stylus" scoped>
.TethrConfig
	display grid
	grid-column 1 / 3
	grid-template-columns subgrid
</style>
