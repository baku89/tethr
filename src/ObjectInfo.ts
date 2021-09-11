export interface ObjectInfo {
	objectID: number
	storageID: number
	objectFormat: number
	protectionStatus: number
	objectCompressedSize: number
	thumb: {
		format: number
		compressedSize: number
		width: number
		height: number
	}
	image: {
		width: number
		height: number
		bitDepth: number
	}
	parentObject: number
	associationType: number
	associationDesc: number
	sequenceNumber: number
	filename: string
	captureDate: Date
	modificationDate: Date
	keywords: string
}
