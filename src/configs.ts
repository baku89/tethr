import {BiMap} from 'bim'

export type Aperture = 'auto' | number

export type ISO = 'auto' | number

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

export type FunctionalMode = 'standard' | 'sleep'

export type FocusMode = 'af' | 'mf'

export type FlashMode =
	| 'auto'
	| 'off'
	| 'fill'
	| 'red eye auto'
	| 'red eye fill'
	| 'external sync'

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

export type ExposureMeteringMode =
	| 'average'
	| 'center-weighted-average'
	| 'multi-spot'
	| 'center-spot'

export type DriveMode = 'normal' | 'burst' | 'timelapse'

export type FocusMeteringMode = 'center-spot' | 'multi-spot'

export type FocalLength = number | 'spherical'

export type ManualFocusOption = `${'near' | 'far'}:${1 | 2 | 3}`

export type ConfigType = {
	model: string

	batteryLevel: BatteryLevel
	functionalMode: FunctionalMode
	compressionSetting: number

	imageSize: string // e.g. L, M, S, 1024x768...
	imageQuality: string // Added e.g. JPEG, JPEG+RAW...
	imageAspect: string // Added e.g. 16:9, 3:2...

	whiteBalance: WhiteBalance
	rgbGain: [number, number, number]
	colorTemperature: number // Added
	aperture: number // fNumber
	focalLength: FocalLength
	focusDistance: number
	focusMode: FocusMode
	exposureMeteringMode: ExposureMeteringMode
	flashMode: FlashMode
	// exposureTime: number
	shutterSpeed: string
	exposureMode: ExposureMode // exposureProgramMode
	// exposureIndex: 0x500f
	exposureComp: string // exposureBiasCompensation
	dateTime: Date
	captureDelay: number
	driveMode: DriveMode // stillCaptureMode
	contrast: number
	sharpness: number
	digitalZoom: number
	colorMode: string
	burstNumber: number
	burstInterval: number
	timelapseNumber: number
	timelapseInterval: number
	focusMeteringMode: FocusMeteringMode
	uploadURL: string
	artist: string
	copyrightInfo: string
	iso: ISO // added

	// Actions
	canTakePicture: boolean
	canRunAutoFocus: boolean
	canRunManualFocus: boolean
	canStartLiveview: boolean

	manualFocusOptions: ManualFocusOption[] // added for runManualFocus

	liveviewEnabled: boolean // added
	liveviewMagnifyRatio: number // added
	liveviewSize: string // ad

	[v: `0x${string}`]: any
}

// Table
export const ConfigForDevicePropTable = new BiMap<number, keyof ConfigType>([
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
