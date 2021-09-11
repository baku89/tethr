import _ from 'lodash'

import {OpCode, ResCode} from '../../PTPDatacode'
import {PTPDecoder} from '../../PTPDecoder'
import {
	Aperture,
	BasePropType,
	ExposureMode,
	ISO,
	PropDesc,
	Tethr,
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

export class TethrPanasnoic extends Tethr {
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
	): Promise<boolean> {
		let dpc: number,
			valuesize: number,
			encode: (value: T) => number = _.identity

		switch (name) {
			case 'exposureMode':
				dpc = DevicePropCodePanasonic.CameraMode_ModePos
				valuesize = 2
				break
			case 'aperture':
				dpc = DevicePropCodePanasonic.Aperture_Param
				valuesize = 2
				encode = this.encodeAperture as (value: T) => number
				break
			case 'shutterSpeed':
				dpc = DevicePropCodePanasonic.ShutterSpeed_Param
				valuesize = 4
				encode = this.encodeShutterSpeed as (value: T) => number
				break
			case 'iso':
				dpc = DevicePropCodePanasonic.ISO_Param
				valuesize = 4
				encode = this.encodeISO as (value: T) => number
				break
			default:
				throw new Error('Invalid prop name')
		}

		const data = new ArrayBuffer(4 + 4 + valuesize)
		const dataView = new DataView(data)
		const encodedValue = encode(value)

		dataView.setUint32(0, dpc, true)
		dataView.setUint32(4, valuesize, true)
		if (valuesize === 2) dataView.setUint16(8, encodedValue, true)
		if (valuesize === 4) dataView.setUint32(8, encodedValue, true)

		await this.device.sendData({
			label: 'Panasonic SetProperty',
			code: OpCodePanasonic.SetProperty,
			parameters: [dpc],
			data,
		})

		return true
	}

	public async getDesc<K extends keyof BasePropType, T extends BasePropType[K]>(
		name: K
	): Promise<PropDesc<T>> {
		switch (name) {
			case 'exposureMode': {
				const desc = (await this.listProperty(
					DevicePropCodePanasonic.CameraMode_ModePos,
					this.decodeExposureMode,
					2
				)) as PropDesc<T>
				desc.supportedValues = ['P', 'A', 'S', 'M'] as T[]
				return desc
			}
			case 'aperture': {
				return (await this.listProperty(
					DevicePropCodePanasonic.Aperture,
					this.decodeAperture,
					2
				)) as PropDesc<T>
			}
			case 'shutterSpeed': {
				return (await this.listProperty(
					DevicePropCodePanasonic.ShutterSpeed,
					this.decodeShutterSpeed,
					4
				)) as PropDesc<T>
			}
			case 'iso': {
				return (await this.listProperty(
					DevicePropCodePanasonic.ISO,
					this.decodeISO,
					4
				)) as PropDesc<T>
			}
			default:
				throw new Error(`Device prop ${name} is not supported for this device`)
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

	private async listProperty<
		K extends keyof BasePropType,
		T extends BasePropType[K]
	>(
		dpc: number,
		fmap: (n: number) => T = _.identity,
		size: 2 | 4
	): Promise<PropDesc<T>> {
		const {data} = await this.device.receiveData({
			label: 'Panasonic ListProperty',
			code: OpCodePanasonic.ListProperty,
			parameters: [dpc],
		})

		const decoder = new PTPDecoder(data)

		const getValue = size === 2 ? decoder.getUint16 : decoder.getUint32
		const getArray =
			size === 2 ? decoder.getUint16Array : decoder.getUint32Array

		decoder.skip(4) // dpc
		const headerLength = decoder.getUint32()

		decoder.goTo(headerLength * 4 + 2 * 4)

		const currentValue = fmap(getValue())

		const supportedValues = [...getArray()].map(fmap)

		return {
			writable: supportedValues.length > 0,
			currentValue,
			defaultValue: currentValue,
			supportedValues,
		}
	}

	private decodeAperture(aperture: number) {
		return aperture / 10
	}

	private encodeAperture(aperture: Aperture) {
		if (aperture === 'auto') return 0
		return aperture * 10
	}

	private encodeShutterSpeed(value: string) {
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
	}

	private decodeShutterSpeed(value: number) {
		switch (value) {
			case 0xffffffff:
				return 'bulb'
			case 0x0fffffff:
				return 'auto'
			case 0x0ffffffe:
				return 'unknown'
			default:
				if ((value & 0x80000000) === 0x00000000) {
					return '1/' + value / 1000
				} else {
					return ((value & 0x7fffffff) / 1000).toString()
				}
		}
	}

	private encodeISO(iso: ISO): number {
		if (iso === 'auto') return 0xffffffff
		return iso
	}

	private decodeISO(iso: number): ISO {
		if (iso === 0xffffffff) return 'auto'
		if (iso === 0xfffffffe) return 'auto' // i-ISO
		return iso
	}

	private decodeExposureMode(mode: number): ExposureMode {
		switch (mode) {
			case 0x0:
				return 'P'
			case 0x1:
				return 'A'
			case 0x2:
				return 'S'
			case 0x3:
				return 'M'
			default:
				throw new Error(`Unsupported exposure mode ${mode}`)
		}
	}
}
