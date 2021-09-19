import {BiMap} from 'bim'
import _ from 'lodash'
import sleep from 'sleep-promise'

import {TethrObject} from '@/TethrObject'

import {decodeIFD, IFDType} from '../../IFD'
import {ResCode} from '../../PTPDatacode'
import {PTPDataView} from '../../PTPDataView'
import {isntNil} from '../../util'
import {
	Aperture,
	BatteryLevel,
	convertShutterSpeedToTime,
	ExposureMode,
	ISO,
	PropDesc,
	PropNames,
	PropType,
	SetPropResult,
	SetPropResultStatus,
	ShutterSpeed,
	TakePictureOption,
	Tethr,
	WhiteBalance,
} from '../Tethr'
import {
	SigmaApexApertureHalf,
	SigmaApexApertureOneThird,
	SigmaApexBatteryLevel,
	SigmaApexCompensationOneThird,
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

enum CaptStatus {
	runSnap = 0x0001,
	compSnap = 0x0002,
	runImageCreate = 0x0004,
	compImageCreate = 0x0005,
	compMovieStopStandby = 0x0006,
	compMovieCreate = 0x0007,
	okAf = 0x8001,
	okCwb = 0x8002,
	okImageSave = 0x8003,
	okNoerrorEtc = 0x8004,
	ngAf = 0x6001,
	ngBaffaFull = 0x6002,
	ngCwb = 0x6003,
	ngImageCreate = 0x6004,
	ngGeneral = 0x6005,
}

enum SnapCaptureMode {
	GeneralCapture = 0x01,
	NonAFCapture = 0x02,
	AFDriveOnly = 0x03,
	StartAF = 0x04,
	StopAF = 0x05,
	StartCapture = 0x06,
	StopCapture = 0x07,
	StartRecordingMovieWithAF = 0x10,
	StartRecordingMovieWithoutAF = 0x20,
	StopRecordingMovie = 0x30,
}

export class TethrSigma extends Tethr {
	private _liveviewing = false

	public open = async (): Promise<void> => {
		await super.open()

		await this.device.receiveData({
			label: 'SigmaFP ConfigApi',
			opcode: OpCodeSigma.ConfigApi,
			parameters: [0x0],
		})

		await this.getCamDataGroup1()
		await this.getCamDataGroup2()
	}

	public async set<K extends PropNames>(
		name: K,
		value: PropType[K]
	): Promise<SetPropResult<PropType[K]>> {
		let succeed = false
		let status: SetPropResultStatus | undefined

		let mayAffectProps: PropNames[] = []

		switch (name) {
			case 'exposureMode':
				succeed = await this.setExposureMode(value as ExposureMode)
				mayAffectProps = ['aperture', 'shutterSpeed', 'exposureComp']
				break
			case 'aperture':
				succeed = await this.setAperture(value as Aperture)
				break
			case 'shutterSpeed':
				succeed = await this.setShutterSpeed(value as ShutterSpeed)
				break
			case 'iso':
				succeed = await this.setISO(value as ISO)
				break
			case 'exposureComp':
				succeed = await this.setExposureComp(value as string)
				break
			case 'whiteBalance':
				succeed = await this.setWhiteBalance(value as WhiteBalance)
				mayAffectProps = ['colorTemperature']
				break
			case 'colorTemperature':
				succeed = await this.setColorTemperature(value as number)
				break
			case 'colorMode':
				succeed = await this.setColorMode(value as string)
				break
			default:
				status = 'unsupported'
		}

		const postValue = await this.get(name)

		for (const prop of mayAffectProps) {
			const desc = await this.getDesc(prop)
			this.emit(`${prop}Changed`, desc)
		}

		return {
			status: status ?? (succeed ? 'ok' : 'invalid'),
			value: postValue,
		}
	}

	public async getDesc<N extends PropNames, T extends PropType[N]>(
		name: N
	): Promise<PropDesc<T>> {
		type ReturnType = PropDesc<T>

		switch (name) {
			case 'batteryLevel':
				return (await this.getBatteryLevelDesc()) as ReturnType
			case 'focalLength':
				return (await this.getFocalLengthDesc()) as ReturnType
			case 'exposureMode':
				return (await this.getExposureModeDesc()) as ReturnType
			case 'aperture':
				return (await this.getApertureDesc()) as ReturnType
			case 'shutterSpeed':
				return (await this.getShutterSpeedDesc()) as ReturnType
			case 'iso':
				return (await this.getISODesc()) as ReturnType
			case 'whiteBalance':
				return (await this.getWhiteBalanceDesc()) as ReturnType
			case 'exposureComp':
				return (await this.getExposureCompDesc()) as ReturnType
			case 'colorTemperature':
				return (await this.getColorTemperatureDesc()) as ReturnType
			case 'colorMode':
				return (await this.getColorModeDesc()) as ReturnType
		}

		return {
			writable: false,
			value: null,
			supportedValues: [],
		}
	}

	private getFocalLengthDesc = async (): Promise<PropDesc<number>> => {
		const data = (await this.getCamDataGroup1()).currentLensFocalLength
		const value = decodeFocalLength(data)

		return {
			writable: false,
			value,
			supportedValues: [],
		}

		function decodeFocalLength(byte: number) {
			const integer = byte >> 4,
				fractional = byte & 0b1111

			return integer + fractional / 10
		}
	}

	private getAperture = async () => {
		const {aperture} = await this.getCamDataGroup1()
		if (aperture === 0x0) return 'auto'
		return (
			SigmaApexApertureOneThird.get(aperture) ??
			SigmaApexApertureHalf.get(aperture) ??
			null
		)
	}

	private setAperture = async (aperture: Aperture): Promise<boolean> => {
		if (aperture === 'auto') return false

		const byte = SigmaApexApertureOneThird.getKey(aperture)
		if (!byte) return false

		return await this.setCamData(OpCodeSigma.SetCamDataGroup1, 1, byte)
	}

	private getApertureDesc = async (): Promise<PropDesc<Aperture>> => {
		const fValue = (await this.getCamCanSetInfo5()).fValue
		const value = await this.getAperture()

		if (fValue.length === 0) {
			// Should be auto aperture
			return {
				writable: false,
				value,
				supportedValues: [],
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

		const supportedValues = apertures.filter(a => fMin <= a && a <= fMax)

		return {
			writable: true,
			value,
			supportedValues,
		}
	}

	private getShutterSpeed = async () => {
		const {shutterSpeed} = await this.getCamDataGroup1()
		if (shutterSpeed === 0x0) return 'auto'
		return (
			SigmaApexShutterSpeedOneThird.get(shutterSpeed) ??
			SigmaApexShutterSpeedHalf.get(shutterSpeed) ??
			null
		)
	}

	private getShutterSpeedDesc = async (): Promise<PropDesc<string>> => {
		const range = (await this.getCamCanSetInfo5()).shutterSpeed
		const value = await this.getShutterSpeed()

		if (range.length < 3) {
			return {
				writable: false,
				value,
				supportedValues: [],
			}
		}

		const [tvMin, tvMax, step] = range

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
			Math.abs(convertShutterSpeedToTime(e[1]) - ssMinRaw)
		)
		const ssMaxEntry = _.minBy(shutterSpeeds, e =>
			Math.abs(convertShutterSpeedToTime(e[1]) - ssMaxRaw)
		)

		if (!ssMinEntry || !ssMaxEntry) throw new Error()

		const ssMinIndex = ssMinEntry[0]
		const ssMaxIndex = ssMaxEntry[0]

		const supportedValues = shutterSpeeds
			.filter(e => ssMinIndex <= e[0] && e[0] <= ssMaxIndex)
			.map(e => e[1])

		return {
			writable: supportedValues.length > 0,
			value,
			supportedValues,
		}
	}

	private setShutterSpeed = async (ss: ShutterSpeed): Promise<boolean> => {
		const byte = SigmaApexShutterSpeedOneThird.getKey(ss)
		if (!byte) return false

		return this.setCamData(OpCodeSigma.SetCamDataGroup1, 0, byte)
	}

	private getISO = async () => {
		const {isoAuto, isoSpeed} = await this.getCamDataGroup1()
		if (isoAuto === 0x01) {
			return 'auto'
		} else {
			return SigmaApexISO.get(isoSpeed) ?? null
		}
	}

	private setISO = async (iso: ISO): Promise<boolean> => {
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

	private getISODesc = async (): Promise<PropDesc<ISO>> => {
		const {isoManual} = await this.getCamCanSetInfo5()
		const value = await this.getISO()

		const [svMin, svMax] = isoManual

		const isoMin = Math.round(3.125 * 2 ** svMin)
		const isoMax = Math.round(3.125 * 2 ** svMax)

		const isos = [...SigmaApexISO.values()]
		const supportedValues = isos.filter(a => isoMin <= a && a <= isoMax)

		supportedValues.unshift('auto')

		return {
			writable: true,
			value,
			supportedValues,
		}
	}

	private getWhiteBalance = async () => {
		const {whiteBalance} = await this.getCamDataGroup2()
		return SigmaApexWhiteBalance.get(whiteBalance) ?? null
	}

	private setWhiteBalance = async (wb: WhiteBalance): Promise<boolean> => {
		const byte = SigmaApexWhiteBalance.getKey(wb)
		if (!byte) return false
		return await this.setCamData(OpCodeSigma.SetCamDataGroup2, 13, byte)
	}

	private getWhiteBalanceDesc = async (): Promise<PropDesc<WhiteBalance>> => {
		const {whiteBalance} = await this.getCamCanSetInfo5()
		const value = await this.getWhiteBalance()

		const supportedValues = whiteBalance
			.map(v => SigmaApexWhiteBalanceIFD.get(v))
			.filter(isntNil)

		return {
			writable: supportedValues.length > 0,
			value,
			supportedValues,
		}
	}

	private getColorTemperature = async () => {
		const wb = await this.getWhiteBalance()
		if (wb !== 'manual') return null

		const {colorTemperature} = await this.getCamDataGroup5()
		return colorTemperature
	}

	private setColorTemperature = async (value: number) => {
		return (
			(await this.setCamData(OpCodeSigma.SetCamDataGroup2, 13, 0x0e)) &&
			(await this.setCamData(OpCodeSigma.SetCamDataGroup5, 1, value))
		)
	}

	private getColorTemperatureDesc = async () => {
		const {colorTemerature} = await this.getCamCanSetInfo5()
		const value = await this.getColorTemperature()

		if (colorTemerature.length !== 3) {
			// When WB is not set to 'manual'
			return {
				writable: false,
				value,
			}
		}

		const [min, max, step] = colorTemerature

		return {
			writable: true,
			value,
			supportedValues: _.range(min, max, step),
		}
	}

	private getExposureMode = async () => {
		const {exposureMode} = await this.getCamDataGroup2()
		return SigmaApexExposureMode.get(exposureMode) ?? null
	}

	private setExposureMode = async (
		exposureMode: ExposureMode
	): Promise<boolean> => {
		const byte = SigmaApexExposureMode.getKey(exposureMode)
		if (!byte) return false

		return this.setCamData(OpCodeSigma.SetCamDataGroup2, 2, byte)
	}

	private getExposureModeDesc = async (): Promise<PropDesc<ExposureMode>> => {
		const {exposureMode} = await this.getCamCanSetInfo5()
		const value = await this.getExposureMode()

		const supportedValues = exposureMode
			.map(n => SigmaApexExposureMode.get(n))
			.filter(isntNil)

		return {
			writable: supportedValues.length > 0,
			value,
			supportedValues,
		}
	}

	private getExposureComp = async () => {
		const {exposureComp} = await this.getCamDataGroup1()
		return SigmaApexCompensationOneThird.get(exposureComp) ?? null
	}

	private setExposureComp = async (value: string): Promise<boolean> => {
		const bits = SigmaApexCompensationOneThird.getKey(value)
		if (bits === undefined) return false
		return this.setCamData(OpCodeSigma.SetCamDataGroup1, 5, bits)
	}

	private getExposureCompDesc = async (): Promise<PropDesc<string>> => {
		const {exposureComp} = await this.getCamCanSetInfo5()
		const value = await this.getExposureComp()

		if (exposureComp.length < 3) {
			return {
				writable: false,
				value,
				supportedValues: [],
			}
		}

		const [min, max] = exposureComp

		const allValues = [...SigmaApexCompensationOneThird.values()]
		const supportedValues = allValues
			.map(v => [v, decodeExposureComp(v)] as [string, number])
			.sort((a, b) => a[1] - b[1])
			.filter(([, n]) => min - 1e-4 <= n && n <= max + 1e-4)
			.map(([v]) => v)

		return {
			writable: exposureComp.length > 0,
			value,
			supportedValues,
		}

		function decodeExposureComp(v: string) {
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

			const match2 = !match1 && v.match(/^([+-]?)(1\/3|2\/3)$/)

			if (match2) {
				negative = match2[1] === '-'
				thirds = match2[2] === '1/3' ? 1 : 2
			}

			if (!match1 && !match2) return null

			return (negative ? -1 : 1) * (digits + thirds / 3)
		}
	}

	private setColorMode = async (colorMode: string): Promise<boolean> => {
		const id = TethrSigma.ColorModeTable.getKey(colorMode)
		if (id === undefined) return false
		return this.setCamData(OpCodeSigma.SetCamDataGroup3, 4, id)
	}

	private getColorModeDesc = async (): Promise<PropDesc<string>> => {
		const {colorMode} = await this.getCamDataGroup3()
		const {colorMode: supportedColorModes} = await this.getCamCanSetInfo5()

		const supportedValues = supportedColorModes.map(decodeColorMode)

		return {
			writable: supportedValues.length > 0,
			value: decodeColorMode(colorMode),
			supportedValues,
		}

		function decodeColorMode(id: number) {
			return TethrSigma.ColorModeTable.get(id) ?? 'Unknown'
		}
	}

	private getBatteryLevelDesc = async (): Promise<PropDesc<BatteryLevel>> => {
		const {batteryLevel} = await this.getCamDataGroup1()
		const value = SigmaApexBatteryLevel.get(batteryLevel) ?? null

		return {
			writable: false,
			value,
			supportedValues: [],
		}
	}

	public takePicture = async ({
		download = true,
	}: TakePictureOption = {}): Promise<null | TethrObject[]> => {
		const captId = await this.executeSnapCommand(
			SnapCaptureMode.NonAFCapture,
			2
		)

		if (captId === null) return null

		if (!download) return null

		const pictInfo = await this.getPictFileInfo()

		// Get file buffer
		const {data: pictFileData} = await this.device.receiveData({
			label: 'SigmaFP GetBigPartialPictFile',
			opcode: OpCodeSigma.GetBigPartialPictFile,
			parameters: [pictInfo.fileAddress, 0x0, pictInfo.fileSize],
			maxByteLength: pictInfo.fileSize + 1000,
		})

		// First 4 bytes seems to be buffer length so splice it
		const jpegData = pictFileData.slice(4)
		const blob = new Blob([jpegData], {type: 'image/jpeg'})

		await this.clearImageDBSingle(captId)

		const jpegTethrObject = {
			format: 'jpeg',
			blob,
		} as TethrObject

		return [jpegTethrObject]
	}

	public runAutoFocus = async (): Promise<boolean> => {
		const captId = await this.executeSnapCommand(SnapCaptureMode.StartAF)

		if (captId !== null) {
			await this.clearImageDBSingle(captId)
			return true
		} else {
			return false
		}
	}

	public startLiveview = async (): Promise<void> => {
		this._liveviewing = true
	}

	public stopLiveview = async (): Promise<void> => {
		this._liveviewing = false
	}

	public getLiveview = async (): Promise<null | string> => {
		const {resCode, data} = await this.device.receiveData({
			label: 'SigmaFP GetViewFrame',
			opcode: OpCodeSigma.GetViewFrame,
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
			maxByteLength: 1_000_000, // = 1MB
		})

		if (resCode !== ResCode.OK) return null

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
			opcode: OpCodeSigma.GetCamDataGroup1,
			parameters: [0x0],
		})

		const dataView = new PTPDataView(data)
		dataView.skip(3) // OC + FieldPreset

		return {
			shutterSpeed: dataView.readUint8(),
			aperture: dataView.readUint8(),
			programShift: dataView.readInt8(),
			isoAuto: dataView.readUint8(),
			isoSpeed: dataView.readUint8(),
			exposureComp: dataView.readUint8(),
			abValue: dataView.readUint8(),
			abSettings: dataView.readUint8(),
			frameBufferState: dataView.readUint8(),
			mediaFreeSpace: dataView.readUint16(),
			mediaStatus: dataView.readUint8(),
			currentLensFocalLength: dataView.readUint16(),
			batteryLevel: dataView.readUint8(),
			abShotRemainNumber: dataView.readUint8(),
			expCompExcludeAB: dataView.readUint8(),
		}
	}

	private async getCamDataGroup2() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroup2',
			opcode: OpCodeSigma.GetCamDataGroup2,
			parameters: [0x0],
		})

		const dataView = new PTPDataView(data)
		dataView.skip(3) // OC + FieldPreset

		return {
			driveMode: dataView.readUint8(),
			specialMode: dataView.readUint8(),
			exposureMode: dataView.readUint8(),
			aeMeteringMode: dataView.readUint8(),
			whiteBalance: dataView.goto(3 + 10).readUint8(),
			resolution: dataView.readUint8(),
			imageQuality: dataView.readUint8(),
		}
	}

	private async getCamDataGroup3() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroup3',
			opcode: OpCodeSigma.GetCamDataGroup3,
			parameters: [0x0],
		})

		const dataView = new PTPDataView(data)
		dataView.skip(3) // OC + FieldPreset

		return {
			colorSpace: dataView.skip(3).readUint8(),
			colorMode: dataView.readUint8(),
			batteryKind: dataView.readUint8(),
			lensWideFocalLength: dataView.readUint16(),
			lensTeleFocalLength: dataView.readUint16(),
			afAuxiliaryLight: dataView.readUint8(),
			afBeep: dataView.readUint8(),
			timerSound: dataView.readUint8(),
			destinationToSave: dataView.skip(1).readUint8(),
		}
	}

	private async getCamDataGroup5() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroup5',
			opcode: OpCodeSigma.GetCamDataGroup5,
			parameters: [0x0],
		})

		const dataView = new PTPDataView(data)
		dataView.skip(3) // OC + FieldPreset

		return {
			intervalTimerSecond: dataView.readUint16(),
			intervalTimerFame: dataView.readUint8(),
			intervalTimerSecond_Remain: dataView.readUint16(),
			intervalTimerFrame_Remain: dataView.readUint8(),
			colorTemperature: dataView.readUint16(),
			aspectRatio: dataView.skip(2).readUint8(),
		}
	}

	private async getCamCanSetInfo5() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamCanSetInfo5',
			opcode: OpCodeSigma.GetCamCanSetInfo5,
			parameters: [0x0],
		})

		return decodeIFD(data, {
			exposureMode: {tag: 200, type: IFDType.Byte},
			fValue: {tag: 210, type: IFDType.SignedShort},
			shutterSpeed: {tag: 212, type: IFDType.SignedShort},
			isoManual: {tag: 215, type: IFDType.SignedShort},
			exposureComp: {tag: 217, type: IFDType.SignedShort},
			whiteBalance: {tag: 301, type: IFDType.Byte},
			colorTemerature: {tag: 302, type: IFDType.Short},
			colorMode: {tag: 320, type: IFDType.Byte},
		})
	}

	private async getCamDataGroupFocus() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroupFocus',
			opcode: OpCodeSigma.GetCamDataGroupFocus,
			parameters: [0x0],
		})

		return decodeIFD(data, {
			focusMode: {tag: 1, type: IFDType.Byte},
			afLock: {tag: 2, type: IFDType.Byte},
			afFaceEyePriorMode: {tag: 3, type: IFDType.Byte},
			afFaceEyePriorDetectionStatus: {tag: 4, type: IFDType.Byte},
			afAreaSelect: {tag: 10, type: IFDType.Byte},
			afAreaMode: {tag: 11, type: IFDType.Byte},
			afFrameSize: {tag: 12, type: IFDType.Byte},
			// afFramePosition: {tag: 13, type: IFDType.Byte},
			// afFrameFaceFocusDetection: {tag: 14, type: IFDType.Byte},
			preAlwaysAf: {tag: 51, type: IFDType.Byte},
			afLimit: {tag: 52, type: IFDType.Byte},
		})
	}

	private async setCamData(opcode: number, propNumber: number, value: number) {
		const buffer = new ArrayBuffer(4)
		const dataView = new DataView(buffer)

		dataView.setUint16(0, 1 << propNumber, true)
		dataView.setUint16(2, value, true)

		const data = TethrSigma.encodeParameter(buffer)

		try {
			await this.device.sendData({
				label: 'SigmaFP SetCamDataGroup#',
				opcode,
				data,
			})
		} catch (err) {
			return false
		}

		return true
	}

	private async getCamCaptStatus(id = 0) {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamCaptStatus',
			opcode: OpCodeSigma.GetCamCaptStatus,
			parameters: [id],
		})

		const dataView = new PTPDataView(data.slice(1))

		return {
			imageId: dataView.readUint8(),
			imageDBHead: dataView.readUint8(),
			imageDBTail: dataView.readUint8(),
			status: dataView.readUint16(),
			destination: dataView.readUint8(),
		}
	}

	/**
	 *
	 * @returns Capture ID if the command execution has succeed, otherwise null
	 */
	private async executeSnapCommand(
		captureMode: number,
		captureAmount = 1
	): Promise<number | null> {
		const {imageDBTail: captId} = await this.getCamCaptStatus()

		const snapState = new Uint8Array([captureMode, captureAmount]).buffer

		await this.device.sendData({
			label: 'Sigma SnapCommand',
			opcode: OpCodeSigma.SnapCommand,
			data: TethrSigma.encodeParameter(snapState),
		})

		for (let restTries = 50; restTries > 0; restTries--) {
			const {status} = await this.getCamCaptStatus(captId)

			const isFailure = (status & 0xf000) === 0x6000
			if (isFailure) return null

			const isSucceed = (status & 0xf000) === 0x8000
			if (isSucceed) return captId

			if (status === CaptStatus.compImageCreate) return captId

			await sleep(500)
		}

		return null
	}

	private async clearImageDBSingle(captId: number) {
		await this.device.sendData({
			label: 'SigmaFP ClearImageDBSingle',
			opcode: OpCodeSigma.ClearImageDBSingle,
			parameters: [captId],
			data: new ArrayBuffer(8),
		})
	}

	private async getPictFileInfo() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetPictFileInfo2',
			opcode: 0x902d,
		})
		const dataView = new PTPDataView(data)

		dataView.skip(12)

		return {
			fileAddress: dataView.readUint32(),
			fileSize: dataView.readUint32(),
			fileExt: dataView.skip(8).readByteString(),
			resolution: {
				width: dataView.readUint16(),
				height: dataView.readUint16(),
			},
			folderName: dataView.readByteString(),
			fileName: dataView.readByteString(),
		}
	}

	private static encodeParameter(buffer: ArrayBuffer) {
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

	private static ColorModeTable = new BiMap<number, string>([
		[0x00, 'normal'],
		[0x01, 'sepia'],
		[0x02, 'bw'],
		[0x03, 'standard'],
		[0x04, 'vivid'],
		[0x05, 'neutral'],
		[0x06, 'portrait'],
		[0x07, 'landscape'],
		[0x08, 'fov classic blue'],
		[0x09, 'sunset red'],
		[0x0a, 'forest'],
		[0x0b, 'cinema'],
		[0x0c, 'fov classic yellow'],
		[0x0d, 'teal and orange'],
		[0x0e, 'off'],
		[0x0f, 'powder blue'],
	])
}
