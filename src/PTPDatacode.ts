type Table = Record<number, string>

class PTPDatacode {
	private nameToCode: Record<string, number>

	public constructor(private table: Record<number, string>) {
		this.nameToCode = Object.fromEntries(
			Object.entries(table).map(([code, name]) => [name, parseInt(code)])
		)
	}

	public for = (name: string): number => {
		return this.nameToCode[name]
	}

	public nameFor = (code: number): string => {
		if (code in this.table) {
			return this.table[code]
		} else {
			return '0x' + ('0000' + code.toString(16)).slice(-4)
		}
	}
}

export const OpCode = new PTPDatacode({
	0x1000: 'Undefined',
	0x1001: 'GetDeviceInfo',
	0x1002: 'OpenSession',
	0x1003: 'CloseSession',
	0x1004: 'GetStorageIDs',
	0x1005: 'GetStorageInfo',
	0x1006: 'GetNumObjects',
	0x1007: 'GetObjectHandles',
	0x1008: 'GetObjectInfo',
	0x1009: 'GetObject',
	0x100a: 'GetThumb',
	0x100b: 'DeleteObject',
	0x100c: 'SendObjectInfo',
	0x100d: 'SendObject',
	0x100e: 'InitiateCapture',
	0x100f: 'FormatStore',
	0x1010: 'ResetDevice',
	0x1011: 'SelfTest',
	0x1012: 'SetObjectProtection',
	0x1013: 'PowerDown',
	0x1014: 'GetDevicePropDesc',
	0x1015: 'GetDevicePropValue',
	0x1016: 'SetDevicePropValue',
	0x1017: 'ResetDevicePropValue',
	0x1018: 'TerminateOpenCapture',
	0x1019: 'MoveObject',
	0x101a: 'CopyObject',
	0x101b: 'GetPartialObject',
	0x101c: 'InitiateOpenCapture',
})

export const ResCode = new PTPDatacode({
	0x2000: 'Undefined',
	0x2001: 'OK',
	0x2002: 'General Error',
	0x2003: 'Session Not Open',
	0x2004: 'Invalid TransactionID',
	0x2005: 'Operation Not Supported',
	0x2006: 'Parameter Not Supported',
	0x2007: 'Incomplete Transfer',
	0x2008: 'Invalid StorageID',
	0x2009: 'Invalid ObjectHandle',
	0x200a: 'DeviceProp Not Supported',
	0x200b: 'Invalid ObjectFormatCode',
	0x200c: 'Store Full',
	0x200d: 'Object WriteProtected',
	0x200e: 'Store Read-Only',
	0x200f: 'Access Denied',
	0x2010: 'No Thumbnail Present',
	0x2011: 'SelfTest Failed',
	0x2012: 'Partial Deletion',
	0x2013: 'Store Not Available',
	0x2014: 'Specification By Format Unsupported',
	0x2015: 'No Valid ObjectInfo',
	0x2016: 'Invalid Code Format',
	0x2017: 'Unknown Vendor Code',
	0x2018: 'Capture Already Terminated',
	0x2019: 'Device Busy',
	0x201a: 'Invalid ParentObject',
	0x201b: 'Invalid DeviceProp Format',
	0x201c: 'Invalid DeviceProp Value',
	0x201d: 'Invalid Parameter',
	0x201e: 'Session Already Open',
	0x201f: 'Transaction Cancelled',
	0x2020: 'Specification of Destination Unsupported',
})

export const EventCode = new PTPDatacode({
	0x4000: 'Undefined',
	0x4001: 'CancelTransaction',
	0x4002: 'ObjectAdded',
	0x4003: 'ObjectRemoved',
	0x4004: 'StoreAdded',
	0x4005: 'StoreRemoved',
	0x4006: 'DevicePropChanged',
	0x4007: 'ObjectInfoChanged',
	0x4008: 'DeviceInfoChanged',
	0x4009: 'RequestObjectTransfer',
	0x400a: 'StoreFull',
	0x400b: 'DeviceReset',
	0x400c: 'StorageInfoChanged',
	0x400d: 'CaptureComplete',
	0x400e: 'UnreportedStatus',
})

export const ObjectFormatCode = new PTPDatacode({
	0x3000: 'Undefined',
	0x3001: 'Association',
	0x3002: 'Script',
	0x3003: 'Executable',
	0x3004: 'Text',
	0x3005: 'HTML',
	0x3006: 'DPOF',
	0x3007: 'AIFF',
	0x3008: 'WAV',
	0x3009: 'MP3',
	0x300a: 'AVI',
	0x300b: 'MPEG',
	0x300c: 'ASF',
	0x3800: 'Undefined',
	0x3801: 'EXIF/JPEG',
	0x3802: 'TIFF/EP',
	0x3803: 'FlashPix',
	0x3804: 'BMP',
	0x3805: 'CIFF',
	0x3806: 'Undefined',
	0x3807: 'GIF',
	0x3808: 'JFIF',
	0x3809: 'PCD',
	0x380a: 'PICT',
	0x380b: 'PNG',
	0x380c: 'Undefined',
	0x380d: 'TIFF',
	0x380e: 'TIFF/IT',
	0x380f: 'JP2',
	0x3810: 'JPX',

	0x300d: 'Apple Quicktime',
})

export const DevicePropCode = new PTPDatacode({
	0x5000: 'Undefined',
	0x5001: 'BatteryLevel',
	0x5002: 'FunctionalMode',
	0x5003: 'ImageSize',
	0x5004: 'CompressionSetting',
	0x5005: 'WhiteBalance',
	0x5006: 'RGB Gain',
	0x5007: 'F-Number',
	0x5008: 'FocalLength',
	0x5009: 'FocusDistance',
	0x500a: 'FocusMode',
	0x500b: 'ExposureMeteringMode',
	0x500c: 'FlashMode',
	0x500d: 'ExposureTime',
	0x500e: 'ExposureProgramMode',
	0x500f: 'ExposureIndex',
	0x5010: 'ExposureBiasCompensation',
	0x5011: 'DateTime',
	0x5012: 'CaptureDelay',
	0x5013: 'StillCaptureMode',
	0x5014: 'Contrast',
	0x5015: 'Sharpness',
	0x5016: 'DigitalZoom',
	0x5017: 'EffectMode',
	0x5018: 'BurstNumber',
	0x5019: 'BurstInterval',
	0x501a: 'TimelapseNumber',
	0x501b: 'TimelapseInterval',
	0x501c: 'FocusMeteringMode',
	0x501d: 'UploadURL',
	0x501e: 'Artist',
	0x501f: 'CopyrightInfo',
})
