export interface TethrStorage {
	id: number
	type?: string
	filesystemType?: string
	accessCapability?: string
	maxCapability?: bigint
	freeSpaceInBytes?: bigint
	freeSpaceInImages?: number
	description?: string
	label?: string
}
