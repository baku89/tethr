import EventEmitter from 'eventemitter3'

import {ConfigName, ConfigType, ManualFocusOption} from './configs'
import {TethrObject} from './TethrObject'

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

type TethrEventTypes = {
	[N in ConfigName as `${N}Changed`]: ConfigDesc<ConfigType[N]>
} & {
	disconnect: void
}

export abstract class Tethr extends EventEmitter<TethrEventTypes> {
	public abstract open(): Promise<void>
	public abstract close(): Promise<void>

	public abstract get opened(): boolean

	// Configsn
	public async get<N extends ConfigName>(
		name: N
	): Promise<ConfigType[N] | null> {
		return (await this.getDesc(name)).value
	}

	public async set<N extends ConfigName>(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		name: N,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ConfigType[N]
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}

	public async getDesc<N extends ConfigName>(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		name: N
	): Promise<ConfigDesc<ConfigType[N]>> {
		return {
			writable: false,
			value: null,
			options: [],
		}
	}

	// Actions
	public async runAutoFocus(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}

	public async runManualFocus(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		option: ManualFocusOption
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}

	public async takePicture(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		options?: TakePictureOption
	): Promise<OperationResult<TethrObject[]>> {
		return {status: 'unsupported'}
	}

	public async startLiveview(): Promise<OperationResult<MediaStream>> {
		return {status: 'unsupported'}
	}
	public async stopLiveview(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
}
