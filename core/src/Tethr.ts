import EventEmitter from 'eventemitter3'
import {vec2} from 'linearly'

import {
	Aperture,
	BatteryLevel,
	ConfigName,
	ConfigNameList,
	ConfigType,
	DriveMode,
	ExposureComp,
	ExposureMeteringMode,
	ExposureMode,
	FlashMode,
	FocalLength,
	FocusMeteringMode,
	FocusMode,
	FocusPeaking,
	FunctionalMode,
	ImageAspect,
	ImageQuality,
	ImageSize,
	ISO,
	ManualFocusOption,
	ShutterSpeed,
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
	progress: {progress: number}
}

type ConfigSetters = {
	[N in ConfigName as `set${Capitalize<N>}`]: (
		value: ConfigType[N]
	) => Promise<OperationResult>
}

type ConfigGetters = {
	[N in ConfigName as `get${Capitalize<N>}`]: () => Promise<
		ConfigType[N] | null
	>
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

export type TethrDeviceType = 'ptpusb' | 'webcam'

export abstract class Tethr
	extends EventEmitter<EventTypes>
	implements ConfigSetters, ConfigGetters, ConfigDescGetters
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
	abstract get type(): TethrDeviceType
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
	async getAperture() {
		return (await this.getApertureDesc()).value
	}
	async getApertureDesc(): Promise<ConfigDesc<Aperture>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setAutoFocusFrameCenter(value: vec2): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getAutoFocusFrameCenter() {
		return (await this.getAutoFocusFrameCenterDesc()).value
	}
	async getAutoFocusFrameCenterDesc(): Promise<ConfigDesc<vec2>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setAutoFocusFrameSize(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getAutoFocusFrameSize() {
		return (await this.getAutoFocusFrameSizeDesc()).value
	}
	async getAutoFocusFrameSizeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setBatteryLevel(value: BatteryLevel): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getBatteryLevel() {
		return (await this.getBatteryLevelDesc()).value
	}
	async getBatteryLevelDesc(): Promise<ConfigDesc<BatteryLevel>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setBurstInterval(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getBurstInterval() {
		return (await this.getBurstIntervalDesc()).value
	}
	async getBurstIntervalDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setBurstNumber(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getBurstNumber() {
		return (await this.getBurstNumberDesc()).value
	}
	async getBurstNumberDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCanRunAutoFocus(value: boolean): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanRunAutoFocus() {
		return (await this.getCanRunAutoFocusDesc()).value
	}
	async getCanRunAutoFocusDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCanRunManualFocus(value: boolean): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanRunManualFocus() {
		return (await this.getCanRunManualFocusDesc()).value
	}
	async getCanRunManualFocusDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCanStartLiveview(value: boolean): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanStartLiveview() {
		return (await this.getCanStartLiveviewDesc()).value
	}
	async getCanStartLiveviewDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCanTakePhoto(value: boolean): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanTakePhoto() {
		return (await this.getCanTakePhotoDesc()).value
	}
	async getCanTakePhotoDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCaptureDelay(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCaptureDelay() {
		return (await this.getCaptureDelayDesc()).value
	}
	async getCaptureDelayDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setColorMode(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getColorMode() {
		return (await this.getColorModeDesc()).value
	}
	async getColorModeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setColorTemperature(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getColorTemperature() {
		return (await this.getColorTemperatureDesc()).value
	}
	async getColorTemperatureDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setCompressionSetting(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCompressionSetting() {
		return (await this.getCompressionSettingDesc()).value
	}
	async getCompressionSettingDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setContrast(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getContrast() {
		return (await this.getContrastDesc()).value
	}
	async getContrastDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setDateTime(value: Date): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDateTime() {
		return (await this.getDateTimeDesc()).value
	}
	async getDateTimeDesc(): Promise<ConfigDesc<Date>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setDestinationToSave(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDestinationToSave() {
		return (await this.getDestinationToSaveDesc()).value
	}
	async getDestinationToSaveDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setDigitalZoom(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDigitalZoom() {
		return (await this.getDigitalZoomDesc()).value
	}
	async getDigitalZoomDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setDriveMode(value: DriveMode): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDriveMode() {
		return (await this.getDriveModeDesc()).value
	}
	async getDriveModeDesc(): Promise<ConfigDesc<DriveMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setExposureComp(value: ExposureComp): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getExposureComp() {
		return (await this.getExposureCompDesc()).value
	}
	async getExposureCompDesc(): Promise<ConfigDesc<ExposureComp>> {
		return UnsupportedConfigDesc
	}

	async setExposureMeteringMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ExposureMeteringMode
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getExposureMeteringMode() {
		return (await this.getExposureMeteringModeDesc()).value
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
	async getExposureMode() {
		return (await this.getExposureModeDesc()).value
	}
	async getExposureModeDesc(): Promise<ConfigDesc<ExposureMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFacingMode(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFacingMode() {
		return (await this.getFacingModeDesc()).value
	}
	async getFacingModeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFlashMode(value: FlashMode): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFlashMode() {
		return (await this.getFlashModeDesc()).value
	}
	async getFlashModeDesc(): Promise<ConfigDesc<FlashMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFocalLength(value: FocalLength): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocalLength() {
		return (await this.getFocalLengthDesc()).value
	}
	async getFocalLengthDesc(): Promise<ConfigDesc<FocalLength>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFocusDistance(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusDistance() {
		return (await this.getFocusDistanceDesc()).value
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
	async getFocusMeteringMode() {
		return (await this.getFocusMeteringModeDesc()).value
	}
	async getFocusMeteringModeDesc(): Promise<ConfigDesc<FocusMeteringMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFocusMode(value: FocusMode): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusMode() {
		return (await this.getFocusModeDesc()).value
	}
	async getFocusModeDesc(): Promise<ConfigDesc<FocusMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFocusPeaking(value: FocusPeaking): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusPeaking() {
		return (await this.getFocusPeakingDesc()).value
	}
	async getFocusPeakingDesc(): Promise<ConfigDesc<FocusPeaking>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setFunctionalMode(value: FunctionalMode): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFunctionalMode() {
		return (await this.getFunctionalModeDesc()).value
	}
	async getFunctionalModeDesc(): Promise<ConfigDesc<FunctionalMode>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setImageAspect(value: ImageAspect): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getImageAspect() {
		return (await this.getImageAspectDesc()).value
	}
	async getImageAspectDesc(): Promise<ConfigDesc<ImageAspect>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setImageQuality(value: ImageQuality): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getImageQuality() {
		return (await this.getImageQualityDesc()).value
	}
	async getImageQualityDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setImageSize(value: ImageSize): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getImageSize() {
		return (await this.getImageSizeDesc()).value
	}
	async getImageSizeDesc(): Promise<ConfigDesc<ImageSize>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setIso(value: ISO): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getIso() {
		return (await this.getIsoDesc()).value
	}
	async getIsoDesc(): Promise<ConfigDesc<ISO>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setLiveview(value: MediaStream): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveview() {
		return (await this.getLiveviewDesc()).value
	}
	async getLiveviewDesc(): Promise<ConfigDesc<MediaStream>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setLiveviewMagnifyRatio(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveviewMagnifyRatio() {
		return (await this.getLiveviewMagnifyRatioDesc()).value
	}
	async getLiveviewMagnifyRatioDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setLiveviewSize(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveviewSize() {
		return (await this.getLiveviewSizeDesc()).value
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
	async getManualFocusOptions() {
		return (await this.getManualFocusOptionsDesc()).value
	}
	async getManualFocusOptionsDesc(): Promise<ConfigDesc<ManualFocusOption[]>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setManufacturer(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getManufacturer() {
		return (await this.getManufacturerDesc()).value
	}
	async getManufacturerDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setModel(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getModel() {
		return (await this.getModelDesc()).value
	}
	async getModelDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setSerialNumber(value: string): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getSerialNumber() {
		return (await this.getSerialNumberDesc()).value
	}
	async getSerialNumberDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setSharpness(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getSharpness() {
		return (await this.getSharpnessDesc()).value
	}
	async getSharpnessDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setShutterSpeed(value: ShutterSpeed): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getShutterSpeed() {
		return (await this.getShutterSpeedDesc()).value
	}
	async getShutterSpeedDesc(): Promise<ConfigDesc<ShutterSpeed>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setShutterSound(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getShutterSound() {
		return (await this.getShutterSoundDesc()).value
	}
	async getShutterSoundDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setTimelapseInterval(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getTimelapseInterval() {
		return (await this.getTimelapseIntervalDesc()).value
	}
	async getTimelapseIntervalDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setTimelapseNumber(value: number): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getTimelapseNumber() {
		return (await this.getTimelapseNumberDesc()).value
	}
	async getTimelapseNumberDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setWhiteBalance(value: WhiteBalance): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getWhiteBalance() {
		return (await this.getWhiteBalanceDesc()).value
	}
	async getWhiteBalanceDesc(): Promise<ConfigDesc<WhiteBalance>> {
		return UnsupportedConfigDesc
	}

	/**
	 * Runs auto focus. Use {@link getCanRunAutoFocus} to check if the camera supports this action.
	 * @category Action
	 */
	async runAutoFocus(): Promise<OperationResult> {
		return UnsupportedOperationResult
	}

	/**
	 * Runs manual focus. Use {@link getCanRunAutoFocus} to check if the camera supports this action.
	 * @category Action
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async runManualFocus(option: ManualFocusOption): Promise<OperationResult> {
		return UnsupportedOperationResult
	}

	/**
	 * Takes a photo. Use {@link getCanTakePhoto} to check if the camera supports this action.
	 * @category Action
	 */
	async takePhoto(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		option?: TakePhotoOption
	): Promise<OperationResult<TethrObject[]>> {
		return UnsupportedOperationResult
	}

	/**
	 * Starts liveview. Use {@link getCanStartLiveview} to check if the camera supports this action.
	 * @category Action
	 */
	async startLiveview(): Promise<OperationResult<MediaStream>> {
		return UnsupportedOperationResult
	}

	/**
	 * Stops liveview.
	 * @category Action
	 */
	async stopLiveview(): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
}
