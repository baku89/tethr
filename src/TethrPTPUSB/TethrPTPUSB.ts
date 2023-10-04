import {times} from 'lodash'

import {
	Aperture,
	BatteryLevel,
	ConfigForDevicePropTable,
	DriveMode,
	DriveModeTable,
	ExposureMode,
	ExposureModeTable,
	ISO,
	WhiteBalance,
	WhiteBalanceTable,
} from '../configs'
import {DeviceInfo} from '../DeviceInfo'
import {
	DatatypeCode,
	DevicePropCode,
	EventCode,
	ObjectFormatCode,
	OpCode,
	PTPAccessCapabilityCode,
	PTPFilesystemTypeCode,
	PTPStorageTypeCode,
	ResCode,
} from '../PTPDatacode'
import {PTPDataView} from '../PTPDataView'
import {PTPDevice, PTPEvent} from '../PTPDevice'
import {
	ConfigDesc,
	ConfigDescOption,
	createReadonlyConfigDesc,
	OperationResult,
	TakePhotoOption,
	Tethr,
} from '../Tethr'
import {TethrObject, TethrObjectInfo} from '../TethrObject'
import {TethrStorage} from '../TethrStorage'
import {isntNil, toHexString} from '../util'

type DevicePropScheme<T, D extends DatatypeCode> = {
	devicePropCode: number
	datatypeCode: D
	decode: (data: DataViewTypeForDatatypeCode<D>) => T | null
	encode: (value: T) => DataViewTypeForDatatypeCode<D> | null
}

type DataViewTypeForDatatypeCode<D extends DatatypeCode> =
	D extends DatatypeCode.String
		? string
		: D extends DatatypeCode.Uint64
		? bigint
		: D extends DatatypeCode.Int64
		? bigint
		: D extends DatatypeCode.Uint128
		? bigint
		: D extends DatatypeCode.Int128
		? bigint
		: number

export class TethrPTPUSB extends Tethr {
	protected _opened = false

	constructor(protected device: PTPDevice) {
		super()
	}

	get opened(): boolean {
		return this._opened
	}

	async open(): Promise<void> {
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
		this.device.on('disconnect', () => {
			this._opened = false
			this.emit('disconnect')
		})

		window.addEventListener('beforeunload', async () => {
			await this.close()
		})

		this._opened = true
	}

	async close(): Promise<void> {
		this._opened = false

		await this.device.sendCommand({
			label: 'Close Session',
			opcode: OpCode.CloseSession,
		})
		await this.device.close()
	}

	// Configs

