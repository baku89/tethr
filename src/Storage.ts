export interface Storage {
	id: number
	type: string
	filesystemType: string
	accessCapability: string
	maxCapability: bigint
	freeSpaceInBytes: bigint
	freeSpaceInImages: number
	description: string
	label: string
}
