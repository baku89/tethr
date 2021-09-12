import {BiMap} from 'bim'
import {EventEmitter} from 'eventemitter3'
import _ from 'lodash'

import {ObjectInfo} from '@/ObjectInfo'

import {DatatypeCode, DevicePropCode, OpCode, ResCode} from '../PTPDatacode'
import {PTPDecoder} from '../PTPDecoder'
import {PTPDevice} from '../PTPDevice'
import {
	PTPAccessCapability,
	PTPFilesystemType,
	PTPStorageType,
} from '../PTPEnum'
import {isntNil} from '../util'

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
	| `manual${'' | '2' | '3' | '4'}`

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

export type FocusMeteringMode = 'center-spot' | 'multi-spot'

export type ManualFocusDriveOption = {
	direction: 'near' | 'far'
	speed: 1 | 2 | 3
}

export type PropDesc<T> = {
	value: T | null
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

export interface DeviceInfo {
	standardVersion: number
	vendorExtensionID: number
	vendorExtensionVersion: number
	vendorExtensionDesc: string
	functionalMode: number
	operationsSupported: number[]
	eventsSupported: number[]
	propsSupported: (keyof BasePropType)[]
	captureFormats: number[]
	imageFormats: number[]
	manufacturer: string
	model: string
	deviceVersion: string
	serialNumber: string
}

export interface BasePropType {
	batteryLevel: BatteryLevel
	functionalMode: FunctionalMode
	imageSize: [number, number]
	compressionSetting: number

	imageResolution: string // Added e.g. L, M, S...
	imageQuality: string // Added e.g. JPEG, JPEG+RAW...
	aspectRatio: string // Added e.g. 16:9, 3:2...

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
	exposureComp: string // exposureBiasCompensation
	dateTime: Date
	captureDelay: number
	stillCaptureMode: StillCaptureMode
	contrast: number
	sharpness: number
	digitalZoom: number
	effectMode: string
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

const PropCode = new BiMap<keyof BasePropType, number>([
	['batteryLevel', 0x5001],
	['functionalMode', 0x5002],
	['imageSize', 0x5003],
	['compressionSetting', 0x5004],
	['whiteBalance', 0x5005],
	['rgbGain', 0x5006],
	['aperture', 0x5007],
	['focalLength', 0x5008],
	['focusDistance', 0x5009],
	['focusMode', 0x500a],
	['exposureMeteringMode', 0x500b],
	['flashMode', 0x500c],
	// ['exposureTime', 0x500d],
	['exposureMode', 0x500e],
	// ['exposureIndex', 0x500f],
	['exposureComp', 0x5010],
	['dateTime', 0x5011],
	['captureDelay', 0x5012],
	['stillCaptureMode', 0x5013],
	['contrast', 0x5014],
	['sharpness', 0x5015],
	['digitalZoom', 0x5016],
	['effectMode', 0x5017],
	['burstNumber', 0x5018],
	['burstInterval', 0x5019],
	['timelapseNumber', 0x501a],
	['timelapseInterval', 0x501b],
	['focusMeteringMode', 0x501c],
	['uploadURL', 0x501d],
	['artist', 0x501e],
	['copyrightInfo', 0x501f],
])

interface PropSchemeEntry<PropType> {
	code: number
	decode?: (data: number) => PropType
	encode?: (value: PropType) => number
}

type PropScheme = {
	[Name in keyof BasePropType]?: PropSchemeEntry<BasePropType[Name]>
}

export type SetPropResultStatus = 'ok' | 'unsupported' | 'invalid'

export interface SetPropResult<T extends BasePropType[keyof BasePropType]> {
	status: SetPropResultStatus
	value: T | null
}

type TethrEventTypes = {
	[Name in keyof BasePropType as `${Name}Changed`]: PropDesc<BasePropType[Name]>
}

export class Tethr extends EventEmitter<TethrEventTypes> {
	protected _opened = false

	protected propScheme: PropScheme = {
		batteryLevel: {
			code: DevicePropCode.BatteryLevel,
		},
	}

	public constructor(protected device: PTPDevice) {
		super()
	}

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
	): Promise<BasePropType[K] | null> {
		return (await this.getDesc(name)).value
	}

	public async set<K extends keyof BasePropType>(
		name: K,
		value: BasePropType[K]
	): Promise<SetPropResult<BasePropType[K]>> {
		return {
			status: 'unsupported',
			value: null,
		}
	}

	public async getDesc<K extends keyof BasePropType, T extends BasePropType[K]>(
		name: K
	): Promise<PropDesc<T>> {
		const dpc = this.propScheme[name]?.code

		if (dpc === undefined) {
			console.warn(`GetDesc for prop ${name} is not yet implemented`)

			return {
				writable: false,
				value: null,
			}
		}

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

		const decodeFn = (this.propScheme[name]?.decode ?? _.identity) as (
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
		const value = decodeFn(getValue())

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
			value,
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
			propsSupported: [...decoder.getUint16Array()]
				.map(c => PropCode.getKey(c))
				.filter(isntNil),
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
