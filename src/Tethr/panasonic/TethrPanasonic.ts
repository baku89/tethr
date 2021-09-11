import {BiMap} from 'bim'

import {OpCode, ResCode} from '../../PTPDatacode'
import {PTPDecoder} from '../../PTPDecoder'
import {
	Aperture,
	BasePropType,
	ExposureMode,
	ISO,
	PropDesc,
	SetPropResult,
	Tethr,
	WhiteBalance,
} from '../Tethr'

enum OpCodePanasonic {
	OpenSession = 0x9102,
	CloseSession = 0x9103,
	ListProperty = 0x9108,
	GetProperty = 0x9402,
	SetProperty = 0x9403,
	InitiateCapture = 0x9404,
	Liveview = 0x9412,
	LiveviewImage = 0x9706,
}

// Panasonic does not have regular device properties, they use some 32bit values
enum DevicePropCodePanasonic {
	PhotoStyle = 0x02000010,
	ISO = 0x02000020,
	ISO_Param = 0x02000021,
	ISO_UpperLimit = 0x02000022,
	ShutterSpeed = 0x02000030,
	ShutterSpeed_Param = 0x02000031,
	ShutterSpeed_RangeLimit = 0x02000032,
	Aperture = 0x02000040,
	Aperture_Param = 0x02000041,
	Aperture_RangeLimit = 0x02000042,
	WhiteBalance = 0x02000050,
	WhiteBalance_Param = 0x02000051,
	WhiteBalance_KSet = 0x02000052,
	WhiteBalance_ADJ_AB = 0x02000053,
	WhiteBalance_ADJ_GM = 0x02000054,
	WhiteBalance_ADJ_AB_Sep = 0x02000055,
	Exposure = 0x02000060,
	Exposure_Param = 0x02000061,
	Exposure_RangeLimit = 0x02000062,
	AFArea = 0x02000070,
	AFArea_AFModeParam = 0x02000071,
	AFArea_AFAreaParam = 0x02000072,
	AFArea_SetQuickAFParam = 0x02000073,
	CameraMode = 0x02000080,
	CameraMode_DriveMode = 0x02000081,
	CameraMode_ModePos = 0x02000082,
	CameraMode_CreativeMode = 0x02000083,
	CameraMode_iAMode = 0x02000084,
	ImageFormat = 0x020000a2,
	MeteringInfo = 0x020000b0,
	IntervalInfo = 0x020000c0,
	RecDispConfig = 0x020000e0,
	RecInfoFlash = 0x02000110,
	BurstBracket = 0x02000140,
	RecPreviewConfig = 0x02000170,
	RecInfoSelfTimer = 0x020001a0,
	RecInfoFlash2 = 0x020001b0,
	RecCtrlRelease = 0x03000010,
}

type PropScheme = {
	[Name in keyof BasePropType]?: {
		getCode: number
		setCode?: number
		decode: (value: number) => BasePropType[Name] | null
		encode?: (value: BasePropType[Name]) => number
		valueSize: 2 | 4
	}
}

export class TethrPanasnoic extends Tethr {
	private static PropScheme: PropScheme = {
		exposureMode: {
			getCode: DevicePropCodePanasonic.CameraMode_ModePos,
			valueSize: 2,
			decode(value: number) {
				return (['P', 'A', 'S', 'M'] as ExposureMode[])[value] ?? null
			},
		},
		aperture: {
			getCode: DevicePropCodePanasonic.Aperture,
			setCode: DevicePropCodePanasonic.Aperture_Param,
			decode(value: number) {
				return value / 10
			},
			encode(value: Aperture) {
				return value === 'auto' ? 0 : Math.round(value * 10)
			},
			valueSize: 2,
		},
		shutterSpeed: {
			getCode: DevicePropCodePanasonic.ShutterSpeed,
			setCode: DevicePropCodePanasonic.ShutterSpeed_Param,
			decode(value: number) {
				switch (value) {
					case 0xffffffff:
						return 'bulb'
					case 0x0fffffff:
						return 'auto'
					case 0x0ffffffe:
						return null
				}
				if ((value & 0x80000000) === 0x00000000) {
					return '1/' + value / 1000
				} else {
					return ((value & 0x7fffffff) / 1000).toString()
				}
			},
			encode(value: string) {
				if (value === 'bulb') {
					return 0xffffffff
				}
				if (value === 'auto') {
					return 0x0ffffffe
				}

				const fractionMatch = value.match(/^1\/([0-9]+)$/)

				if (fractionMatch) {
					const denominator = parseInt(fractionMatch[1])
					return denominator * 1000
				}

				// Seconds
				const seconds = parseFloat(value)
				if (!isNaN(seconds)) {
					return Math.round(seconds * 1000) | 0x80000000
				}

				throw new Error('Invalid format of shutter speed')
			},
			valueSize: 4,
		},
		iso: {
			getCode: DevicePropCodePanasonic.ISO,
			setCode: DevicePropCodePanasonic.ISO_Param,
			decode(value: number) {
				if (value === 0xffffffff) return 'auto'
				if (value === 0xfffffffe) return 'auto' // i-ISO
				return value
			},
			encode(value: ISO) {
				return value === 'auto' ? 0xffffffff : value
			},
			valueSize: 4,
		},
		whiteBalance: {
			getCode: DevicePropCodePanasonic.WhiteBalance,
			setCode: DevicePropCodePanasonic.WhiteBalance_Param,
			decode(value: number) {
				return TethrPanasnoic.WhiteBalanceTable.get(value) ?? null
			},
			encode(value: WhiteBalance) {
				const data = TethrPanasnoic.WhiteBalanceTable.getKey(value)
				if (data === undefined) throw new Error(`Unsupported WB`)
				return data
			},
			valueSize: 2,
		},
	}

