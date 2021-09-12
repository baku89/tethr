<template>
	<dt>{{ label }}</dt>
	<dd>
		<template v-if="prop.writable">
			<select :value="valueIndex" @change="update" :disabled="prop.updating">
				<option
					v-for="(v, i) in prop.supportedValues"
					:key="i"
					:label="v"
					:value="i"
					:data-index="i"
				>
					{{ v }}
				</option>
			</select>
		</template>
		<template v-else>{{ prop.value }} </template>
	</dd>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'
import {TethrProp} from './useTethr'

export default defineComponent({
	props: {
		label: String,
		prop: {
			type: Object as PropType<TethrProp<any>>,
			required: true,
		},
	},
	setup(props) {
		const valueIndex = computed(() => {
			const {prop} = props
			if (prop.supportedValues) {
				return prop.supportedValues.indexOf(prop.value)
			}
			return 0
		})

		function update(e: InputEvent) {
			if (!props.prop.supportedValues) return
			const index = parseInt((e.target as HTMLSelectElement).value)
			const value = props.prop.supportedValues[index]
			props.prop.update(value)
		}

		return {
			valueIndex,
			update,
		}
	},
})
</script>
