export interface ObjectInfo {
	objectID: number
	storageID: number
	objectFormat: number
	protectionStatus: number
	objectCompressedSize: number
	thumbFormat: number
	thumbCompressedSize: number
	thumbPixWidth: number
	thumbPixHeight: number
	imagePixWidth: number
	imagePixHeight: number
	imageBitDepth: number
	parentObject: number
	associationType: number
	associationDesc: number
	sequenceNumber: number
	filename: string
	captureDate: Date
	modificationDate: Date
	keywords: string
}
