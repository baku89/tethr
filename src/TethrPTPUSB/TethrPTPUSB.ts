import {BiMap} from 'bim'
import {identity, range, times} from 'lodash'

import {
	ConfigType,
	DriveMode,
	ExposureMode,
	ManualFocusOption,
	WhiteBalance,
} from '../configs'
import {DeviceInfo} from '../DeviceInfo'
import {
	DatatypeCode,
	DevicePropCode,
	EventCode,
	ObjectFormatCode,
	OpCode,
	ResCode,
} from '../PTPDatacode'
import {PTPDataView} from '../PTPDataView'
import {PTPDevice, PTPEvent} from '../PTPDevice'
import {
	PTPAccessCapability,
	PTPFilesystemType,
	PTPStorageType,
} from '../PTPEnum'
import {ConfigDesc, OperationResult, TakePictureOption, Tethr} from '../Tethr'
import {TethrObject, TethrObjectInfo} from '../TethrObject'
import {toHexString} from '../util'

type DevicePropSchemeEntry<Name extends keyof ConfigType> = {
	devicePropCode: number
} & (
	| {
			dataType: DatatypeCode.Uint64
			decode: (data: bigint) => ConfigType[Name] | null
			encode: (value: ConfigType[Name]) => bigint | null
	  }
	| {
			dataType: DatatypeCode.String
			decode: (data: string) => ConfigType[Name] | null
			encode: (value: ConfigType[Name]) => string | null
	  }
	| {
			dataType: DatatypeCode
			decode: (data: number) => ConfigType[Name] | null
			encode: (value: ConfigType[Name]) => number | null
	  }
)

export type DevicePropScheme = {
	[Name in keyof ConfigType]?: DevicePropSchemeEntry<Name>
}

export class TethrPTPUSB extends Tethr {
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

		this.device.onEventCode(
			EventCode.DevicePropChanged,
			this.onDevicePropChanged
		)
		this.device.on('disconnect', () => this.emit('disconnect'))

		window.addEventListener('beforeunload', async () => {
			await this.close()
		})

