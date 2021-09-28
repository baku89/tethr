import EventEmitter from 'eventemitter3'

import {ConfigName, ConfigType, ManualFocusOption} from './configs'
import {TethrObject} from './TethrObject'

export type ITethrEventTypes = {
	[N in ConfigName as `${N}Changed`]: ConfigDesc<ConfigType[N]>
} & {
	disconnect: void
}

export type OperationResultStatus =
	| 'ok'
	| 'unsupported'
	| 'invalid parameter'
	| 'busy'
	| 'general error'

export type OperationResult<T> = T extends void
	? {status: OperationResultStatus}
	:
			| {status: Exclude<OperationResultStatus, 'ok'>}
			| {
					status: 'ok'
					value: T
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

	public async get<N extends ConfigName>(
		name: N
	): Promise<ConfigType[N] | null> {
		return (await this.getDesc(name)).value
	}
	public abstract set<N extends ConfigName>(
		name: N,
		value: ConfigType[N]
	): Promise<OperationResult<void>>
	public abstract getDesc<N extends ConfigName>(
		name: N
	): Promise<ConfigDesc<ConfigType[N]>>

	// Actions
	public abstract runAutoFocus(): Promise<OperationResult<void>>
	public abstract runManualFocus(
		option: ManualFocusOption
	): Promise<OperationResult<void>>
	public abstract takePicture(
		options?: TakePictureOption
	): Promise<OperationResult<TethrObject[]>>
	public abstract startLiveview(): Promise<OperationResult<MediaStream>>
	public abstract stopLiveview(): Promise<OperationResult<void>>
}
