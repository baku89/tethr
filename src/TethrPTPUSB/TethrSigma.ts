import {BiMap} from 'bim'
import {minBy} from 'lodash'
import sleep from 'sleep-promise'

import {FocalLength} from '..'
import {
	Aperture,
	BatteryLevel,
	computeShutterSpeedSeconds,
	ConfigName,
	ExposureMode,
	ISO,
	WhiteBalance,
} from '../configs'
import {decodeIFD, IFDType} from '../IFD'
import {ResCode} from '../PTPDatacode'
import {PTPDataView} from '../PTPDataView'
import {
	ConfigDesc,
	createReadonlyConfigDesc,
	OperationResult,
	OperationResultStatus,
	TakePhotoOption,
} from '../Tethr'
import {TethrObject} from '../TethrObject'
import {TethrStorage} from '../TethrStorage'
import {isntNil} from '../util'
import {TethrPTPUSB} from '.'

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

const ConfigListSigma: ConfigName[] = [
	'aperture',
	'iso',
	'colorTemperature',
	'colorMode',
	'destinationToSave',
	'exposureComp',
	'exposureMode',
	'imageAspect',
	'imageQuality',
	'imageSize',
	'liveviewEnabled',
	'liveviewMagnifyRatio',
	'shutterSpeed',
	'whiteBalance',
]

export class TethrSigma extends TethrPTPUSB {
	private liveviewEnabled = false
	private isCapturing = false
	private checkPropChangedTimerId!: number

	public async open() {
		await super.open()

		await this.device.receiveData({
			label: 'SigmaFP ConfigApi',
			opcode: OpCodeSigma.ConfigApi,
			parameters: [0x0],
		})

		this.checkPropChangedTimerId = setInterval(() => {
			if (this.isCapturing) return
			this.emitAllConfigChangedEvents()
		}, 1000)
	}

	public async close(): Promise<void> {
		await this.stopLiveview()
		clearInterval(this.checkPropChangedTimerId)

		await super.close()
	}

	public async getAperture(): Promise<Aperture | null> {
		const {aperture} = await this.getCamDataGroup1()
		if (aperture === 0x0) return 'auto'
		return (
			this.apertureOneThirdTable.get(aperture) ??
			this.apertureHalfTable.get(aperture) ??
			null
		)
	}

	public async setAperture(aperture: Aperture): Promise<OperationResult<void>> {
		if (aperture === 'auto') return {status: 'invalid parameter'}

		const byte = this.apertureOneThirdTable.getKey(aperture)
		if (!byte) return {status: 'invalid parameter'}

		return this.setCamData(OpCodeSigma.SetCamDataGroup1, 1, byte)
	}

	public async getApertureDesc() {
		const fValue = (await this.getCamCanSetInfo5()).fValue
		const value = await this.getAperture()

		if (fValue.length === 0) {
			// Should be auto aperture
			return {
				writable: false,
				value,
			}
		}

		const [svMin, svMax, step] = fValue

		const isStepOneThird = Math.abs(step - 1 / 3) < Math.abs(step - 1 / 2)
		const table = isStepOneThird
			? this.apertureOneThirdTable
			: this.apertureHalfTable

		const apertures = Array.from(table.values())

		const fMinRaw = Math.sqrt(2 ** svMin)
		const fMaxRaw = Math.sqrt(2 ** svMax)

		const fMin = minBy(apertures, a => Math.abs(a - fMinRaw))
		const fMax = minBy(apertures, a => Math.abs(a - fMaxRaw))

		if (!fMin || !fMax) throw new Error()

		const values = apertures.filter(a => fMin <= a && a <= fMax)

		return {
			writable: true,
			value,
			option: {
				type: 'enum',
				values,
			},
		} as ConfigDesc<Aperture>
	}

	public async getBatteryLevelDesc(): Promise<ConfigDesc<BatteryLevel>> {
		const {batteryLevel} = await this.getCamDataGroup1()
		const value = this.batteryLevelTable.get(batteryLevel) ?? null

		return {
			writable: false,
			value,
		}
	}

	public async getCanTakePhotoDesc() {
		return createReadonlyConfigDesc(true)
	}

	public async getCanRunAutoFocusDesc() {
		const {focusMode} = await this.getCamCanSetInfo5()

		const canRun = focusMode.includes(2)

		return createReadonlyConfigDesc(canRun)
	}

	public async getCanStartLiveviewDesc() {
		return createReadonlyConfigDesc(true)
	}

	public async setColorMode(colorMode: string): Promise<OperationResult<void>> {
		const id = this.colorModeTable.getKey(colorMode)
		if (id === undefined) return {status: 'invalid parameter'}

		return this.setCamData(OpCodeSigma.SetCamDataGroup3, 4, id)
	}

	public async getColorModeDesc(): Promise<ConfigDesc<string>> {
		const decodeColorMode = (id: number) => {
			return this.colorModeTable.get(id) ?? `unknown:${id.toString(16)}`
		}

		const {colorMode} = await this.getCamDataGroup3()
		const {colorMode: colorModeOptions} = await this.getCamCanSetInfo5()

		return {
			writable: colorModeOptions.length > 0,
			value: decodeColorMode(colorMode),
			option: {
				type: 'enum',
				values: colorModeOptions.map(decodeColorMode),
			},
		}
	}

	public async getColorTemperature() {
		const wb = await this.getWhiteBalance()
		if (wb !== 'manual') return null

		const {colorTemperature} = await this.getCamDataGroup5()
		return colorTemperature
	}

