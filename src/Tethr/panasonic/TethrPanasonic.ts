import _ from 'lodash'

import {OpCode, ResCode} from '../../PTPDatacode'
import {PTPDecoder} from '../../PTPDecoder'
import {Aperture, ExposureMode, ISO, PropDesc, Tethr} from '../Tethr'

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

	public getAperture = this.getPropGetter(
		DevicePropCodePanasonic.Aperture,
		this.decodeAperture,
		2
	)

	public setAperture = this.getPropSetter(
		DevicePropCodePanasonic.Aperture,
		this.encodeAperture,
		2
	)

	public getApertureDesc = async (): Promise<PropDesc<Aperture>> => {
		const {range} = await this.getPropDesc(
			DevicePropCodePanasonic.Aperture,
			this.decodeAperture,
			2
		)

		return {
			canRead: true,
			canWrite: range.length > 0,
			range,
		}
	}

	public getShutterSpeed = this.getPropGetter(
		DevicePropCodePanasonic.ShutterSpeed,
		this.decodeShutterSpeed,
		4
	)

	public getShutterSpeedDesc = async (): Promise<PropDesc<string>> => {
		const {range} = await this.getPropDesc(
			DevicePropCodePanasonic.ShutterSpeed,
			this.decodeShutterSpeed,
			4
		)

		return {
			canRead: true,
			canWrite: true,
			range,
		}
	}

	public getISO = this.getPropGetter(
		DevicePropCodePanasonic.ISO,
		this.decodeISO,
		4
	)

	public setISO = this.getPropSetter(
		DevicePropCodePanasonic.ISO,
		this.encodeISO,
		4
	)

	public getISODesc = async (): Promise<PropDesc<ISO>> => {
		const {range} = await this.getPropDesc(
			DevicePropCodePanasonic.ISO,
			this.decodeISO,
			4
		)

		return {
			canRead: true,
			canWrite: true,
			range,
		}
	}

	public getExposureMode = this.getPropGetter(
		DevicePropCodePanasonic.CameraMode_ModePos,
		this.decodeExposureMode,
		2
	)

	public getExposureModeDesc = async (): Promise<PropDesc<ExposureMode>> => {
		return {
			canRead: true,
			canWrite: true,
			range: ['P', 'A', 'S', 'M'],
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

	private getPropGetter<T>(
		dpc: number,
		fmap: (n: number) => T = _.identity,
		size: 2 | 4
	) {
		return async () => {
			const {data} = await this.device.receiveData({
				label: 'Panasonic GetProperty',
				code: OpCodePanasonic.GetProperty,
				parameters: [dpc],
			})

			const decoder = new PTPDecoder(data)

			const dpc2 = decoder.getUint32().toString(16)
			const bytes = decoder.getUint32()
			const value = size === 2 ? decoder.getUint16() : decoder.getUint32()

			console.log({dpc2, bytes, value, data})

			return fmap(value)
		}
	}

	private getPropSetter<T>(
		dpc: number,
		fmap: (n: T) => number,
		valuesize: 2 | 4
	) {
		return async (value: T) => {
			const data = new ArrayBuffer(4 + 4 + valuesize)
			const dataView = new DataView(data)

			dataView.setUint32(0, dpc)
			dataView.setUint32(4, valuesize)
			if (valuesize === 2) dataView.setUint16(8, fmap(value))
			if (valuesize === 4) dataView.setUint16(8, fmap(value))

			await this.device.sendData({
				label: 'Panasonic SetProperty',
				code: OpCodePanasonic.SetProperty,
				parameters: [dpc],
				data,
			})

			return true
		}
	}

	private async getPropDesc<T>(
		dpc: number,
		fmap: (n: number) => T = _.identity,
		size: 2 | 4
	) {
		const {data} = await this.device.receiveData({
			label: 'Panasonic ListProperty',
			code: OpCodePanasonic.ListProperty,
			parameters: [dpc],
		})

		const decoder = new PTPDecoder(data)

		decoder.skip(4) // dpc
		const headerLength = decoder.getUint32()

		decoder.goTo(headerLength * 4 + 2 * 4)

		const currentValue = fmap(
			size === 2 ? decoder.getUint16() : decoder.getUint32()
		)

		const range = [
			...(size === 2 ? decoder.getUint16Array() : decoder.getUint32Array()),
		].map(fmap)

		return {
			currentValue,
			range,
		}
	}

	private decodeAperture(aperture: number) {
		return aperture / 10
	}

	private encodeAperture(aperture: Aperture) {
		if (aperture === 'auto') return 0
		return aperture * 10
	}

	private decodeShutterSpeed(value: number) {
		switch (value) {
			case 0xffffffff:
				return 'bulb'
			case 0x0fffffff:
				return 'auto'
			case 0x0ffffffe:
				return 'Unknown'
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

	private decodeExposureMode(mode: number): null | ExposureMode {
		switch (mode) {
			case 0x0:
				return 'P'
			case 0x1:
				return 'A'
			case 0x2:
				return 'S'
			case 0x3:
				return 'M'
		}

		return null
	}
}
