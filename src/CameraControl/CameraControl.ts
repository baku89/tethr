import {DeviceInfo} from '@/DeviceInfo'
import {ObjectInfo} from '@/ObjectInfo'

import {
	DevicePropCode,
	EventCode,
	ObjectFormatCode,
	OpCode,
	ResCode,
} from '../PTPDatacode'
import {PTPDecoder} from '../PTPDecoder'
import {PTPDevice} from '../PTPDevice'
import {
	PTPAccessCapability,
	PTPFilesystemType,
	PTPStorageType,
} from '../PTPEnum'

export type ISO = 'auto' | number

export enum ExposureMode {
	P = 'P',
	A = 'A',
	S = 'S',
	M = 'M',
}

export type BatteryLevel = 'ac' | number

export interface DevicePropDesc<T> {
	currentValue: T
	factoryDefaultValue: T
	getSet: number
	range?: {
		min: T
		max: T
		step: T
	}
}

export class CameraControl {
	protected _opened = false

	public constructor(protected device: PTPDevice) {}

	public get opened(): boolean {
		return this._opened
	}

	public async open(): Promise<void> {
		await this.device.open()

		await this.device.sendCommand({
			label: 'Open Session',
			code: OpCode.for('OpenSession'),
			parameters: [0x1],
			expectedResCodes: [
				ResCode.for('OK'),
				ResCode.for('Session Already Open'),
			],
		})

		this._opened = true
	}

	public close = async (): Promise<void> => {
		this._opened = false

		await this.device.sendCommand({
			label: 'Close Session',
			code: OpCode.for('CloseSession'),
		})
		await this.device.close()
	}

	public getDeviceInfo = async (): Promise<DeviceInfo> => {
		return await CameraControl.getDeviceInfo(this.device)
	}

	public getStorageInfo = async (): Promise<void> => {
		const {data} = await this.device.receiveData({
			label: 'Get Storage IDs',
			code: OpCode.for('GetStorageIDs'),
		})
		const decoder = new PTPDecoder(data)

		const storageIDs = decoder.getUint32Array()
		console.log('Storage IDs =', storageIDs)

		for (const id of storageIDs) {
			const {data} = await this.device.receiveData({
				label: 'GetStorageInfo',
				parameters: [id],
				code: OpCode.for('GetStorageInfo'),
			})

			const storageInfo = new PTPDecoder(data)

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

	public getFocalLength = async (): Promise<null | number> => {
		return null
	}

	public getExposureMode = async (): Promise<null | ExposureMode> => {
		return null
	}

	public getBatteryLevel = async (): Promise<null | BatteryLevel> => {
		const desc = await this.getDevicePropDesc('BatteryLevel')

		if (!desc) return null

		const min = desc.range?.min ?? 0
		const max = desc.range?.max ?? 100
		const value = desc.currentValue

		return (value - min) / (max - min)
	}

	public takePicture = async (): Promise<null | string> => {
		return null
	}

	public getThumb = async (objectID: number): Promise<null> => {
		return null
	}

	public getDevicePropDesc = async (
		deviceProp: string
	): Promise<null | DevicePropDesc<number>> => {
		const info = await this.getDeviceInfo()

		if (!info.DevicePropertiesSupported.includes(deviceProp)) {
			return null
		}

		const {data} = await this.device.receiveData({
			label: 'GetDevicePropDesc',
			code: OpCode.for('GetDevicePropDesc'),
			parameters: [DevicePropCode.for(deviceProp)],
		})

		const decoder = new PTPDecoder(data.slice(2))

		/*const devicePropCode =*/ decoder.getUint16()
		const dataType = decoder.getUint16()
		const getSet = decoder.getUint8()

		let getValue: () => number = decoder.getUint8

		if (dataType === 0x0002) {
			getValue = decoder.getUint8
		}

		const factoryDefaultValue = getValue()
		const currentValue = getValue()

		const desc: DevicePropDesc<number> = {
			getSet,
			factoryDefaultValue,
			currentValue,
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

	protected getObjectInfo = async (objectID: number): Promise<ObjectInfo> => {
		const {data} = await this.device.receiveData({
			label: 'GetObjectInfo',
			code: OpCode.for('GetObjectInfo'),
			parameters: [objectID],
		})

		const decoder = new PTPDecoder(data)

		return {
			objectID,
			storageID: decoder.getUint32(),
			objectFormat: decoder.getUint16(),
			protectionStatus: decoder.getUint16(),
			objectCompressedSize: decoder.getUint32(),
			thumbFormat: decoder.getUint16(),
			thumbCompressedSize: decoder.getUint32(),
			thumbPixWidth: decoder.getUint32(),
			thumbPixHeight: decoder.getUint32(),
			imagePixWidth: decoder.getUint32(),
			imagePixHeight: decoder.getUint32(),
			imageBitDepth: decoder.getUint32(),
			parentObject: decoder.getUint32(),
			associationType: decoder.getUint16(),
			associationDesc: decoder.getUint32(),
			sequenceNumber: decoder.getUint32(),
			filename: decoder.getString(),
			captureDate: decoder.getDate(),
			modificationDate: decoder.getDate(),
			keywords: decoder.getString(),
		}
	}

	public static getDeviceInfo = async function (
		device: PTPDevice
	): Promise<DeviceInfo> {
		const {data} = await device.receiveData({
			label: 'GetDeviceInfo',
			code: OpCode.for('GetDeviceInfo'),
		})

		const decoder = new PTPDecoder(data)

		const info: DeviceInfo = {
			StandardVersion: decoder.getUint16(),
			VendorExtensionID: decoder.getUint32(),
			VendorExtensionVersion: decoder.getUint16(),
			VendorExtensionDesc: decoder.getString(),
			FunctionalMode: decoder.getUint16(),
			OperationsSupported: decoder.getUint16Array().map(OpCode.nameFor),
			EventsSupported: decoder.getUint16Array().map(EventCode.nameFor),
			DevicePropertiesSupported: decoder
				.getUint16Array()
				.map(DevicePropCode.nameFor),
			CaptureFormats: decoder.getUint16Array().map(ObjectFormatCode.nameFor),
			ImageFormats: decoder.getUint16Array().map(ObjectFormatCode.nameFor),
			Manufacturer: decoder.getString(),
			Model: decoder.getString(),
			DeviceVersion: decoder.getString(),
			SerialNumber: decoder.getString(),
		}

		return info
	}
}
