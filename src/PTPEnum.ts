export enum PTPStorageType {
	Undefined = 0x0000,
	FixedROM = 0x0001,
	RemovableROM = 0x0002,
	FixedRAM = 0x0003,
	RemovableRAM = 0x0004,
}

export enum PTPFilesystemType {
	Undefined = 0x0000,
	GenericFlat = 0x0001,
	GenericHierarchical = 0x0002,
	DCF = 0x0003,
}

export enum PTPAccessCapability {
	ReadWrite = 0x0000,
	ReadOnlyWithoutObjectDeletion = 0x0001,
	ReadOnlyWithObjectDeletion = 0x0002,
}
