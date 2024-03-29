import {BiMap} from 'bim'
import {vec2} from 'linearly'

/**
 * Aperture value. `'auto'` means auto aperture.
 * @example `'auto', 5.6, 9`
 */
export type Aperture = 'auto' | number

/**
 * Battery level represented as a number between `0` and `100`. `100` means full battery.
 * . `'ac'` means AC power, `'low'` means low battery.
 */
export type BatteryLevel = 'ac' | 'low' | number

export type DriveMode = 'normal' | 'burst' | 'timelapse'

export type ExposureMeteringMode =
	| 'average'
	| 'center-weighted-average'
	| 'multi-spot'
	| 'center-spot'

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

export type FlashMode =
	| 'auto'
	| 'off'
	| 'fill'
	| 'red eye auto'
	| 'red eye fill'
	| 'external sync'

export type FocusMode = 'af' | 'mf'

export type FunctionalMode = 'standard' | 'sleep'

export type FocusMeteringMode =
	| 'center spot'
	| 'multi spot'
	| `vendor:${string}`

/**
 * Focus peaking mode. `false` means disabled.
 */
export type FocusPeaking = false | string

export type FocalLength = number | 'spherical'

export type ISO = 'auto' | number

export type ManualFocusOption = `${'near' | 'far'}:${1 | 2 | 3}`

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
	aperture: Aperture // fNumber
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
	colorMode: string
	colorTemperature: number // Added
	contrast: number
	dateTime: Date
	destinationToSave: string
	digitalZoom: number
	driveMode: DriveMode // stillCaptureMode
	exposureComp: string // exposureBiasCompensation
	exposureMeteringMode: ExposureMeteringMode
	exposureMode: ExposureMode // exposureProgramMode
	facingMode: string
	flashMode: FlashMode
	focalLength: FocalLength
	focusDistance: number
	focusMeteringMode: FocusMeteringMode
	focusMode: FocusMode
	focusPeaking: FocusPeaking
	functionalMode: FunctionalMode
	imageAspect: string // Added e.g. 16:9, 3:2...
	imageQuality: string // Added e.g. JPEG, JPEG+RAW...
	imageSize: string // e.g. L, M, S, 1024x768...
	iso: ISO // added
	liveviewEnabled: boolean // added
	liveviewMagnifyRatio: number // added
	liveviewSize: string // ad
	manualFocusOptions: ManualFocusOption[]
	manufacturer: string
	model: string
	serialNumber: string
	sharpness: number
	shutterSpeed: string
	shutterSound: number
	timelapseInterval: number
	timelapseNumber: number
	whiteBalance: WhiteBalance
}

export type ConfigName = keyof ConfigType

/**
 * All settable config list for `Tethr.{exportConfigs,importConfigs}()`. The list is sorted to ensure that all configs are correctly set. For example, `exposureMode` must be set before `shutterSpeed` and `aperture`.
 */
export const ConfigNameList: ConfigName[] = [
	// Exposure settings
	'exposureMode',
	'aperture',
	'shutterSpeed',

	// White balance
	'whiteBalance',
	'colorTemperature',

	// Focus-related configs
	'focusMode',
	'focalLength',
	'focusMeteringMode',
	'focusDistance',

	// Misc
	'burstInterval',
	'burstNumber',
	'captureDelay',
	'colorMode',
	'contrast',
	'dateTime',
	'destinationToSave',
	'digitalZoom',
	'driveMode',
	'exposureComp',
	'exposureMeteringMode',
	'facingMode',
	'flashMode',
	'focusPeaking',
	'functionalMode',
	'imageAspect',
	'imageQuality',
	'imageSize',
	'iso',
	'liveviewEnabled',
	'liveviewMagnifyRatio',
	'liveviewSize',
	'sharpness',
	'shutterSound',
	'timelapseInterval',
	'timelapseNumber',
]

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

// Utility functions
export function computeShutterSpeedSeconds(ss: string) {
	if (ss === 'bulk' || ss === 'sync') {
		return Infinity
	}

	if (ss.includes('/')) {
		const [fraction, denominator] = ss.split('/')
		return parseInt(fraction) / parseInt(denominator)
	}

	return parseFloat(ss)
}
