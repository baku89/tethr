import {BiMap} from 'bim'
import {EventEmitter} from 'eventemitter3'
import _ from 'lodash'

import {
	DatatypeCode,
	DevicePropCode,
	EventCode,
	ObjectFormatCode,
	OpCode,
	ResCode,
} from '../PTPDatacode'
import {PTPDataView} from '../PTPDataView'
import {PTPDevice} from '../PTPDevice'
import {
	PTPAccessCapability,
	PTPFilesystemType,
	PTPStorageType,
} from '../PTPEnum'
import {TethrObject, TethrObjectInfo} from '../TethrObject'
import {toHexString} from '../util'

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
	| `manual${'' | 2 | 3 | 4}`
	| `custom${'' | 2 | 3 | 4}`
	| `vendor ${string}`

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

export type ExposureMode =
	| 'P'
	| 'A'
	| 'S'
	| 'M'
	| 'creative'
	| 'action'
	| 'portrait'
	| 'video'
	| `C${1 | 2 | 3}`
	| `vendor ${string}`

export type ExposureMeteringMode =
	| 'average'
	| 'center-weighted-average'
	| 'multi-spot'
	| 'center-spot'

export type DriveMode = 'normal' | 'burst' | 'timelapse'

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
	propsSupported: number[]
	captureFormats: number[]
	imageFormats: number[]
	manufacturer: string
	model: string
	deviceVersion: string
	serialNumber: string
}

