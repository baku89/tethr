import {DevicePropCode, OpCode} from '../PTPDatacode'
import {PTPDecoder} from '../PTPDecoder'
import {PTPDevice} from '../PTPDevice'
import {
	PTPAccessCapability,
	PTPFilesystemType,
	PTPStorageType,
} from '../PTPEnum'

export type ISO = 'auto' | number

export enum DriveMode {
	Unknown = 'Unknown',
	P = 'P',
	A = 'A',
	S = 'S',
	M = 'M',
}

export class CameraControl {
	protected _opened = false

	public constructor(protected device: PTPDevice) {}

	public get opened(): boolean {
		return this._opened
	}

	public async open(): Promise<void> {
		await this.device.connect()

		await this.device.performTransaction({
			label: 'Open Session',
			opcode: OpCode.for('OpenSession'),
			parameters: [0x1],
		})

		this._opened = true
	}

	public close = async (): Promise<void> => {
		this._opened = false

		await this.device.performTransaction({
			label: 'Close Session',
			opcode: OpCode.for('CloseSession'),
		})
		await this.device.close()
	}

	public getDeviceInfo = this.device.getInfo

	public getStorageInfo = async (): Promise<void> => {
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

	public getFocalLength = async (): Promise<number> => {
		return NaN
	}

	public getDriveMode = async (): Promise<DriveMode> => {
		return DriveMode.Unknown
	}

	public getBatteryLevel = async (): Promise<number> => {
		const desc = await this.getDevicePropDesc('BatteryLevel')

		console.log('batteryLevel=', desc)

		return 100
	}

	public takePicture = async (): Promise<void> => {
		await this.device.performTransaction({
			label: 'Shutter',
			opcode: 0x9404,
			parameters: [0x3000011],
		})
	}

	public getDevicePropDesc = async (deviceProp: string): Promise<any> => {
		const info = await this.device.getInfo()

		if (!info.DevicePropertiesSupported.includes(deviceProp)) {
			return null
		}

		const res = await this.device.performTransaction({
			label: 'GetDevicePropDesc',
			opcode: OpCode.for('GetDevicePropDesc'),
			parameters: [DevicePropCode.for(deviceProp)],
		})

		if (!res.data) return null

		const decoder = new PTPDecoder(res.data)

		const devicePropCode = decoder.getUint16().toString(16)
		const dataType = decoder.getUint16()
		const getSet = decoder.getUint8()

		let getValue: () => number = decoder.getUint8

		if (dataType === 0x0002) {
			getValue = decoder.getUint8
		}

		const factoryDefaultValue = getValue()
		const currentValue = getValue()

		const desc = {
			devicePropCode,
			dataType,
			getSet,
			factoryDefaultValue,
			currentValue,
			range: {min: NaN, max: NaN, step: NaN},
		}

		// Read form
		const formFlag = getValue()

		if (formFlag === 0x01) {
			const range = {
				min: getValue(),
				max: getValue(),
				step: getValue(),
			}
			desc.range = range
		}

		return desc
	}
}
