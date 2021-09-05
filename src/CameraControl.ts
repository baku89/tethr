import {
	DevicePropCode,
	EventCode,
	ObjectFormatCode,
	OpCode,
} from './PTPDatacode'
import {PTPDecoder} from './PTPDecoder'
import {PTPDevice} from './PTPDevice'
import {PTPAccessCapability, PTPFilesystemType, PTPStorageType} from './PTPEnum'

export class CameraControl {
	private device: PTPDevice
	private _opened = false

	constructor() {
		this.device = new PTPDevice()
	}

	get opened(): boolean {
		return this._opened
	}

	open = async (): Promise<void> => {
		await this.device.connect()

		await this.device.performTransaction({
			label: 'Open Session',
			opcode: OpCode.for('OpenSession'),
			parameters: [0x1],
		})

		this._opened = true
	}

	getDeviceInfo = async (): Promise<void> => {
		const result = await this.device.performTransaction({
			label: 'GetDeviceInfo',
			opcode: OpCode.for('GetDeviceInfo'),
		})

		if (!result.data) throw new Error()
		const decoder = new PTPDecoder(result.data)

		console.log('deviceInfo=', {
			StandardVersion: decoder.getUint16(),
			VendorExtensionID: decoder.getUint32(),
			VendorExtensionVersion: decoder.getUint16(),
			VendorExtensionDesc: decoder.getString(),
			FunctionalMode: decoder.getUint16(),
			OperationsSupported: decoder.getUint16Array(OpCode.nameFor),
			EventsSupported: decoder.getUint16Array(EventCode.nameFor),
			DevicePropertiesSupported: decoder.getUint16Array(DevicePropCode.nameFor),
			CaptureFormats: decoder.getUint16Array(ObjectFormatCode.nameFor),
			ImageFormats: decoder.getUint16Array(ObjectFormatCode.nameFor),
			Manufacturer: decoder.getString(),
			Model: decoder.getString(),
			DeviceVersion: decoder.getString(),
			SerialNumber: decoder.getString(),
		})
	}

	getStorageInfo = async (): Promise<void> => {
		const result = await this.device.performTransaction({
			label: 'Get Storage IDs',
			opcode: OpCode.for('GetStorageIDs'),
		})
		if (!result.data) throw new Error()
		const decoder = new PTPDecoder(result.data)

		const storageIDs = decoder.getUint32Array()
		console.log('Storage IDs =', storageIDs)

		for (const id of storageIDs) {
			const r = await this.device.performTransaction({
				label: 'GetStorageInfo',
				parameters: [id],
				opcode: OpCode.for('GetStorageInfo'),
			})
			if (!r.data) throw new Error()
			const storageInfo = new PTPDecoder(r.data)

			const info = {
				storageType: PTPStorageType[storageInfo.getUint16()],
				filesystemType: PTPFilesystemType[storageInfo.getUint16()],
				accessCapability: PTPAccessCapability[storageInfo.getUint16()],
				maxCapability: storageInfo.getUint64(),
				freeSpaceInBytes: storageInfo.getUint64(),
				freeSpaceInImages: storageInfo.getUint32(),
			}

			console.log(`Storage info for ${id}=`, info)
		}
	}

	takePicture = async (): Promise<void> => {
		await this.device.performTransaction({
			label: 'Shutter',
			opcode: 0x9404,
			parameters: [0x3000011],
		})
	}

	close = async (): Promise<void> => {
		this._opened = false

		await this.device.performTransaction({
			label: 'Close Session',
			opcode: OpCode.for('CloseSession'),
		})
		await this.device.close()
	}
}
