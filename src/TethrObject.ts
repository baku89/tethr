export interface TethrObjectInfo {
	id: number
	storageID: number
	format: string | number
	byteLength: number
	protectionStatus: number
	thumb: {
		format: string | number
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

export type TethrObject = TethrObjectInfo & {
	blob: Blob
}
