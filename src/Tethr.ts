import EventEmitter from 'eventemitter3'

import {ActionName} from './actions'
import {ConfigType, RunManualFocusOption} from './configs'
import {DeviceInfo} from './DeviceInfo'
import {TethrObject} from './TethrObject'

type ConfigName = keyof ConfigType

export type ITethrEventTypes = {
	[Name in keyof ConfigType as `${Name}Changed`]: ConfigDesc<ConfigType[Name]>
} & {
	disconnect: void
}

export type OperationResultStatus = 'ok' | 'unsupported' | 'invalid' | 'busy'

export interface SetConfigResult<T extends ConfigType[keyof ConfigType]> {
	status: OperationResultStatus
	value: T | null
}

export type ConfigDesc<T> = {
	value: T | null
	defaultValue?: T
	writable: boolean
	options: T[]
}

export interface TakePictureOption {
	download?: boolean
}

export abstract class Tethr extends EventEmitter<ITethrEventTypes> {
	public abstract open(): Promise<void>
	public abstract close(): Promise<void>

	public abstract get opened(): boolean

	public abstract listConfigs(): Promise<ConfigName[]>
	public abstract listActions(): Promise<ActionName[]>

	public abstract get<N extends ConfigName>(
		name: N
	): Promise<ConfigType[N] | null>
	public abstract set<N extends ConfigName>(
		name: N,
		value: ConfigType[N]
	): Promise<SetConfigResult<ConfigType[N]>>
	public abstract getDesc<N extends ConfigName>(
		name: N
	): Promise<ConfigDesc<ConfigType[N]>>

	// Actions
	public abstract getDeviceInfo(): Promise<DeviceInfo>
	public abstract runAutoFocus(): Promise<boolean>
	public abstract runManualFocus(option: RunManualFocusOption): Promise<boolean>
	public abstract takePicture(
		options?: TakePictureOption
	): Promise<null | TethrObject[]>
	public abstract startLiveview(): Promise<null | MediaStream>
	public abstract stopLiveview(): Promise<void>
}