	setAperture(value: Aperture) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.FNumber,
			datatypeCode: DatatypeCode.Uint16,
			encode(value) {
				if (value === 'auto') return null
				return Math.round(value * 100)
			},
			value,
		})
	}

	getApertureDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.FNumber,
			datatypeCode: DatatypeCode.Uint16,
			decode(data) {
				return (data / 100) as Aperture
			},
		})
	}

	getBatteryLevelDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.BatteryLevel,
			datatypeCode: DatatypeCode.Uint8,
			decode: data => data as BatteryLevel,
		})
	}

	async getCanTakePhotoDesc() {
		const {operationsSupported} = await this.getDeviceInfo()
		const value = operationsSupported.includes(OpCode.InitiateCapture)
		return createReadonlyConfigDesc(value)
	}

	setCaptureDelay(value: number) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.CaptureDelay,
			datatypeCode: DatatypeCode.Uint32,
			encode: data => data,
			value,
		})
	}

	getCaptureDelayDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.CaptureDelay,
			datatypeCode: DatatypeCode.Uint32,
			decode: data => data,
		})
	}

	setDriveMode(value: DriveMode) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.StillCaptureMode,
			datatypeCode: DatatypeCode.Uint16,
			encode(value) {
				return DriveModeTable.getKey(value) ?? 0x0
			},
			value,
		})
	}

	getDriveModeDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.StillCaptureMode,
			datatypeCode: DatatypeCode.Uint16,
			decode: data => {
				return DriveModeTable.get(data) ?? 'normal'
			},
		})
	}

	setExposureComp(value: string) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.ExposureBiasCompensation,
			datatypeCode: DatatypeCode.Int16,
			encode(str) {
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
			value,
		})
	}

	getExposureCompDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.ExposureBiasCompensation,
			datatypeCode: DatatypeCode.Int16,
			decode(mills) {
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
		})
	}

	async setExposureMode(value: ExposureMode) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.ExposureProgramMode,
			datatypeCode: DatatypeCode.Uint16,
			encode: value => {
				return (
					ExposureModeTable.getKey(value) ??
					parseInt(value.replace('vendor ', ''), 16)
				)
			},
			value,
		})
	}

	async getExposureModeDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.ExposureProgramMode,
			datatypeCode: DatatypeCode.Uint16,
			decode(data) {
				return (
					ExposureModeTable.get(data) ??
					(`vendor ${toHexString(data, 4)}` as ExposureMode)
				)
			},
		})
	}

	setImageSizeValue(value: string) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.ImageSize,
			datatypeCode: DatatypeCode.String,
			encode: data => data,
			value,
		})
	}
	getImageSizeDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.ImageSize,
			datatypeCode: DatatypeCode.String,
			decode: data => data,
		})
	}

	setIso(value: ISO) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.ExposureIndex,
			datatypeCode: DatatypeCode.Uint16,
			encode(iso) {
				if (iso === 'auto') return 0xffff
				return iso
			},
			value,
		})
	}

	getIsoDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.ExposureIndex,
			datatypeCode: DatatypeCode.Uint16,
			decode: data => {
				if (data === 0xffff) return 'auto'
				return data
			},
		})
	}

	async getManufacturerDesc() {
		const value = (await this.getDeviceInfo()).manufacturer
		return createReadonlyConfigDesc(value)
	}

	async getModelDesc() {
		const value = (await this.getDeviceInfo()).model
		return createReadonlyConfigDesc(value)
	}

	setWhiteBalance(value: WhiteBalance) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.WhiteBalance,
			datatypeCode: DatatypeCode.Uint16,
			encode(value) {
				return (
					WhiteBalanceTable.getKey(value) ??
					parseInt(value.replace(/^vendor /, ''), 16)
				)
			},
			value,
		})
	}

	getWhiteBalanceDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.WhiteBalance,
			datatypeCode: DatatypeCode.Uint16,
			decode: data => {
				return (
					WhiteBalanceTable.get(data) ??
					(`vendor ${toHexString(data, 4)}` as WhiteBalance)
				)
			},
		})
	}

	setTimelapseNumber(value: number) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.TimelapseNumber,
			datatypeCode: DatatypeCode.Uint32,
			encode: data => data,
			value,
		})
	}

	getTimelapseNumberDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.TimelapseNumber,
			datatypeCode: DatatypeCode.Uint32,
			decode: data => data,
		})
	}

	setTimelapseInterval(value: number) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.TimelapseInterval,
			datatypeCode: DatatypeCode.Uint32,
			encode: data => data,
			value,
		})
	}

	getTimelapseIntervalDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.TimelapseInterval,
			datatypeCode: DatatypeCode.Uint32,
			decode: data => data,
		})
	}

	// Actions

	async takePhoto({doDownload = true}: TakePhotoOption = {}): Promise<
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

		if (!doDownload) return {status: 'ok', value: []}

		const objectID = objectAddedEvent.parameters[0]
		const objectInfo = await this.getObjectInfo(objectID)
		const objectBuffer = await this.getObject(objectID)

		const tethrObject: TethrObject = {
			...objectInfo,
			blob: new Blob([objectBuffer], {type: 'image/jpeg'}),
		}

		return {status: 'ok', value: [tethrObject]}
	}

	// Utility functions
	protected async setDevicePropValue<T, D extends DatatypeCode>({
		devicePropCode,
		datatypeCode,
		encode,
		value,
	}: Omit<DevicePropScheme<T, D>, 'decode'> & {
		value: T
	}): Promise<OperationResult> {
		const devicePropData = encode(value)

		if (devicePropData === null) {
			return {
				status: 'invalid parameter',
			}
		}

		const dataView = new PTPDataView()
		switch (datatypeCode) {
			case DatatypeCode.Uint8:
				dataView.writeUint8(devicePropData as number)
				break
			case DatatypeCode.Int8:
				dataView.writeInt8(devicePropData as number)
				break
			case DatatypeCode.Uint16:
				dataView.writeUint16(devicePropData as number)
				break
			case DatatypeCode.Int16:
				dataView.writeInt16(devicePropData as number)
				break
			case DatatypeCode.Uint32:
				dataView.writeUint32(devicePropData as number)
				break
			case DatatypeCode.Int32:
				dataView.writeInt32(devicePropData as number)
				break
			case DatatypeCode.Uint64:
				dataView.writeBigUint64(devicePropData as bigint)
				break
			case DatatypeCode.String:
				dataView.writeBigUint64(devicePropData as bigint)
				break
			default: {
				const label = DatatypeCode[datatypeCode] ?? toHexString(16)
				throw new Error(
					`DevicePropDesc of datatype ${label} is not yet supported`
				)
			}
		}

		const {resCode} = await this.device.sendData({
			label: 'SetDevicePropValue',
			opcode: OpCode.SetDevicePropValue,
			parameters: [devicePropCode],
			data: dataView.toBuffer(),
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		return {
			status: resCode === ResCode.OK ? 'ok' : 'busy',
		}
	}

	protected async getDevicePropDesc<T, D extends DatatypeCode>({
		devicePropCode,
		datatypeCode,
		decode,
	}: Omit<DevicePropScheme<T, D>, 'encode'>): Promise<ConfigDesc<T>> {
		// Check if the deviceProps is supported
		if (!(await this.isDevicePropSupported(devicePropCode))) {
			return {
				writable: false,
				value: null,
			}
		}

		const {data} = await this.device.receiveData({
			label: 'GetDevicePropDesc',
			opcode: OpCode.GetDevicePropDesc,
			parameters: [devicePropCode],
		})

		const dataView = new PTPDataView(data.slice(2))
		/*const dataType =*/ dataView.readUint16()
		const writable = dataView.readUint8() === 0x01 // Get/Set

		let readValue: () => DataViewTypeForDatatypeCode<D>

		switch (datatypeCode) {
			case DatatypeCode.Uint8:
				readValue = dataView.readUint8 as any
				break
			case DatatypeCode.Uint16:
				readValue = dataView.readUint16 as any
				break
			case DatatypeCode.Int16:
				readValue = dataView.readInt16 as any
				break
			case DatatypeCode.Uint32:
				readValue = dataView.readUint32 as any
				break
			case DatatypeCode.Uint64:
				readValue = dataView.readUint64 as any
				break
			case DatatypeCode.String:
				readValue = dataView.readUTF16StringNT as any
				break
			default: {
				const label = DatatypeCode[datatypeCode] ?? toHexString(16)
				throw new Error(`PropDesc of datatype ${label} is not yet supported`)
			}
		}

		readValue() // Skip factoryDefault
		const value = decode(readValue())

		// Read options
		const formFlag = dataView.readUint8()

		let option: ConfigDescOption<T> | undefined

		switch (formFlag) {
			case 0x00:
				// None
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
				option = {
					type: 'range',
					min,
					max,
					step,
				}
				break
			}
			case 0x02: {
				// Enumeration
				const length = dataView.readUint16()
				option = {
					type: 'enum',
					values: times(length, readValue).map(decode).filter(isntNil),
				}
				break
			}
			default:
				throw new Error(`Invalid form flag ${formFlag}`)
		}

		if (writable && option) {
			return {writable, value, option}
		} else {
			return {writable: false, value, option}
		}
	}

	private async isDevicePropSupported(code: number): Promise<boolean> {
		const {devicePropsSupported} = await this.getDeviceInfo()
		return devicePropsSupported.includes(code)
	}

	protected async getDeviceInfo(): Promise<DeviceInfo> {
		return await TethrPTPUSB.getDeviceInfo(this.device)
	}

	protected async getObjectHandles(storageId = 0xffffffff): Promise<number[]> {
		const {data} = await this.device.receiveData({
			label: 'GetObjectHandles',
			opcode: OpCode.GetObjectHandles,
			parameters: [storageId, 0xffffffff, 0x0],
		})

		return new PTPDataView(data).readUint32Array()
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
			format: this.getObjectFormatNameByCode(dataView.readUint16()),
			// protectionStatus: dataView.readUint16(),
			byteLength: dataView.skip(2).readUint32(),
			thumb: {
				format: this.getObjectFormatNameByCode(dataView.readUint16()),
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

	protected async getStorages(): Promise<TethrStorage[]> {
		const {data} = await this.device.receiveData({
			label: 'GetStorageIDs',
			opcode: OpCode.GetStorageIDs,
		})
		const dataView = new PTPDataView(data)

		const ids = dataView.readUint32Array()

		const storages: TethrStorage[] = []

		for (const id of ids) {
			const {data} = await this.device.receiveData({
				label: 'GetStorageInfo',
				parameters: [id],
				opcode: OpCode.GetStorageInfo,
			})

			const storageInfo = new PTPDataView(data)

			const storage: TethrStorage = {
				id: id,
				type: PTPStorageTypeCode[storageInfo.readUint16()],
				filesystemType: PTPFilesystemTypeCode[storageInfo.readUint16()],
				accessCapability: PTPAccessCapabilityCode[storageInfo.readUint16()],
				maxCapability: storageInfo.readUint64(),
				freeSpaceInBytes: storageInfo.readUint64(),
				freeSpaceInImages: storageInfo.readUint32(),
				description: storageInfo.readAsciiString(),
				label: storageInfo.readAsciiString(),
			}

			storages.push(storage)
		}

		return storages
	}

	protected onDevicePropChanged = async (event: PTPEvent) => {
		const devicePropCode = event.parameters[0]
		const name = this.getConfigNameByCode(devicePropCode)

		if (!name) return

		const desc = await this.getDesc(name)
		this.emit(`${name}Changed`, desc)
	}

	protected getConfigNameByCode(code: number) {
		return ConfigForDevicePropTable.get(code) ?? null
	}

	protected getObjectFormatNameByCode(code: number) {
		return ObjectFormatCode[code].toLowerCase()
	}

	static async getDeviceInfo(device: PTPDevice): Promise<DeviceInfo> {
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
}
