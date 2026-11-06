import {BiMap} from 'bim'
import {times} from 'lodash'

import {
	Aperture,
	ColorMode,
	ConfigName,
	ExposureComp,
	ExposureMode,
	FocusMode,
	ImageAspect,
	ISO,
	ManualFocusOption,
	ShutterSpeed,
	WhiteBalance,
} from '../configs'
import {LiveviewDriver} from '../LiveviewDriver'
import {getObjectFormatName} from '../objectFormat'
import {ResCode} from '../PTPDatacode'
import {PTPDataView} from '../PTPDataView'
import {PTPEvent, PTPPriority, PTPTransport} from '../PTPDevice'
import {ConfigDesc, OperationResult, TakePhotoOption} from '../Tethr'
import {TethrObject, TethrObjectInfo} from '../TethrObject'
import {isntNil, readonlyConfigDesc} from '../util'
import {TethrPTPUSB} from './TethrPTPUSB'

enum OpCodePanasonic {
	OpenSession = 0x9102,
	CloseSession = 0x9103,
	GetDevicePropDesc = 0x9108,
	AcknowledgeEvent = 0x9401,
	GetDevicePropValue = 0x9402,
	SetDevicePropValue = 0x9403,
	InitiateCapture = 0x9404,
	CtrlLiveview = 0x9405,
	Liveview = 0x9412,
	GetLiveviewSettings = 0x9414,
	SetLiveviewSettings = 0x9415,
	ManualFocusDrive = 0x9416,
	LiveviewImage = 0x9706,
}

enum EventCodePanasonic {
	AcknowledgeRequired = 0xc101,
	DevicePropChanged = 0xc102,
	ObjectAdded = 0xc108,
	ObjectAddedSDRAM = 0xc109,
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
	// ImageFormat = 0x020000a2, // Duplicated with ImageMode_Quality
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
	ImageMode_ImageAspect = 0x20000a3,

	Liveview_TransImg = 0xd800011,
	Liveview_RecomImg = 0xd800012,
}

enum ObjectFormatCodePanasonic {
	Raw = 0x3800,
}

const NudgeAfterMs = 1500
const CaptureTimeoutMs = 10_000

function shutterSpeedToMs(value: ShutterSpeed | null) {
	if (!value || value.startsWith('1/')) return 0
	const seconds = parseFloat(value)
	return isNaN(seconds) ? 0 : seconds * 1000
}

interface DevicePropSchemePanasonic<T> {
	devicePropCode: number
	decode: (value: number) => T | null
	encode: (value: T) => number | null
	valueSize: 1 | 2 | 4
}

interface LiveviewSetting {
	width: number
	height: number
	frameSize: number
	fps: number
}

export class TethrPanasonic extends TethrPTPUSB {
	constructor(device: PTPTransport) {
		super(device)
	}

	async open(): Promise<void> {
		await super.open()

		await this.device.sendCommand({
			label: 'Panasonic OpenSession',
			opcode: OpCodePanasonic.OpenSession,
			parameters: [0x00010001],
			nudgeAfterMs: NudgeAfterMs,
		})

		if ((await this.getDeviceInfo()).model === 'DC-S9') {
			this.imageQualityTable = new BiMap<number, string>([
				[0, 'fine'],
				[1, 'standard'],
				[3, 'raw'],
				[4, 'raw,fine'],
				[5, 'raw,standard'],
			])
		}

		this.device.onEventCode(
			EventCodePanasonic.DevicePropChanged,
			this.onDevicePropChanged
		)
		this.device.onEventCode(
			EventCodePanasonic.AcknowledgeRequired,
			this.onAcknowledgeRequired
		)
	}

	async close(): Promise<void> {
		this.device.offEventCode(
			EventCodePanasonic.DevicePropChanged,
			this.onDevicePropChanged
		)
		this.device.offEventCode(
			EventCodePanasonic.AcknowledgeRequired,
			this.onAcknowledgeRequired
		)

		await this.device.sendCommand({
			label: 'Panasonic CloseSession',
			opcode: OpCodePanasonic.CloseSession,
			parameters: [0x00010001],
			nudgeAfterMs: NudgeAfterMs,
		})

		await super.close()
	}

