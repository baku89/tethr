import {ConfigName} from 'tethr'

/** A curated, ordered subset of the configs (mirrors koma's CameraControl). */
export const CameraConfigs: Partial<
	Record<ConfigName, {label: string; icon: string; hint?: string}>
> = {
	exposureMode: {
		label: 'Mode',
		icon: 'material-symbols:settings-photo-camera',
		hint: 'Exposure mode (P / A / S / M)',
	},
	exposureComp: {
		label: 'Exp.',
		icon: 'material-symbols:exposure',
		hint: 'Exposure compensation',
	},
	focalLength: {label: 'F.L.', icon: 'lucide:focus', hint: 'Focal length'},
	focusMode: {label: 'Focus', icon: 'mdi:focus-auto', hint: 'Focus mode'},
	focusDistance: {
		label: 'F.D.',
		icon: 'tabler:frustum',
		hint: 'Focus distance',
	},
	aperture: {label: 'Apr.', icon: 'ph:aperture', hint: 'Aperture'},
	shutterSpeed: {
		label: 'SS',
		icon: 'material-symbols:shutter-speed',
		hint: 'Shutter speed',
	},
	whiteBalance: {label: 'WB', icon: 'subway:black-white', hint: 'White balance'},
	colorTemperature: {
		label: 'C.Temp.',
		icon: 'mdi:temperature',
		hint: 'Color temperature',
	},
	iso: {label: 'ISO', icon: 'carbon:iso', hint: 'ISO sensitivity'},
	imageQuality: {label: 'Quality', icon: 'mdi:image', hint: 'Image quality'},
	colorMode: {label: 'Color', icon: 'mdi:palette', hint: 'Color mode'},
	imageAspect: {
		label: 'Aspect',
		icon: 'mdi:aspect-ratio',
		hint: 'Image aspect ratio',
	},
	destinationToSave: {
		label: 'Save',
		icon: 'mdi:content-save',
		hint: 'Destination to save captures',
	},
	focusPeaking: {
		label: 'Peaking',
		icon: 'material-symbols:center-focus-strong',
		hint: 'Focus peaking',
	},
	liveviewMagnifyRatio: {
		label: 'LV Zoom',
		icon: 'material-symbols:zoom-in',
		hint: 'Live view magnification',
	},
}

export const CameraConfigNames = Object.keys(CameraConfigs) as ConfigName[]

export const ManualFocusSteps: {option: any; icon: string; label: string}[] = [
	{option: 'far:3', icon: 'mdi:chevron-triple-up', label: 'far ×3'},
	{option: 'far:2', icon: 'mdi:chevron-double-up', label: 'far ×2'},
	{option: 'far:1', icon: 'mdi:chevron-up', label: 'far ×1'},
	{option: 'near:1', icon: 'mdi:chevron-down', label: 'near ×1'},
	{option: 'near:2', icon: 'mdi:chevron-double-down', label: 'near ×2'},
	{option: 'near:3', icon: 'mdi:chevron-triple-down', label: 'near ×3'},
]
