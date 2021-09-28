import EventEmitter from 'eventemitter3'

import {
	BatteryLevel,
	ConfigName,
	ConfigType,
	DriveMode,
	ExposureMeteringMode,
	ExposureMode,
	FlashMode,
	FocalLength,
	FocusMeteringMode,
	FocusMode,
	FunctionalMode,
	generateUnsupportedConfigDesc,
	ISO,
	ManualFocusOption,
	WhiteBalance,
} from './configs'
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

	// Config
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

	public async getAperture(): Promise<number | null> {
		return (await this.getApertureDesc()).value
	}
	public async setAperture(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getApertureDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getBatteryLevel(): Promise<BatteryLevel | null> {
		return (await this.getBatteryLevelDesc()).value
	}
	public async setBatteryLevel(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getBatteryLevelDesc(): Promise<ConfigDesc<BatteryLevel>> {
		return generateUnsupportedConfigDesc()
	}

	public async getBurstInterval(): Promise<number | null> {
		return (await this.getBurstIntervalDesc()).value
	}
	public async setBurstInterval(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getBurstIntervalDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getBurstNumber(): Promise<number | null> {
		return (await this.getBurstNumberDesc()).value
	}
	public async setBurstNumber(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getBurstNumberDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCanRunAutoFocus(): Promise<boolean | null> {
		return (await this.getCanRunAutoFocusDesc()).value
	}
	public async setCanRunAutoFocus(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCanRunAutoFocusDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCanRunManualFocus(): Promise<boolean | null> {
		return (await this.getCanRunManualFocusDesc()).value
	}
	public async setCanRunManualFocus(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCanRunManualFocusDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCanStartLiveview(): Promise<boolean | null> {
		return (await this.getCanStartLiveviewDesc()).value
	}
	public async setCanStartLiveview(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCanStartLiveviewDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCanTakePicture(): Promise<boolean | null> {
		return (await this.getCanTakePictureDesc()).value
	}
	public async setCanTakePicture(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCanTakePictureDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCaptureDelay(): Promise<number | null> {
		return (await this.getCaptureDelayDesc()).value
	}
	public async setCaptureDelay(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCaptureDelayDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getColorMode(): Promise<string | null> {
		return (await this.getColorModeDesc()).value
	}
	public async setColorMode(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getColorModeDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getColorTemperature(): Promise<number | null> {
		return (await this.getColorTemperatureDesc()).value
	}
	public async setColorTemperature(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getColorTemperatureDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCompressionSetting(): Promise<number | null> {
		return (await this.getCompressionSettingDesc()).value
	}
	public async setCompressionSetting(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCompressionSettingDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getContrast(): Promise<number | null> {
		return (await this.getContrastDesc()).value
	}
	public async setContrast(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getContrastDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getDateTime(): Promise<Date | null> {
		return (await this.getDateTimeDesc()).value
	}
	public async setDateTime(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getDateTimeDesc(): Promise<ConfigDesc<Date>> {
		return generateUnsupportedConfigDesc()
	}

	public async getDigitalZoom(): Promise<number | null> {
		return (await this.getDigitalZoomDesc()).value
	}
	public async setDigitalZoom(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getDigitalZoomDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getDriveMode(): Promise<DriveMode | null> {
		return (await this.getDriveModeDesc()).value
	}
	public async setDriveMode(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getDriveModeDesc(): Promise<ConfigDesc<DriveMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getExposureComp(): Promise<string | null> {
		return (await this.getExposureCompDesc()).value
	}
	public async setExposureComp(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getExposureCompDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getExposureMeteringMode(): Promise<string | null> {
		return (await this.getExposureMeteringModeDesc()).value
	}
	public async setExposureMeteringMode(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getExposureMeteringModeDesc(): Promise<
		ConfigDesc<ExposureMeteringMode>
	> {
		return generateUnsupportedConfigDesc()
	}

	public async getExposureMode(): Promise<ExposureMode | null> {
		return (await this.getExposureModeDesc()).value
	}
	public async setExposureMode(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getExposureModeDesc(): Promise<ConfigDesc<ExposureMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFlashMode(): Promise<FlashMode | null> {
		return (await this.getFlashModeDesc()).value
	}
	public async setFlashMode(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFlashModeDesc(): Promise<ConfigDesc<FlashMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFocalLength(): Promise<FocalLength | null> {
		return (await this.getFocalLengthDesc()).value
	}
	public async setFocalLength(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFocalLengthDesc(): Promise<ConfigDesc<FocalLength>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFocusDistance(): Promise<number | null> {
		return (await this.getFocusDistanceDesc()).value
	}
	public async setFocusDistance(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFocusDistanceDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFocusMeteringMode(): Promise<FocusMeteringMode | null> {
		return (await this.getFocusMeteringModeDesc()).value
	}
	public async setFocusMeteringMode(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFocusMeteringModeDesc(): Promise<
		ConfigDesc<FocusMeteringMode>
	> {
		return generateUnsupportedConfigDesc()
	}

	public async getFocusMode(): Promise<FocusMode | null> {
		return (await this.getFocusModeDesc()).value
	}
	public async setFocusMode(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFocusModeDesc(): Promise<ConfigDesc<FocusMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFunctionalMode(): Promise<FunctionalMode | null> {
		return (await this.getFunctionalModeDesc()).value
	}
	public async setFunctionalMode(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFunctionalModeDesc(): Promise<ConfigDesc<FunctionalMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getImageAspect(): Promise<string | null> {
		return (await this.getImageAspectDesc()).value
	}
	public async setImageAspect(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getImageAspectDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getImageQuality(): Promise<string | null> {
		return (await this.getImageQualityDesc()).value
	}
	public async setImageQuality(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getImageQualityDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getImageSize(): Promise<string | null> {
		return (await this.getImageSizeDesc()).value
	}
	public async setImageSize(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getImageSizeDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getIso(): Promise<ISO | null> {
		return (await this.getIsoDesc()).value
	}
	public async setIso(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getIsoDesc(): Promise<ConfigDesc<ISO>> {
		return generateUnsupportedConfigDesc()
	}

	public async getLiveviewEnabled(): Promise<boolean | null> {
		return (await this.getLiveviewEnabledDesc()).value
	}
	public async setLiveviewEnabled(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getLiveviewEnabledDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getLiveviewMagnifyRatio(): Promise<number | null> {
		return (await this.getLiveviewMagnifyRatioDesc()).value
	}
	public async setLiveviewMagnifyRatio(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getLiveviewMagnifyRatioDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getLiveviewSize(): Promise<string | null> {
		return (await this.getLiveviewSizeDesc()).value
	}
	public async setLiveviewSize(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getLiveviewSizeDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getManualFocusOptions(): Promise<ManualFocusOption[] | null> {
		return (await this.getManualFocusOptionsDesc()).value
	}
	public async setManualFocusOptions(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getManualFocusOptionsDesc(): Promise<
		ConfigDesc<ManualFocusOption[]>
	> {
		return generateUnsupportedConfigDesc()
	}

	public async getModel(): Promise<string | null> {
		return (await this.getModelDesc()).value
	}
	public async setModel(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getModelDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getSharpness(): Promise<number | null> {
		return (await this.getSharpnessDesc()).value
	}
	public async setSharpness(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getSharpnessDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getShutterSpeed(): Promise<string | null> {
		return (await this.getShutterSpeedDesc()).value
	}
	public async setShutterSpeed(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getShutterSpeedDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getTimelapseInterval(): Promise<number | null> {
		return (await this.getTimelapseIntervalDesc()).value
	}
	public async setTimelapseInterval(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getTimelapseIntervalDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getTimelapseNumber(): Promise<number | null> {
		return (await this.getTimelapseNumberDesc()).value
	}
	public async setTimelapseNumber(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getTimelapseNumberDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getWhiteBalance(): Promise<WhiteBalance | null> {
		return (await this.getWhiteBalanceDesc()).value
	}
	public async setWhiteBalance(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getWhiteBalanceDesc(): Promise<ConfigDesc<WhiteBalance>> {
		return generateUnsupportedConfigDesc()
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
