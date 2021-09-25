export interface DeviceInfo {
	standardVersion: number
	vendorExtensionID: number
	vendorExtensionVersion: number
	vendorExtensionDesc: string
	functionalMode: number
	operationsSupported: number[]
	eventsSupported: number[]
	propsSupported: number[]
	captureFormats: number[]
	imageFormats: number[]
	manufacturer: string
	model: string
	deviceVersion: string
	serialNumber: string
}