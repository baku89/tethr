import {BiMap} from 'bim'
import {vec2} from 'linearly'

/**
 * Aperture value. `'auto'` means auto aperture. The corresponding property in PTP spec is `fNumber`.
 * @example `'auto', 5.6, 9`
 * @category Config
 */
export type Aperture = 'auto' | number

/**
 * Battery level represented as a number between `0` and `100`. `100` means full battery.
 * . `'ac'` means AC power, `'low'` means low battery.
 * @ccategory Config
 */
export type BatteryLevel = 'ac' | 'low' | number

/**
 * Color mode.
 * @category Config
 */
export type ColorMode = string

/**
 * Drive mode. The corresponding property in PTP spec is `stillCaptureMode`.
 * @category Config
 */
export type DriveMode = 'normal' | 'burst' | 'timelapse'

/**
 * Exposure bias compensation.
 * @example `'-5', '0', '1 1/3'`
 * @category Config
 */
export type ExposureComp = string

/**
 * Exposure metering mode.
 * @category Config
 */
export type ExposureMeteringMode =
	| 'average'
	| 'center-weighted-average'
	| 'multi-spot'
	| 'center-spot'

/**
 * Exposure program mode. The corresponding property in PTP spec is `exposureProgramMode`.
 * @category Config
 */
export type ExposureMode =
	| 'P'
	| 'A'
	| 'S'
	| 'M'
	| 'creative'
	| 'action'
	| 'portrait'
	| 'video'
	| `C${1 | 2 | 3}`
	| `vendor:${string}`

/**
 * Color mode.
 * @category Config
 */
export type FlashMode =
	| 'auto'
	| 'off'
	| 'fill'
	| 'red eye auto'
	| 'red eye fill'
	| 'external sync'

/**
 * Focus mode.
 * @category Config
 */
export type FocusMode = 'af' | 'mf'

/**
 * Functional mode. `'standard'` means normal mode, `'sleep'` means sleep mode.
 * @category Config
 */
export type FunctionalMode = 'standard' | 'sleep'

export type FocusMeteringMode =
	| 'center spot'
	| 'multi spot'
	| `vendor:${string}`

/**
 * Focus peaking mode. This usually corresponds to the color of the peaking. `false` means disabled.
 * @example `false, 'red', 'white'`
 * @category Config
 */
export type FocusPeaking = false | string

/**
 * Focal length in millimeters. Note that it is not 35mm equivalent focal length.
 * @category Config
 */
export type FocalLength = number | 'spherical'

/**
 * Image aspect.
 * @example `'3:2', '16:9', 'a size'`
 * @category Config
 */
export type ImageAspect = `${number}:${number}` | 'a size'

/**
 * Image quality.
 * @category Config
 */
export type ImageQuality = string

/**
 * Image size.
 * @example `'L', 'M', 'S'`
 * @category Config
 */
export type ImageSize = string

/**
 * ISO sensitivity.
 * @category Config
 */
export type ISO = 'auto' | number

/**
 * Manual focus option.
 */
export type ManualFocusOption = `${'near' | 'far'}:${1 | 2 | 3}`

/**
 * Shutter speed.
 * @example `'auto', 'bulb', 'sync', '1/100', '15'`
 * @category Config
 */
export type ShutterSpeed =
	| 'auto'
	| 'bulb'
	| 'sync'
	| `${number}/${number}`
	| `${number}`

/**
 * White balance.
 * @category Config
 */
export type WhiteBalance =
	| 'auto'
	| 'auto cool'
	| 'auto warm'
	| 'auto ambience'
	| 'daylight'
	| 'shade'
	| 'cloud'
	| 'incandescent'
	| 'fluorescent'
	| 'tungsten'
	| 'flash'
	| 'underwater'
	| 'manual'
	| 'custom'
	| `vendor:${string}`