	public async setColorTemperature(value: number) {
		const r0 = await this.setCamData(OpCodeSigma.SetCamDataGroup2, 13, 0x0e)
		const r1 = await this.setCamData(OpCodeSigma.SetCamDataGroup5, 1, value)

		const status: OperationResultStatus =
			r0.status === 'ok' && r1.status === 'ok' ? 'ok' : 'general error'

		return {status}
	}

	public async getColorTemperatureDesc() {
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
			option: {
				type: 'range',
				min,
				max,
				step,
			},
		} as ConfigDesc<number>
	}

	public async setDestinationToSave(
		value: string
	): Promise<OperationResult<void>> {
		const id = this.destinationToSaveTable.getKey(value)

		if (id === undefined) return {status: 'invalid parameter'}

		return this.setCamData(OpCodeSigma.SetCamDataGroup3, 15, id)
	}

	public async getDestinationToSaveDesc(): Promise<ConfigDesc<string>> {
		const {destinationToSave} = await this.getCamDataGroup3()

		const value = this.destinationToSaveTable.get(destinationToSave) ?? null

		return {
			writable: true,
			value,
			option: {
				type: 'enum',
				values: ['uninitialized', 'camera', 'pc', 'camera,pc'],
			},
		}
	}

	public async getExposureMode() {
		const {exposureMode} = await this.getCamDataGroup2()
		return this.exposureModeTable.get(exposureMode) ?? null
	}

	public async setExposureMode(
		exposureMode: ExposureMode
	): Promise<OperationResult<void>> {
		const id = this.exposureModeTable.getKey(exposureMode)
		if (!id) return {status: 'invalid parameter'}

		return this.setCamData(OpCodeSigma.SetCamDataGroup2, 2, id)
	}

	public async getExposureModeDesc(): Promise<ConfigDesc<ExposureMode>> {
		const {exposureMode} = await this.getCamCanSetInfo5()
		const value = await this.getExposureMode()

		const values = exposureMode
			.map(n => this.exposureModeTable.get(n))
			.filter(isntNil)

		return {
			writable: values.length > 0,
			value,
			option: {
				type: 'enum',
				values,
			},
		}
	}

	public async getExposureComp() {
		const {exposureComp} = await this.getCamDataGroup1()
		return this.compensationOneThirdTable.get(exposureComp) ?? null
	}

	public async setExposureComp(value: string): Promise<OperationResult<void>> {
		const id = this.compensationOneThirdTable.getKey(value)
		if (id === undefined) return {status: 'invalid parameter'}

		return this.setCamData(OpCodeSigma.SetCamDataGroup1, 5, id)
	}

	public async getExposureCompDesc(): Promise<ConfigDesc<string>> {
		const {exposureComp} = await this.getCamCanSetInfo5()
		const value = await this.getExposureComp()

		if (exposureComp.length < 3) {
			return {
				writable: false,
				value: null,
			}
		}

		const [min, max] = exposureComp

		if (min === 0 && max === 0) {
			return {
				writable: false,
				value: null,
			}
		}

		const allValues = [...this.compensationOneThirdTable.values()]
		const values = allValues
			.map(v => [v, exposureCompStringToFloat(v)] as const)
			.sort((a, b) => a[1] - b[1])
			.filter(([, n]) => min - 1e-4 <= n && n <= max + 1e-4)
			.map(([v]) => v)

		return {
			writable: exposureComp.length > 0,
			value,
			option: {
				type: 'enum',
				values,
			},
		}

		function exposureCompStringToFloat(v: string) {
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

			if (!match1 && !match2) throw new Error()

			return (negative ? -1 : 1) * (digits + thirds / 3)
		}
	}

	public async getFocalLengthDesc() {
		const {currentLensFocalLength} = await this.getCamDataGroup1()
		const value = decodeFocalLength(currentLensFocalLength)

		const {lensWideFocalLength, lensTeleFocalLength} =
			await this.getCamDataGroup3()

		const min = decodeFocalLength(lensWideFocalLength)
		const max = decodeFocalLength(lensTeleFocalLength)

		return {
			writable: false,
			value,
			option: {
				type: 'range',
				min,
				max,
				step: 0,
			},
		} as ConfigDesc<FocalLength>

		function decodeFocalLength(byte: number) {
			const integer = byte >> 4,
				fractional = byte & 0b1111

			return integer + fractional / 10
		}
	}

	public async getImageAspect() {
		const {imageAspect} = await this.getCamDataGroup5()
		const id = imageAspect - 245 // Magic number
		return this.imageAspectTable.get(id) ?? null
	}

	public async setImageAspect(
		imageAspect: string
	): Promise<OperationResult<void>> {
		const id = this.imageAspectTable.getKey(imageAspect)
		if (id === undefined) return {status: 'invalid parameter'}

		return this.setCamData(OpCodeSigma.SetCamDataGroup5, 3, id)
	}

	public async getImageAspectDesc(): Promise<ConfigDesc<string>> {
		const decodeImageAspectIFD = (id: number) => {
			return this.imageAspectTableIFD.get(id) ?? 'Unknown'
		}

		const {imageAspect: values} = await this.getCamCanSetInfo5()
		const value = await this.getImageAspect()

		return {
			writable: values.length > 0,
			value,
			option: {
				type: 'enum',
				values: values.map(decodeImageAspectIFD),
			},
		}
	}

	public async setImageQuality(
		imageQuality: string
	): Promise<OperationResult<void>> {
		let jpegQuality: string | null = null
		let dngBitDepth: number | null = null

		const hasDngMatch = imageQuality.match(/^raw (12|14)bit(?:,([a-z]+))?/i)

		if (hasDngMatch) {
			const [, dngBitDepthStr, jpegQualityStr] = hasDngMatch
			jpegQuality = jpegQualityStr ?? null
			dngBitDepth = parseInt(dngBitDepthStr)
		} else {
			jpegQuality = imageQuality
		}

		// Generate imageQuality value for setCamData
		let imageQualityID
		switch (jpegQuality) {
			case null:
				imageQualityID = 0x00
				break
			case 'fine':
				imageQualityID = 0x02
				break
			case 'standard':
				imageQualityID = 0x04
				break
			case 'low':
				imageQualityID = 0x08
				break
			default:
				return {status: 'invalid parameter'}
		}
		imageQualityID |= dngBitDepth === null ? 0x00 : 0x10

		const setImageQualityResult = (
			await this.setCamData(OpCodeSigma.SetCamDataGroup2, 15, imageQualityID)
		).status

		let setDngBitDepthResult: OperationResultStatus = 'ok'
		if (dngBitDepth !== null) {
			setDngBitDepthResult = (
				await this.setCamData(OpCodeSigma.SetCamDataGroup4, 9, dngBitDepth)
			).status
		}

		if (setImageQualityResult === 'ok' && setDngBitDepthResult === 'ok') {
			return {status: 'ok'}
		} else {
			return {status: 'invalid parameter'}
		}
	}

	public async getImageQualityDesc() {
		type ImageQualityConfig = {
			jpegQuality: string | null
			hasDNG: boolean
		}

		const imageQuality: ImageQualityConfig = await (async () => {
			const {imageQuality} = await this.getCamDataGroup2()

			let jpegQuality: string | null = null
			switch (imageQuality & 0x0f) {
				case 0x02:
					jpegQuality = 'fine'
					break
				case 0x04:
					jpegQuality = 'standard'
					break
				case 0x08:
					jpegQuality = 'low'
					break
			}

			const hasDNG = !!(imageQuality & 0x10)

			return {
				jpegQuality,
				hasDNG,
			}
		})()

		const {dngImageQuality} = await this.getCamDataGroup4()

		return {
			writable: true,
			value: stringifyImageQuality(imageQuality, dngImageQuality),
			option: {
				type: 'enum',
				values: [
					// NOTE: Hard-coded so this might not work for some cases
					'low',
					'standard',
					'fine',
					'raw 12bit,fine',
					'raw 14bit,fine',
					'raw 12bit',
					'raw 14bit',
				],
			},
		} as ConfigDesc<string>

		function stringifyImageQuality(
			quality: ImageQualityConfig,
			dngBitDepth: number
		) {
			if (quality.hasDNG) {
				if (quality.jpegQuality) {
					return `raw ${dngBitDepth}bit,${quality.jpegQuality}`
				} else {
					return `raw ${dngBitDepth}bit`
				}
			} else {
				if (quality.jpegQuality) {
					return quality.jpegQuality
				} else {
					throw new Error('Invalid ImageQualityConfig')
				}
			}
		}
	}

	public async setImageSize(imageSize: string): Promise<OperationResult<void>> {
		const id = this.imageSizeTable.getKey(imageSize)
		if (id === undefined) return {status: 'invalid parameter'}

		return this.setCamData(OpCodeSigma.SetCamDataGroup2, 14, id)
	}

	public async getImageSizeDesc(): Promise<ConfigDesc<string>> {
		const {resolution} = await this.getCamDataGroup2()

		const value = this.imageSizeTable.get(resolution)

		if (!value) {
			return {
				writable: false,
				value: null,
			}
		}

		return {
			writable: true,
			value,
			option: {
				type: 'enum',
				values: ['low', 'medium', 'high'],
			},
		}
	}

	public async getIso() {
		const {isoAuto, isoSpeed} = await this.getCamDataGroup1()
		if (isoAuto === 0x01) {
			return 'auto'
		} else {
			return this.isoTable.get(isoSpeed) ?? null
		}
	}

	public async setIso(iso: ISO): Promise<OperationResult<void>> {
		if (iso === 'auto') {
			return this.setCamData(OpCodeSigma.SetCamDataGroup1, 3, 0x1)
		}

		const id = this.isoTable.getKey(iso)
		if (!id) return {status: 'invalid parameter'}

		const setISOAutoResult = await this.setCamData(
			OpCodeSigma.SetCamDataGroup1,
			3,
			0x0
		)
		const setISOValueResult = await this.setCamData(
			OpCodeSigma.SetCamDataGroup1,
			4,
			id
		)

		if (setISOAutoResult.status === 'ok' && setISOValueResult.status === 'ok') {
			return {status: 'ok'}
		} else {
			return {status: 'invalid parameter'}
		}
	}

	public async getIsoDesc(): Promise<ConfigDesc<ISO>> {
		const {isoManual} = await this.getCamCanSetInfo5()
		const value = await this.getIso()

		const [svMin, svMax] = isoManual

		const isoMin = Math.round(3.125 * 2 ** svMin)
		const isoMax = Math.round(3.125 * 2 ** svMax)

		const isos = [...this.isoTable.values()]
		const values = isos.filter(a => isoMin <= a && a <= isoMax)

		values.unshift('auto')

		return {
			writable: true,
			value,
			option: {
				type: 'enum',
				values,
			},
		}
	}

	public async getLiveviewEnabledDesc(): Promise<ConfigDesc<boolean>> {
		return {
			writable: false,
			value: this.liveviewEnabled,
		}
	}

	public async setLiveviewMagnifyRatio(
		value: number
	): Promise<OperationResult<void>> {
		const id = this.liveviewMagnifyRatioTable.getKey(value)
		if (!id) return {status: 'invalid parameter'}

		return this.setCamData(OpCodeSigma.SetCamDataGroup4, 5, id)
	}

	public async getLiveviewMagnifyRatioDesc(): Promise<ConfigDesc<number>> {
		const {lvMagnifyRatio} = await this.getCamDataGroup4()
		const value = this.liveviewMagnifyRatioTable.get(lvMagnifyRatio) ?? null

		const {lvMagnifyRatio: values} = await this.getCamCanSetInfo5()

		return {
			writable: values.length > 0,
			value,
			option: {
				type: 'enum',
				values,
			},
		}
	}

	public async getShutterSpeed() {
		const {shutterSpeed} = await this.getCamDataGroup1()
		if (shutterSpeed === 0x0) return 'auto'
		return (
			this.shutterSpeedOneThirdTable.get(shutterSpeed) ??
			this.shutterSpeedHalfTable.get(shutterSpeed) ??
			null
		)
	}

	public async setShutterSpeed(ss: string): Promise<OperationResult<void>> {
		const byte = this.shutterSpeedOneThirdTable.getKey(ss)
		if (!byte) return {status: 'invalid parameter'}

		return this.setCamData(OpCodeSigma.SetCamDataGroup1, 0, byte)
	}

	public async getShutterSpeedDesc() {
		const {shutterSpeed: range, notApexShutterSpeed} =
			await this.getCamCanSetInfo5()

		const value = await this.getShutterSpeed()

		if (range.length < 3) {
			return {
				writable: false,
				value,
			}
		}

		const [tvMin, tvMax, step] = range

		const isStepOneThird = Math.abs(step - 1 / 3) < Math.abs(step - 1 / 2)
		const table = isStepOneThird
			? this.shutterSpeedOneThirdTable
			: this.shutterSpeedHalfTable

		const shutterSpeeds = Array.from(table.entries()).filter(
			e => e[1] !== 'sync' && e[1] !== 'bulb'
		)

		const ssMinRaw = 1 / 2 ** tvMin
		const ssMaxRaw = 1 / 2 ** tvMax

		const ssMinEntry = minBy(shutterSpeeds, e =>
			Math.abs(computeShutterSpeedSeconds(e[1]) - ssMinRaw)
		)
		const ssMaxEntry = minBy(shutterSpeeds, e =>
			Math.abs(computeShutterSpeedSeconds(e[1]) - ssMaxRaw)
		)

		if (!ssMinEntry || !ssMaxEntry) throw new Error()

		const ssMinIndex = ssMinEntry[0]
		const ssMaxIndex = ssMaxEntry[0]

		const values = shutterSpeeds
			.filter(e => ssMinIndex <= e[0] && e[0] <= ssMaxIndex)
			.map(e => e[1])

		if (notApexShutterSpeed.includes(0)) {
			values.unshift('bulb')
		}

		return {
			writable: values.length > 0,
			value,
			option: {
				type: 'enum',
				values,
			},
		} as ConfigDesc<string>
	}

	public async getWhiteBalance() {
		const {whiteBalance} = await this.getCamDataGroup2()
		return this.whiteBalanceTable.get(whiteBalance) ?? null
	}

	public async setWhiteBalance(
		wb: WhiteBalance
	): Promise<OperationResult<void>> {
		const id = this.whiteBalanceTable.getKey(wb)
		if (!id) return {status: 'invalid parameter'}
		return this.setCamData(OpCodeSigma.SetCamDataGroup2, 13, id)
	}

	public async getWhiteBalanceDesc(): Promise<ConfigDesc<WhiteBalance>> {
		const {whiteBalance} = await this.getCamCanSetInfo5()
		const value = await this.getWhiteBalance()

		const values = whiteBalance
			.map(v => this.whiteBalanceTableIFD.get(v))
			.filter(isntNil)

		return {
			writable: values.length > 0,
			value,
			option: {
				type: 'enum',
				values,
			},
		}
	}

	// Actions

	public async takePhoto({download = true}: TakePhotoOption = {}): Promise<
		OperationResult<TethrObject[]>
	> {
		this.isCapturing = true

		const captId = await this.executeSnapCommand(
			SnapCaptureMode.NonAFCapture,
			1
		)

		if (captId === null) return {status: 'general error'}

		const picts: TethrObject[] = []

		if (download) {
			const pictInfos = await this.getPictFileInfo2()

			for await (const info of pictInfos) {
				const pictArray = new Uint8Array(info.fileSize)

				const CHUNK_SIZE = 0x00200000 // SampleApp uses this

				// Download the image with splitting every 2MB chunk
				for (let offset = 0; offset < info.fileSize; offset += CHUNK_SIZE) {
					const length = Math.min(info.fileSize - offset, CHUNK_SIZE)

					const {data} = await this.device.receiveData({
						label: 'SigmaFP GetBigPartialPictFile',
						opcode: OpCodeSigma.GetBigPartialPictFile,
						parameters: [info.fileAddress, offset, length],
						maxByteLength: CHUNK_SIZE + 64,
					})

					// First 4 bytes is the length of buffer so splice them
					const chunkArray = new Uint8Array(data.slice(4, 4 + length))

					// Copy to buffer
					pictArray.set(chunkArray, offset)
				}
				const isRaw = /dng/i.test(info.fileExt)
				const format = isRaw ? 'raw' : 'jpeg'
				const type = isRaw ? 'image/x-adobe-dng' : 'image/jpeg'

				const blob = new Blob([pictArray.buffer], {type})

				picts.push({
					format,
					blob,
					filename: info.fileName,
				} as TethrObject)
			}
		}

		await this.clearImageDBAll()

		this.isCapturing = false

		return {status: 'ok', value: picts}
	}

	public async runAutoFocus(): Promise<OperationResult<void>> {
		const succeed = await this.executeSnapCommand(SnapCaptureMode.StartAF)
		await this.clearImageDBAll()

		if (succeed !== null) {
			return {status: 'ok'}
		} else {
			return {status: 'general error'}
		}
	}

	public async startLiveview(): Promise<OperationResult<MediaStream>> {
		const canvas = document.createElement('canvas')
		const ctx = canvas.getContext('2d')
		if (!ctx) return {status: 'general error'}

		this.liveviewEnabled = true
		this.emit('liveviewEnabledChanged', await this.getDesc('liveviewEnabled'))

		const updateFrame = async () => {
			if (!this.liveviewEnabled) return

			try {
				if (this.isCapturing) return

				const {resCode, data} = await this.device.receiveData({
					label: 'SigmaFP GetViewFrame',
					opcode: OpCodeSigma.GetViewFrame,
					expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
					maxByteLength: 1_000_000, // = 1MB
				})
				if (resCode !== ResCode.OK) return null

				// Might be quirky but somehow works
				const jpegData = data.slice(10)

				const image = new Blob([jpegData], {type: 'image/jpg'})
				const imageBitmap = await createImageBitmap(image)

				const sizeChanged =
					canvas.width !== imageBitmap.width ||
					canvas.height !== imageBitmap.height

				if (sizeChanged) {
					canvas.width = imageBitmap.width
					canvas.height = imageBitmap.height
				}

				ctx.drawImage(imageBitmap, 0, 0)
			} finally {
				requestAnimationFrame(updateFrame)
			}
		}
		updateFrame()

		const stream = canvas.captureStream(60)
		return {status: 'ok', value: stream}
	}

	public async stopLiveview(): Promise<OperationResult<void>> {
		this.liveviewEnabled = false
		this.emit('liveviewEnabledChanged', await this.getDesc('liveviewEnabled'))

		return {status: 'ok'}
	}

	public async startRec(): Promise<OperationResult<void>> {
		const captureMode = SnapCaptureMode.StartRecordingMovieWithoutAF
		const captureAmount = 1

		const snapState = new Uint8Array([captureMode, captureAmount]).buffer

		await this.device.sendData({
			label: 'Sigma SnapCommand',
			opcode: OpCodeSigma.SnapCommand,
			data: this.encodeParameter(snapState),
		})

		return {status: 'ok'}
	}

	public async stopRec(): Promise<OperationResult<void>> {
		const captureMode = SnapCaptureMode.StopRecordingMovie
		const captureAmount = 1

		const snapState = new Uint8Array([captureMode, captureAmount]).buffer

		await this.device.sendData({
			label: 'Sigma SnapCommand',
			opcode: OpCodeSigma.SnapCommand,
			data: this.encodeParameter(snapState),
		})

		const movieFileInfo = await this.getMovieFileInfo()

		return {status: 'ok'}
	}

	// NOTE: WIP
	public async startBulb(): Promise<OperationResult<void>> {
		if ((await this.getShutterSpeed()) !== 'bulb') {
			return {status: 'general error'}
		}

		const captureMode = SnapCaptureMode.NonAFCapture
		const captureAmount = 1

		const snapState = new Uint8Array([captureMode, captureAmount]).buffer

		await this.device.sendData({
			label: 'Sigma SnapCommand',
			opcode: OpCodeSigma.SnapCommand,
			data: this.encodeParameter(snapState),
		})

		return {status: 'ok'}
	}

	// NOTE: WIP
	public async endBulb(): Promise<OperationResult<void>> {
		const captureMode = SnapCaptureMode.StopCapture
		const captureAmount = 1

		const snapState = new Uint8Array([captureMode, captureAmount]).buffer

		await this.device.sendData({
			label: 'Sigma SnapCommand',
			opcode: OpCodeSigma.SnapCommand,
			data: this.encodeParameter(snapState),
		})

		return {status: 'ok'}
	}

	public async getStorages(): Promise<TethrStorage[]> {
		// fp always returns one storage info even if no SD inserted.
		const [storage] = await super.getStorages()

		const {mediaFreeSpace} = await this.getCamDataGroup1()

		storage.freeSpaceInImages = mediaFreeSpace

		return [storage]
	}

	// fp SDK
	private async getMovieFileInfo() {
		const {data} = await this.device.receiveData({
			label: 'Sigma GetMovieFileInfo',
			opcode: OpCodeSigma.GetMovieFileInfo,
		})

		const dv = new PTPDataView(data)

		const movieFileInfo = {
			fileFormat: dv.goto(24).readAsciiString(),
			fileHandler: dv.goto(32).readUint32(),
		}

		return movieFileInfo
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
			destinationToSave: dataView.readUint8(),
		}
	}

	private async getCamDataGroup4() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroup4',
			opcode: OpCodeSigma.GetCamDataGroup4,
			parameters: [0x0],
		})

		const dataView = new PTPDataView(data)
		dataView.skip(3) // OC + FieldPreset

		return {
			dcCropMode: dataView.readUint8(),
			lvMagnifyRatio: dataView.readUint8(),
			isoExtension: dataView.readUint8(),
			continuousShootingSpeed: dataView.readUint8(),
			hdr: dataView.readUint8(),
			dngImageQuality: dataView.readUint8(),
			fillLight: dataView.readUint8(),
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
			imageAspect: dataView.skip(2).readUint8(),
		}
	}

	private async getCamCanSetInfo5() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamCanSetInfo5',
			opcode: OpCodeSigma.GetCamCanSetInfo5,
			parameters: [0x0],
		})

		return decodeIFD(data, {
			imageQuality: {tag: 11, type: IFDType.Byte},
			dngImageQuality: {tag: 12, type: IFDType.Byte},
			stillImageResolution: {tag: 20, type: IFDType.Byte},
			imageAspect: {tag: 21, type: IFDType.Byte},
			exposureMode: {tag: 200, type: IFDType.Byte},
			fValue: {tag: 210, type: IFDType.SignedShort},
			shutterSpeed: {tag: 212, type: IFDType.SignedShort},
			notApexShutterSpeed: {tag: 213, type: IFDType.Byte},
			isoManual: {tag: 215, type: IFDType.SignedShort},
			exposureComp: {tag: 217, type: IFDType.SignedShort},
			whiteBalance: {tag: 301, type: IFDType.Byte},
			colorTemerature: {tag: 302, type: IFDType.Short},
			colorMode: {tag: 320, type: IFDType.Byte},
			focusMode: {tag: 600, type: IFDType.Byte},
			lvImageTransfer: {tag: 700, type: IFDType.Byte},
			lvMagnifyRatio: {tag: 701, type: IFDType.Byte},
			focusPeaking: {tag: 702, type: IFDType.Byte},
			shutterSound: {tag: 801, type: IFDType.Byte},
			afVolume: {tag: 802, type: IFDType.Byte},
			timerVolume: {tag: 803, type: IFDType.Byte},
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

	private async setCamData(
		opcode: number,
		devicePropIndex: number,
		value: number
	): Promise<OperationResult<void>> {
		const dataView = new PTPDataView()

		dataView.writeUint16(1 << devicePropIndex)
		dataView.writeUint16(value)

		const data = this.encodeParameter(dataView.toBuffer())

		try {
			await this.device.sendData({
				label: 'SigmaFP SetCamDataGroup#',
				opcode,
				data,
			})
		} catch (err) {
			return {status: 'invalid parameter'}
		}

		await this.emitAllConfigChangedEvents()

		return {status: 'ok'}
	}

	private async getCamCaptStatus(imageId = 0) {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamCaptStatus',
			opcode: OpCodeSigma.GetCamCaptStatus,
			parameters: [imageId],
		})

		const dataView = new PTPDataView(data)

		const status = {
			imageId: dataView.skip(1).readUint8(),
			imageDBHead: dataView.readUint8(),
			imageDBTail: dataView.readUint8(),
			status: dataView.readUint16(),
			destination: dataView.readUint8(),
		}

		return status
	}

	/**
	 *
	 * @returns true if succeed
	 */
	private async executeSnapCommand(
		captureMode: number,
		captureAmount = 1
	): Promise<boolean> {
		const {imageDBTail: captId} = await this.getCamCaptStatus()

		const snapState = new Uint8Array([captureMode, captureAmount]).buffer

		await this.device.sendData({
			label: 'Sigma SnapCommand',
			opcode: OpCodeSigma.SnapCommand,
			data: this.encodeParameter(snapState),
		})

		for (let restTries = 50; restTries > 0; restTries--) {
			const {status} = await this.getCamCaptStatus(captId)

			const isFailure = (status & 0xf000) === 0x6000
			if (isFailure) return false

			const isSucceed = (status & 0xf000) === 0x8000
			if (isSucceed) return true

			if (status === CaptStatus.compImageCreate) return true

			await sleep(500)
		}

		return false
	}

	private async clearImageDBAll() {
		const {imageDBHead, imageDBTail} = await this.getCamCaptStatus()

		for (let id = imageDBHead; id < imageDBTail; id++) {
			await this.device.sendData({
				label: 'SigmaFP ClearImageDBSingle',
				opcode: OpCodeSigma.ClearImageDBSingle,
				parameters: [id],
				data: new ArrayBuffer(8),
			})
		}
	}

	private async getPictFileInfo2() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetPictFileInfo2',
			opcode: 0x902d,
		})
		const dataView = new PTPDataView(data)

		dataView.skip(4) // Packet Size

		const byteOffsets = dataView.readUint32Array()

		const pictInfos = byteOffsets.map(offset => ({
			fileAddress: dataView.goto(offset).readUint32(),
			fileSize: dataView.readUint32(),
			fileExt: dataView.skip(8).readAsciiString(),
			folderName: dataView.skip(4).readAsciiString(),
			fileName: dataView.readAsciiString(),
		}))

		return pictInfos
	}

	private async emitAllConfigChangedEvents() {
		for (const config of ConfigListSigma) {
			const desc = await this.getDesc(config)
			this.emit(`${config}Changed`, desc)
		}
	}

	/**
	 * Encode parameter to fit fp's SDK format
	 * (Byte length on the head, and checksum on the tail)
	 */
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

	private colorModeTable = new BiMap<number, string>([
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

	private imageAspectTable = new BiMap<number, string>([
		[1, '21:9'],
		[2, '16:9'],
		[3, '3:2'],
		[4, '4:3'],
		[5, '7:6'],
		[6, '1:1'],
		[7, 'a size'],
	])

	private imageAspectTableIFD = new BiMap<number, string>([
		[1, '21:9'],
		[2, '16:9'],
		[3, '3:2'],
		[4, 'a size'],
		[5, '4:3'],
		[6, '7:6'],
		[7, '1:1'],
	])

	private isoTable = new BiMap<number, ISO>([
		[0b00000000, 6],
		[0b00000011, 8],
		[0b00000101, 10],
		[0b00001000, 12],
		[0b00001011, 16],
		[0b00001101, 20],
		[0b00010000, 25],
		[0b00010011, 32],
		[0b00010101, 40],
		[0b00011000, 50],
		[0b00011011, 64],
		[0b00011101, 80],
		[0b00100000, 100],
		[0b00100011, 125],
		[0b00100101, 160],
		[0b00101000, 200],
		[0b00101011, 250],
		[0b00101101, 320],
		[0b00110000, 400],
		[0b00110011, 500],
		[0b00110101, 640],
		[0b00111000, 800],
		[0b00111011, 1000],
		[0b00111101, 1250],
		[0b01000000, 1600],
		[0b01000011, 2000],
		[0b01000101, 2500],
		[0b01001000, 3200],
		[0b01001011, 4000],
		[0b01001101, 5000],
		[0b01010000, 6400],
		[0b01010011, 8000],
		[0b01010101, 10000],
		[0b01011000, 12800],
		[0b01011011, 16000],
		[0b01011101, 20000],
		[0b01100000, 25600],
		[0b01100011, 32000],
		[0b01100101, 40000],
		[0b01101000, 51200],
		[0b01101011, 64000],
		[0b01101101, 80000],
		[0b01110000, 102400],
	])

	private compensationOneThirdTable = new BiMap<number, string>([
		[0b00000000, '0'],
		[0b00000011, '+1/3'],
		[0b00000101, '+2/3'],
		[0b00001000, '+1'],
		[0b00001011, '+1 1/3'],
		[0b00001110, '+1 2/3'],
		[0b00010000, '+2'],
		[0b00010011, '+2 1/3'],
		[0b00010101, '+2 2/3'],
		[0b00011000, '+3'],
		[0b00011011, '+3 1/3'],
		[0b00011101, '+3 2/3'],
		[0b00100000, '+4'],
		[0b00100011, '+4 1/3'],
		[0b00100101, '+4 2/3'],
		[0b00101000, '+5'],
		[0b00101011, '+5 1/3'],
		[0b00101101, '+5 2/3'],
		[0b00110000, '+6'],
		[0b00110011, '+6 1/3'],
		[0b11001101, '-6 1/3'],
		[0b11010000, '-6'],
		[0b11010011, '-5 2/3'],
		[0b11010101, '-5 1/3'],
		[0b11011000, '-5'],
		[0b11011011, '-4 2/3'],
		[0b11011101, '-4 1/3'],
		[0b11100000, '-4'],
		[0b11100011, '-3 2/3'],
		[0b11100101, '-3 1/3'],
		[0b11101000, '-3'],
		[0b11101011, '-2 2/3'],
		[0b11101101, '-2 1/3'],
		[0b11110000, '-2'],
		[0b11110011, '-1 2/3'],
		[0b11110101, '-1 1/3'],
		[0b11111000, '-1'],
		[0b11111011, '-2/3'],
		[0b11111101, '-1/3'],
	])

	private shutterSpeedOneThirdTable = new BiMap<number, string>([
		[0b00001000, 'bulb'],
		[0b00010000, '30'],
		[0b00010011, '25'],
		[0b00010101, '20'],
		[0b00011000, '15'],
		[0b00011011, '13'],
		[0b00011101, '10'],
		[0b00100000, '8'],
		[0b00100011, '6'],
		[0b00100101, '5'],
		[0b00101000, '4'],
		[0b00101011, '3.2'],
		[0b00101101, '2.5'],
		[0b00110000, '2'],
		[0b00110011, '1.6'],
		[0b00110101, '1.3'],
		[0b00111000, '1'],
		[0b00111011, '0.8'],
		[0b00111101, '0.6'],
		[0b01000000, '0.5'],
		[0b01000011, '0.4'],
		[0b01000101, '0.3'],
		[0b01001000, '1/4'],
		[0b01001011, '1/5'],
		[0b01001101, '1/6'],
		[0b01010000, '1/8'],
		[0b01010011, '1/10'],
		[0b01010101, '1/13'],
		[0b01011000, '1/15'],
		[0b01011011, '1/20'],
		[0b01011101, '1/25'],
		[0b01100000, '1/30'],
		[0b01100011, '1/40'],
		[0b01100101, '1/50'],
		[0b01101000, '1/60'],
		[0b01101011, '1/80'],
		[0b01101101, '1/100'],
		[0b01110000, '1/125'],
		[0b01110011, '1/160'],
		[0b01110100, '1/180'],
		[0b01110101, '1/200'],
		[0b01111000, '1/250'],
		[0b01111011, '1/320'],
		[0b01111100, '1/350'],
		[0b01111101, '1/400'],
		[0b10000000, '1/500'],
		[0b10000011, '1/640'],
		[0b10000100, '1/750'],
		[0b10000101, '1/800'],
		[0b10001000, '1/1000'],
		[0b10001011, '1/1250'],
		[0b10001100, '1/1500'],
		[0b10001101, '1/1600'],
		[0b10010000, '1/2000'],
		[0b10010011, '1/2500'],
		[0b10010100, '1/3000'],
		[0b10010101, '1/3200'],
		[0b10011000, '1/4000'],
		[0b10011011, '1/5000'],
		[0b10011100, '1/6000'],
		[0b10011101, '1/6000'],
		[0b10100000, '1/8000'],
		[0b10100010, 'sync'],
		[0b10100011, '1/10000'],
		[0b10100101, '1/12800'],
		[0b10101000, '1/16000'],
		[0b10101011, '1/20000'],
		[0b10101101, '1/25600'],
		[0b10110000, '1/32000'],
	])

	private shutterSpeedHalfTable = new BiMap<number, string>([
		[0b00001000, 'bulb'],
		[0b00010001, '30'],
		[0b00010100, '20'],
		[0b00011000, '15'],
		[0b00011100, '10'],
		[0b00100000, '8'],
		[0b00100100, '6'],
		[0b00101000, '4'],
		[0b00101100, '3'],
		[0b00110000, '2'],
		[0b00110100, '1.5'],
		[0b00111000, '1'],
		[0b00111100, '0.7'],
		[0b01000000, '1/2'],
		[0b01000100, '1/3'],
		[0b01001000, '1/4'],
		[0b01001100, '1/6'],
		[0b01010000, '1/8'],
		[0b01010100, '1/10'],
		[0b01011000, '1/15'],
		[0b01011100, '1/20'],
		[0b01100000, '1/30'],
		[0b01100100, '1/45'],
		[0b01101000, '1/60'],
		[0b01101100, '1/90'],
		[0b01110000, '1/125'],
		[0b01111000, '1/250'],
		[0b10000000, '1/500'],
		[0b10001000, '1/1000'],
		[0b10010000, '1/2000'],
		[0b10011000, '1/4000'],
		[0b10100000, '1/8000'],
		[0b10100010, 'sync'],
		[0b10101000, '1/16000'],
		[0b10110000, '1/32000'],
	])

	private apertureOneThirdTable = new BiMap<number, number>([
		[0b00001000, 1.0],
		[0b00001011, 1.1],
		[0b00001101, 1.2],
		[0b00010000, 1.4],
		[0b00010011, 1.6],
		[0b00010101, 1.8],
		[0b00011000, 2.0],
		[0b00011011, 2.2],
		[0b00011101, 2.5],
		[0b00100000, 2.8],
		[0b00100011, 3.2],
		[0b00100101, 3.5],
		[0b00101000, 4.0],
		[0b00101011, 4.5],
		[0b00101101, 5.0],
		[0b00110000, 5.6],
		[0b00110011, 6.3],
		[0b00110101, 7.1],
		[0b00111000, 8.0],
		[0b00111011, 9.0],
		[0b00111101, 10],
		[0b01000000, 11],
		[0b01000011, 13],
		[0b01000101, 14],
		[0b01001000, 16],
		[0b01001011, 18],
		[0b01001101, 20],
		[0b01010000, 22],
		[0b01010011, 25],
		[0b01010101, 29],
		[0b01011000, 32],
		[0b01011011, 36],
		[0b01011101, 40],
		[0b01100000, 45],
		[0b01100011, 51],
		[0b01100101, 57],
		[0b01101000, 64],
		[0b01101011, 72],
		[0b01101101, 81],
		[0b01110000, 91],
	])

	private apertureHalfTable = new BiMap<number, number>([
		[0b00001000, 1.0],
		[0b00001100, 1.2],
		[0b00010000, 1.4],
		[0b00010100, 1.8],
		[0b00011000, 2.0],
		[0b00011100, 2.5],
		[0b00100000, 2.8],
		[0b00100100, 3.5],
		[0b00101000, 4.0],
		[0b00101100, 4.5],
		[0b00110000, 5.6],
		[0b00110100, 6.7],
		[0b00111000, 8.0],
		[0b00111100, 9.5],
		[0b01000000, 11],
		[0b01000100, 13],
		[0b01001000, 16],
		[0b01001100, 19],
		[0b01010000, 22],
		[0b01010100, 27],
		[0b01011000, 32],
		[0b01011100, 38],
		[0b01100000, 45],
		[0b01100100, 54],
		[0b01101000, 64],
		[0b01101100, 76],
		[0b01110000, 91],
	])

	protected exposureModeTable = new BiMap<number, ExposureMode>([
		[0x1, 'P'],
		[0x2, 'A'],
		[0x3, 'S'],
		[0x4, 'M'],
	])

	protected liveviewMagnifyRatioTable = new BiMap<number, number>([
		[0x1, 1],
		[0x2, 4],
		[0x3, 8],
	])

	private batteryLevelTable = new Map<number, null | BatteryLevel>([
		[0x00, null],
		[0x01, 100],
		[0x02, 66],
		[0x03, 33],
		[0x04, 'low'],
		[0x05, 0],
		[0x06, null],
		[0x07, 0],
		[0x08, 'ac'],
		[0x09, null],
		[0x0a, 80],
		[0x0b, 60],
		[0x0c, null],
	])

	private whiteBalanceTable = new BiMap<number, WhiteBalance>([
		[0x01, 'auto'],
		[0x02, 'daylight'], // Sunlight
		[0x03, 'shade'],
		[0x04, 'cloud'], // Overcast
		[0x05, 'incandescent'],
		[0x06, 'fluorescent'],
		[0x07, 'flash'],
		[0x08, 'custom'], // Custom 1
		// [0x09, null], // CustomCapture 1
		[0x0a, 'custom2'], // Custom 2
		// [0x0b, null], // CustomCapture 2
		[0x0c, 'custom3'], // Custom 3
		// // [0x0d, null], // CustomCapture 3
		[0x0e, 'manual'], // Custom Temperature
		[0x0f, 'auto ambience'], // Auto (Light Source Priority)
	])

	private whiteBalanceTableIFD = new Map<number, WhiteBalance>([
		[0x1, 'auto'],
		[0x2, 'auto ambience'],
		[0x3, 'daylight'],
		[0x4, 'shade'],
		[0x5, 'tungsten'],
		[0x6, 'fluorescent'],
		[0x7, 'flash'],
		[0x8, 'manual'],
	])

	private imageSizeTable = new BiMap<number, string>([
		[0x1, 'high'],
		[0x3, 'medium'],
		[0x4, 'low'],
	])

	private destinationToSaveTable = new BiMap<number, string>([
		[0x00, 'uninitialized'],
		[0x01, 'camera'],
		[0x02, 'pc'],
		[0x03, 'camera,pc'],
	])
}
