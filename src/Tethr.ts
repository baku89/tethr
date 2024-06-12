import EventEmitter from 'eventemitter3'
import {vec2} from 'linearly'

import {
	Aperture,
	BatteryLevel,
	ConfigName,
	ConfigNameList,
	ConfigType,
	DriveMode,
	ExposureMeteringMode,
	ExposureMode,
	FlashMode,
	FocalLength,
	FocusMeteringMode,
	FocusMode,
	FocusPeaking,
	FunctionalMode,
	ISO,
	ManualFocusOption,
	WhiteBalance,
} from './configs'
import {TethrObject} from './TethrObject'
import {isntNil} from './util'

export type OperationResultStatus =
	| 'ok'
	| 'unsupported'
	| 'invalid parameter'
	| 'busy'
	| 'general error'

export type OperationResult<T = void> = T extends void
	? {status: OperationResultStatus}
	:
			| {status: Exclude<OperationResultStatus, 'ok'>}
			| {
					status: 'ok'
					value: T
			  }

export type ConfigDescOption<T> =
	| {type: 'enum'; values: T[]}
	| {type: 'range'; min: T; max: T; step: T}

export type ConfigDesc<T> = {
	value: T | null
} & (
	| {
			writable: true
			option: ConfigDescOption<T>
	  }
	| {writable: false; option?: ConfigDescOption<T>}
)

export interface TakePhotoOption {
	doDownload?: boolean
}

type EventTypes = {
	[N in ConfigName as `${N}Change`]: ConfigDesc<ConfigType[N]>
} & {
	change: [name: ConfigName, value: ConfigType[ConfigName]]
	disconnect: void
	liveviewStreamUpdate: MediaStream
	progress: {progress: number}
}

type ConfigSetters = {
	[N in ConfigName as `set${Capitalize<N>}`]: (
		value: ConfigType[N]
	) => Promise<OperationResult>
}

type ConfigDescGetters = {
	[N in ConfigName as `get${Capitalize<N>}Desc`]: () => Promise<
		ConfigDesc<ConfigType[N]>
	>
}

export const UnsupportedConfigDesc: ConfigDesc<any> = {
	writable: false,
	value: null,
}

export const UnsupportedOperationResult = {
	status: 'unsupported',
} as const

export function readonlyConfigDesc<T>(value: T): ConfigDesc<T> {
	return {
		writable: false,
		value,
	}
}

