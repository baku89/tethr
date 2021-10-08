import {BiMap} from 'bim'

export type Aperture = 'auto' | number

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
	| `vendor ${string}`

export type FlashMode =
	| 'auto'
	| 'off'
	| 'fill'
	| 'red eye auto'
	| 'red eye fill'
	| 'external sync'

export type FocusMode = 'af' | 'mf'

export type FunctionalMode = 'standard' | 'sleep'

export type FocusMeteringMode = 'center-spot' | 'multi-spot'

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
	| `manual${'' | 2 | 3 | 4}`
	| `custom${'' | 2 | 3 | 4}`
	| `vendor ${string}`

export type ConfigType = {
	aperture: Aperture // fNumber
	batteryLevel: BatteryLevel
	burstInterval: number
	burstNumber: number
	canRunAutoFocus: boolean
	canRunManualFocus: boolean
	canStartLiveview: boolean
	canTakePicture: boolean
	captureDelay: number
	colorMode: string
	colorTemperature: number // Added
	contrast: number
	dateTime: Date
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
	sharpness: number
	shutterSpeed: string
	timelapseInterval: number
	timelapseNumber: number
	whiteBalance: WhiteBalance
}

export type ConfigName = keyof ConfigType

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