export type ConfigType = {
	aperture: Aperture
	autoFocusFrameCenter: vec2
	autoFocusFrameSize: string
	batteryLevel: BatteryLevel
	burstInterval: number
	burstNumber: number
	canRunAutoFocus: boolean
	canRunManualFocus: boolean
	canStartLiveview: boolean
	canTakePhoto: boolean
	captureDelay: number
	colorMode: ColorMode
	colorTemperature: number
	contrast: number
	dateTime: Date
	destinationToSave: string
	digitalZoom: number
	driveMode: DriveMode
	exposureComp: ExposureComp
	exposureMeteringMode: ExposureMeteringMode
	exposureMode: ExposureMode
	facingMode: string
	flashMode: FlashMode
	focalLength: FocalLength
	focusDistance: number
	focusMeteringMode: FocusMeteringMode
	focusMode: FocusMode
	focusPeaking: FocusPeaking
	functionalMode: FunctionalMode
	imageAspect: ImageAspect
	imageQuality: ImageQuality
	imageSize: ImageSize
	iso: ISO
	liveview: MediaStream
	liveviewMagnifyRatio: number
	liveviewSize: string
	manualFocusOptions: ManualFocusOption[]
	manufacturer: string
	model: string
	serialNumber: string
	sharpness: number
	shutterSpeed: ShutterSpeed
	shutterSound: number
	timelapseInterval: number
	timelapseNumber: number
	whiteBalance: WhiteBalance
}

export type ConfigName = keyof ConfigType

/**
 * All configuration names in the order of dependencies.
 */
export const ConfigNameList: ConfigName[] = (() => {
	const names: ConfigName[] = [
		'aperture',
		'autoFocusFrameCenter',
		'autoFocusFrameSize',
		'batteryLevel',
		'burstInterval',
		'burstNumber',
		'canRunAutoFocus',
		'canRunManualFocus',
		'canStartLiveview',
		'canTakePhoto',
		'captureDelay',
		'colorMode',
		'colorTemperature',
		'contrast',
		'dateTime',
		'destinationToSave',
		'digitalZoom',
		'driveMode',
		'exposureComp',
		'exposureMeteringMode',
		'exposureMode',
		'facingMode',
		'flashMode',
		'focalLength',
		'focusDistance',
		'focusMeteringMode',
		'focusMode',
		'focusPeaking',
		'functionalMode',
		'imageAspect',
		'imageQuality',
		'imageSize',
		'iso',
		'liveview',
		'liveviewMagnifyRatio',
		'liveviewSize',
		'manualFocusOptions',
		'manufacturer',
		'model',
		'serialNumber',
		'sharpness',
		'shutterSpeed',
		'shutterSound',
		'timelapseInterval',
		'timelapseNumber',
		'whiteBalance',
	]

	const dependencies = new Map<ConfigName, ConfigName[]>([
		['aperture', ['exposureMode']],
		['shutterSpeed', ['exposureMode', 'driveMode', 'iso']],
		['exposureComp', ['exposureMode']],
		['iso', ['exposureMode']],
		['colorTemperature', ['whiteBalance']],
	])

	const sortedNames: ConfigName[] = []

	const set = new Set<ConfigName>()

	const add = (name: ConfigName) => {
		if (set.has(name)) {
			return
		}

		dependencies.get(name)?.forEach(add)

		sortedNames.push(name)
		set.add(name)
	}

	names.forEach(add)

	return sortedNames
})()

// Table
export const ConfigForDevicePropTable = new BiMap<number, ConfigName>([
	[0x5001, 'batteryLevel'],
	[0x5005, 'whiteBalance'],
	[0x5007, 'aperture'],
	[0x5008, 'focalLength'],
	[0x5009, 'focusDistance'],
	[0x500d, 'shutterSpeed'],
	[0x500e, 'exposureMode'],
	[0x500f, 'iso'],
	[0x5010, 'exposureComp'],
	[0x5012, 'captureDelay'],
	[0x5013, 'driveMode'],
	[0x5017, 'colorMode'],
	[0x501a, 'timelapseNumber'],
	[0x501b, 'timelapseInterval'],
])

export const ExposureModeTable = new BiMap<number, ExposureMode>([
	[0x1, 'M'],
	[0x2, 'P'],
	[0x3, 'A'],
	[0x4, 'S'],
	[0x5, 'creative'],
	[0x6, 'action'],
	[0x7, 'portrait'],
])

export const WhiteBalanceTable = new BiMap<number, WhiteBalance>([
	[0x1, 'manual'],
	[0x2, 'auto'],
	[0x3, 'custom'],
	[0x4, 'daylight'],
	[0x5, 'fluorescent'],
	[0x6, 'tungsten'],
])

export const DriveModeTable = new BiMap<number, DriveMode>([
	[0x1, 'normal'],
	[0x2, 'burst'],
	[0x3, 'timelapse'],
])
