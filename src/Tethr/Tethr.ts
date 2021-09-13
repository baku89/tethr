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
import {isntNil, toHexString} from '../util'

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

export type ShutterSpeed = string

export function convertShutterSpeedToTime(ss: string) {
	if (ss === 'bulk' || ss === 'sync') return Infinity
	if (ss.startsWith('1/')) return 1 / parseInt(ss.slice(2))
	return parseFloat(ss)
}

export type ExposureComp = string

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
	writable: boolean
	supportedValues: T[]
}

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
	shutterSpeed: ShutterSpeed
	exposureMode: ExposureMode // exposureProgramMode
	// exposureIndex: 0x500f
	exposureComp: ExposureComp // exposureBiasCompensation
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
		exposureComp: {
			code: DevicePropCode.ExposureBiasCompensation,
		},
		exposureMode: {
			code: DevicePropCode.ExposureProgramMode,
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

		window.addEventListener('beforeunload', async () => {
			await this.close()
		})
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

		const storageIDs = decoder.readUint32Array()
		console.log('Storage IDs =', storageIDs)

		for (const id of storageIDs) {
			const {data} = await this.device.receiveData({
				label: 'GetStorageInfo',
				parameters: [id],
				code: OpCode.GetStorageInfo,
			})

			const storageInfo = new PTPDecoder(data)

			const info = {
				storageType: PTPStorageType[storageInfo.readUint16()],
				filesystemType: PTPFilesystemType[storageInfo.readUint16()],
				accessCapability: PTPAccessCapability[storageInfo.readUint16()],
				maxCapability: storageInfo.readUint64(),
				freeSpaceInBytes: storageInfo.readUint64(),
				freeSpaceInImages: storageInfo.readUint32(),
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
			return {
				writable: false,
				value: null,
				supportedValues: [],
			}
		}

		const {code: rescode, data} = await this.device.receiveData({
			label: 'GetDevicePropDesc',
			code: OpCode.GetDevicePropDesc,
			parameters: [dpc],
			expectedResCodes: [ResCode.OK, ResCode.DevicePropNotSupported],
		})

		if (rescode === ResCode.DevicePropNotSupported) {
			return {
				writable: false,
				value: null,
				supportedValues: [],
			}
		}

		const decodeFn = (this.propScheme[name]?.decode ?? _.identity) as (
			data: number
		) => T

		const decoder = new PTPDecoder(data.slice(2))

		const dataType = decoder.readUint16()
		const writable = decoder.readUint8() === 0x01 // Get/Set

		let getValue: () => number

		switch (dataType) {
			case DatatypeCode.Uint8:
				getValue = decoder.readUint8
				break
			case DatatypeCode.Uint16:
				getValue = decoder.readUint16
				break
			case DatatypeCode.Int16:
				getValue = decoder.readInt16
				break
			default: {
				const label = DatatypeCode[dataType] ?? toHexString(16)
				throw new Error(`PropDesc of datatype ${label} is not yet supported`)
			}
		}

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
				const length = decoder.readUint16()
				supportedValues = _.times(length, getValue).map(decodeFn)
				break
			}
			default:
				throw new Error(`Invalid form flag ${formFlag}`)
		}

		return {
			writable,
			value,
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
			storageID: decoder.readUint32(),
			objectFormat: decoder.readUint16(),
			protectionStatus: decoder.readUint16(),
			objectCompressedSize: decoder.readUint32(),
			thumb: {
				format: decoder.readUint16(),
				compressedSize: decoder.readUint32(),
				width: decoder.readUint32(),
				height: decoder.readUint32(),
			},
			image: {
				width: decoder.readUint32(),
				height: decoder.readUint32(),
				bitDepth: decoder.readUint32(),
			},
			parentObject: decoder.readUint32(),
			associationType: decoder.readUint16(),
			associationDesc: decoder.readUint32(),
			sequenceNumber: decoder.readUint32(),
			filename: decoder.readString(),
			captureDate: decoder.readDate(),
			modificationDate: decoder.readDate(),
			keywords: decoder.readString(),
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
			standardVersion: decoder.readUint16(),
			vendorExtensionID: decoder.readUint32(),
			vendorExtensionVersion: decoder.readUint16(),
			vendorExtensionDesc: decoder.readString(),
			functionalMode: decoder.readUint16(),
			operationsSupported: decoder.readUint16Array(),
			eventsSupported: decoder.readUint16Array(),
			propsSupported: [...decoder.readUint16Array()]
				.map(c => PropCode.getKey(c))
				.filter(isntNil),
			captureFormats: decoder.readUint16Array(),
			imageFormats: decoder.readUint16Array(),
			manufacturer: decoder.readString(),
			model: decoder.readString(),
			deviceVersion: decoder.readString(),
			serialNumber: decoder.readString(),
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
