import EventEmitter from 'eventemitter3'

import {DeviceInfo} from './DeviceInfo'
import {PropType} from './props'
import {TethrObject} from './TethrObject'

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

export interface TakePictureOption {
	download?: boolean
}

export interface LiveviewResult {
	image: Blob
	histogram?: Uint8Array
}

export abstract class Tethr extends EventEmitter<ITethrEventTypes> {
	public abstract open(): Promise<void>
	public abstract close(): Promise<void>

	public abstract get opened(): boolean

	public abstract listProps(): Promise<PropName[]>
	// listActions: () => Promise<string[]>

	public abstract get<N extends PropName>(name: N): Promise<PropType[N] | null>
	public abstract set<N extends PropName>(
		name: N,
		value: PropType[N]
	): Promise<SetPropResult<PropType[N]>>
	public abstract getDesc<N extends PropName>(
		name: N
	): Promise<PropDesc<PropType[N]>>

	// Actions
	public abstract getDeviceInfo(): Promise<DeviceInfo>
	public abstract runAutoFocus(): Promise<boolean>
	public abstract takePicture(
		options?: TakePictureOption
	): Promise<null | TethrObject[]>
	public abstract startLiveview(): Promise<void>
	public abstract stopLiveview(): Promise<void>
	public abstract getLiveview(): Promise<null | LiveviewResult>
}
