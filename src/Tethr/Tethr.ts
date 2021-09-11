import {BiMap} from 'bim'
import _ from 'lodash'

import {DeviceInfo} from '@/DeviceInfo'
import {ObjectInfo} from '@/ObjectInfo'

import {DatatypeCode, DevicePropCode, OpCode, ResCode} from '../PTPDatacode'
import {PTPDecoder} from '../PTPDecoder'
import {PTPDevice} from '../PTPDevice'
import {
	PTPAccessCapability,
	PTPFilesystemType,
	PTPStorageType,
} from '../PTPEnum'

export type Aperture = 'auto' | number

export type ISO = 'auto' | number

export type WhiteBalance =
	| 'auto'
	| 'auto cool'
	| 'auto warm'
	| 'auto ambience'
	| 'daylight'
	| 'shade'
	| 'cloud'
	| 'incandescent'
	| 'fluorescent'
	| 'tungsten'
	| 'flash'
	| 'manual'

export type BatteryLevel = 'ac' | 'low' | number

export type FunctionalMode = 'standard' | 'sleep'

export type FocusMode = 'af' | 'mf'

export type FlashMode =
	| 'auto'
	| 'off'
	| 'fill'
	| 'red eye auto'
	| 'red eye fill'
	| 'external sync'

export type ExposureMode = 'P' | 'A' | 'S' | 'M'

export type ExposureMeteringMode =
	| 'average'
	| 'center-weighted-average'
	| 'multi-spot'
	| 'center-spot'

export type StillCaptureMode = 'normal' | 'burst' | 'timelapse'

export type EffectMode = 'standard' | 'bw' | 'sepia' | string

export type FocusMeteringMode = 'center-spot' | 'multi-spot'

export type PropDesc<T> = {
	currentValue: T | typeof Tethr.Unknown
	defaultValue?: T
} & (
	| {
			writable: true
			supportedValues: T[]
	  }
	| {
			writable: false
	  }
)

export interface BasePropType {
	batteryLevel: BatteryLevel
	functionalMode: FunctionalMode
	imageSize: [number, number]
	compressionSetting: 0x5004
	whiteBalance: WhiteBalance
	rgbGain: [number, number, number]
	colorTemperature: number // Added
	aperture: number // fNumber
	focalLength: number
	focusDistance: number
	focusMode: FocusMode
	exposureMeteringMode: ExposureMeteringMode
	flashMode: FlashMode
	// exposureTime: number
	shutterSpeed: string
	exposureMode: ExposureMode // exposureProgramMode
	// exposureIndex: 0x500f
	exposureCompensation: number // exposureBiasCompensation
	dateTime: Date
	captureDelay: number
	stillCaptureMode: StillCaptureMode
	contrast: number
	sharpness: number
	digitalZoom: number
	effectMode: EffectMode
	burstNumber: number
	burstInterval: number
	timelapseNumber: number
	timelapseInterval: number
	focusMeteringMode: FocusMeteringMode
	uploadURL: string
	artist: string
	copyrightInfo: string
	iso: ISO // added
}

type DevicePropCodeTable = BiMap<keyof BasePropType, number>

interface PropTypeConverterEntry<PropType, DataType = number> {
	decode?: (data: DataType) => PropType
	encode?: (value: PropType) => DataType
}

type PropTypeConverter = {
	[Name in keyof BasePropType]?: PropTypeConverterEntry<BasePropType[Name]>
}

export class Tethr {
	public static readonly Unknown: unique symbol = Symbol('Tethr.Unknown')

	protected _opened = false

	protected propTypeConverter: PropTypeConverter = {}

	protected devicePropCodeTable: DevicePropCodeTable = new BiMap([
		['batteryLevel', DevicePropCode.BatteryLevel],
	])

	public constructor(protected device: PTPDevice) {}

	public get opened(): boolean {
		return this._opened
	}