export interface PropType {
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
	driveMode: DriveMode // stillCaptureMode
	contrast: number
	sharpness: number
	digitalZoom: number
	colorMode: string
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

export type PropNames = keyof PropType

type PropScheme = {
	[Name in PropNames]?: {
		devicePropCode: number
		dataType: DatatypeCode
		decode: (this: typeof Tethr, data: number) => PropType[Name] | null
		encode: (this: typeof Tethr, value: PropType[Name]) => number | null
	}
}

export type SetPropResultStatus = 'ok' | 'unsupported' | 'invalid' | 'busy'

export interface SetPropResult<T extends PropType[PropNames]> {
	status: SetPropResultStatus
	value: T | null
}

export interface TakePictureOption {
	download?: boolean
}

export interface LiveviewResult {
	image: Blob
	histogram?: Uint8Array
}

type TethrEventTypes = {
	[Name in PropNames as `${Name}Changed`]: PropDesc<PropType[Name]>
}

export class Tethr extends EventEmitter<TethrEventTypes> {
	protected _class = Tethr
	protected _opened = false

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
			opcode: OpCode.OpenSession,
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
			opcode: OpCode.CloseSession,
		})
		await this.device.close()
	}

	public getDeviceInfo = async (): Promise<DeviceInfo> => {
		return await this._class.getDeviceInfo(this.device)
	}

	public getStorageInfo = async (): Promise<void> => {
		const {data} = await this.device.receiveData({
			label: 'Get Storage IDs',
			opcode: OpCode.GetStorageIDs,
		})
		const dataView = new PTPDataView(data)

		const storageIDs = dataView.readUint32Array()
		console.log('Storage IDs =', storageIDs)

		for (const id of storageIDs) {
			const {data} = await this.device.receiveData({
				label: 'GetStorageInfo',
				parameters: [id],
				opcode: OpCode.GetStorageInfo,
			})

			const storageInfo = new PTPDataView(data)

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

	public async get<K extends PropNames>(name: K): Promise<PropType[K] | null> {
		return (await this.getDesc(name)).value
	}

	public async set<K extends PropNames>(
		name: K,
		value: PropType[K]
	): Promise<SetPropResult<PropType[K]>> {
		const scheme = this._class.PropScheme[name]

		if (!scheme) {
			return {
				status: 'unsupported',
				value: null,
			}
		}

		const encode = scheme.encode.bind(this._class) as (
			value: PropType[K]
		) => number
		const propData = encode(value)

		if (propData === null) {
			return {
				status: 'invalid',
				value: await this.get(name),
			}
		}

		let dataView: DataView
		switch (scheme.dataType) {
			case DatatypeCode.Uint8:
				dataView = new DataView(new ArrayBuffer(1))
				dataView.setUint8(0, propData)
				break
			case DatatypeCode.Int8:
				dataView = new DataView(new ArrayBuffer(1))
				dataView.setInt8(0, propData)
				break
			case DatatypeCode.Uint16:
				dataView = new DataView(new ArrayBuffer(2))
				dataView.setUint16(0, propData, true)
				break
			case DatatypeCode.Int16:
				dataView = new DataView(new ArrayBuffer(2))
				dataView.setInt16(0, propData, true)
				break
			case DatatypeCode.Uint32:
				dataView = new DataView(new ArrayBuffer(4))
				dataView.setUint32(0, propData, true)
				break
			case DatatypeCode.Int32:
				dataView = new DataView(new ArrayBuffer(4))
				dataView.setInt32(0, propData, true)
				break
			default: {
				const label = DatatypeCode[scheme.dataType] ?? toHexString(16)
				throw new Error(`PropDesc of datatype ${label} is not yet supported`)
			}
		}

		const {resCode} = await this.device.sendData({
			label: 'SetDevicePropValue',
			opcode: OpCode.SetDevicePropValue,
			parameters: [scheme.devicePropCode],
			data: dataView.buffer,
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		return {
			status: resCode === ResCode.OK ? 'ok' : 'busy',
			value: await this.get(name),
		}
	}

	public async getDesc<K extends PropNames, T extends PropType[K]>(
		name: K
	): Promise<PropDesc<T>> {
		const scheme = this._class.PropScheme[name]

		if (!scheme) {
			return {
				writable: false,
				value: null,
				supportedValues: [],
			}
		}

		const {resCode, data} = await this.device.receiveData({
			label: 'GetDevicePropDesc',
			opcode: OpCode.GetDevicePropDesc,
			parameters: [scheme.devicePropCode],
			expectedResCodes: [ResCode.OK, ResCode.DevicePropNotSupported],
		})

		if (resCode === ResCode.DevicePropNotSupported) {
			return {
				writable: false,
				value: null,
				supportedValues: [],
			}
		}

		const decode = scheme.decode.bind(this._class) as (data: number) => T

		const dataView = new PTPDataView(data, 2)

		const dataType = dataView.readUint16()
		const writable = dataView.readUint8() === 0x01 // Get/Set

		let getValue: () => number

		switch (dataType) {
			case DatatypeCode.Uint8:
				getValue = dataView.readUint8
				break
			case DatatypeCode.Uint16:
				getValue = dataView.readUint16
				break
			case DatatypeCode.Int16:
				getValue = dataView.readInt16
				break
			case DatatypeCode.Uint32:
				getValue = dataView.readUint32
				break
			default: {
				const label = DatatypeCode[dataType] ?? toHexString(16)
				throw new Error(`PropDesc of datatype ${label} is not yet supported`)
			}
		}

		getValue() // Skip factoryDefault
		const value = decode(getValue())

		// Read supportedValues
		const formFlag = dataView.readUint8()

		let supportedValues: T[]

		switch (formFlag) {
			case 0x00:
				// None
				supportedValues = []
				break
			case 0x01: {
				// Range
				const min = decode(getValue())
				const max = decode(getValue())
				const step = decode(getValue())
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
				const length = dataView.readUint16()
				supportedValues = _.times(length, getValue).map(decode)
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

	public takePicture = async ({
		download = true,
	}: TakePictureOption = {}): Promise<null | TethrObject[]> => {
		await this.device.sendCommand({
			label: 'InitiateCapture',
			opcode: OpCode.InitiateCapture,
			parameters: [0x0],
		})

		const objectAddedEvent = await this.device.waitEvent(EventCode.ObjectAdded)

		if (!download) return null

		const objectID = objectAddedEvent.parameters[0]
		const objectInfo = await this.getObjectInfo(objectID)
		const objectBuffer = await this.getObject(objectID)

		const tethrObject: TethrObject = {
			...objectInfo,
			blob: new Blob([objectBuffer], {type: 'image/jpeg'}),
		}

		return [tethrObject]
	}

	public startLiveview = async (): Promise<void> => {
		return
	}

	public stopLiveview = async (): Promise<void> => {
		return
	}

	public getLiveview = async (): Promise<null | LiveviewResult> => null

	public get liveviewing(): boolean {
		return false
	}

	protected getObjectInfo = async (id: number): Promise<TethrObjectInfo> => {
		const {data} = await this.device.receiveData({
			label: 'GetObjectInfo',
			opcode: OpCode.GetObjectInfo,
			parameters: [id],
		})

		const dataView = new PTPDataView(data)

		return {
			id,
			storageID: dataView.readUint32(),
			format: this._class.getObjectFormat(dataView.readUint16()),
			protectionStatus: dataView.readUint16(),
			byteLength: dataView.readUint32(),
			thumb: {
				format: this._class.getObjectFormat(dataView.readUint16()),
				compressedSize: dataView.readUint32(),
				width: dataView.readUint32(),
				height: dataView.readUint32(),
			},
			image: {
				width: dataView.readUint32(),
				height: dataView.readUint32(),
				bitDepth: dataView.readUint32(),
			},
			parent: dataView.readUint32(),
			// associationType: dataView.readUint16(),
			// associationDesc: dataView.readUint32(),
			sequenceNumber: dataView.skip(2 + 4).readUint32(),
			filename: dataView.readFixedUTF16String(),
			captureDate: dataView.readDate(),
			modificationDate: dataView.readDate(),
			keywords: dataView.readFixedUTF16String(),
		}
	}

	protected getObject = async (objectID: number): Promise<ArrayBuffer> => {
		const {byteLength} = await this.getObjectInfo(objectID)

		const {data} = await this.device.receiveData({
			label: 'GetObject',
			opcode: OpCode.GetObject,
			parameters: [objectID],
			maxByteLength: byteLength + 1000,
		})

		return data
	}

	public static getDeviceInfo = async function (
		device: PTPDevice
	): Promise<DeviceInfo> {
		const {data} = await device.receiveData({
			label: 'GetDeviceInfo',
			opcode: OpCode.GetDeviceInfo,
		})

		const dataView = new PTPDataView(data)

		return {
			standardVersion: dataView.readUint16(),
			vendorExtensionID: dataView.readUint32(),
			vendorExtensionVersion: dataView.readUint16(),
			vendorExtensionDesc: dataView.readFixedUTF16String(),
			functionalMode: dataView.readUint16(),
			operationsSupported: dataView.readUint16Array(),
			eventsSupported: dataView.readUint16Array(),
			propsSupported: dataView.readUint16Array(),
			captureFormats: dataView.readUint16Array(),
			imageFormats: dataView.readUint16Array(),
			manufacturer: dataView.readFixedUTF16String(),
			model: dataView.readFixedUTF16String(),
			deviceVersion: dataView.readFixedUTF16String(),
			serialNumber: dataView.readFixedUTF16String(),
		}
	}

	protected static getObjectFormat(code: number) {
		return ObjectFormatCode[code].toLowerCase()
	}

	protected static PropScheme: PropScheme = {
		exposureMode: {
			devicePropCode: DevicePropCode.ExposureProgramMode,
			dataType: DatatypeCode.Uint16,
			decode: function (data) {
				return (
					this.ExposureModeTable.get(data) ?? `vendor ${toHexString(data, 4)}`
				)
			},
			encode: function (value) {
				return (
					this.ExposureModeTable.getKey(value) ??
					parseInt(value.replace('vendor ', ''), 16)
				)
			},
		},
		exposureComp: {
			devicePropCode: DevicePropCode.ExposureBiasCompensation,
			dataType: DatatypeCode.Int16,
			decode: function (mills) {
				if (mills === 0) return '0'

				const millsAbs = Math.abs(mills)

				const sign = mills > 0 ? '+' : '-'
				const integer = Math.floor(millsAbs / 1000)
				const fracMills = millsAbs % 1000

				let fraction = ''

				switch (fracMills) {
					case 300:
						fraction = '1/3'
						break
					case 500:
						fraction = '1/2'
						break
					case 700:
						fraction = '2/3'
						break
				}

				if (integer === 0) return `${sign}${fraction}`
				if (fraction === '') return `${sign}${integer}`
				return `${sign}${integer} ${fraction}`
			},
			encode: function (str) {
				if (str === '0') return 0

				const match = str.match(/^([+-]?)([0-9]+)?\s?(1\/2|1\/3|2\/3)?$/)

				if (!match) return null

				const [, signStr, integerStr, fractionStr] = match

				const sign = signStr === '-' ? -1 : +1
				const integer = parseInt(integerStr)
				let fracMills = 0
				switch (fractionStr) {
					case '1/3':
						fracMills = 300
						break
					case '1/2':
						fracMills = 500
						break
					case '2/3':
						fracMills = 700
						break
				}

				return sign * (integer * 1000 + fracMills)
			},
		},
		whiteBalance: {
			devicePropCode: DevicePropCode.WhiteBalance,
			dataType: DatatypeCode.Uint16,
			decode: function (data) {
				return this.WhiteBalanceTable.get(data) ?? 'auto'
			},
			encode: function (value) {
				return this.WhiteBalanceTable.getKey(value) ?? 0x2 // = auto
			},
		},
		iso: {
			devicePropCode: DevicePropCode.ExposureIndex,
			dataType: DatatypeCode.Uint16,
			decode: function (data) {
				if (data === 0xffff) return 'auto'
				return data
			},
			encode: function (iso) {
				if (iso === 'auto') return 0xffff
				return iso
			},
		},
		captureDelay: {
			devicePropCode: DevicePropCode.CaptureDelay,
			dataType: DatatypeCode.Uint32,
			decode: _.identity,
			encode: _.identity,
		},
		driveMode: {
			devicePropCode: DevicePropCode.StillCaptureMode,
			dataType: DatatypeCode.Uint16,
			decode: function (data) {
				return this.DriveModeTable.get(data) ?? 'normal'
			},
			encode: function (value) {
				return this.DriveModeTable.getKey(value) ?? 0x0
			},
		},
		timelapseNumber: {
			devicePropCode: DevicePropCode.TimelapseNumber,
			dataType: DatatypeCode.Uint16,
			decode: _.identity,
			encode: _.identity,
		},
		timelapseInterval: {
			devicePropCode: DevicePropCode.TimelapseInterval,
			dataType: DatatypeCode.Uint32,
			decode: _.identity,
			encode: _.identity,
		},
		batteryLevel: {
			devicePropCode: DevicePropCode.BatteryLevel,
			dataType: DatatypeCode.Uint8,
			decode: _.identity,
			encode: _.identity,
		},
	}

	protected static ExposureModeTable = new BiMap<number, ExposureMode>([
		[0x1, 'M'],
		[0x2, 'P'],
		[0x3, 'A'],
		[0x4, 'S'],
		[0x5, 'creative'],
		[0x6, 'action'],
		[0x7, 'portrait'],
	])

	protected static WhiteBalanceTable = new BiMap<number, WhiteBalance>([
		[0x1, 'manual'],
		[0x2, 'auto'],
		[0x3, 'custom'],
		[0x4, 'daylight'],
		[0x5, 'fluorescent'],
		[0x6, 'tungsten'],
	])

	protected static DriveModeTable = new BiMap<number, DriveMode>([
		[0x1, 'normal'],
		[0x2, 'burst'],
		[0x3, 'timelapse'],
	])
}
