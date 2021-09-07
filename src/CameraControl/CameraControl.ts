import {DeviceInfo} from '@/DeviceInfo'
import {ObjectInfo} from '@/ObjectInfo'

import {DevicePropCode, OpCode, ResCode} from '../PTPDatacode'
import {PTPDecoder} from '../PTPDecoder'
import {PTPDevice} from '../PTPDevice'
import {
	PTPAccessCapability,
	PTPFilesystemType,
	PTPStorageType,
} from '../PTPEnum'

export type ISO = 'auto' | number

export type Aperture = 'auto' | number

export enum ExposureMode {
	P = 'P',
	A = 'A',
	S = 'S',
	M = 'M',
}

export type BatteryLevel = 'ac' | 'low' | number

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

export interface PropDescEnum<T> {
	canRead: boolean
	canWrite: boolean
	range: T[]
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
			code: OpCode.OpenSession,
			parameters: [0x1],
			expectedResCodes: [ResCode.OK, ResCode.SessionAlreadyOpen],
		})

		this._opened = true
	}

	public close = async (): Promise<void> => {
		this._opened = false

		await this.device.sendCommand({
			label: 'Close Session',
			code: OpCode.CloseSession,
		})
		await this.device.close()
	}

	public getDeviceInfo = async (): Promise<DeviceInfo> => {
		return await CameraControl.getDeviceInfo(this.device)
	}

	public getStorageInfo = async (): Promise<void> => {
		const {data} = await this.device.receiveData({
			label: 'Get Storage IDs',
			code: OpCode.GetStorageIDs,
		})
		const decoder = new PTPDecoder(data)

		const storageIDs = decoder.getUint32Array()
		console.log('Storage IDs =', storageIDs)

		for (const id of storageIDs) {
			const {data} = await this.device.receiveData({
				label: 'GetStorageInfo',
				parameters: [id],
				code: OpCode.GetStorageInfo,
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

	public getAperture = async (): Promise<null | Aperture> => {
		return null
	}

	public setAperture = async (aperture: Aperture): Promise<boolean> => {
		return false
	}

	public getApertureDesc = async (): Promise<PropDescEnum<Aperture>> => {
		return {
			canRead: false,
			canWrite: false,
			range: [],
		}
	}

	public getShutterSpeed = async (): Promise<null | string> => {
		return null
	}

	public setShutterSpeed = async (shutterSpeed: string): Promise<boolean> => {
		return false
	}

	public getShutterSpeedDesc = async (): Promise<PropDescEnum<string>> => {
		return {
			canRead: false,
			canWrite: false,
			range: [],
		}
	}

	public getISO = async (): Promise<null | ISO> => {
		return null
	}

	public setISO = async (iso: ISO): Promise<boolean> => {
		return false
	}

	public getISODesc = async (): Promise<PropDescEnum<ISO>> => {
		return {
			canRead: false,
			canWrite: false,
			range: [],
		}
	}

	public getExposureMode = async (): Promise<null | ExposureMode> => {
		return null
	}

	public setExposureMode = async (mode: ExposureMode): Promise<boolean> => {
		return false
	}

	public getBatteryLevel = async (): Promise<null | BatteryLevel> => {
		const desc = await this.getDevicePropDesc(DevicePropCode.BatteryLevel)

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

	public startLiveView = async (): Promise<void> => {
		return
	}

	public stopLiveView = async (): Promise<void> => {
		return
	}

	public getLiveView = async (): Promise<null | string> => {
		return null
	}

	public getDevicePropDesc = async (
		deviceProp: number
	): Promise<null | DevicePropDesc<number>> => {
		const info = await this.getDeviceInfo()

		if (!info.DevicePropertiesSupported.includes(deviceProp)) {
			return null
		}

		const {data} = await this.device.receiveData({
			label: 'GetDevicePropDesc',
			code: OpCode.GetDevicePropDesc,
			parameters: [deviceProp],
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
			code: OpCode.GetObjectInfo,
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
			code: OpCode.GetDeviceInfo,
		})

		const decoder = new PTPDecoder(data)

		const info: DeviceInfo = {
			StandardVersion: decoder.getUint16(),
			VendorExtensionID: decoder.getUint32(),
			VendorExtensionVersion: decoder.getUint16(),
			VendorExtensionDesc: decoder.getString(),
			FunctionalMode: decoder.getUint16(),
			OperationsSupported: decoder.getUint16Array(),
			EventsSupported: decoder.getUint16Array(),
			DevicePropertiesSupported: decoder.getUint16Array(),
			CaptureFormats: decoder.getUint16Array(),
			ImageFormats: decoder.getUint16Array(),
			Manufacturer: decoder.getString(),
			Model: decoder.getString(),
			DeviceVersion: decoder.getString(),
			SerialNumber: decoder.getString(),
		}

		return info
	}

	protected static extractJpeg(buffer: ArrayBuffer): ArrayBuffer {
		const bytes = new Uint8Array(buffer)
		const len = bytes.length

		// look for the JPEG SOI marker (0xFFD8) in data
		let start: null | number = null

		for (let i = 0; i + 1 < len; i++) {
			if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
				// SOI found
				start = i
				break
			}
		}
		if (start === null) /* no SOI -> no JPEG */ throw new Error('SOI not found')

		// look for the JPEG SOI marker (0xFFD8) in data
		let end: null | number = null

		for (let i = start + 2; i + 1 < len; i++) {
			if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
				// EOI found
				end = i + 2
				break
			}
		}
		if (end === null)
			// no EOI -> no JPEG
			throw new Error('EOI not found')

		return buffer.slice(start, end)
	}
}
