import EventEmitter from 'eventemitter3'

import {PropType} from './props'

type PropName = keyof PropType

export type ITethrEventTypes = {
	[Name in keyof PropType as `${Name}Changed`]: PropDesc<PropType[Name]>
} & {
	disconnect: void
}

export type SetPropResultStatus = 'ok' | 'unsupported' | 'invalid' | 'busy'

export interface SetPropResult<T extends PropType[keyof PropType]> {
	status: SetPropResultStatus
	value: T | null
}

export type PropDesc<T> = {
	value: T | null
	defaultValue?: T
	writable: boolean
	options: T[]
}

export interface ITethr extends EventEmitter<ITethrEventTypes> {
	open: () => Promise<void>
	close: () => Promise<void>

	listProps: () => Promise<PropName[]>
	// listActions: () => Promise<string[]>

	get: <N extends PropName>(name: N) => Promise<PropType[N] | null>
	set: <N extends PropName>(
		name: N,
		value: PropType[N]
	) => Promise<SetPropResult<PropType[N]>>
	getDesc: <N extends PropName>(name: N) => Promise<PropDesc<PropType[N]>>
}
