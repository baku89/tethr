import {BiMap} from 'bim'
import _ from 'lodash'

import {PTPDeviceEvent} from '@/PTPDevice'

import {OpCode, ResCode} from '../../PTPDatacode'
import {PTPDecoder} from '../../PTPDecoder'
import {isntNil} from '../../util'
import {
	Aperture,
	BasePropType,
	ExposureMode,
	ISO,
	ManualFocusDriveOption,
	PropDesc,
	SetPropResult,
	Tethr,
	WhiteBalance,
} from '../Tethr'

enum OpCodePanasonic {
	OpenSession = 0x9102,
	CloseSession = 0x9103,
	GetDevicePropDesc = 0x9108,
	GetDevicePropValue = 0x9402,
	SetDevicePropValue = 0x9403,
	InitiateCapture = 0x9404,
	Liveview = 0x9412,
	ManualFocusDrive = 0x9416,
	LiveviewImage = 0x9706,
}

enum EventCodePanasonic {
	PropChanged = 0xc102,
}

// Panasonic does not have regular device properties, they use some 32bit values
enum DevicePropCodePanasonic {
	PhotoStyle = 0x02000010,
	PhotoStyle_Param = 0x02000011,
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

	ImageMode = 0x20000a0,
	ImageMode_Param = 0x20000a1,
	ImageMode_Quality = 0x20000a2,
	ImageMode_AspectRatio = 0x20000a3,
}

type PropScheme = {
	[Name in keyof BasePropType]?: {
		getCode: number
		setCode?: number
		decode: (value: number) => BasePropType[Name] | null
		encode?: (value: BasePropType[Name]) => number | null
		valueSize: 1 | 2 | 4
	}
}

