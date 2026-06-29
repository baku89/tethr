<script lang="ts" setup>
import {ConfigName, WhiteBalance} from 'tethr'
import * as Tq from 'tweeq'
import {computed} from 'vue'

// A single reactive config from @tethr/vue3's `useTethr().configs`.
interface Config {
	writable: boolean
	value: any
	option?:
		| {type: 'enum'; values: any[]}
		| {type: 'range'; min: any; max: any; step: any}
	set: (value: any) => void
}

interface Props {
	config: Config
	name?: ConfigName
	suffix?: string
	prefix?: string
}

interface InputAttrs {
	labelizer?: (value: any) => string
	leftIcon?: string
	rightIcon?: string
	icons?: string[]
	prefix?: string
	suffix?: string
}

const props = withDefaults(defineProps<Props>(), {prefix: '', suffix: ''})

// Inlined to keep the doc component free of extra deps (koma uses case/linearly).
const capital = (v: string) => v.replace(/\b\w/g, c => c.toUpperCase())
const clamp = (x: number, min: number, max: number) =>
	Math.min(Math.max(x, min), max)

function update(value: any) {
	props.config.set(value)
}

const whiteBalanceIcons = new Map<WhiteBalance, string>([
	['auto', 'material-symbols:wb-auto'],
	['auto cool', 'material-symbols:wb-auto-outline'],
	['auto warm', 'material-symbols:wb-auto-outline'],
	['auto ambience', 'material-symbols:wb-auto-outline'],
	['daylight', 'material-symbols:wb-sunny'],
	['shade', 'material-symbols:wb-shade'],
	['cloud', 'material-mid:wb-cloudy'],
	['incandescent', 'material-symbols:wb-incandescent'],
	['fluorescent', 'material-symbols:fluorescent'],
	['tungsten', 'ic:baseline-tungsten'],
	['flash', 'mdi:flash'],
	['underwater', 'material-symbols:water'],
	['manual', 'mdi:temperature-kelvin'],
	['custom', 'material-symbols:settings'],
])

const inputAttrs = computed<InputAttrs>(() => {
	switch (props.name) {
		case 'aperture':
			return {labelizer: v => 'F' + v}
		case 'focalLength':
			return {suffix: 'mm'}
		case 'focusDistance':
			return {
				leftIcon: 'tabler:macro',
				rightIcon: 'material-symbols:landscape-outline',
			}
		case 'whiteBalance': {
			const values =
				props.config.option?.type === 'enum'
					? (props.config.option.values as string[])
					: []
			const icons = values.map(
				value => whiteBalanceIcons.get(value as WhiteBalance) ?? ''
			)
			return {icons}
		}
		case 'colorTemperature':
			return {suffix: 'K'}
		case 'shutterSpeed':
			return {labelizer: (v: any) => (/^[a-z]+$/i.test(v) ? capital(v) : v)}
		case 'liveviewMagnifyRatio':
			return {labelizer: (v: any) => '×' + v}
		case 'focusPeaking':
			return {labelizer: (v: any) => (v === false ? 'Off' : capital(v))}
	}
	return {}
})

// Long, loosely-numeric enums shown as a spinnable drum instead of a dropdown.
const drumConfigs: ConfigName[] = [
	'aperture',
	'shutterSpeed',
	'iso',
	'exposureComp',
]
const isDrumConfig = computed(
	() => !!props.name && drumConfigs.includes(props.name)
)

const isEnum = computed(() => {
	const o = props.config.option
	return o?.type === 'enum' && o.values.length > 0
})
const asDrum = computed(() => isDrumConfig.value && isEnum.value)
const asNumber = computed(() => {
	const o = props.config.option
	return typeof props.config.value === 'number' && o?.type === 'range'
})

// ± steppers flank a drum or a number field, but not a plain dropdown.
const showSteppers = computed(
	() => props.config.writable && (asDrum.value || asNumber.value)
)

function increment(dir: 1 | -1) {
	if (!props.config.writable) return
	const {option, value} = props.config
	if (!option || value === null) return

	if (option.type === 'range') {
		if (
			typeof option.min !== 'number' ||
			typeof option.max !== 'number' ||
			typeof value !== 'number'
		) {
			return
		}
		const step = option.step || ((option.max - option.min) / 100) * dir
		update(clamp(value + step, option.min, option.max))
	} else if (option.type === 'enum') {
		const values = option.values as string[]
		const index = values.indexOf(value as any)
		if (index === -1) return
		update(values[clamp(index + dir, 0, values.length - 1)])
	}
}
</script>

<template>
	<Tq.InputGroup class="TethrConfig">
		<Tq.InputButton
			v-if="showSteppers"
			icon="mdi:chevron-left"
			subtle
			narrow
			@click="increment(-1)"
		/>
		<!-- Long, loosely-numeric lists (aperture / shutter speed / ISO / exposure
			comp) — a drum the user can spin instead of a tall dropdown. -->
		<Tq.InputDrum
			v-if="
				isDrumConfig &&
				config.option?.type === 'enum' &&
				config.option.values.length > 0
			"
			:modelValue="config.value"
			:options="config.option.values"
			:disabled="!config.writable"
			font="numeric"
			v-bind="inputAttrs"
			@update:modelValue="update"
		/>
		<Tq.InputDropdown
			v-else-if="config.option?.type === 'enum' && config.option.values.length > 0"
			:modelValue="config.value"
			:options="config.option.values"
			:disabled="!config.writable"
			align="center"
			v-bind="inputAttrs"
			@update:modelValue="update"
		/>
		<Tq.InputNumber
			v-else-if="
				typeof config.value === 'number' && config.option?.type === 'range'
			"
			:modelValue="config.value"
			:min="config.option.min as number"
			:max="config.option.max as number"
			:step="config.option.step as number"
			:disabled="!config.writable"
			:prefix="prefix"
			:suffix="suffix"
			v-bind="inputAttrs"
			@update:modelValue="update"
		/>
		<!-- No usable input: show an inactive, read-only frame. -->
		<Tq.InputString
			v-else
			:modelValue="config.value ? String(config.value) : '-'"
			align="center"
			disabled
		/>
		<Tq.InputButton
			v-if="showSteppers"
			subtle
			narrow
			icon="mdi:chevron-right"
			@click="increment(1)"
		/>
	</Tq.InputGroup>
</template>

<style lang="stylus" scoped>
.TethrConfig
	display flex
</style>
