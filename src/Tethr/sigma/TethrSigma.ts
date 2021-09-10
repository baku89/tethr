import _ from 'lodash'
import sleep from 'sleep-promise'

import {decodeIFD, IFDType} from '../../IFD'
import {ResCode} from '../../PTPDatacode'
import {PTPDecoder} from '../../PTPDecoder'
import {
	Aperture,
	BatteryLevel,
	ExposureMode,
	ISO,
	PropDesc,
	Tethr,
	WhiteBalance,
} from '../Tethr'
import {
	SigmaApexApertureHalf,
	SigmaApexApertureOneThird,
	SigmaApexBatteryLevel,
	SigmaApexExposureMode,
	SigmaApexISO,
	SigmaApexShutterSpeedHalf,
	SigmaApexShutterSpeedOneThird,
	SigmaApexWhiteBalance,
	SigmaApexWhiteBalanceIFD,
} from './SigmaApexTable'

enum OpCodeSigma {
	GetCamConfig = 0x9010,
	GetCamStatus = 0x9011,
	GetCamDataGroup1 = 0x9012,
	GetCamDataGroup2 = 0x9013,
	GetCamDataGroup3 = 0x9014,
	GetCamCaptStatus = 0x9015,
	SetCamDataGroup1 = 0x9016,
	SetCamDataGroup2 = 0x9017,
	SetCamDataGroup3 = 0x9018,
	SetCamClockAdj = 0x9019,
	GetCamCanSetInfo = 0x901a,
	SnapCommand = 0x901b,
	ClearImageDBSingle = 0x901c,
	ClearImageDBAll = 0x901d,
	GetPictFileInfo = 0x9020,
	GetPartialPictFile = 0x9021,
	GetBigPartialPictFile = 0x9022,

	GetCamDataGroup4 = 0x9023, // ver1.1
	SetCamDataGroup4 = 0x9024, // ver1.1
	GetCamCanSetInfo2 = 0x9025, // ver1.1

	GetCamCanSetInfo3 = 0x9026, // ver1.2
	GetCamDataGroup5 = 0x9027, // ver1.2
	SetCamDataGroup5 = 0x9028, // ver1.2
	GetCamDataGroup6 = 0x9029, // ver1.2
	SetCamDataGroup6 = 0x902a, // ver1.2

	GetViewFrame = 0x902b, // V21
	GetCamCanSetInfo4 = 0x902e, // V21

	GetCamStatus2 = 0x902c,
	GetPictFileInfo2 = 0x902d,
	CloseApplication = 0x902f, // V21

	GetCamCanSetInfo5 = 0x9030, // V5
	GetCamDataGroupFocus = 0x9031, // V5
	SetCamDataGroupFocus = 0x9032, // V5
	GetCamDataGroupMovie = 0x9033, // V5
	SetCamDataGroupMovie = 0x9034, // V5
	ConfigApi = 0x9035, // V5
	GetMovieFileInfo = 0x9036, // V5
	GetPartialMovieFile = 0x9037, // V5
}

export class TethrSigma extends Tethr {
	private _liveviewing = false

	public open = async (): Promise<void> => {
		await super.open()

		const {data} = await this.device.receiveData({
			label: 'SigmaFP ConfigApi',
			code: OpCodeSigma.ConfigApi,
			parameters: [0x0],
		})

		await this.getCamDataGroup1()
		await this.getCamDataGroup2()
	}

	public getFocalLength = async (): Promise<null | number> => {
		const data = (await this.getCamDataGroup1()).currentLensFocalLength
		return this.decodeFocalLength(data)
	}

	public getAperture = async (): Promise<null | Aperture> => {
		const {aperture} = await this.getCamDataGroup1()
		if (aperture === 0x0) return 'auto'
		return (
			SigmaApexApertureOneThird.get(aperture) ??
			SigmaApexApertureHalf.get(aperture) ??
			null
		)
	}

	public setAperture = async (aperture: Aperture): Promise<boolean> => {
		if (aperture === 'auto') return false

		const byte = SigmaApexApertureOneThird.getKey(aperture)
		if (!byte) return false

		return this.setCamData(OpCodeSigma.SetCamDataGroup1, 1, byte)
	}

