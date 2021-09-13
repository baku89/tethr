export interface TethrObject {
	id: number
	storageID: number
	format: string
	byteLength: number
	protectionStatus: number
	thumb: {
		format: string
		compressedSize: number
		width: number
		height: number
	}
	image: {
		width: number
		height: number
		bitDepth: number
	}
	parent: number
	// associationType: number
	// associationDesc: number
	sequenceNumber: number
	filename: string
	captureDate: Date
	modificationDate: Date
	keywords: string
}
