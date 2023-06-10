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

export type OperationResult<T = void> = T extends void
	? {status: OperationResultStatus}
	:
			| {status: Exclude<OperationResultStatus, 'ok'>}
			| {
					status: 'ok'
					value: T
			  }

export type ConfigDesc<T> = {
	value: T | null
	writable: boolean
	option?:
		| {type: 'enum'; values: T[]}
		| {type: 'range'; min: T; max: T; step: T}
}

export interface TakePhotoOption {
	download?: boolean
}

type EventTypes = {
	[N in ConfigName as `${N}Changed`]: ConfigDesc<ConfigType[N]>
} & {
	disconnect: void
	liveviewStreamUpdate: MediaStream
}

type ConfigGetters = {
	[N in ConfigName as `get${Capitalize<N>}`]: () => Promise<
		ConfigType[N] | null
	>
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

export function createReadonlyConfigDesc<T>(value: T): ConfigDesc<T> {
	return {
		writable: false,
		value,
	}
}

export abstract class Tethr
	extends EventEmitter<EventTypes>
	implements ConfigGetters, ConfigSetters, ConfigDescGetters
{
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
	): Promise<OperationResult> {
		switch (name) {
			case 'aperture':
				return this.setAperture(value as Aperture)
			case 'batteryLevel':
				return this.setBatteryLevel(value as BatteryLevel)
			case 'burstInterval':
				return this.setBurstInterval(value as number)
			case 'burstNumber':
				return this.setBurstNumber(value as number)
			case 'canRunAutoFocus':
				return this.setCanRunAutoFocus(value as boolean)
			case 'canRunManualFocus':
				return this.setCanRunManualFocus(value as boolean)
			case 'canStartLiveview':
				return this.setCanStartLiveview(value as boolean)
			case 'canTakePhoto':
				return this.setCanTakePhoto(value as boolean)
			case 'captureDelay':
				return this.setCaptureDelay(value as number)
			case 'colorMode':
				return this.setColorMode(value as string)
			case 'colorTemperature':
				return this.setColorTemperature(value as number)
			case 'contrast':
				return this.setContrast(value as number)
			case 'dateTime':
				return this.setDateTime(value as Date)
			case 'destinationToSave':
				return this.setDestinationToSave(value as string)
			case 'digitalZoom':
				return this.setDigitalZoom(value as number)
			case 'driveMode':
				return this.setDriveMode(value as DriveMode)
			case 'exposureComp':
				return this.setExposureComp(value as string)
			case 'exposureMeteringMode':
				return this.setExposureMeteringMode(value as ExposureMeteringMode)
			case 'exposureMode':
				return this.setExposureMode(value as ExposureMode)
			case 'facingMode':
				return this.setFacingMode(value as string)
			case 'flashMode':
				return this.setFlashMode(value as FlashMode)
			case 'focalLength':
				return this.setFocalLength(value as FocalLength)
			case 'focusDistance':
				return this.setFocusDistance(value as number)
			case 'focusMeteringMode':
				return this.setFocusMeteringMode(value as FocusMeteringMode)
			case 'focusMode':
				return this.setFocusMode(value as FocusMode)
			case 'functionalMode':
				return this.setFunctionalMode(value as FunctionalMode)
			case 'imageAspect':
				return this.setImageAspect(value as string)
			case 'imageQuality':
				return this.setImageQuality(value as string)
			case 'imageSize':
				return this.setImageSize(value as string)
			case 'iso':
				return this.setIso(value as ISO)
			case 'liveviewEnabled':
				return this.setLiveviewEnabled(value as boolean)
			case 'liveviewMagnifyRatio':
				return this.setLiveviewMagnifyRatio(value as number)
			case 'liveviewSize':
				return this.setLiveviewSize(value as string)
			case 'manualFocusOptions':
				return this.setManualFocusOptions(value as ManualFocusOption[])
			case 'manufacturer':
				return this.setManufacturer(value as string)
			case 'model':
				return this.setModel(value as string)
			case 'serialNumber':
				return this.setSerialNumber(value as string)
			case 'sharpness':
				return this.setSharpness(value as number)
			case 'shutterSpeed':
				return this.setShutterSpeed(value as string)
			case 'timelapseInterval':
				return this.setTimelapseInterval(value as number)
			case 'timelapseNumber':
				return this.setTimelapseNumber(value as number)
			case 'whiteBalance':
				return this.setWhiteBalance(value as WhiteBalance)
		}

		return {status: 'unsupported'}
	}

	public async getDesc<N extends ConfigName>(
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
			case 'canTakePhoto':
				return this.getCanTakePhotoDesc() as ReturnType
			case 'captureDelay':
				return this.getCaptureDelayDesc() as ReturnType
			case 'colorMode':
				return this.getColorModeDesc() as ReturnType
			case 'colorTemperature':
				return this.getColorTemperatureDesc() as ReturnType
			case 'contrast':
				return this.getContrastDesc() as ReturnType
			case 'dateTime':
				return this.getDateTimeDesc() as ReturnType
			case 'destinationToSave':
				return this.getDestinationToSaveDesc() as ReturnType
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
			case 'facingMode':
				return this.getFacingModeDesc() as ReturnType
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
			case 'manufacturer':
				return this.getManufacturerDesc() as ReturnType
			case 'model':
				return this.getModelDesc() as ReturnType
			case 'serialNumber':
				return this.getSerialNumberDesc() as ReturnType
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
		}
	}

	public async getAperture(): Promise<Aperture | null> {
		return (await this.getApertureDesc()).value
	}
	public async setAperture(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: Aperture
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getApertureDesc(): Promise<ConfigDesc<Aperture>> {
		return UnsupportedConfigDesc
	}

	public async getBatteryLevel(): Promise<BatteryLevel | null> {
		return (await this.getBatteryLevelDesc()).value
	}
	public async setBatteryLevel(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: BatteryLevel
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getBatteryLevelDesc(): Promise<ConfigDesc<BatteryLevel>> {
		return UnsupportedConfigDesc
	}

	public async getBurstInterval(): Promise<number | null> {
		return (await this.getBurstIntervalDesc()).value
	}
	public async setBurstInterval(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getBurstIntervalDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getBurstNumber(): Promise<number | null> {
		return (await this.getBurstNumberDesc()).value
	}
	public async setBurstNumber(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getBurstNumberDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getCanRunAutoFocus(): Promise<boolean | null> {
		return (await this.getCanRunAutoFocusDesc()).value
	}
	public async setCanRunAutoFocus(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getCanRunAutoFocusDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	public async getCanRunManualFocus(): Promise<boolean | null> {
		return (await this.getCanRunManualFocusDesc()).value
	}
	public async setCanRunManualFocus(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getCanRunManualFocusDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	public async getCanStartLiveview(): Promise<boolean | null> {
		return (await this.getCanStartLiveviewDesc()).value
	}
	public async setCanStartLiveview(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getCanStartLiveviewDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	public async getCanTakePhoto(): Promise<boolean | null> {
		return (await this.getCanTakePhotoDesc()).value
	}
	public async setCanTakePhoto(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getCanTakePhotoDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	public async getCaptureDelay(): Promise<number | null> {
		return (await this.getCaptureDelayDesc()).value
	}
	public async setCaptureDelay(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getCaptureDelayDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getColorMode(): Promise<string | null> {
		return (await this.getColorModeDesc()).value
	}
	public async setColorMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getColorModeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getColorTemperature(): Promise<number | null> {
		return (await this.getColorTemperatureDesc()).value
	}
	public async setColorTemperature(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getColorTemperatureDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getCompressionSetting(): Promise<number | null> {
		return (await this.getCompressionSettingDesc()).value
	}
	public async setCompressionSetting(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getCompressionSettingDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getContrast(): Promise<number | null> {
		return (await this.getContrastDesc()).value
	}
	public async setContrast(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getContrastDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getDateTime(): Promise<Date | null> {
		return (await this.getDateTimeDesc()).value
	}
	public async setDateTime(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: Date
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getDateTimeDesc(): Promise<ConfigDesc<Date>> {
		return UnsupportedConfigDesc
	}

	public async getDestinationToSave(): Promise<string | null> {
		return (await this.getDestinationToSaveDesc()).value
	}
	public async setDestinationToSave(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getDestinationToSaveDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getDigitalZoom(): Promise<number | null> {
		return (await this.getDigitalZoomDesc()).value
	}
	public async setDigitalZoom(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getDigitalZoomDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getDriveMode(): Promise<DriveMode | null> {
		return (await this.getDriveModeDesc()).value
	}
	public async setDriveMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: DriveMode
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getDriveModeDesc(): Promise<ConfigDesc<DriveMode>> {
		return UnsupportedConfigDesc
	}

	public async getExposureComp(): Promise<string | null> {
		return (await this.getExposureCompDesc()).value
	}
	public async setExposureComp(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getExposureCompDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getExposureMeteringMode(): Promise<ExposureMeteringMode | null> {
		return (await this.getExposureMeteringModeDesc()).value
	}
	public async setExposureMeteringMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getExposureMeteringModeDesc(): Promise<
		ConfigDesc<ExposureMeteringMode>
	> {
		return UnsupportedConfigDesc
	}

	public async getExposureMode(): Promise<ExposureMode | null> {
		return (await this.getExposureModeDesc()).value
	}
	public async setExposureMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ExposureMode
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getExposureModeDesc(): Promise<ConfigDesc<ExposureMode>> {
		return UnsupportedConfigDesc
	}

	public async getFacingMode(): Promise<string | null> {
		return (await this.getFacingModeDesc()).value
	}
	public async setFacingMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getFacingModeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getFlashMode(): Promise<FlashMode | null> {
		return (await this.getFlashModeDesc()).value
	}
	public async setFlashMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FlashMode
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getFlashModeDesc(): Promise<ConfigDesc<FlashMode>> {
		return UnsupportedConfigDesc
	}

	public async getFocalLength(): Promise<FocalLength | null> {
		return (await this.getFocalLengthDesc()).value
	}
	public async setFocalLength(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocalLength
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getFocalLengthDesc(): Promise<ConfigDesc<FocalLength>> {
		return UnsupportedConfigDesc
	}

	public async getFocusDistance(): Promise<number | null> {
		return (await this.getFocusDistanceDesc()).value
	}
	public async setFocusDistance(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getFocusDistanceDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getFocusMeteringMode(): Promise<FocusMeteringMode | null> {
		return (await this.getFocusMeteringModeDesc()).value
	}
	public async setFocusMeteringMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocusMeteringMode
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getFocusMeteringModeDesc(): Promise<
		ConfigDesc<FocusMeteringMode>
	> {
		return UnsupportedConfigDesc
	}

	public async getFocusMode(): Promise<FocusMode | null> {
		return (await this.getFocusModeDesc()).value
	}
	public async setFocusMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocusMode
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getFocusModeDesc(): Promise<ConfigDesc<FocusMode>> {
		return {
			writable: false,
			value: null,
		}
	}

	public async getFunctionalMode(): Promise<FunctionalMode | null> {
		return (await this.getFunctionalModeDesc()).value
	}
	public async setFunctionalMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FunctionalMode
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getFunctionalModeDesc(): Promise<ConfigDesc<FunctionalMode>> {
		return UnsupportedConfigDesc
	}

	public async getImageAspect(): Promise<string | null> {
		return (await this.getImageAspectDesc()).value
	}
	public async setImageAspect(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getImageAspectDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getImageQuality(): Promise<string | null> {
		return (await this.getImageQualityDesc()).value
	}
	public async setImageQuality(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getImageQualityDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getImageSize(): Promise<string | null> {
		return (await this.getImageSizeDesc()).value
	}
	public async setImageSize(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getImageSizeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getIso(): Promise<ISO | null> {
		return (await this.getIsoDesc()).value
	}
	public async setIso(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ISO
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getIsoDesc(): Promise<ConfigDesc<ISO>> {
		return UnsupportedConfigDesc
	}

	public async getLiveviewEnabled(): Promise<boolean | null> {
		return (await this.getLiveviewEnabledDesc()).value
	}
	public async setLiveviewEnabled(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getLiveviewEnabledDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	public async getLiveviewMagnifyRatio(): Promise<number | null> {
		return (await this.getLiveviewMagnifyRatioDesc()).value
	}
	public async setLiveviewMagnifyRatio(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getLiveviewMagnifyRatioDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getLiveviewSize(): Promise<string | null> {
		return (await this.getLiveviewSizeDesc()).value
	}
	public async setLiveviewSize(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getLiveviewSizeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getManualFocusOptions(): Promise<ManualFocusOption[] | null> {
		return (await this.getManualFocusOptionsDesc()).value
	}
	public async setManualFocusOptions(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ManualFocusOption[]
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getManualFocusOptionsDesc(): Promise<
		ConfigDesc<ManualFocusOption[]>
	> {
		return UnsupportedConfigDesc
	}

	public async getManufacturer(): Promise<string | null> {
		return (await this.getManufacturerDesc()).value
	}
	public async setManufacturer(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getManufacturerDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getModel(): Promise<string | null> {
		return (await this.getModelDesc()).value
	}
	public async setModel(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getModelDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getSerialNumber(): Promise<string | null> {
		return (await this.getSerialNumberDesc()).value
	}
	public async setSerialNumber(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getSerialNumberDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getSharpness(): Promise<number | null> {
		return (await this.getSharpnessDesc()).value
	}
	public async setSharpness(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getSharpnessDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getShutterSpeed(): Promise<string | null> {
		return (await this.getShutterSpeedDesc()).value
	}
	public async setShutterSpeed(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getShutterSpeedDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	public async getTimelapseInterval(): Promise<number | null> {
		return (await this.getTimelapseIntervalDesc()).value
	}
	public async setTimelapseInterval(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getTimelapseIntervalDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getTimelapseNumber(): Promise<number | null> {
		return (await this.getTimelapseNumberDesc()).value
	}
	public async setTimelapseNumber(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getTimelapseNumberDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	public async getWhiteBalance(): Promise<WhiteBalance | null> {
		return (await this.getWhiteBalanceDesc()).value
	}
	public async setWhiteBalance(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: WhiteBalance
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
	public async getWhiteBalanceDesc(): Promise<ConfigDesc<WhiteBalance>> {
		return UnsupportedConfigDesc
	}

	// Actions
	public async runAutoFocus(): Promise<OperationResult> {
		return {status: 'unsupported'}
	}

	public async runManualFocus(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		option: ManualFocusOption
	): Promise<OperationResult> {
		return {status: 'unsupported'}
	}

	public async takePhoto(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		option?: TakePhotoOption
	): Promise<OperationResult<TethrObject[]>> {
		return {status: 'unsupported'}
	}

	public async startLiveview(): Promise<OperationResult<MediaStream>> {
		return {status: 'unsupported'}
	}
	public async stopLiveview(): Promise<OperationResult> {
		return {status: 'unsupported'}
	}
}