export abstract class Tethr
	extends EventEmitter<EventTypes>
	implements ConfigSetters, ConfigDescGetters
{
	constructor() {
		super()
	}

	emit(eventName: keyof EventTypes, ...args: any[]) {
		const ret = super.emit(eventName, ...args)

		if (eventName.endsWith('Change')) {
			this.emit('change', eventName.slice(0, -6) as ConfigName, args[0])
		}

		return ret
	}

	abstract open(): Promise<void>
	abstract close(): Promise<void>

	abstract get opened(): boolean
	abstract get type(): 'usbptp' | 'webcam'
	abstract get name(): string

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	setLog(log: boolean) {
		null
	}

	/**
	 * Export all writable configs to a plain object.
	 */
	async exportConfigs(): Promise<Partial<ConfigType>> {
		const configs = (
			await Promise.all(
				ConfigNameList.map(async name => {
					const desc = await this.getDesc(name)
					if (desc.value === null) return null
					return [name, desc.value] as const
				})
			)
		).filter(isntNil)

		return Object.fromEntries(configs)
	}

	/**
	 * Apply all writable configs.
	 */
	async importConfigs(configs: Partial<ConfigType>) {
		const sortedConfigs = Object.entries(configs).sort(([a], [b]) => {
			const ai = ConfigNameList.indexOf(a as ConfigName)
			const bi = ConfigNameList.indexOf(b as ConfigName)
			return ai - bi
		}) as [ConfigName, ConfigType[ConfigName]][]

		for (const [name, value] of sortedConfigs) {
			// NOTE: this might be converted to parallel execution in the future
			try {
				await this.set(name, value)
			} finally {
				null
			}

			// The delay is necessary to avoid "busy" error
			// await sleep(25)
		}
	}

	// Config
	async get<N extends ConfigName>(name: N): Promise<ConfigType[N] | null> {
		return (await this.getDesc(name)).value
	}

	async set<N extends ConfigName>(
		name: N,
		value: ConfigType[N]
	): Promise<OperationResult> {
		const setterName = `set${name[0].toUpperCase()}${name.slice(1)}`

		if (!(this as any)[setterName]) {
			console.error(`No such config: ${name}`)
			return {status: 'invalid parameter'}
		}

		return (this as any)[setterName](value)
	}

	async getDesc<N extends ConfigName>(
		name: N
	): Promise<ConfigDesc<ConfigType[N]>> {
		const getterName = `get${name[0].toUpperCase()}${name.slice(1)}Desc`

		if (!(this as any)[getterName]) {
			console.error(`No such config: ${name}`)
			return UnsupportedConfigDesc
		}

		return (this as any)[getterName]()
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setAperture(value: Aperture): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getApertureDesc(): Promise<ConfigDesc<Aperture>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setAutoFocusFrameCenter(value: vec2): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getAutoFocusFrameCenterDesc(): Promise<ConfigDesc<vec2>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setAutoFocusFrameSize(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getAutoFocusFrameSizeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setBatteryLevel(value: BatteryLevel): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getBatteryLevelDesc(): Promise<ConfigDesc<BatteryLevel>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setBurstInterval(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getBurstIntervalDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setBurstNumber(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getBurstNumberDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCanRunAutoFocus(value: boolean): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanRunAutoFocusDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCanRunManualFocus(value: boolean): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanRunManualFocusDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCanStartLiveview(value: boolean): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanStartLiveviewDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCanTakePhoto(value: boolean): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanTakePhotoDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCaptureDelay(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCaptureDelayDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setColorMode(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getColorModeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setColorTemperature(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getColorTemperatureDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCompressionSetting(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCompressionSettingDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setContrast(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getContrastDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setDateTime(value: Date): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDateTimeDesc(): Promise<ConfigDesc<Date>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setDestinationToSave(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDestinationToSaveDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setDigitalZoom(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDigitalZoomDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setDriveMode(value: DriveMode): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDriveModeDesc(): Promise<ConfigDesc<DriveMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setExposureComp(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getExposureCompDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setExposureMeteringMode(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getExposureMeteringModeDesc(): Promise<
		ConfigDesc<ExposureMeteringMode>
	> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setExposureMode(value: ExposureMode): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getExposureModeDesc(): Promise<ConfigDesc<ExposureMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFacingMode(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFacingModeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFlashMode(value: FlashMode): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFlashModeDesc(): Promise<ConfigDesc<FlashMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFocalLength(value: FocalLength): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocalLengthDesc(): Promise<ConfigDesc<FocalLength>> {
		return UnsupportedConfigDesc
	}
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFocusDistance(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusDistanceDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async setFocusMeteringMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocusMeteringMode
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusMeteringModeDesc(): Promise<ConfigDesc<FocusMeteringMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFocusMode(value: FocusMode): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusModeDesc(): Promise<ConfigDesc<FocusMode>> {
		return {
			writable: false,
			value: null,
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFocusPeaking(value: FocusPeaking): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusPeakingDesc(): Promise<ConfigDesc<FocusPeaking>> {
		return {
			writable: false,
			value: null,
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFunctionalMode(value: FunctionalMode): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFunctionalModeDesc(): Promise<ConfigDesc<FunctionalMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setImageAspect(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getImageAspectDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setImageQuality(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getImageQualityDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setImageSize(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getImageSizeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setIso(value: ISO): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getIsoDesc(): Promise<ConfigDesc<ISO>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setLiveviewEnabled(value: boolean): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveviewEnabledDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setLiveviewMagnifyRatio(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveviewMagnifyRatioDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setLiveviewSize(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveviewSizeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async setManualFocusOptions(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ManualFocusOption[]
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getManualFocusOptionsDesc(): Promise<ConfigDesc<ManualFocusOption[]>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setManufacturer(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getManufacturerDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setModel(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getModelDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setSerialNumber(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getSerialNumberDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setSharpness(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getSharpnessDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setShutterSpeed(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getShutterSpeedDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setShutterSound(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getShutterSoundDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setTimelapseInterval(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getTimelapseIntervalDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setTimelapseNumber(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getTimelapseNumberDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setWhiteBalance(value: WhiteBalance): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getWhiteBalanceDesc(): Promise<ConfigDesc<WhiteBalance>> {
		return UnsupportedConfigDesc
	}

	/**
	 * Runs auto focus.
	 * @category Action
	 */
	async runAutoFocus(): Promise<OperationResult> {
		return UnsupportedOperationResult
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async runManualFocus(option: ManualFocusOption): Promise<OperationResult> {
		return UnsupportedOperationResult
	}

	async takePhoto(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		option?: TakePhotoOption
	): Promise<OperationResult<TethrObject[]>> {
		return UnsupportedOperationResult
	}

	async startLiveview(): Promise<OperationResult<MediaStream>> {
		return UnsupportedOperationResult
	}
	async stopLiveview(): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveViewImage(): Promise<OperationResult<Blob>> {
		return UnsupportedOperationResult
	}
}