	public open = async (): Promise<void> => {
		await super.open()

		await this.device.sendCommand({
			label: 'Panasonic OpenSession',
			code: OpCodePanasonic.OpenSession,
			parameters: [0x00010001],
		})
	}

	public close = async (): Promise<void> => {
		await this.device.sendCommand({
			label: 'Panasonic CloseSession',
			code: OpCodePanasonic.CloseSession,
			parameters: [0x00010001],
		})

		await super.open()
	}

	public async set<K extends keyof BasePropType, T extends BasePropType[K]>(
		name: K,
		value: T
	): Promise<SetPropResult<T>> {
		const descriptor = TethrPanasnoic.PropScheme[name] as
			| PropScheme<T>
			| undefined

		if (!descriptor)
			throw new Error(`Prop ${name} is not supported for this device`)

		const setCode = descriptor.setCode
		const encode = descriptor.encode
		const valueSize = descriptor.valueSize

		if (!(setCode && encode)) {
			return {
				status: 'unsupported',
				value: (await this.get(name)) as T,
			}
		}

		const data = new ArrayBuffer(4 + 4 + valueSize)
		const dataView = new DataView(data)
		const encodedValue = encode(value)

		dataView.setUint32(0, setCode, true)
		dataView.setUint32(4, valueSize, true)
		if (valueSize === 2) dataView.setUint16(8, encodedValue, true)
		if (valueSize === 4) dataView.setUint32(8, encodedValue, true)

		const succeed = await this.device.sendData({
			label: 'Panasonic SetProperty',
			code: OpCodePanasonic.SetProperty,
			parameters: [setCode],
			data,
		})

		return {
			status: succeed ? 'ok' : 'invalid',
			value: (await this.get(name)) as T,
		}
	}

	public async getDesc<K extends keyof BasePropType, T extends BasePropType[K]>(
		name: K
	): Promise<PropDesc<T>> {
		const scheme = TethrPanasnoic.PropScheme[name]

		if (!scheme) throw new Error(`Device prop ${name} is not readable`)

		const getCode = scheme.getCode
		const decode = scheme.decode
		const valueSize = scheme.valueSize

		const {data} = await this.device.receiveData({
			label: 'Panasonic ListProperty',
			code: OpCodePanasonic.ListProperty,
			parameters: [getCode],
		})

		const decoder = new PTPDecoder(data)

		const getValue = valueSize === 2 ? decoder.getUint16 : decoder.getUint32
		const getArray =
			valueSize === 2 ? decoder.getUint16Array : decoder.getUint32Array

		decoder.skip(4) // dpc
		const headerLength = decoder.getUint32()

		decoder.goTo(headerLength * 4 + 2 * 4)

		const value = decode(getValue())

		const supportedValues = [...getArray()].map(decode)

		return {
			writable: supportedValues.length > 0,
			value,
			supportedValues,
		}
	}

	public takePicture = async (): Promise<null | string> => {
		await this.device.sendCommand({
			label: 'Panasonic InitiateCapture',
			code: OpCodePanasonic.InitiateCapture,
			parameters: [0x3000011],
		})

		const objectAdded = await this.device.waitEvent(0xc108)
		const objectID = objectAdded.parameters[0]

		const objectInfo = await this.getObjectInfo(objectID)

		const {data} = await this.device.receiveData({
			label: 'GetObject',
			code: OpCode.GetObject,
			parameters: [objectInfo.objectID],
		})

		const blob = new Blob([data], {type: 'image/jpeg'})
		const url = window.URL.createObjectURL(blob)

		return url
	}

	public startLiveView = async (): Promise<void> => {
		await this.device.sendCommand({
			label: 'Panasonic Liveview',
			code: OpCodePanasonic.Liveview,
			parameters: [0x0d000010],
		})
	}

	public stopLiveView = async (): Promise<void> => {
		await this.device.sendCommand({
			label: 'Panasonic Liveview',
			code: OpCodePanasonic.Liveview,
			parameters: [0x0d000011],
		})
	}

	public getLiveView = async (): Promise<null | string> => {
		const {code, data} = await this.device.receiveData({
			label: 'Panasonic LiveviewImage',
			code: OpCodePanasonic.LiveviewImage,
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		if (code !== ResCode.OK) return null

		// This does work somehow
		const jpegData = data.slice(180) //TethrPanasnoic.extractJpeg(data)

		const blob = new Blob([jpegData], {type: 'image/jpg'})
		const url = window.URL.createObjectURL(blob)
		return url
	}

	private static WhiteBalanceTable = new BiMap<number, WhiteBalance>([
		[0x0002, 'auto'],
		[0x0004, 'daylight'],
		[0x8008, 'cloud'],
		[0x0006, 'incandescent'],
		// [0x8009, 'White Set'],
		[0x0007, 'flash'],
		[0x0005, 'fluorescent'],
		// [0x800a, 'Black and White'],
		// [0x800b, 'WB Setting 1'],
		// [0x800c, 'WB Setting 2'],
		// [0x800d, 'WB Setting 3'],
		// [0x800e, 'WB Setting 4'],
		[0x800f, 'shade'],
		// [0x8010, 'Color Temperature (Color Temperature 1)'],
		// [0x8011, 'Color Temperature 2'],
		// [0x8012, 'Color Temperature 3'],
		// [0x8013, 'Color Temperature 4'],
		[0x8014, 'auto cool'],
		[0x8015, 'auto warm'],
	])
}