	public getApertureDesc = async (): Promise<PropDesc<Aperture>> => {
		const fValue = (await this.getCamCanSetInfo5()).fValue

		if (fValue.length === 0) {
			// Should be auto aperture
			return {
				canWrite: false,
				canRead: true,
				range: [],
			}
		}

		const [svMin, svMax, step] = fValue

		const isStepOneThird = Math.abs(step - 1 / 3) < Math.abs(step - 1 / 2)
		const table = isStepOneThird
			? SigmaApexApertureOneThird
			: SigmaApexApertureHalf

		const apertures = Array.from(table.values())

		const fMinRaw = Math.sqrt(2 ** svMin)
		const fMaxRaw = Math.sqrt(2 ** svMax)

		const fMin = _.minBy(apertures, a => Math.abs(a - fMinRaw))
		const fMax = _.minBy(apertures, a => Math.abs(a - fMaxRaw))

		if (!fMin || !fMax) throw new Error()

		const range = apertures.filter(a => fMin <= a && a <= fMax)

		return {
			canWrite: true,
			canRead: true,
			range,
		}
	}

	public getShutterSpeed = async (): Promise<null | string> => {
		const {shutterSpeed} = await this.getCamDataGroup1()
		if (shutterSpeed === 0x0) return 'auto'
		return (
			SigmaApexShutterSpeedOneThird.get(shutterSpeed) ??
			SigmaApexShutterSpeedHalf.get(shutterSpeed) ??
			null
		)
	}

	public getShutterSpeedDesc = async (): Promise<PropDesc<string>> => {
		const info = (await this.getCamCanSetInfo5()).shutterSpeed

		if (info.length === 0) {
			// Should be auto aperture
			return {
				canWrite: false,
				canRead: true,
				range: [],
			}
		}

		const [tvMin, tvMax, step] = info

		const isStepOneThird = Math.abs(step - 1 / 3) < Math.abs(step - 1 / 2)
		const table = isStepOneThird
			? SigmaApexShutterSpeedOneThird
			: SigmaApexShutterSpeedHalf

		const shutterSpeeds = Array.from(table.entries()).filter(
			e => e[1] !== 'sync' && e[1] !== 'bulb'
		)

		const ssMinRaw = 1 / 2 ** tvMin
		const ssMaxRaw = 1 / 2 ** tvMax

		const ssMinEntry = _.minBy(shutterSpeeds, e =>
			Math.abs(convertSSToTime(e[1]) - ssMinRaw)
		)
		const ssMaxEntry = _.minBy(shutterSpeeds, e =>
			Math.abs(convertSSToTime(e[1]) - ssMaxRaw)
		)

		if (!ssMinEntry || !ssMaxEntry) throw new Error()

		const ssMinIndex = ssMinEntry[0]
		const ssMaxIndex = ssMaxEntry[0]

		const range = shutterSpeeds
			.filter(e => ssMinIndex <= e[0] && e[0] <= ssMaxIndex)
			.map(e => e[1])

		return {
			canWrite: true,
			canRead: true,
			range,
		}

		function convertSSToTime(ss: string) {
			if (ss === 'bulk' || ss === 'sync') return Infinity

			if (ss.includes('"')) return parseFloat(ss.replace('"', '.'))

			return 1 / parseInt(ss)
		}
	}

	public setShutterSpeed = async (shutterSpeed: string): Promise<boolean> => {
		const byte = SigmaApexShutterSpeedOneThird.getKey(shutterSpeed)
		if (!byte) return false

		return this.setCamData(OpCodeSigma.SetCamDataGroup1, 0, byte)
	}

	public getISO = async (): Promise<null | ISO> => {
		const {isoAuto, isoSpeed} = await this.getCamDataGroup1()
		if (isoAuto === 0x01) {
			return 'auto'
		} else {
			return SigmaApexISO.get(isoSpeed) ?? null
		}
	}

	public setISO = async (iso: ISO): Promise<boolean> => {
		if (iso === 'auto') {
			return await this.setCamData(OpCodeSigma.SetCamDataGroup1, 3, 0x1)
		}

		const byte = SigmaApexISO.getKey(iso)
		if (!byte) return false

		return (
			(await this.setCamData(OpCodeSigma.SetCamDataGroup1, 3, 0x0)) &&
			(await this.setCamData(OpCodeSigma.SetCamDataGroup1, 4, byte))
		)
	}

