export interface DeviceInfo {
	StandardVersion: number
	VendorExtensionID: number
	VendorExtensionVersion: number
	VendorExtensionDesc: string
	FunctionalMode: number
	OperationsSupported: string[]
	EventsSupported: string[]
	DevicePropertiesSupported: string[]
	CaptureFormats: string[]
	ImageFormats: string[]
	Manufacturer: string
	Model: string
	DeviceVersion: string
	SerialNumber: string
}