export class TethrPanasnoic extends Tethr {
	private propSchemePanasonic: PropScheme = {
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

				return null
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
		exposureComp: {
			getCode: DevicePropCodePanasonic.Exposure,
			setCode: DevicePropCodePanasonic.Exposure_Param,
			decode(v) {
				if (v === 0x0) return '0'

				const steps = v & 0xf
				const digits = Math.floor(steps / 3)
				const thirds = steps % 3
				const negative = v & 0x8000

				const sign = negative ? '-' : '+'
				const thirdsSymbol = thirds === 1 ? '1/3' : thirds === 2 ? '2/3' : ''

				if (digits === 0) return sign + thirdsSymbol
				if (thirds === 0) return sign + digits

				return sign + digits + ' ' + thirdsSymbol
			},
			encode(v) {
				if (v === '0') return 0x0

				let negative = false,
					digits = 0,
					thirds = 0

				const match1 = v.match(/^([+-]?)([0-9]+)( 1\/3| 2\/3)?$/)

				if (match1) {
					negative = match1[1] === '-'
					digits = parseInt(match1[2])
					thirds = !match1[3] ? 0 : match1[3] === ' 1/3' ? 1 : 2
				}

				const match2 = match1 && v.match(/^([+-]?)(1\/3|2\/3)$/)

				if (match2) {
					negative = match2[1] === '-'
					thirds = match2[2] === '1/3' ? 1 : 2
				}

				if (!match1 && !match2) return null

				const steps = digits * 3 + thirds

				return (negative ? 0x8000 : 0x0000) | steps
			},
			valueSize: 2,
		},
		whiteBalance: {
			getCode: DevicePropCodePanasonic.WhiteBalance,
			setCode: DevicePropCodePanasonic.WhiteBalance_Param,
			decode(value: number) {
				return TethrPanasnoic.WhiteBalanceTable.get(value) ?? null
			},
			encode(value: WhiteBalance) {
				return TethrPanasnoic.WhiteBalanceTable.getKey(value) ?? null
			},
			valueSize: 2,
		},
		colorTemperature: {
			getCode: DevicePropCodePanasonic.WhiteBalance_KSet,
			setCode: DevicePropCodePanasonic.WhiteBalance_KSet,
			decode: _.identity,
			encode: _.identity,
			valueSize: 2,
		},
		effectMode: {
			getCode: DevicePropCodePanasonic.PhotoStyle,
			setCode: DevicePropCodePanasonic.PhotoStyle_Param,
			decode(value: number) {
				return TethrPanasnoic.EffectModeTable.get(value) ?? null
			},
			encode(value: string) {
				return TethrPanasnoic.EffectModeTable.getKey(value) ?? null
			},
			valueSize: 2,
		},
		aspectRatio: {
			getCode: DevicePropCodePanasonic.ImageMode_AspectRatio,
			setCode: DevicePropCodePanasonic.ImageMode_AspectRatio,
			decode(value: number) {
				return TethrPanasnoic.AspectRatioTable.get(value) ?? null
			},
			encode(value: string) {
				return TethrPanasnoic.AspectRatioTable.getKey(value) ?? null
			},
			valueSize: 2,
		},
		imageQuality: {
			getCode: DevicePropCodePanasonic.ImageMode_Quality,
			setCode: DevicePropCodePanasonic.ImageMode_Quality,
			decode(value: number) {
				return TethrPanasnoic.ImageQualityTable.get(value) ?? null
			},
			encode(value: string) {
				return TethrPanasnoic.ImageQualityTable.getKey(value) ?? null
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

		this.device.on('0xc102', this.onPropChanged)
	}

	public close = async (): Promise<void> => {
		await this.device.sendCommand({
			label: 'Panasonic CloseSession',
			code: OpCodePanasonic.CloseSession,
			parameters: [0x00010001],
		})

		await super.open()
	}

	public async set<K extends keyof BasePropType>(
		name: K,
		value: BasePropType[K]
	): Promise<SetPropResult<BasePropType[K]>> {
		const scheme = this.propSchemePanasonic[name] as PropScheme[K] | undefined

		if (!scheme)
			throw new Error(`Prop ${name} is not supported for this device`)

		const setCode = scheme.setCode
		const encode = scheme.encode as (value: BasePropType[K]) => number | null
		const valueSize = scheme.valueSize

		const desc = await this.getDesc(name)

		if (!(setCode && encode && desc.writable)) {
			return {
				status: 'unsupported',
				value: (await this.get(name)) as BasePropType[K],
			}
		}

		const data = new ArrayBuffer(4 + 4 + valueSize)
		const dataView = new DataView(data)
		const encodedValue = await encode(value)

		if (encodedValue === null) {
			return {
				status: 'unsupported',
				value: (await this.get(name)) as BasePropType[K],
			}
		}

		dataView.setUint32(0, setCode, true)
		dataView.setUint32(4, valueSize, true)
		if (valueSize === 1) dataView.setUint8(8, encodedValue)
		if (valueSize === 2) dataView.setUint16(8, encodedValue, true)
		if (valueSize === 4) dataView.setUint32(8, encodedValue, true)

		const succeed = await this.device.sendData({
			label: 'Panasonic SetDevicePropValue',
			code: OpCodePanasonic.SetDevicePropValue,
			parameters: [setCode],
			data,
		})

		return {
			status: succeed ? 'ok' : 'invalid',
			value: (await this.get(name)) as BasePropType[K],
		}
	}

	public async getDesc<K extends keyof BasePropType, T extends BasePropType[K]>(
		name: K
	): Promise<PropDesc<T>> {
		// const superDesc = await super.getDesc(name)
		// if (superDesc.value !== null) return superDesc as PropDesc<T>

		const scheme = this.propSchemePanasonic[name]

		if (!scheme) {
			// console.warn(`Prop ${name} is not supported`)
			return {
				writable: false,
				value: null,
				supportedValues: [],
			}
		}

		const getCode = scheme.getCode
		const decode = scheme.decode as (data: number) => T
		const valueSize = scheme.valueSize

		const {data} = await this.device.receiveData({
			label: 'Panasonic GetDevicePropDesc',
			code: OpCodePanasonic.GetDevicePropDesc,
			parameters: [getCode],
		})

		const decoder = new PTPDecoder(data)

		const getValue =
			valueSize === 1
				? decoder.readUint8
				: valueSize === 2
				? decoder.readUint16
				: decoder.readUint32
		const getArray =
			valueSize === 1
				? decoder.readUint8Array
				: valueSize === 2
				? decoder.readUint16Array
				: decoder.readUint32Array

		decoder.skip(4) // dpc
		const headerLength = decoder.readUint32()

		decoder.goto(headerLength * 4 + 2 * 4)

		const value = decode(getValue())

		const supportedValues = [...getArray()].map(decode).filter(isntNil)

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

	public async manualFocusDrive(option: ManualFocusDriveOption) {
		const {direction, speed} = option

		let mode = 0

		if (direction === 'far') {
			if (speed === 1) mode = 2
			else if (speed === 2) mode = 1
		} else if (direction === 'near') {
			if (speed === 1) mode = 3
			else if (speed === 2) mode = 4
		}

		if (!mode) {
			throw new Error('This speed is not supported')
		}

		const propCode = 0x03010011

		const data = new ArrayBuffer(10)
		const dataView = new DataView(data)

		dataView.setUint32(0, propCode, true)
		dataView.setUint32(4, 2, true)
		dataView.setUint16(8, mode, true)

		await this.device.sendData({
			label: 'Panasonic ManualFocusDrive',
			code: OpCodePanasonic.ManualFocusDrive,
			parameters: [propCode],
			data,
		})
	}

	private onPropChanged = async (ev: PTPDeviceEvent) => {
		const code = ev.parameters[0]

		let props: (keyof BasePropType)[]

		switch (code) {
			case DevicePropCodePanasonic.CameraMode:
				props = ['exposureMode', 'aperture', 'shutterSpeed', 'exposureComp']
				break
			case DevicePropCodePanasonic.Aperture:
				props = ['aperture']
				break
			case DevicePropCodePanasonic.ShutterSpeed:
				props = ['shutterSpeed']
				break
			case DevicePropCodePanasonic.ISO:
				props = ['iso']
				break
			case DevicePropCodePanasonic.Exposure:
				props = ['exposureComp']
				break
			case DevicePropCodePanasonic.WhiteBalance:
				props = ['whiteBalance', 'colorTemperature']
				break
			case DevicePropCodePanasonic.PhotoStyle:
				props = ['effectMode']
				break
			case DevicePropCodePanasonic.ImageMode:
				props = ['imageResolution', 'aspectRatio', 'imageQuality']
				break
			default:
				return
		}

		for (const prop of props) {
			const desc = await this.getDesc(prop)
			this.emit(`${prop}Changed`, desc)
		}
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
		[0x8010, 'manual'],
		[0x8011, 'manual2'],
		[0x8012, 'manual3'],
		[0x8013, 'manual4'],
		[0x8014, 'auto cool'],
		[0x8015, 'auto warm'],
	])

	private static EffectModeTable = new BiMap<number, string>([
		[0, 'Standard'],
		[1, 'Vivid'],
		[2, 'Natural'],
		[18, 'Flat'],
		[4, 'Landscape'],
		[5, 'Portrait'],
		[3, 'Monochorme'],
		[15, 'L.Monochrome'],
		[17, 'L.Monochrome D'],
		[41, 'Cinelike D2'],
		[42, 'Cinelike V2'],
		[14, 'Like709'],
		[40, 'V-Log'],
		[19, 'MY PHOTOSTYLE 1'],
		[20, 'MY PHOTOSTYLE 2'],
		[21, 'MY PHOTOSTYLE 3'],
		[22, 'MY PHOTOSTYLE 4'],
	])

	private static AspectRatioTable = new BiMap<number, string>([
		[1, '4:3'],
		[2, '3:2'],
		[3, '16:9'],
		[4, '1:1'],
		[10, '65:24'],
		[11, '2:1'],
	])

	private static ImageQualityTable = new BiMap<number, string>([
		[0, 'fine'],
		[1, 'std'],
		[2, 'raw'],
		[3, 'raw +fine'],
		[4, 'raw + std'],
	])
}
