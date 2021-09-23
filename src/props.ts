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

export type BatteryLevel = 'ac' | 'low' | number

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

export type RunManualFocusOption = {
	direction: 'near' | 'far'
	speed: 1 | 2 | 3
}

export interface PropType {
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
}

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