	public getISODesc = async (): Promise<PropDesc<ISO>> => {
		const {isoManual} = await this.getCamCanSetInfo5()

		const [svMin, svMax] = isoManual

		const isoMin = Math.round(3.125 * 2 ** svMin)
		const isoMax = Math.round(3.125 * 2 ** svMax)

		const isos = Array.from(SigmaApexISO.values())
		const range = isos.filter(a => isoMin <= a && a <= isoMax)

		range.unshift('auto')

		return {
			canWrite: true,
			canRead: true,
			range,
		}
	}

	public getWhiteBalance = async (): Promise<null | WhiteBalance> => {
		const {whiteBalance} = await this.getCamDataGroup2()
		return SigmaApexWhiteBalance.get(whiteBalance) ?? null
	}

	public setWhiteBalance = async (wb: WhiteBalance): Promise<boolean> => {
		const byte = SigmaApexWhiteBalance.getKey(wb)
		if (!byte) return false
		return this.setCamData(OpCodeSigma.SetCamDataGroup2, 13, byte)
		// }
	}

	public getWhiteBalanceDesc = async (): Promise<PropDesc<WhiteBalance>> => {
		const {whiteBalance} = await this.getCamCanSetInfo5()

		const range = whiteBalance
			.map(v => SigmaApexWhiteBalanceIFD.get(v))
			.filter(v => !!v) as WhiteBalance[]

		return {
			canRead: true,
			canWrite: true,
			range,
		}
	}

	public getColorTemperature = async (): Promise<null | number> => {
		const wb = await this.getWhiteBalance()
		if (wb !== 'manual') return null

		const {colorTemp} = await this.getCamDataGroup5()
		return colorTemp
	}

	public setColorTemperature = async (value: number): Promise<boolean> => {
		return (
			(await this.setCamData(OpCodeSigma.SetCamDataGroup2, 13, 0x0e)) &&
			(await this.setCamData(OpCodeSigma.SetCamDataGroup5, 1, value))
		)
	}

	public getColorTemperatureDesc = async (): Promise<PropDesc<number>> => {
		const {colorTemerature} = await this.getCamCanSetInfo5()

		if (colorTemerature.length !== 3) {
			// When WB is not set to 'manual'
			return {
				canRead: false,
				canWrite: false,
				range: [],
			}
		}

		const [min, max, step] = colorTemerature

		return {
			canRead: true,
			canWrite: true,
			range: _.range(min, max, step),
		}
	}

	public getExposureMode = async (): Promise<null | ExposureMode> => {
		const {exposureMode} = await this.getCamDataGroup2()
		return SigmaApexExposureMode.get(exposureMode) ?? null
	}

	public setExposureMode = async (
		exposureMode: ExposureMode
	): Promise<boolean> => {
		const byte = SigmaApexExposureMode.getKey(exposureMode)
		if (!byte) return false

		return this.setCamData(OpCodeSigma.SetCamDataGroup2, 2, byte)
	}

	public getExposureModeDesc = async (): Promise<PropDesc<ExposureMode>> => {
		const {exposureMode} = await this.getCamCanSetInfo5()

		const range = exposureMode
			.map(n => SigmaApexExposureMode.get(n))
			.filter(m => m !== undefined) as ExposureMode[]

		return {
			canRead: false,
			canWrite: false,
			range,
		}
	}

	public getBatteryLevel = async (): Promise<null | BatteryLevel> => {
		const {batteryLevel} = await this.getCamDataGroup1()
		return SigmaApexBatteryLevel.get(batteryLevel) ?? null
	}

