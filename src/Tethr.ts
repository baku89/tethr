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
	FocusPeaking,
	FunctionalMode,
	ISO,
	ManualFocusOption,
	WhiteBalance,
	WritableConfigNameList,
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

export const UnsupportedOperationResult: OperationResult<any> = {
	status: 'unsupported',
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
	abstract open(): Promise<void>
	abstract close(): Promise<void>

	abstract get opened(): boolean

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	setLog(log: boolean) {
		null
	}

	/**
	 * Export all writable configs to a plain object.
	 */
	async exportConfigs(): Promise<Partial<ConfigType>> {
		const configs = await Promise.all(
			WritableConfigNameList.map(async name => {
				const desc = await this.getDesc(name)
				return desc.writable ? ([name, desc.value] as const) : null
			})
		)

		const entries = configs.filter(isntNil)

		return Object.fromEntries(entries)
	}

	/**
	 * Apply all writable configs.
	 */
	async importConfigs(configs: Partial<ConfigType>) {
		const sortedConfigs = Object.entries(configs).sort(([a], [b]) => {
			const ai = WritableConfigNameList.indexOf(a as ConfigName)
			const bi = WritableConfigNameList.indexOf(b as ConfigName)
			return ai - bi
		})

		for (const [name, value] of sortedConfigs) {
			// NOTE: this might be converted to parallel execution in the future
			await this.set(name as ConfigName, value)
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
			case 'focusPeaking':
				return this.setFocusPeaking(value as FocusPeaking)
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
			case 'shutterSound':
				return this.setShutterSound(value as number)
			case 'timelapseInterval':
				return this.setTimelapseInterval(value as number)
			case 'timelapseNumber':
				return this.setTimelapseNumber(value as number)
			case 'whiteBalance':
				return this.setWhiteBalance(value as WhiteBalance)
		}

		return UnsupportedOperationResult
	}

	async getDesc<N extends ConfigName>(
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
			case 'focusPeaking':
				return this.getFocusPeakingDesc() as ReturnType
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
			case 'shutterSound':
				return this.getShutterSoundDesc() as ReturnType
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

	async getAperture(): Promise<Aperture | null> {
		return (await this.getApertureDesc()).value
	}
	async setAperture(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: Aperture
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getApertureDesc(): Promise<ConfigDesc<Aperture>> {
		return UnsupportedConfigDesc
	}

	async getBatteryLevel(): Promise<BatteryLevel | null> {
		return (await this.getBatteryLevelDesc()).value
	}
	async setBatteryLevel(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: BatteryLevel
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getBatteryLevelDesc(): Promise<ConfigDesc<BatteryLevel>> {
		return UnsupportedConfigDesc
	}

	async getBurstInterval(): Promise<number | null> {
		return (await this.getBurstIntervalDesc()).value
	}
	async setBurstInterval(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getBurstIntervalDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getBurstNumber(): Promise<number | null> {
		return (await this.getBurstNumberDesc()).value
	}
	async setBurstNumber(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getBurstNumberDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getCanRunAutoFocus(): Promise<boolean | null> {
		return (await this.getCanRunAutoFocusDesc()).value
	}
	async setCanRunAutoFocus(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanRunAutoFocusDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	async getCanRunManualFocus(): Promise<boolean | null> {
		return (await this.getCanRunManualFocusDesc()).value
	}
	async setCanRunManualFocus(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanRunManualFocusDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	async getCanStartLiveview(): Promise<boolean | null> {
		return (await this.getCanStartLiveviewDesc()).value
	}
	async setCanStartLiveview(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanStartLiveviewDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	async getCanTakePhoto(): Promise<boolean | null> {
		return (await this.getCanTakePhotoDesc()).value
	}
	async setCanTakePhoto(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCanTakePhotoDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	async getCaptureDelay(): Promise<number | null> {
		return (await this.getCaptureDelayDesc()).value
	}
	async setCaptureDelay(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCaptureDelayDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getColorMode(): Promise<string | null> {
		return (await this.getColorModeDesc()).value
	}
	async setColorMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getColorModeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getColorTemperature(): Promise<number | null> {
		return (await this.getColorTemperatureDesc()).value
	}
	async setColorTemperature(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getColorTemperatureDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getCompressionSetting(): Promise<number | null> {
		return (await this.getCompressionSettingDesc()).value
	}
	async setCompressionSetting(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getCompressionSettingDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getContrast(): Promise<number | null> {
		return (await this.getContrastDesc()).value
	}
	async setContrast(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getContrastDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getDateTime(): Promise<Date | null> {
		return (await this.getDateTimeDesc()).value
	}
	async setDateTime(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: Date
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDateTimeDesc(): Promise<ConfigDesc<Date>> {
		return UnsupportedConfigDesc
	}

	async getDestinationToSave(): Promise<string | null> {
		return (await this.getDestinationToSaveDesc()).value
	}
	async setDestinationToSave(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDestinationToSaveDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getDigitalZoom(): Promise<number | null> {
		return (await this.getDigitalZoomDesc()).value
	}
	async setDigitalZoom(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDigitalZoomDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getDriveMode(): Promise<DriveMode | null> {
		return (await this.getDriveModeDesc()).value
	}
	async setDriveMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: DriveMode
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getDriveModeDesc(): Promise<ConfigDesc<DriveMode>> {
		return UnsupportedConfigDesc
	}

	async getExposureComp(): Promise<string | null> {
		return (await this.getExposureCompDesc()).value
	}
	async setExposureComp(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getExposureCompDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getExposureMeteringMode(): Promise<ExposureMeteringMode | null> {
		return (await this.getExposureMeteringModeDesc()).value
	}
	async setExposureMeteringMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getExposureMeteringModeDesc(): Promise<
		ConfigDesc<ExposureMeteringMode>
	> {
		return UnsupportedConfigDesc
	}

	async getExposureMode(): Promise<ExposureMode | null> {
		return (await this.getExposureModeDesc()).value
	}
	async setExposureMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ExposureMode
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getExposureModeDesc(): Promise<ConfigDesc<ExposureMode>> {
		return UnsupportedConfigDesc
	}

	async getFacingMode(): Promise<string | null> {
		return (await this.getFacingModeDesc()).value
	}
	async setFacingMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFacingModeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getFlashMode(): Promise<FlashMode | null> {
		return (await this.getFlashModeDesc()).value
	}
	async setFlashMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FlashMode
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFlashModeDesc(): Promise<ConfigDesc<FlashMode>> {
		return UnsupportedConfigDesc
	}

	async getFocalLength(): Promise<FocalLength | null> {
		return (await this.getFocalLengthDesc()).value
	}
	async setFocalLength(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocalLength
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocalLengthDesc(): Promise<ConfigDesc<FocalLength>> {
		return UnsupportedConfigDesc
	}

	async getFocusDistance(): Promise<number | null> {
		return (await this.getFocusDistanceDesc()).value
	}
	async setFocusDistance(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusDistanceDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getFocusMeteringMode(): Promise<FocusMeteringMode | null> {
		return (await this.getFocusMeteringModeDesc()).value
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

	async getFocusMode(): Promise<FocusMode | null> {
		return (await this.getFocusModeDesc()).value
	}
	async setFocusMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocusMode
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusModeDesc(): Promise<ConfigDesc<FocusMode>> {
		return {
			writable: false,
			value: null,
		}
	}

	async getFocusPeaking(): Promise<FocusPeaking | null> {
		return (await this.getFocusPeakingDesc()).value
	}
	async setFocusPeaking(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FocusPeaking
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFocusPeakingDesc(): Promise<ConfigDesc<FocusPeaking>> {
		return {
			writable: false,
			value: null,
		}
	}

	async getFunctionalMode(): Promise<FunctionalMode | null> {
		return (await this.getFunctionalModeDesc()).value
	}
	async setFunctionalMode(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: FunctionalMode
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getFunctionalModeDesc(): Promise<ConfigDesc<FunctionalMode>> {
		return UnsupportedConfigDesc
	}

	async getImageAspect(): Promise<string | null> {
		return (await this.getImageAspectDesc()).value
	}
	async setImageAspect(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getImageAspectDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getImageQuality(): Promise<string | null> {
		return (await this.getImageQualityDesc()).value
	}
	async setImageQuality(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getImageQualityDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getImageSize(): Promise<string | null> {
		return (await this.getImageSizeDesc()).value
	}
	async setImageSize(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getImageSizeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getIso(): Promise<ISO | null> {
		return (await this.getIsoDesc()).value
	}
	async setIso(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: ISO
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getIsoDesc(): Promise<ConfigDesc<ISO>> {
		return UnsupportedConfigDesc
	}

	async getLiveviewEnabled(): Promise<boolean | null> {
		return (await this.getLiveviewEnabledDesc()).value
	}
	async setLiveviewEnabled(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: boolean
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveviewEnabledDesc(): Promise<ConfigDesc<boolean>> {
		return UnsupportedConfigDesc
	}

	async getLiveviewMagnifyRatio(): Promise<number | null> {
		return (await this.getLiveviewMagnifyRatioDesc()).value
	}
	async setLiveviewMagnifyRatio(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveviewMagnifyRatioDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getLiveviewSize(): Promise<string | null> {
		return (await this.getLiveviewSizeDesc()).value
	}
	async setLiveviewSize(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveviewSizeDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getManualFocusOptions(): Promise<ManualFocusOption[] | null> {
		return (await this.getManualFocusOptionsDesc()).value
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

	async getManufacturer(): Promise<string | null> {
		return (await this.getManufacturerDesc()).value
	}
	async setManufacturer(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getManufacturerDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getModel(): Promise<string | null> {
		return (await this.getModelDesc()).value
	}
	async setModel(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getModelDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getSerialNumber(): Promise<string | null> {
		return (await this.getSerialNumberDesc()).value
	}
	async setSerialNumber(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getSerialNumberDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getSharpness(): Promise<number | null> {
		return (await this.getSharpnessDesc()).value
	}
	async setSharpness(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getSharpnessDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getShutterSpeed(): Promise<string | null> {
		return (await this.getShutterSpeedDesc()).value
	}
	async setShutterSpeed(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: string
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getShutterSpeedDesc(): Promise<ConfigDesc<string>> {
		return UnsupportedConfigDesc
	}

	async getShutterSound(): Promise<number | null> {
		return (await this.getShutterSoundDesc()).value
	}
	async setShutterSound(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getShutterSoundDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getTimelapseInterval(): Promise<number | null> {
		return (await this.getTimelapseIntervalDesc()).value
	}
	async setTimelapseInterval(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getTimelapseIntervalDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getTimelapseNumber(): Promise<number | null> {
		return (await this.getTimelapseNumberDesc()).value
	}
	async setTimelapseNumber(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: number
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getTimelapseNumberDesc(): Promise<ConfigDesc<number>> {
		return UnsupportedConfigDesc
	}

	async getWhiteBalance(): Promise<WhiteBalance | null> {
		return (await this.getWhiteBalanceDesc()).value
	}
	async setWhiteBalance(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		value: WhiteBalance
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getWhiteBalanceDesc(): Promise<ConfigDesc<WhiteBalance>> {
		return UnsupportedConfigDesc
	}

	// Actions
	async runAutoFocus(): Promise<OperationResult> {
		return UnsupportedOperationResult
	}

	async runManualFocus(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		option: ManualFocusOption
	): Promise<OperationResult> {
		return UnsupportedOperationResult
	}

	async takePhoto(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		option?: TakePhotoOption
	): Promise<OperationResult<TethrObject[]>> {
		return {status: 'unsupported'}
	}

	async startLiveview(): Promise<OperationResult<MediaStream>> {
		return {status: 'unsupported'}
	}
	async stopLiveview(): Promise<OperationResult> {
		return UnsupportedOperationResult
	}
	async getLiveViewImage(): Promise<OperationResult<Blob>> {
		return {status: 'unsupported'}
	}
}