		this._opened = true
	}

	public async close(): Promise<void> {
		this._opened = false

		await this.device.sendCommand({
			label: 'Close Session',
			opcode: OpCode.CloseSession,
		})
		await this.device.close()
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

	public async listConfigs() {
		const {devicePropsSupported} = await this.getDeviceInfo()

		const deviceInfos = ['model']
		const deviceProps = devicePropsSupported.map(getConfigNameByDevicePropCode)
		const actionSupportedFlags = [
			'canTakePicture',
			'canRunAutoFocus',
			'canRunManualFocus',
			'canStartLiveview',
		]

		return [
			...deviceInfos,
			...deviceProps,
			...actionSupportedFlags,
		] as (keyof ConfigType)[]

		function getConfigNameByDevicePropCode(code: number) {
			return DevicePropCode[code] ?? toHexString(code, 4)
		}
	}

	public async set<K extends keyof ConfigType>(
		name: K,
		value: ConfigType[K]
	): Promise<OperationResult<void>> {
		const scheme = this.devicePropScheme[name]

		if (!scheme) {
			return {
				status: 'unsupported',
			}
		}

		if (!(await this.isDevicePropSupported(scheme.devicePropCode))) {
			return {
				status: 'unsupported',
			}
		}

		const encode = scheme.encode as (value: ConfigType[K]) => number
		const devicePropData = encode(value)

		if (devicePropData === null) {
			return {
				status: 'invalid',
			}
		}

		const dataView = new PTPDataView()
		switch (scheme.dataType) {
			case DatatypeCode.Uint8:
				dataView.writeUint8(devicePropData)
				break
			case DatatypeCode.Int8:
				dataView.writeInt8(devicePropData)
				break
			case DatatypeCode.Uint16:
				dataView.writeUint16(devicePropData)
				break
			case DatatypeCode.Int16:
				dataView.writeInt16(devicePropData)
				break
			case DatatypeCode.Uint32:
				dataView.writeUint32(devicePropData)
				break
			case DatatypeCode.Int32:
				dataView.writeInt32(devicePropData)
				break
			case DatatypeCode.Uint64:
				dataView.writeBigUint64(BigInt(devicePropData))
				break
			case DatatypeCode.String:
				dataView.writeBigUint64(BigInt(devicePropData))
				break
			default: {
				const label = DatatypeCode[scheme.dataType] ?? toHexString(16)
				throw new Error(
					`DevicePropDesc of datatype ${label} is not yet supported`
				)
			}
		}

		const {resCode} = await this.device.sendData({
			label: 'SetDevicePropValue',
			opcode: OpCode.SetDevicePropValue,
			parameters: [scheme.devicePropCode],
			data: dataView.toBuffer(),
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		return {
			status: resCode === ResCode.OK ? 'ok' : 'busy',
		}
	}

	public async getDesc<K extends keyof ConfigType, T extends ConfigType[K]>(
		name: K
	): Promise<ConfigDesc<T>> {
		const scheme = this.devicePropScheme[name]
		if (scheme) {
			return await this.getDevicePropDesc(scheme)
		}

		switch (name) {
			case 'model': {
				const value = (await this.getDeviceInfo()).model
				return {
					writable: false,
					value: value as T,
					options: [],
				}
			}
			case 'canTakePicture':
			case 'canRunAutoFocus':
			case 'canRunManualFocus':
			case 'canStartLiveview':
				return {
					writable: false,
					value: true as T,
					options: [],
				}
		}

		return {
			writable: false,
			value: null,
			options: [],
		}
	}

	private async getDevicePropDesc<Name extends keyof ConfigType>(
		scheme: DevicePropSchemeEntry<Name>
	) {
		// Check if the deviceProps is supported
		if (!(await this.isDevicePropSupported(scheme.devicePropCode))) {
			return {
				writable: false,
				value: null,
				options: [],
			}
		}

		const {data} = await this.device.receiveData({
			label: 'GetDevicePropDesc',
			opcode: OpCode.GetDevicePropDesc,
			parameters: [scheme.devicePropCode],
		})

		const decode = scheme.decode as (data: number) => any

		const dataView = new PTPDataView(data.slice(2))
		const dataType = dataView.readUint16()
		const writable = dataView.readUint8() === 0x01 // Get/Set

		let readValue: () => any

		switch (dataType) {
			case DatatypeCode.Uint8:
				readValue = dataView.readUint8
				break
			case DatatypeCode.Uint16:
				readValue = dataView.readUint16
				break
			case DatatypeCode.Int16:
				readValue = dataView.readInt16
				break
			case DatatypeCode.Uint32:
				readValue = dataView.readUint32
				break
			case DatatypeCode.Uint64:
				readValue = dataView.readUint64
				break
			case DatatypeCode.String:
				readValue = dataView.readUTF16StringNT
				break
			default: {
				const label = DatatypeCode[dataType] ?? toHexString(16)
				throw new Error(`PropDesc of datatype ${label} is not yet supported`)
			}
		}

		readValue() // Skip factoryDefault
		const value = decode(readValue())

		// Read options
		const formFlag = dataView.readUint8()

		let options: ConfigType[Name][]

		switch (formFlag) {
			case 0x00:
				// None
				options = []
				break
			case 0x01: {
				// Range
				const min = decode(readValue())
				const max = decode(readValue())
				const step = decode(readValue())
				if (
					typeof min !== 'number' ||
					typeof max !== 'number' ||
					typeof step !== 'number'
				) {
					throw new Error(`Cannot enumerate supported values of device config`)
				}
				options = range(min, max, step) as ConfigType[Name][]
				break
			}
			case 0x02: {
				// Enumeration
				const length = dataView.readUint16()
				options = times(length, readValue).map(decode)
				break
			}
			default:
				throw new Error(`Invalid form flag ${formFlag}`)
		}

		return {
			writable: writable && options.length > 1,
			value,
			options,
		}
	}

	private async isDevicePropSupported(code: number): Promise<boolean> {
		const {devicePropsSupported} = await this.getDeviceInfo()
		return devicePropsSupported.includes(code)
	}

	public async runAutoFocus(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public async runManualFocus(
		option: ManualFocusOption
	): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}

	public async takePicture({download = true}: TakePictureOption = {}): Promise<
		OperationResult<TethrObject[]>
	> {
		const {operationsSupported} = await this.getDeviceInfo()
		if (!operationsSupported.includes(OpCode.InitiateCapture)) {
			return {status: 'unsupported'}
		}

		await this.device.sendCommand({
			label: 'InitiateCapture',
			opcode: OpCode.InitiateCapture,
			parameters: [0x0],
		})

		const objectAddedEvent = await this.device.waitEvent(EventCode.ObjectAdded)

		if (!download) return {status: 'ok', value: []}

		const objectID = objectAddedEvent.parameters[0]
		const objectInfo = await this.getObjectInfo(objectID)
		const objectBuffer = await this.getObject(objectID)

		const tethrObject: TethrObject = {
			...objectInfo,
			blob: new Blob([objectBuffer], {type: 'image/jpeg'}),
		}

		return {status: 'ok', value: [tethrObject]}
	}

	public async startLiveview(): Promise<OperationResult<MediaStream>> {
		return {status: 'unsupported'}
	}

	public async stopLiveview(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}

	protected getDeviceInfo = async (): Promise<DeviceInfo> => {
		return await TethrPTPUSB.getDeviceInfo(this.device)
	}

	protected async getObjectInfo(id: number): Promise<TethrObjectInfo> {
		const {data} = await this.device.receiveData({
			label: 'GetObjectInfo',
			opcode: OpCode.GetObjectInfo,
			parameters: [id],
		})

		const dataView = new PTPDataView(data)

		return {
			id,
			storageID: dataView.readUint32(),
			format: this.getObjectFormat(dataView.readUint16()),
			// protectionStatus: dataView.readUint16(),
			byteLength: dataView.skip(2).readUint32(),
			thumb: {
				format: this.getObjectFormat(dataView.readUint16()),
				compressedSize: dataView.readUint32(),
				width: dataView.readUint32(),
				height: dataView.readUint32(),
			},
			image: {
				width: dataView.readUint32(),
				height: dataView.readUint32(),
				bitDepth: dataView.readUint32(),
			},
			// parent: dataView.readUint32(),
			// associationType: dataView.readUint16(),
			// associationDesc: dataView.readUint32(),
			sequenceNumber: dataView.skip(4 + 2 + 4).readUint32(),
			filename: dataView.readFixedUTF16String(),
			captureDate: dataView.readDate(),
			modificationDate: dataView.readDate(),
			// keywords: dataView.readFixedUTF16String(),
		}
	}

	protected async getObject(objectID: number): Promise<ArrayBuffer> {
		const {byteLength} = await this.getObjectInfo(objectID)

		const {data} = await this.device.receiveData({
			label: 'GetObject',
			opcode: OpCode.GetObject,
			parameters: [objectID],
			maxByteLength: byteLength + 1000,
		})

		return data
	}

	public static async getDeviceInfo(device: PTPDevice): Promise<DeviceInfo> {
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
			devicePropsSupported: dataView.readUint16Array(),
			captureFormats: dataView.readUint16Array(),
			imageFormats: dataView.readUint16Array(),
			manufacturer: dataView.readFixedUTF16String(),
			model: dataView.readFixedUTF16String(),
			deviceVersion: dataView.readFixedUTF16String(),
			serialNumber: dataView.readFixedUTF16String(),
		}
	}

	protected onDevicePropChanged = async (event: PTPEvent) => {
		const devicePropCode = event.parameters[0]
		const name = this.getConfigNameFromCode(devicePropCode)

		if (!name) return

		const desc = await this.getDesc(name)
		this.emit(`${name}Changed`, desc)
	}

	protected getConfigNameFromCode(
		devicePropCode: number
	): keyof ConfigType | null {
		return this.devicePropTable.get(devicePropCode) ?? null
	}

	protected getObjectFormat(code: number) {
		return ObjectFormatCode[code].toLowerCase()
	}

	protected devicePropScheme: DevicePropScheme = {
		exposureMode: {
			devicePropCode: DevicePropCode.ExposureProgramMode,
			dataType: DatatypeCode.Uint16,
			decode: data => {
				return (
					this.exposureModeTable.get(data) ?? `vendor ${toHexString(data, 4)}`
				)
			},
			encode: value => {
				return (
					this.exposureModeTable.getKey(value) ??
					parseInt(value.replace('vendor ', ''), 16)
				)
			},
		},
		exposureComp: {
			devicePropCode: DevicePropCode.ExposureBiasCompensation,
			dataType: DatatypeCode.Int16,
			decode: mills => {
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
			encode: str => {
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
			decode: data => {
				return (
					this.whiteBalanceTable.get(data) ?? `vendor ${toHexString(data, 4)}`
				)
			},
			encode: value => {
				return (
					this.whiteBalanceTable.getKey(value) ??
					parseInt(value.replace(/^vendor /, ''), 16)
				)
			},
		},
		iso: {
			devicePropCode: DevicePropCode.ExposureIndex,
			dataType: DatatypeCode.Uint16,
			decode: data => {
				if (data === 0xffff) return 'auto'
				return data
			},
			encode: iso => {
				if (iso === 'auto') return 0xffff
				return iso
			},
		},
		captureDelay: {
			devicePropCode: DevicePropCode.CaptureDelay,
			dataType: DatatypeCode.Uint32,
			decode: identity,
			encode: identity,
		},
		driveMode: {
			devicePropCode: DevicePropCode.StillCaptureMode,
			dataType: DatatypeCode.Uint16,
			decode: data => {
				return this.driveModeTable.get(data) ?? 'normal'
			},
			encode: value => {
				return this.driveModeTable.getKey(value) ?? 0x0
			},
		},
		imageSize: {
			devicePropCode: DevicePropCode.ImageSize,
			dataType: DatatypeCode.String,
			decode: identity,
			encode: identity,
		},
		timelapseNumber: {
			devicePropCode: DevicePropCode.TimelapseNumber,
			dataType: DatatypeCode.Uint16,
			decode: identity,
			encode: identity,
		},
		timelapseInterval: {
			devicePropCode: DevicePropCode.TimelapseInterval,
			dataType: DatatypeCode.Uint32,
			decode: identity,
			encode: identity,
		},
		batteryLevel: {
			devicePropCode: DevicePropCode.BatteryLevel,
			dataType: DatatypeCode.Uint8,
			decode: identity,
			encode: identity,
		},
	}

	protected devicePropTable = new BiMap<number, keyof ConfigType>([
		[0x5001, 'batteryLevel'],
		[0x5005, 'whiteBalance'],
		[0x5007, 'aperture'],
		[0x5008, 'focalLength'],
		[0x5009, 'focusDistance'],
		[0x500d, 'shutterSpeed'],
		[0x500e, 'exposureMode'],
		[0x500f, 'iso'],
		[0x5010, 'exposureComp'],
		[0x5012, 'captureDelay'],
		[0x5013, 'driveMode'],
		[0x5017, 'colorMode'],
		[0x501a, 'timelapseNumber'],
		[0x501b, 'timelapseInterval'],
	])

	protected exposureModeTable = new BiMap<number, ExposureMode>([
		[0x1, 'M'],
		[0x2, 'P'],
		[0x3, 'A'],
		[0x4, 'S'],
		[0x5, 'creative'],
		[0x6, 'action'],
		[0x7, 'portrait'],
	])

	protected whiteBalanceTable = new BiMap<number, WhiteBalance>([
		[0x1, 'manual'],
		[0x2, 'auto'],
		[0x3, 'custom'],
		[0x4, 'daylight'],
		[0x5, 'fluorescent'],
		[0x6, 'tungsten'],
	])

	protected driveModeTable = new BiMap<number, DriveMode>([
		[0x1, 'normal'],
		[0x2, 'burst'],
		[0x3, 'timelapse'],
	])
}
