<template>
	<div class="InputRange">
		<input
			type="range"
			:min="min"
			:max="max"
			:step="step || 0.0001"
			:value="modelValue"
			:disabled="disabled"
			@change="$emit('change', $event)"
		/>
		<input
			type="number"
			:value="modelValue"
			:disabled="disabled"
			@change="$emit('change', $event)"
		/>
	</div>
</template>

<script setup lang="ts">
defineProps({
	modelValue: Number,
	min: Number,
	max: Number,
	step: Number,
	disabled: Boolean,
})

defineEmits<{
	(e: 'change', value: Event): void
}>()
</script>

<style lang="stylus" scoped>
.InputRange
	display flex
	gap .4rem

input
	display block

	&[type=range]
		flex-grow 1

	&[type=number]
		width 6em
		text-align center
</style>