	public takePicture = async (): Promise<null | string> => {
		// https://github.com/gphoto/libgphoto2/blob/96925915768917ef6c245349b787baa275df608c/camlibs/ptp2/library.c#L5426

		const {data: camCaptStatusData} = await this.device.receiveData({
			label: 'SigmaFP GetCamCaptStatus',
			code: OpCodeSigma.GetCamCaptStatus,
			parameters: [0x0],
		})
		const camCaptStatus = this.decodeCamCaptStatus(camCaptStatusData)
		const id = camCaptStatus.imageDBTail

		// Snap
		const buffer = new ArrayBuffer(2)
		const dataView = new DataView(buffer)

		dataView.setUint8(0, 0x02)
		dataView.setUint8(1, 0x02)

		await this.device.sendData({
			label: 'SigmaFP SnapCommand',
			code: 0x901b,
			data: this.encodeParameter(buffer),
		})

		let tries = 50
		while (tries--) {
			const {data} = await this.device.receiveData({
				label: 'SigmaFP GetCamCaptStatus',
				code: OpCodeSigma.GetCamCaptStatus,
				parameters: [id],
			})

			const result = this.decodeCamCaptStatus(data)

			// Failure
			if ((result.status & 0xf000) === 0x6000) {
				switch (result.status) {
					case 0x6001:
						throw new Error('AF failure')
					case 0x6002:
						throw new Error('Buffer full')
					case 0x6003:
						throw new Error('Custom WB failure')
					case 0x6004:
						throw new Error('Image generation failed')
				}
				throw new Error('Capture failed')
			}
			// Success
			if ((result.status & 0xf000) === 0x8000) break
			if (result.status == 0x0002) break
			if (result.status == 0x0005) break

			await sleep(500)
		}

		const {data: pictInfoData} = await this.device.receiveData({
			label: 'SigmaFP GetPictFileInfo2',
			code: 0x902d,
		})
		const pictInfo = this.decodePictureFileInfoData2(pictInfoData)

		// Get file
		const {data: pictFileData} = await this.device.receiveData({
			label: 'SigmaFP GetBigPartialPictFile',
			code: OpCodeSigma.GetBigPartialPictFile,
			parameters: [pictInfo.fileAddress, 0x0, pictInfo.fileSize],
		})

		const blob = new Blob([pictFileData.slice(4)], {type: 'image/jpeg'})
		const url = window.URL.createObjectURL(blob)

		await this.device.sendData({
			label: 'SigmaFP ClearImageDBSingle',
			code: OpCodeSigma.ClearImageDBSingle,
			parameters: [id],
			data: new ArrayBuffer(8),
		})

		return url
	}

	public startLiveView = async (): Promise<void> => {
		this._liveviewing = true
	}

	public stopLiveView = async (): Promise<void> => {
		this._liveviewing = false
	}

	public getLiveView = async (): Promise<null | string> => {
		const {code, data} = await this.device.receiveData({
			label: 'SigmaFP GetViewFrame',
			code: OpCodeSigma.GetViewFrame,
			parameters: [],
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		if (code !== ResCode.OK) return null

		// Might be quirky but somehow works
		const jpegData = data.slice(10)

		const blob = new Blob([jpegData], {type: 'image/jpg'})
		const url = window.URL.createObjectURL(blob)
		return url
	}

	public get liveviewing(): boolean {
		return this._liveviewing
	}

	private async getCamDataGroup1() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroup1',
			code: OpCodeSigma.GetCamDataGroup1,
			parameters: [0x0],
		})

		const decoder = new PTPDecoder(data)
		decoder.getUint8() // Size
		decoder.getUint16() // FieldPreset

		const group1 = {
			shutterSpeed: decoder.getUint8(),
			aperture: decoder.getUint8(),
			programShift: decoder.getInt8(),
			isoAuto: decoder.getUint8(),
			isoSpeed: decoder.getUint8(),
			expCompensation: decoder.getUint8(),
			abValue: decoder.getUint8(),
			abSettings: decoder.getUint8(),
			frameBufferState: decoder.getUint8(),
			mediaFreeSpace: decoder.getUint16(),
			mediaStatus: decoder.getUint8(),
			currentLensFocalLength: decoder.getUint16(),
			batteryLevel: decoder.getUint8(),
			abShotRemainNumber: decoder.getUint8(),
			expCompExcludeAB: decoder.getUint8(),
		}

