import EventEmitter from 'eventemitter3'

import {
	Aperture,
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
		name: N,
		value: ConfigType[N]
	): Promise<OperationResult<void>> {
		switch (name) {
			case 'aperture':
				return this.setAperture(value as any)
			case 'batteryLevel':
				return this.setBatteryLevel(value as any)
			case 'burstInterval':
				return this.setBurstInterval(value as any)
			case 'burstNumber':
				return this.setBurstNumber(value as any)
			case 'canRunAutoFocus':
				return this.setCanRunAutoFocus(value as any)
			case 'canRunManualFocus':
				return this.setCanRunManualFocus(value as any)
			case 'canStartLiveview':
				return this.setCanStartLiveview(value as any)
			case 'canTakePicture':
				return this.setCanTakePicture(value as any)
			case 'captureDelay':
				return this.setCaptureDelay(value as any)
			case 'colorMode':
				return this.setColorMode(value as any)
			case 'colorTemperature':
				return this.setColorTemperature(value as any)
			case 'compressionSetting':
				return this.setCompressionSetting(value as any)
			case 'contrast':
				return this.setContrast(value as any)
			case 'dateTime':
				return this.setDateTime(value as any)
			case 'digitalZoom':
				return this.setDigitalZoom(value as any)
			case 'driveMode':
				return this.setDriveMode(value as any)
			case 'exposureComp':
				return this.setExposureComp(value as any)
			case 'exposureMeteringMode':
				return this.setExposureMeteringMode(value as any)
			case 'exposureMode':
				return this.setExposureMode(value as any)
			case 'flashMode':
				return this.setFlashMode(value as any)
			case 'focalLength':
				return this.setFocalLength(value as any)
			case 'focusDistance':
				return this.setFocusDistance(value as any)
			case 'focusMeteringMode':
				return this.setFocusMeteringMode(value as any)
			case 'focusMode':
				return this.setFocusMode(value as any)
			case 'functionalMode':
				return this.setFunctionalMode(value as any)
			case 'imageAspect':
				return this.setImageAspect(value as any)
			case 'imageQuality':
				return this.setImageQuality(value as any)
			case 'imageSize':
				return this.setImageSize(value as any)
			case 'iso':
				return this.setIso(value as any)
			case 'liveviewEnabled':
				return this.setLiveviewEnabled(value as any)
			case 'liveviewMagnifyRatio':
				return this.setLiveviewMagnifyRatio(value as any)
			case 'liveviewSize':
				return this.setLiveviewSize(value as any)
			case 'manualFocusOptions':
				return this.setManualFocusOptions(value as any)
			case 'model':
				return this.setModel(value as any)
			case 'sharpness':
				return this.setSharpness(value as any)
			case 'shutterSpeed':
				return this.setShutterSpeed(value as any)
			case 'timelapseInterval':
				return this.setTimelapseInterval(value as any)
			case 'timelapseNumber':
				return this.setTimelapseNumber(value as any)
			case 'whiteBalance':
				return this.setWhiteBalance(value as any)
		}

		return {status: 'unsupported'}
	}

	public async getDesc<N extends ConfigName>(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		name: N
	): Promise<ConfigDesc<ConfigType[N]>> {
		type ReturnType = Promise<ConfigDesc<ConfigType[N]>>

		switch (name) {
			case 'aperture':
				return this.getApertureDesc() as ReturnType
			case 'batteryLevel':
				return this.getBatteryLevelDesc() as ReturnType
			case 'burstInterval':
				return this.getBurstIntervalDesc() as ReturnType
			case 'burstNumber':
				return this.getBurstNumberDesc() as ReturnType
			case 'canRunAutoFocus':
				return this.getCanRunAutoFocusDesc() as ReturnType
			case 'canRunManualFocus':
				return this.getCanRunManualFocusDesc() as ReturnType
			case 'canStartLiveview':
				return this.getCanStartLiveviewDesc() as ReturnType
			case 'canTakePicture':
				return this.getCanTakePictureDesc() as ReturnType
			case 'captureDelay':
				return this.getCaptureDelayDesc() as ReturnType
			case 'colorMode':
				return this.getColorModeDesc() as ReturnType
			case 'colorTemperature':
				return this.getColorTemperatureDesc() as ReturnType
			case 'compressionSetting':
				return this.getCompressionSettingDesc() as ReturnType
			case 'contrast':
				return this.getContrastDesc() as ReturnType
			case 'dateTime':
				return this.getDateTimeDesc() as ReturnType
			case 'digitalZoom':
				return this.getDigitalZoomDesc() as ReturnType
			case 'driveMode':
				return this.getDriveModeDesc() as ReturnType
			case 'exposureComp':
				return this.getExposureCompDesc() as ReturnType
			case 'exposureMeteringMode':
				return this.getExposureMeteringModeDesc() as ReturnType
			case 'exposureMode':
				return this.getExposureModeDesc() as ReturnType
			case 'flashMode':
				return this.getFlashModeDesc() as ReturnType
			case 'focalLength':
				return this.getFocalLengthDesc() as ReturnType
			case 'focusDistance':
				return this.getFocusDistanceDesc() as ReturnType
			case 'focusMeteringMode':
				return this.getFocusMeteringModeDesc() as ReturnType
			case 'focusMode':
				return this.getFocusModeDesc() as ReturnType
			case 'functionalMode':
				return this.getFunctionalModeDesc() as ReturnType
			case 'imageAspect':
				return this.getImageAspectDesc() as ReturnType
			case 'imageQuality':
				return this.getImageQualityDesc() as ReturnType
			case 'imageSize':
				return this.getImageSizeDesc() as ReturnType
			case 'iso':
				return this.getIsoDesc() as ReturnType
			case 'liveviewEnabled':
				return this.getLiveviewEnabledDesc() as ReturnType
			case 'liveviewMagnifyRatio':
				return this.getLiveviewMagnifyRatioDesc() as ReturnType
			case 'liveviewSize':
				return this.getLiveviewSizeDesc() as ReturnType
			case 'manualFocusOptions':
				return this.getManualFocusOptionsDesc() as ReturnType
			case 'model':
				return this.getModelDesc() as ReturnType
			case 'sharpness':
				return this.getSharpnessDesc() as ReturnType
			case 'shutterSpeed':
				return this.getShutterSpeedDesc() as ReturnType
			case 'timelapseInterval':
				return this.getTimelapseIntervalDesc() as ReturnType
			case 'timelapseNumber':
				return this.getTimelapseNumberDesc() as ReturnType
			case 'whiteBalance':
				return this.getWhiteBalanceDesc() as ReturnType
		}

		return {
			writable: false,
			value: null,
			options: [],
		}
	}

	public async getAperture(): Promise<Aperture | null> {
		return (await this.getApertureDesc()).value
	}
	public async setAperture(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: Aperture
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getApertureDesc(): Promise<ConfigDesc<Aperture>> {
		return generateUnsupportedConfigDesc()
	}

	public async getBatteryLevel(): Promise<BatteryLevel | null> {
		return (await this.getBatteryLevelDesc()).value
	}
	public async setBatteryLevel(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: BatteryLevel
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getBatteryLevelDesc(): Promise<ConfigDesc<BatteryLevel>> {
		return generateUnsupportedConfigDesc()
	}

	public async getBurstInterval(): Promise<number | null> {
		return (await this.getBurstIntervalDesc()).value
	}
	public async setBurstInterval(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getBurstIntervalDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getBurstNumber(): Promise<number | null> {
		return (await this.getBurstNumberDesc()).value
	}
	public async setBurstNumber(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getBurstNumberDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCanRunAutoFocus(): Promise<boolean | null> {
		return (await this.getCanRunAutoFocusDesc()).value
	}
	public async setCanRunAutoFocus(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCanRunAutoFocusDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCanRunManualFocus(): Promise<boolean | null> {
		return (await this.getCanRunManualFocusDesc()).value
	}
	public async setCanRunManualFocus(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCanRunManualFocusDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCanStartLiveview(): Promise<boolean | null> {
		return (await this.getCanStartLiveviewDesc()).value
	}
	public async setCanStartLiveview(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCanStartLiveviewDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCanTakePicture(): Promise<boolean | null> {
		return (await this.getCanTakePictureDesc()).value
	}
	public async setCanTakePicture(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCanTakePictureDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCaptureDelay(): Promise<number | null> {
		return (await this.getCaptureDelayDesc()).value
	}
	public async setCaptureDelay(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCaptureDelayDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getColorMode(): Promise<string | null> {
		return (await this.getColorModeDesc()).value
	}
	public async setColorMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getColorModeDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getColorTemperature(): Promise<number | null> {
		return (await this.getColorTemperatureDesc()).value
	}
	public async setColorTemperature(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getColorTemperatureDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getCompressionSetting(): Promise<number | null> {
		return (await this.getCompressionSettingDesc()).value
	}
	public async setCompressionSetting(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getCompressionSettingDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getContrast(): Promise<number | null> {
		return (await this.getContrastDesc()).value
	}
	public async setContrast(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getContrastDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getDateTime(): Promise<Date | null> {
		return (await this.getDateTimeDesc()).value
	}
	public async setDateTime(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: Date
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getDateTimeDesc(): Promise<ConfigDesc<Date>> {
		return generateUnsupportedConfigDesc()
	}

	public async getDigitalZoom(): Promise<number | null> {
		return (await this.getDigitalZoomDesc()).value
	}
	public async setDigitalZoom(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getDigitalZoomDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getDriveMode(): Promise<DriveMode | null> {
		return (await this.getDriveModeDesc()).value
	}
	public async setDriveMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: DriveMode
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getDriveModeDesc(): Promise<ConfigDesc<DriveMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getExposureComp(): Promise<string | null> {
		return (await this.getExposureCompDesc()).value
	}
	public async setExposureComp(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getExposureCompDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getExposureMeteringMode(): Promise<string | null> {
		return (await this.getExposureMeteringModeDesc()).value
	}
	public async setExposureMeteringMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult<void>> {
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
	public async setExposureMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ExposureMode
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getExposureModeDesc(): Promise<ConfigDesc<ExposureMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFlashMode(): Promise<FlashMode | null> {
		return (await this.getFlashModeDesc()).value
	}
	public async setFlashMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FlashMode
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFlashModeDesc(): Promise<ConfigDesc<FlashMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFocalLength(): Promise<FocalLength | null> {
		return (await this.getFocalLengthDesc()).value
	}
	public async setFocalLength(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocalLength
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFocalLengthDesc(): Promise<ConfigDesc<FocalLength>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFocusDistance(): Promise<number | null> {
		return (await this.getFocusDistanceDesc()).value
	}
	public async setFocusDistance(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFocusDistanceDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFocusMeteringMode(): Promise<FocusMeteringMode | null> {
		return (await this.getFocusMeteringModeDesc()).value
	}
	public async setFocusMeteringMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocusMeteringMode
	): Promise<OperationResult<void>> {
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
	public async setFocusMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocusMode
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFocusModeDesc(): Promise<ConfigDesc<FocusMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getFunctionalMode(): Promise<FunctionalMode | null> {
		return (await this.getFunctionalModeDesc()).value
	}
	public async setFunctionalMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FunctionalMode
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getFunctionalModeDesc(): Promise<ConfigDesc<FunctionalMode>> {
		return generateUnsupportedConfigDesc()
	}

	public async getImageAspect(): Promise<string | null> {
		return (await this.getImageAspectDesc()).value
	}
	public async setImageAspect(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getImageAspectDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getImageQuality(): Promise<string | null> {
		return (await this.getImageQualityDesc()).value
	}
	public async setImageQuality(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getImageQualityDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getImageSize(): Promise<string | null> {
		return (await this.getImageSizeDesc()).value
	}
	public async setImageSize(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getImageSizeDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getIso(): Promise<ISO | null> {
		return (await this.getIsoDesc()).value
	}
	public async setIso(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ISO
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getIsoDesc(): Promise<ConfigDesc<ISO>> {
		return generateUnsupportedConfigDesc()
	}

	public async getLiveviewEnabled(): Promise<boolean | null> {
		return (await this.getLiveviewEnabledDesc()).value
	}
	public async setLiveviewEnabled(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getLiveviewEnabledDesc(): Promise<ConfigDesc<boolean>> {
		return generateUnsupportedConfigDesc()
	}

	public async getLiveviewMagnifyRatio(): Promise<number | null> {
		return (await this.getLiveviewMagnifyRatioDesc()).value
	}
	public async setLiveviewMagnifyRatio(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getLiveviewMagnifyRatioDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getLiveviewSize(): Promise<string | null> {
		return (await this.getLiveviewSizeDesc()).value
	}
	public async setLiveviewSize(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getLiveviewSizeDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getManualFocusOptions(): Promise<ManualFocusOption[] | null> {
		return (await this.getManualFocusOptionsDesc()).value
	}
	public async setManualFocusOptions(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ManualFocusOption
	): Promise<OperationResult<void>> {
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
	public async setModel(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getModelDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getSharpness(): Promise<number | null> {
		return (await this.getSharpnessDesc()).value
	}
	public async setSharpness(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getSharpnessDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getShutterSpeed(): Promise<string | null> {
		return (await this.getShutterSpeedDesc()).value
	}
	public async setShutterSpeed(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getShutterSpeedDesc(): Promise<ConfigDesc<string>> {
		return generateUnsupportedConfigDesc()
	}

	public async getTimelapseInterval(): Promise<number | null> {
		return (await this.getTimelapseIntervalDesc()).value
	}
	public async setTimelapseInterval(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getTimelapseIntervalDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getTimelapseNumber(): Promise<number | null> {
		return (await this.getTimelapseNumberDesc()).value
	}
	public async setTimelapseNumber(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}
	public async getTimelapseNumberDesc(): Promise<ConfigDesc<number>> {
		return generateUnsupportedConfigDesc()
	}

	public async getWhiteBalance(): Promise<WhiteBalance | null> {
		return (await this.getWhiteBalanceDesc()).value
	}
	public async setWhiteBalance(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: WhiteBalance
	): Promise<OperationResult<void>> {
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
