export interface DeviceInfo {
	StandardVersion: number
	VendorExtensionID: number
	VendorExtensionVersion: number
	VendorExtensionDesc: string
	FunctionalMode: number
	OperationsSupported: number[]
	EventsSupported: number[]
	DevicePropertiesSupported: number[]
	CaptureFormats: number[]
	ImageFormats: number[]
	Manufacturer: string
	Model: string
	DeviceVersion: string
	SerialNumber: string
}