		return group1
	}

	private async getCamDataGroup2() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroup2',
			code: OpCodeSigma.GetCamDataGroup2,
			parameters: [0x0],
		})

		const decoder = new PTPDecoder(data)
		decoder.getUint8()
		decoder.getUint16() // FieldPreset

		const group2First = {
			driveMode: decoder.getUint8(),
			specialMode: decoder.getUint8(),
			exposureMode: decoder.getUint8(),
			aeMeteringMode: decoder.getUint8(),
		}

		decoder.goTo(3 + 10)

		const group2Second = {
			whiteBalance: decoder.getUint8(),
			resolution: decoder.getUint8(),
			imageQuality: decoder.getUint8(),
		}

		const group2 = {...group2First, ...group2Second}

		return group2
	}

	private async getCamDataGroup5() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroup5',
			code: OpCodeSigma.GetCamDataGroup5,
			parameters: [0x0],
		})

		const decoder = new PTPDecoder(data)
		decoder.getUint8()
		decoder.getUint16() // FieldPreset

		const group5FirstOct = {
			intervalTimerSecond: decoder.getUint16(),
			intervalTimerFame: decoder.getUint8(),
			intervalTimerSecond_Remain: decoder.getUint16(),
			intervalTimerFrame_Remain: decoder.getUint8(),
			colorTemp: decoder.getUint16(),
		}

		decoder.skip(2)

		const group5SecondOct = {
			aspectRatio: decoder.getUint8(),
		}

		const group5 = {...group5FirstOct, ...group5SecondOct}

		return group5
	}

	private async getCamCanSetInfo5() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamCanSetInfo5',
			code: OpCodeSigma.GetCamCanSetInfo5,
			parameters: [0x0],
		})

		return decodeIFD(data, {
			exposureMode: {tag: 200, type: IFDType.Byte},
			fValue: {tag: 210, type: IFDType.SignedShort},
			shutterSpeed: {tag: 212, type: IFDType.SignedShort},
			isoManual: {tag: 215, type: IFDType.SignedShort},
			whiteBalance: {tag: 301, type: IFDType.Byte},
			colorTemerature: {tag: 302, type: IFDType.Short},
		})
	}

	private async setCamData(code: number, propNumber: number, value: number) {
		const buffer = new ArrayBuffer(4)
		const dataView = new DataView(buffer)

		dataView.setUint16(0, 1 << propNumber, true)
		dataView.setUint16(2, value, true)

		const data = this.encodeParameter(buffer)

		try {
			await this.device.sendData({
				label: 'SigmaFP SetCamDataGroup#',
				code,
				data,
			})
		} catch (err) {
			return false
		}

		return true
	}

	private decodeCamCaptStatus(data: ArrayBuffer) {
		const decoder = new PTPDecoder(data.slice(1))
		return {
			imageId: decoder.getUint8(),
			imageDBHead: decoder.getUint8(),
			imageDBTail: decoder.getUint8(),
			status: decoder.getUint16(),
			destination: decoder.getUint8(),
		}
	}

	private decodePictureFileInfoData2(data: ArrayBuffer) {
		const decoder = new PTPDecoder(data)

		decoder.skip(12)

		const chunk0 = {
			fileAddress: decoder.getUint32(),
			fileSize: decoder.getUint32(),
		}

		decoder.skip(8)

		const chunk1 = {
			fileExt: decoder.getByteString(),
			resolution: {
				width: decoder.getUint16(),
				height: decoder.getUint16(),
			},
			folderName: decoder.getByteString(),
			fileName: decoder.getByteString(),
		}

		return {...chunk0, ...chunk1}
	}

	private decodeFocalLength(byte: number) {
		const integer = byte >> 4,
			fractional = byte & 0b1111

		return integer + fractional / 10
	}

	private encodeParameter(buffer: ArrayBuffer) {
		const bytes = new Uint8Array(buffer)

		const size = buffer.byteLength
		const encodedBuffer = new ArrayBuffer(size + 2)
		const encodedBytes = new Uint8Array(encodedBuffer)

		// Set size at the first byte
		encodedBytes[0] = size

		// Insert the content
		for (let i = 0; i < size; i++) {
			encodedBytes[1 + i] = bytes[i]
		}

		// Add checksum on the last
		let checksum = 0
		for (let i = 0; i <= size; i++) {
			checksum += encodedBytes[i]
		}
		encodedBytes[size + 1] = checksum

		return encodedBuffer
	}
}