	public async open(): Promise<void> {
		if (!this.device.opened) {
			await this.device.open()
		}

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
		return await Tethr.getDeviceInfo(this.device)
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

	public async get<K extends keyof BasePropType>(
		name: K
	): Promise<BasePropType[K]> {
		return (await this.getDesc(name)).currentValue
	}

	public async set<K extends keyof BasePropType>(
		name: K,
		value: BasePropType[K]
	): Promise<boolean> {
		return false
	}

	public async getDesc<K extends keyof BasePropType, T extends BasePropType[K]>(
		name: K
	): Promise<PropDesc<T>> {
		const dpc = this.devicePropCodeTable.get(name as any)

		if (dpc === undefined)
			throw new Error(`Prop "${name}"" is not supported for this device`)

		const {code: rescode, data} = await this.device.receiveData({
			label: 'GetDevicePropDesc',
			code: OpCode.GetDevicePropDesc,
			parameters: [dpc],
			expectedResCodes: [ResCode.OK, ResCode.DevicePropNotSupported],
		})

		if (rescode === ResCode.DevicePropNotSupported)
			throw new Error(
				`DeviceProp ${dpc.toString(16)} (${name}) is not supported`
			)

		const decodeFn = (this.propTypeConverter[name]?.decode ?? _.identity) as (
			data: number
		) => T

		const decoder = new PTPDecoder(data.slice(2))

		const dataType = decoder.getUint16()
		const writable = decoder.getUint8() === 0x01 // Get/Set

		let getValue: () => number
		switch (dataType) {
			case DatatypeCode.Uint8:
				getValue = decoder.getUint8
				break
			default:
				throw new Error(
					`PropDesc of datatype ${
						DatatypeCode[dataType] ?? dataType.toString(16)
					} is not yet supported`
				)
		}

		const defaultValue = decodeFn(getValue())
		const currentValue = decodeFn(getValue())

		// Read supportedValues
		const formFlag = getValue()

		let supportedValues: T[]

		switch (formFlag) {
			case 0x00:
				// None
				supportedValues = []
				break
			case 0x01: {
				// Range
				const min = decodeFn(getValue())
				const max = decodeFn(getValue())
				const step = decodeFn(getValue())
				if (
					typeof min !== 'number' ||
					typeof max !== 'number' ||
					typeof step !== 'number'
				) {
					throw new Error(
						`Cannot enumerate supported values of device prop ${name}`
					)
				}
				supportedValues = _.range(min, max, step) as T[]
				break
			}
			case 0x02: {
				// Enumeration
				const length = decoder.getUint16()
				supportedValues = _.times(length, getValue).map(decodeFn)
				break
			}
			default:
				throw new Error(`Invalid form flag ${formFlag}`)
		}

		return {
			writable,
			currentValue,
			defaultValue,
			supportedValues,
		}
	}

	public runAutoFocus = async (): Promise<boolean> => false

	public takePicture = async (): Promise<null | string> => null

	public startLiveView = async (): Promise<void> => {
		return
	}

	public stopLiveView = async (): Promise<void> => {
		return
	}

	public getLiveView = async (): Promise<null | string> => {
		console.info('Liveview is not supported for the current camera')
		return null
	}

	public get liveviewing(): boolean {
		return false
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
			thumb: {
				format: decoder.getUint16(),
				compressedSize: decoder.getUint32(),
				width: decoder.getUint32(),
				height: decoder.getUint32(),
			},
			image: {
				width: decoder.getUint32(),
				height: decoder.getUint32(),
				bitDepth: decoder.getUint32(),
			},
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
			standardVersion: decoder.getUint16(),
			vendorExtensionID: decoder.getUint32(),
			vendorExtensionVersion: decoder.getUint16(),
			vendorExtensionDesc: decoder.getString(),
			functionalMode: decoder.getUint16(),
			operationsSupported: decoder.getUint16Array(),
			eventsSupported: decoder.getUint16Array(),
			devicePropertiesSupported: decoder.getUint16Array(),
			captureFormats: decoder.getUint16Array(),
			imageFormats: decoder.getUint16Array(),
			manufacturer: decoder.getString(),
			model: decoder.getString(),
			deviceVersion: decoder.getString(),
			serialNumber: decoder.getString(),
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