	// Config

	setAperture(value: Aperture) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.Aperture_Param,
			encode: (value: Aperture) => {
				return value === 'auto' ? 0 : Math.round(value * 10)
			},
			valueSize: 2,
			value,
		})
	}

	getApertureDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.Aperture,
			decode: (value: number) => {
				return value / 10
			},
			valueSize: 2,
		})
	}

	setColorMode(value: ColorMode) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.PhotoStyle_Param,

			encode: (value: string) => {
				return this.colorModeTable.getKey(value) ?? null
			},
			valueSize: 2,
			value,
		})
	}

	getColorModeDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.PhotoStyle,
			decode: (value: number) => {
				return this.colorModeTable.get(value) ?? null
			},
			valueSize: 2,
		})
	}

	getExposureModeDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.CameraMode_ModePos,
			decode: (value: number) => {
				return this.exposureModeTable.get(value) ?? null
			},
			valueSize: 2,
		})
	}

	setExposureComp(value: ExposureComp) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.Exposure_Param,
			encode: v => {
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

				const steps = digits * 3 + thirds

				return (negative ? 0x8000 : 0x0000) | steps
			},
			valueSize: 2,
			value,
		})
	}

	getExposureCompDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.Exposure,
			decode: v => {
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
			valueSize: 2,
		})
	}

	setFocusMode(value: FocusMode) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.AFArea_AFModeParam,
			encode: (value: FocusMode) => (value === 'mf' ? 3 : 4),
			valueSize: 2,
			value,
		})
	}

	async getFocusModeDesc(): Promise<ConfigDesc<FocusMode>> {
		const desc = await this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.AFArea_AFModeParam,
			// 3 = MF, others are AF variants (4 = AF-S, 5 = AF-C, 6 = AF-F)
			decode: (value: number): FocusMode => (value === 3 ? 'mf' : 'af'),
			valueSize: 2,
		})

		return {
			...desc,
			option: {type: 'enum', values: [...new Set(desc.option?.type === 'enum' ? desc.option.values : [])]},
		}
	}

	async getManualFocusOptionsDesc() {
		return readonlyConfigDesc<ManualFocusOption[]>([
			'near:2',
			'near:1',
			'far:1',
			'far:2',
		])
	}

	async getCanTakePhotoDesc() {
		return readonlyConfigDesc(true)
	}

	async getCanRunAutoFocusDesc() {
		return readonlyConfigDesc(true)
	}

	async getCanRunManualFocusDesc() {
		return readonlyConfigDesc(true)
	}

	async getCanStartLiveviewDesc() {
		return readonlyConfigDesc(true)
	}

	async setColorTemperature(value: number) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.WhiteBalance_KSet,
			encode: value => value,
			valueSize: 2,
			value,
		})
	}

	async getColorTemperatureDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.WhiteBalance_KSet,
			decode: data => data,
			valueSize: 2,
		})
	}

	setImageAspect(value: ImageAspect) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.ImageMode_ImageAspect,
			encode: (value: ImageAspect) => {
				return this.imageAspectTable.getKey(value) ?? null
			},
			valueSize: 2,
			value,
		})
	}

	getImageAspectDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.ImageMode_ImageAspect,
			decode: (value: number) => {
				return this.imageAspectTable.get(value) ?? null
			},
			valueSize: 2,
		})
	}

	setImageQuality(value: string) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.ImageMode_Quality,
			encode: (value: string) => {
				return this.imageQualityTable.getKey(value) ?? null
			},
			valueSize: 2,
			value,
		})
	}

	getImageQualityDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.ImageMode_Quality,
			decode: (value: number) => {
				return this.imageQualityTable.get(value) ?? null
			},
			valueSize: 2,
		})
	}

	setIso(value: ISO) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.ISO_Param,
			encode: value => {
				return value === 'auto' ? 0xffffffff : value
			},
			valueSize: 4,
			value,
		})
	}

	getIsoDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.ISO,
			decode: (value: number) => {
				if (value === 0xffffffff) return 'auto'
				if (value === 0xfffffffe) return 'auto' // i-ISO
				return value
			},
			valueSize: 4,
		})
	}

	setWhiteBalance(value: WhiteBalance) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.WhiteBalance_Param,
			encode: (value: WhiteBalance) => {
				return this.whiteBalanceTable.getKey(value) ?? null
			},
			valueSize: 2,
			value,
		})
	}

	getWhiteBalanceDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.WhiteBalance,
			decode: (value: number) => {
				return this.whiteBalanceTable.get(value) ?? null
			},
			valueSize: 2,
		})
	}

	private async setDevicePropValuePanasonic<T>({
		value,
		valueSize,
		encode,
		devicePropCode,
	}: Omit<DevicePropSchemePanasonic<T>, 'decode'> & {
		value: T
	}): Promise<OperationResult> {
		const dataView = new PTPDataView()
		const encodedValue = encode(value)

		if (encodedValue === null) {
			return {
				status: 'invalid parameter',
			}
		}

		dataView.writeUint32(devicePropCode)
		dataView.writeUint32(valueSize)
		if (valueSize === 1) dataView.writeUint8(encodedValue)
		if (valueSize === 2) dataView.writeUint16(encodedValue)
		if (valueSize === 4) dataView.writeUint32(encodedValue)

		const send = () =>
			this.device.sendData({
				label: 'Panasonic SetDevicePropValue',
				opcode: OpCodePanasonic.SetDevicePropValue,
				parameters: [devicePropCode],
				data: dataView.toBuffer(),
				nudgeAfterMs: NudgeAfterMs,
				expectedResCodes: [
					ResCode.OK,
					ResCode.DeviceBusy,
					ResCode.InvalidDevicePropValue,
					ResCode.InvalidParameter,
				],
			})

		let {resCode} = await send()

		// The S9 can reject a valid value while still applying the previous change
		// (the lens stopping down, for one), so give it a second chance.
		if (resCode === ResCode.InvalidParameter) {
			await new Promise(resolve => setTimeout(resolve, 300))
			;({resCode} = await send())
		}

		switch (resCode) {
			case ResCode.OK:
				return {status: 'ok'}
			case ResCode.DeviceBusy:
				return {status: 'busy'}
			default:
				return {status: 'invalid parameter'}
		}
	}

	private async getDevicePropDescPanasonic<T>({
		devicePropCode,
		decode,
		valueSize,
	}: Omit<DevicePropSchemePanasonic<T>, 'encode'>): Promise<ConfigDesc<T>> {
		const read = () =>
			this.device.receiveData({
				label: 'Panasonic GetDevicePropDesc',
				opcode: OpCodePanasonic.GetDevicePropDesc,
				parameters: [devicePropCode],
				nudgeAfterMs: NudgeAfterMs,
			})

		let {data} = await read()

		// During liveview the S9 occasionally answers OK with no data phase
		for (let i = 0; i < 3 && data.byteLength === 0; i++) {
			await new Promise(resolve => setTimeout(resolve, 100))
			;({data} = await read())
		}

		if (data.byteLength === 0) {
			return {writable: false, value: null}
		}

		const dataView = new PTPDataView(data)

		let getValue: () => number
		let getArray: () => number[]
		switch (valueSize) {
			case 1:
				getValue = dataView.readUint8
				getArray = dataView.readUint8Array
				break
			case 2:
				getValue = dataView.readUint16
				getArray = dataView.readUint16Array
				break
			case 4:
				getValue = dataView.readUint32
				getArray = dataView.readUint32Array
				break
		}

		dataView.skip(4) // devicePropCode
		const headerLength = dataView.readUint32()

		dataView.goto(headerLength * 4 + 2 * 4)

		const value = decode(getValue())

		const values = [...getArray()].map(decode).filter(isntNil)

		return {
			writable: values.length > 0,
			value,
			option: {
				type: 'enum',
				values,
			},
		}
	}

	#bulbCode = 0xffffffff

	setShutterSpeed(value: ShutterSpeed) {
		return this.setDevicePropValuePanasonic({
			devicePropCode: DevicePropCodePanasonic.ShutterSpeed_Param,
			encode: (value: string) => {
				if (value === 'bulb') return this.#bulbCode
				if (value === 'auto') return 0x0ffffffe

				if (value.startsWith('1/')) {
					// The denominator can be fractional (1/1.3, 1/2.5, 1/3.2...)
					const denominator = parseFloat(value.slice(2))
					return Math.round(denominator * 1000)
				}

				// Seconds
				const seconds = parseFloat(value)
				if (!isNaN(seconds)) {
					return Math.round(seconds * 1000) | 0x80000000
				}

				return null
			},
			valueSize: 4,
			value,
		})
	}
	getShutterSpeedDesc() {
		return this.getDevicePropDescPanasonic({
			devicePropCode: DevicePropCodePanasonic.ShutterSpeed,
			decode: (value: number) => {
				switch (value) {
					case 0xffffffff:
					case 0xfffffffe: // S9
						this.#bulbCode = value
						return 'bulb'
					case 0x0fffffff:
						return 'auto'
					case 0x0ffffffe:
						return null
				}
				if ((value & 0x80000000) === 0x00000000) {
					return `1/${value / 1000}` as const
				} else {
					return `${(value & 0x7fffffff) / 1000}` as const
				}
			},
			valueSize: 4,
		})
	}

	// Actions

	async takePhoto({doDownload = true}: TakePhotoOption = {}): Promise<
		OperationResult<TethrObject[]>
	> {
		const shutterSpeed = await this.get('shutterSpeed')
		const quality = await this.get('imageQuality')
		let restNumPhotos = quality?.includes(',') ? 2 : 1

		const objectEvents = [
			EventCodePanasonic.ObjectAdded,
			EventCodePanasonic.ObjectAddedSDRAM,
		]

		const infos: TethrObjectInfo[] = []
		let onObjectAdded!: (ev: PTPEvent) => void

		const arrived = new Promise<boolean>((resolve, reject) => {
			onObjectAdded = async (ev: PTPEvent) => {
				if (restNumPhotos === 0) return

				try {
					// Reading the info right after the event can fail
					await new Promise(r => setTimeout(r, 50))
					const info = await this.getObjectInfo(ev.parameters[0])

					// A new folder is announced the same way
					if (info.format !== 'jpeg' && info.format !== 'raw') return

					infos.push(info)
					if (--restNumPhotos === 0) resolve(true)
				} catch (err) {
					reject(err)
				}
			}

			setTimeout(
				() => resolve(false),
				CaptureTimeoutMs + shutterSpeedToMs(shutterSpeed)
			)
		})

		for (const code of objectEvents) {
			this.device.onEventCode(code, onObjectAdded)
		}

		let succeeded: boolean
		try {
			const capture = () =>
				this.device.sendCommand({
					label: 'Panasonic InitiateCapture',
					opcode: OpCodePanasonic.InitiateCapture,
					parameters: [0x3000011],
					nudgeAfterMs: NudgeAfterMs,
					expectedResCodes: [ResCode.OK, ResCode.GeneralError],
				})

			// Refused for a moment after other operations, such as autofocus
			let response = await capture()
			if (response?.resCode === ResCode.GeneralError) {
				await new Promise(resolve => setTimeout(resolve, 1000))
				response = await capture()
			}
			if (response?.resCode === ResCode.GeneralError) {
				return {status: 'general error', message: 'The camera refused to shoot.'}
			}

			succeeded = await arrived
		} finally {
			for (const code of objectEvents) {
				this.device.offEventCode(code, onObjectAdded)
			}
		}

		if (!succeeded) {
			return {
				status: 'general error',
				message:
					'No image arrived. In AF-S the camera silently refuses to shoot when it cannot focus.',
			}
		}

		if (!doDownload) {
			return {status: 'ok', value: []}
		}

		const objects: TethrObject[] = []

		for (const info of infos) {
			const data = await this.getObjectBuffer(info.id)
			const isRaw = info.format === 'raw'
			const type = isRaw ? 'image/x-panasonic-rw2' : 'image/jpeg'

			const blob = new Blob([data], {type})
			objects.push({...info, blob})
		}

		return {status: 'ok', value: objects}
	}

	#liveview = new LiveviewDriver({
		grab: () => this.#getLiveviewImage(),
		isOpen: () => this.device.opened,
		onChange: stream => this.emit('liveviewChange', readonlyConfigDesc(stream)),
	})

	async startLiveview(): Promise<OperationResult<MediaStream>> {
		await this.device.sendCommand({
			label: 'Panasonic Liveview',
			opcode: OpCodePanasonic.Liveview,
			parameters: [0x0d000010],
			nudgeAfterMs: NudgeAfterMs,
		})

		const stream = await this.#liveview.start()

		return {status: 'ok', value: stream}
	}

	async getLiveview(): Promise<MediaStream | null> {
		return this.#liveview.stream
	}

	async stopLiveview(): Promise<OperationResult> {
		await this.device.sendCommand({
			label: 'Panasonic Liveview',
			opcode: OpCodePanasonic.Liveview,
			parameters: [0x0d000011],
			nudgeAfterMs: NudgeAfterMs,
		})

		this.#liveview.stop()

		return {status: 'ok'}
	}

	async getLiveviewSizeDesc(): Promise<ConfigDesc<string>> {
		const setting = await this.getLiveviewSetting()
		const settingOptions = await this.getLiveviewRecommendedSettings()

		const value = getSizeStringFromSetting(setting)
		const values = settingOptions.map(getSizeStringFromSetting)

		return {
			writable: values.length > 0,
			value,
			option: {
				type: 'enum',
				values,
			},
		}

		function getSizeStringFromSetting(setting: LiveviewSetting) {
			return `${setting.width}x${setting.height}`
		}
	}

	async setLiveviewSize(value: string): Promise<OperationResult> {
		const [width, height] = value.split('x').map(Number)

		const settings = await this.getLiveviewRecommendedSettings()

		const setting = settings.find(s => s.width === width && s.height === height)

		if (!setting) {
			return {status: 'invalid parameter'}
		}

		await this.setLiveviewSetting(setting)

		return {status: 'ok'}
	}

	private async getLiveviewRecommendedSettings(): Promise<LiveviewSetting[]> {
		const {data} = await this.device.receiveData({
			opcode: OpCodePanasonic.GetLiveviewSettings,
			parameters: [DevicePropCodePanasonic.Liveview_RecomImg],
		})

		const dataView = new PTPDataView(data)

		/*const receivedPropCode =*/ dataView.readUint32()
		/*const dataSize =*/ dataView.readUint32()

		const settingsNum = dataView.readUint16()
		/*const structSize =*/ dataView.readUint16()

		const settings = times(settingsNum, () => {
			return {
				height: dataView.readUint16(),
				width: dataView.readUint16(),
				frameSize: dataView.readUint16(),
				fps: dataView.readUint16(),
			}
		})

		return settings
	}

	private async getLiveviewSetting(): Promise<LiveviewSetting> {
		const {data} = await this.device.receiveData({
			opcode: OpCodePanasonic.GetLiveviewSettings,
			parameters: [DevicePropCodePanasonic.Liveview_TransImg],
		})

		const dataView = new PTPDataView(data)

		/*const receivedPropCode =*/ dataView.readUint32()
		/*const dataSize =*/ dataView.readUint32()

		return {
			height: dataView.readUint16(),
			width: dataView.readUint16(),
			frameSize: dataView.readUint16(),
			fps: dataView.readUint16(),
		}
	}

	private async setLiveviewSetting(setting: LiveviewSetting): Promise<void> {
		const dataView = new PTPDataView()

		dataView.writeUint32(DevicePropCodePanasonic.Liveview_TransImg)
		dataView.writeUint32(8)
		dataView.writeUint16(setting.height)
		dataView.writeUint16(setting.width)
		dataView.writeUint16(setting.frameSize)
		dataView.writeUint16(setting.fps)

		await this.device.sendData({
			opcode: OpCodePanasonic.SetLiveviewSettings,
			parameters: [DevicePropCodePanasonic.Liveview_TransImg],
			data: dataView.toBuffer(),
		})
	}

	async #getLiveviewImage(): Promise<null | Blob> {
		const {resCode, data} = await this.device.receiveData({
			label: 'Panasonic LiveviewImage',
			opcode: OpCodePanasonic.LiveviewImage,
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
			maxByteLength: 1_000_000, // = 1MB
			priority: PTPPriority.Liveview,
			nudgeAfterMs: NudgeAfterMs,
		})

		if (resCode !== ResCode.OK) return null

		// let histogram!: Uint8Array | undefined

		const dataView = new DataView(data)

		let jpegOffset = 180

		for (let offset = 0; offset < 180; ) {
			const id = dataView.getUint32(offset, true)
			offset += 4
			const dataSize = dataView.getUint32(offset, true)
			offset += 4
			// const sessionID = dataView.getUint32(offset, true)

			switch (id) {
				case 0x17000001: {
					// Jpeg Offset
					jpegOffset = dataView.getUint32(offset + 4, true)
					break
				}
				/*
				case 0x17000002: {
					// Jpeg Length?
					jpegLength = dataView.getUint32(offset + 4, true)
					break
				}*/
				case 0x17000003: {
					// Histogram
					// const valid = dataView.getUint32(offset + 4, true)
					// const samples = dataView.getUint32(offset + 8, true)
					// const elems = dataView.getUint32(offset + 12, true)
					// histogram = new Uint8Array(
					// 	data.slice(offset + 16, offset + 16 + samples)
					// )
					break
				}
				case 0x17000004: {
					// Posture?
					// const posture = dataView.getUint16(offset + 4, true)
					break
				}
				case 0x17000005: {
					// Level gauge
					// const roll = dataView.getInt16(offset + 4, true) / 10
					// const pitch = dataView.getInt16(offset + 6, true) / 10
					break
				}
			}

			offset += dataSize
		}

		if (!jpegOffset) return null

		const jpegData = data.slice(jpegOffset)

		const image = new Blob([jpegData], {type: 'image/jpg'})
		return image
	}

	async runManualFocus(option: ManualFocusOption): Promise<OperationResult> {
		const [direction, speed] = option.split(':')

		let mode = 0

		if (direction === 'far') {
			if (speed === '1') mode = 2
			else if (speed === '2') mode = 1
		} else if (direction === 'near') {
			if (speed === '1') mode = 3
			else if (speed === '2') mode = 4
		}

		if (!mode) {
			return {status: 'invalid parameter'}
		}

		const devicePropCode = 0x03010011

		const dataView = new PTPDataView()

		dataView.writeUint32(devicePropCode)
		dataView.writeUint32(2)
		dataView.writeUint16(mode)

		const {resCode} = await this.device.sendData({
			label: 'Panasonic ManualFocusDrive',
			opcode: OpCodePanasonic.ManualFocusDrive,
			parameters: [devicePropCode],
			data: dataView.toBuffer(),
			expectedResCodes: [ResCode.OK, ResCode.InvalidParameter],
		})

		if (resCode !== ResCode.OK) {
			// Rejected unless the focus mode is MF
			return {status: 'invalid parameter', message: 'Focus mode is not MF'}
		}

		return {status: 'ok'}
	}

	async runAutoFocus(): Promise<OperationResult> {
		await this.device.sendCommand({
			label: 'Panasonic Ctrl Liveview',
			opcode: OpCodePanasonic.CtrlLiveview,
			parameters: [0x03000024],
			nudgeAfterMs: NudgeAfterMs,
		})

		return {status: 'ok'}
	}

	// libgphoto2 does this for 0xC101, following LUMIX Tether
	protected onAcknowledgeRequired = async (ev: PTPEvent) => {
		try {
			await this.device.receiveData({
				label: 'Panasonic Acknowledge Event',
				opcode: OpCodePanasonic.AcknowledgeEvent,
				parameters: [ev.parameters[0]],
			})
		} catch {
			// As above
		}
	}

	protected onDevicePropChanged = async (ev: PTPEvent) => {
		const devicdPropCode = ev.parameters[0]

		let configs: ConfigName[]

		switch (devicdPropCode) {
			case DevicePropCodePanasonic.CameraMode:
				configs = ['exposureMode', 'aperture', 'shutterSpeed', 'exposureComp']
				break
			case DevicePropCodePanasonic.Aperture:
				configs = ['aperture']
				break
			case DevicePropCodePanasonic.ShutterSpeed:
				configs = ['shutterSpeed']
				break
			case DevicePropCodePanasonic.ISO:
				configs = ['iso']
				break
			case DevicePropCodePanasonic.Exposure:
				configs = ['exposureComp']
				break
			case DevicePropCodePanasonic.WhiteBalance:
				configs = ['whiteBalance', 'colorTemperature']
				break
			case DevicePropCodePanasonic.PhotoStyle:
				configs = ['colorMode']
				break
			case DevicePropCodePanasonic.ImageMode:
				configs = ['imageSize', 'imageAspect', 'imageQuality']
				break
			default:
				return
		}

		try {
			for (const config of configs) {
				const desc = await this.getDesc(config)
				this.emit(`${config}Change`, desc)
			}
		} catch {
			// Nothing to report to from an event; the next explicit read will throw.
		}
	}

	protected getObjectFormatNameByCode(code: number): string {
		return getObjectFormatName(code, c =>
			(ObjectFormatCodePanasonic[c] as string | undefined)?.toLowerCase()
		)
	}

	protected exposureModeTable = new BiMap<number, ExposureMode>([
		[0, 'P'],
		[1, 'A'],
		[2, 'S'],
		[3, 'M'],
		[5, 'video'],
		[7, 'vendor:iA'],
		[8, 'C1'],
		[9, 'C2'],
		[10, 'C3'],
		[12, 'vendor:S&Q'],
	])

	protected whiteBalanceTable = new BiMap<number, WhiteBalance>([
		[0x0002, 'auto'],
		[0x0004, 'daylight'],
		[0x8008, 'cloud'],
		[0x0006, 'incandescent'],
		// [0x8009, 'White Set'],
		[0x0007, 'flash'],
		[0x0005, 'fluorescent'],
		// [0x800a, 'Black and White'],
		[0x800b, 'vendor:preset1'],
		[0x800c, 'vendor:preset2'],
		[0x800d, 'vendor:preset3'],
		[0x800e, 'vendor:preset4'],
		[0x800f, 'shade'],
		// Color temperature slots K1-K4
		[0x8010, 'vendor:manual'],
		[0x8011, 'vendor:manual2'],
		[0x8012, 'vendor:manual3'],
		[0x8013, 'vendor:manual4'],
		[0x8014, 'auto cool'],
		[0x8015, 'auto warm'],
	])

	protected colorModeTable = new BiMap<number, string>([
		[0, 'Standard'],
		[1, 'Vivid'],
		[2, 'Natural'],
		[44, 'L.Classic Neo'],
		[18, 'Flat'],
		[4, 'Landscape'],
		[5, 'Portrait'],
		[3, 'Monochorme'],
		[15, 'L.Monochrome'],
		[17, 'L.Monochrome D'],
		[45, 'L.Monochrome S'],
		[50, 'LEICA Monochrome'],
		[41, 'Cinelike D2'],
		[42, 'Cinelike V2'],
		[14, 'Like709'],
		[40, 'V-Log'],
		[49, 'Realtime LUT'],
		[19, 'MY PHOTOSTYLE 1'],
		[20, 'MY PHOTOSTYLE 2'],
		[21, 'MY PHOTOSTYLE 3'],
		[22, 'MY PHOTOSTYLE 4'],
	])

	protected imageAspectTable = new BiMap<number, ImageAspect>([
		[1, '4:3'],
		[2, '3:2'],
		[3, '16:9'],
		[4, '1:1'],
		[10, '65:24'],
		[11, '2:1'],
	])

	protected imageQualityTable = new BiMap<number, string>([
		[0, 'fine'],
		[1, 'standard'],
		[2, 'raw'],
		[3, 'raw,fine'],
		[4, 'raw,standard'],
	])
}
