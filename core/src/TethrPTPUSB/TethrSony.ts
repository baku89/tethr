import {BiMap} from 'bim'

import {
	Aperture,
	BatteryLevel,
	ConfigName,
	ConfigType,
	ExposureMode,
	ISO,
	ShutterSpeed,
	WhiteBalance,
	WhiteBalanceTable,
} from '../configs'
import {ConfigScheme, ConfigTable, defineConfigs} from '../configScheme'
import {LiveviewDriver} from '../LiveviewDriver'
import {DatatypeCode, OpCode, ResCode} from '../PTPDatacode'
import {PTPDataView} from '../PTPDataView'
import {PTPPriority} from '../PTPDevice'
import {ConfigDesc, OperationResult, TakePhotoOption} from '../Tethr'
import {TethrObject} from '../TethrObject'
import {
	readonlyConfigDesc,
	sliceJpegData,
	UnsupportedConfigDesc,
	UnsupportedOperationResult,
} from '../util'
import {TethrPTPUSB} from './TethrPTPUSB'

/**
 * Sony "PC Remote" PTP extension (Alpha bodies).
 *
 * Implemented from the libgphoto2 ptp2 camlib (ptp.c / ptp-pack.c / config.c /
 * library.c). Sony reads/writes device properties through its own SDIO ops
 * rather than the standard PTP GetDevicePropDesc/SetDevicePropValue, so this
 * overrides the base config-scheme runners ({@link descFromScheme} /
 * {@link setFromScheme}) to use the Sony transport while reusing the base
 * declarative {@link configScheme} table and its change-event reverse map.
 *
 * NOTE: developed without physical hardware — protocol constants and byte
 * layouts follow libgphoto2, but the flows are unverified on a real camera.
 */
enum OpCodeSony {
	SDIOConnect = 0x9201,
	SDIOGetExtDeviceInfo = 0x9202,
	GetDevicePropDesc = 0x9203,
	GetDevicePropertyValue = 0x9204,
	SetControlDeviceA = 0x9205,
	GetControlDeviceDesc = 0x9206,
	SetControlDeviceB = 0x9207,
	GetAllDevicePropData = 0x9209,
}

/** Sony device property codes (PTP_DPC_SONY_*). */
enum DevicePropCodeSony {
	ColorTemp = 0xd20f,
	ShutterSpeed = 0xd20d,
	FocusFound = 0xd213,
	ObjectInMemory = 0xd215,
	BatteryLevel = 0xd218,
	ISO = 0xd21e,
	ExposureCompensation = 0xd224,
	PriorityMode = 0xd25a,
}

/** Sony control codes used with SetControlDeviceB (press = 2, release = 1). */
enum ControlCodeSony {
	ShutterHalfRelease = 0xd2c1, // half-press / AF
	ShutterRelease = 0xd2c2, // full-press / shutter
}

/** Standard PTP device property codes Sony reuses. */
enum DevicePropCodeStd {
	WhiteBalance = 0x5005,
	FNumber = 0x5007,
	ExposureProgramMode = 0x500e,
}

/** Fixed object handles Sony exposes. */
const SONY_CAPTURED_IMAGE_HANDLE = 0xffffc001
const SONY_LIVEVIEW_HANDLE = 0x80000001

/** ExposureProgramMode values for "new mode" (2020+) bodies — 32-bit. */
const ExposureModeTableSony = new BiMap<number, ExposureMode>([
	[0x00000001, 'M'],
	[0x00010002, 'P'],
	[0x00020003, 'A'],
	[0x00030004, 'S'],
	[0x00048000, 'vendor:intelligent-auto'],
	[0x00048001, 'vendor:superior-auto'],
	[0x00078050, 'video'],
	[0x00078051, 'vendor:movie-a'],
	[0x00078052, 'vendor:movie-s'],
	[0x00078053, 'vendor:movie-m'],
	[0x00008020, 'vendor:memory-recall'],
])

const SONY_ISO_MASK = 0x00ffffff

interface SonyDpd {
	datatype: number
	getSet: number
	isEnabled: number
	value: number
	values: number[]
	formFlag: number
	range?: {min: number; max: number; step: number}
}

export class TethrSony extends TethrPTPUSB {
	async open(): Promise<void> {
		await super.open()

		// SDIO handshake (libgphoto2 camera_init): connect phases 1 & 2, query
		// the extended capability list (protocol 3.00 token 0x12c), then phase 3.
		await this.#sdioConnect(1)
		await this.#sdioConnect(2)
		await this.#getExtDeviceInfo()
		await this.#sdioConnect(3)

		// Put the camera in "application priority" so PC settings take effect.
		try {
			await this.#setControlDeviceA(
				DevicePropCodeSony.PriorityMode,
				DatatypeCode.Int8,
				1
			)
		} catch {
			// Not all bodies expose PriorityMode; ignore.
		}

		// Sony pushes property changes via event 0xc203; refresh the common
		// exposure configs when it fires.
		this.device.onEventCode(0xc203, this.#onSonyPropChanged)
	}

	async #sdioConnect(phase: number): Promise<void> {
		// Data-in transaction; the returned payload is discarded.
		await this.device.receiveData({
			label: `Sony SDIOConnect ${phase}`,
			opcode: OpCodeSony.SDIOConnect,
			parameters: [phase, 0x0, 0x0],
		})
	}

	async #getExtDeviceInfo(): Promise<void> {
		// Request protocol 3.00; we don't parse the capability list here (the
		// base getDeviceInfo already drives detection), just complete the
		// handshake the camera expects.
		await this.device.receiveData({
			label: 'Sony SDIOGetExtDeviceInfo',
			opcode: OpCodeSony.SDIOGetExtDeviceInfo,
			parameters: [0x012c, 0x1],
		})
	}

	// Config scheme — Sony codes, read/written over the SDIO transport.

	protected configScheme: ConfigTable = defineConfigs({
		aperture: {
			devicePropCode: DevicePropCodeStd.FNumber,
			datatypeCode: DatatypeCode.Uint16,
			decode: raw => (raw / 100) as Aperture,
			encode: value => (value === 'auto' ? null : Math.round(value * 100)),
		},
		shutterSpeed: {
			devicePropCode: DevicePropCodeSony.ShutterSpeed,
			datatypeCode: DatatypeCode.Uint32,
			decode: raw => decodeSonyShutterSpeed(raw),
			encode: value => encodeSonyShutterSpeed(value),
		},
		iso: {
			devicePropCode: DevicePropCodeSony.ISO,
			datatypeCode: DatatypeCode.Uint32,
			decode: raw => {
				const base = raw & SONY_ISO_MASK
				return base === SONY_ISO_MASK ? 'auto' : base
			},
			encode: value => (value === 'auto' ? SONY_ISO_MASK : value),
		},
		exposureComp: {
			devicePropCode: DevicePropCodeSony.ExposureCompensation,
			datatypeCode: DatatypeCode.Int16,
			// Sony reports exposure compensation in 1/1000 EV.
			decode: raw => formatExposureComp(raw / 1000),
			encode: value => {
				const ev = parseExposureComp(value)
				return ev === null ? null : Math.round(ev * 1000)
			},
		},
		exposureMode: {
			devicePropCode: DevicePropCodeStd.ExposureProgramMode,
			datatypeCode: DatatypeCode.Uint32,
			decode: raw =>
				ExposureModeTableSony.get(raw) ??
				(`vendor:${raw.toString(16)}` as ExposureMode),
			encode: value => ExposureModeTableSony.getKey(value) ?? null,
		},
		whiteBalance: {
			devicePropCode: DevicePropCodeStd.WhiteBalance,
			datatypeCode: DatatypeCode.Uint16,
			decode: raw =>
				WhiteBalanceTable.get(raw) ??
				(`vendor:${raw.toString(16)}` as WhiteBalance),
			encode: value => WhiteBalanceTable.getKey(value) ?? null,
		},
		colorTemperature: {
			devicePropCode: DevicePropCodeSony.ColorTemp,
			datatypeCode: DatatypeCode.Uint16,
			decode: raw => raw,
			encode: value => value,
		},
		batteryLevel: {
			devicePropCode: DevicePropCodeSony.BatteryLevel,
			datatypeCode: DatatypeCode.Uint8,
			decode: raw => raw as BatteryLevel,
		},
	})

	// Sony reads descriptors via GetDevicePropDesc (0x9203) and writes via
	// SetControlDeviceA (0x9205), not the standard PTP ops — so override the
	// base scheme runners. The base one-liner config methods then route here.

	protected async descFromScheme<N extends ConfigName>(
		name: N
	): Promise<ConfigDesc<ConfigType[N]>> {
		const scheme = this.configScheme[name] as ConfigScheme<N> | undefined
		if (!scheme) return UnsupportedConfigDesc

		let dpd: SonyDpd
		try {
			dpd = await this.#readDpd(scheme.devicePropCode)
		} catch {
			return UnsupportedConfigDesc
		}

		const value = scheme.decode(dpd.value)
		const settable =
			(dpd.getSet === 0x01 || (dpd.getSet & 0x80) !== 0) && dpd.isEnabled === 1

		if (dpd.formFlag === 0x02) {
			const values = dpd.values.map(scheme.decode).filter(isntNull)
			if (settable && values.length > 0) {
				return {writable: true, value, option: {type: 'enum', values}}
			}
			return {writable: false, value, option: {type: 'enum', values}}
		}

		if (dpd.formFlag === 0x01 && dpd.range) {
			const min = scheme.decode(dpd.range.min)
			const max = scheme.decode(dpd.range.max)
			const step = scheme.decode(dpd.range.step)
			if (
				settable &&
				typeof min === 'number' &&
				typeof max === 'number' &&
				typeof step === 'number'
			) {
				return {
					writable: true,
					value,
					option: {type: 'range', min, max, step} as never,
				}
			}
		}

		return {writable: false, value}
	}

	protected async setFromScheme<N extends ConfigName>(
		name: N,
		value: ConfigType[N]
	): Promise<OperationResult> {
		const scheme = this.configScheme[name] as ConfigScheme<N> | undefined
		if (!scheme || !scheme.encode) return UnsupportedOperationResult

		const encoded = scheme.encode(value)
		if (encoded === null) return {status: 'invalid parameter'}

		return this.#setControlDeviceA(
			scheme.devicePropCode,
			scheme.datatypeCode,
			encoded
		)
	}

	// shutterSpeed / colorTemperature aren't implemented by the base class, so
	// expose them here (delegating to the scheme runner above).

	setShutterSpeed(value: ShutterSpeed) {
		return this.setFromScheme('shutterSpeed', value)
	}
	getShutterSpeedDesc() {
		return this.descFromScheme('shutterSpeed')
	}

	setColorTemperature(value: number) {
		return this.setFromScheme('colorTemperature', value)
	}
	getColorTemperatureDesc() {
		return this.descFromScheme('colorTemperature')
	}

	// Capabilities

	async getCanTakePhotoDesc() {
		return readonlyConfigDesc(true)
	}
	async getCanRunAutoFocusDesc() {
		return readonlyConfigDesc(true)
	}
	async getCanStartLiveviewDesc() {
		return readonlyConfigDesc(true)
	}

	// Actions

	async runAutoFocus(): Promise<OperationResult> {
		await this.#setControlDeviceB(ControlCodeSony.ShutterHalfRelease, 2)

		const focused = await this.#waitFor(
			DevicePropCodeSony.FocusFound,
			v => v === 2,
			1000
		)

		await this.#setControlDeviceB(ControlCodeSony.ShutterHalfRelease, 1)

		return {status: focused ? 'ok' : 'general error'}
	}

	async takePhoto({doDownload = true}: TakePhotoOption = {}): Promise<
		OperationResult<TethrObject[]>
	> {
		// Half-press (AF) then full-press.
		await this.#setControlDeviceB(ControlCodeSony.ShutterHalfRelease, 2)
		await this.#setControlDeviceB(ControlCodeSony.ShutterRelease, 2)

		// Wait for focus (best effort; ignore if the body doesn't report it).
		await this.#waitFor(DevicePropCodeSony.FocusFound, v => v === 2, 1000)

		// Release.
		await this.#setControlDeviceB(ControlCodeSony.ShutterRelease, 1)
		await this.#setControlDeviceB(ControlCodeSony.ShutterHalfRelease, 1)

		// Wait until an image is held in camera RAM.
		const ready = await this.#waitFor(
			DevicePropCodeSony.ObjectInMemory,
			v => v >= 0x8000,
			35000
		)

		if (!ready) return {status: 'general error'}
		if (!doDownload) return {status: 'ok', value: []}

		const info = await this.getObjectInfo(SONY_CAPTURED_IMAGE_HANDLE)
		const buffer = await this.getObjectBuffer(SONY_CAPTURED_IMAGE_HANDLE)
		const blob = new Blob([buffer], {type: 'image/jpeg'})

		return {status: 'ok', value: [{...info, blob}]}
	}

	#liveview = new LiveviewDriver({
		grab: () => this.#getLiveviewImage(),
		isOpen: () => this.device.opened,
		onChange: stream => this.emit('liveviewChange', readonlyConfigDesc(stream)),
	})

	async startLiveview(): Promise<OperationResult<MediaStream>> {
		// Alpha bodies have no explicit liveview start op — the preview handle is
		// readable while connected.
		const stream = await this.#liveview.start()
		return {status: 'ok', value: stream}
	}

	async getLiveview(): Promise<MediaStream | null> {
		return this.#liveview.stream
	}

	async stopLiveview(): Promise<OperationResult> {
		this.#liveview.stop()
		return {status: 'ok'}
	}

	async #getLiveviewImage(): Promise<Blob | null> {
		try {
			const {resCode, data} = await this.device.receiveData({
				label: 'Sony Liveview GetObject',
				opcode: OpCode.GetObject,
				parameters: [SONY_LIVEVIEW_HANDLE],
				expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
				maxByteLength: 2_000_000,
				priority: PTPPriority.Liveview,
			})
			if (resCode !== ResCode.OK) return null

			// The payload is a JPEG preceded by a small Sony header; locate the
			// actual JPEG by its SOI/EOI markers.
			const jpeg = sliceJpegData(data)
			return new Blob([jpeg], {type: 'image/jpeg'})
		} catch {
			return null
		}
	}

	// Sony transport primitives

	async #readDpd(code: number): Promise<SonyDpd> {
		const {data} = await this.device.receiveData({
			label: 'Sony GetDevicePropDesc',
			opcode: OpCodeSony.GetDevicePropDesc,
			parameters: [code],
			priority: PTPPriority.Interactive,
		})

		const dv = new PTPDataView(data)

		/* propcode */ dv.readUint16()
		const datatype = dv.readUint16()
		const getSet = dv.readUint8()
		const isEnabled = dv.readUint8()

		readByDatatype(dv, datatype) // factory default
		const value = readByDatatype(dv, datatype) // current

		const formFlag = dv.readUint8()

		const dpd: SonyDpd = {
			datatype,
			getSet,
			isEnabled,
			value,
			values: [],
			formFlag,
		}

		if (formFlag === 0x01) {
			dpd.range = {
				min: readByDatatype(dv, datatype),
				max: readByDatatype(dv, datatype),
				step: readByDatatype(dv, datatype),
			}
		} else if (formFlag === 0x02) {
			const count = dv.readUint16()
			for (let i = 0; i < count; i++) {
				dpd.values.push(readByDatatype(dv, datatype))
			}
		}

		return dpd
	}

	async #setControlDeviceA(
		code: number,
		datatype: number,
		value: number
	): Promise<OperationResult> {
		const dv = new PTPDataView()
		writeByDatatype(dv, datatype, value)

		const {resCode} = await this.device.sendData({
			label: 'Sony SetControlDeviceA',
			opcode: OpCodeSony.SetControlDeviceA,
			parameters: [code],
			data: dv.toBuffer(),
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		return {status: resCode === ResCode.OK ? 'ok' : 'busy'}
	}

	async #setControlDeviceB(code: number, value: number): Promise<void> {
		const dv = new PTPDataView()
		dv.writeUint16(value)

		await this.device.sendData({
			label: 'Sony SetControlDeviceB',
			opcode: OpCodeSony.SetControlDeviceB,
			parameters: [code],
			data: dv.toBuffer(),
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})
	}

	/** Polls a Sony property until `predicate` holds or `timeoutMs` elapses. */
	async #waitFor(
		code: number,
		predicate: (value: number) => boolean,
		timeoutMs: number
	): Promise<boolean> {
		const deadline = Date.now() + timeoutMs
		while (Date.now() < deadline) {
			try {
				const dpd = await this.#readDpd(code)
				if (predicate(dpd.value)) return true
			} catch {
				// keep polling
			}
		}
		return false
	}

	#onSonyPropChanged = async () => {
		const configs: ConfigName[] = [
			'aperture',
			'shutterSpeed',
			'iso',
			'exposureComp',
			'exposureMode',
			'whiteBalance',
		]
		for (const name of configs) {
			const desc = await this.getDesc(name)
			this.emit(`${name}Change`, desc)
		}
	}
}

function isntNull<T>(v: T | null): v is T {
	return v !== null
}

function readByDatatype(dv: PTPDataView, datatype: number): number {
	switch (datatype) {
		case DatatypeCode.Int8:
			return dv.readInt8()
		case DatatypeCode.Uint8:
			return dv.readUint8()
		case DatatypeCode.Int16:
			return dv.readInt16()
		case DatatypeCode.Uint16:
			return dv.readUint16()
		case DatatypeCode.Uint32:
			return dv.readUint32()
		default:
			throw new Error(`Sony: unsupported datatype ${datatype}`)
	}
}

function writeByDatatype(dv: PTPDataView, datatype: number, value: number) {
	switch (datatype) {
		case DatatypeCode.Int8:
			dv.writeInt8(value)
			break
		case DatatypeCode.Uint8:
			dv.writeUint8(value)
			break
		case DatatypeCode.Int16:
			dv.writeInt16(value)
			break
		case DatatypeCode.Uint16:
			dv.writeUint16(value)
			break
		case DatatypeCode.Uint32:
			dv.writeUint32(value)
			break
		default:
			throw new Error(`Sony: unsupported datatype ${datatype}`)
	}
}

/** Sony shutter speed: u32 = (numerator << 16) | denominator; bulb = 0. */
function decodeSonyShutterSpeed(raw: number): ShutterSpeed {
	if (raw === 0 || raw === 0xffffffff) return 'bulb'

	const num = (raw >>> 16) & 0xffff
	const den = raw & 0xffff
	if (den === 0) return 'bulb'

	if (num === 1) return `1/${den}` as ShutterSpeed
	if (den === 1) return `${num}` as ShutterSpeed
	// Sony reports fast/slow speeds as tenths (e.g. 25/10 = 2.5").
	return `${num / den}` as ShutterSpeed
}

function encodeSonyShutterSpeed(value: ShutterSpeed): number | null {
	if (value === 'bulb') return 0
	if (value === 'sync' || value === 'auto') return null

	if (value.includes('/')) {
		const [n, d] = value.split('/').map(s => parseInt(s, 10))
		if (!n || !d) return null
		return ((n & 0xffff) << 16) | (d & 0xffff)
	}

	const seconds = parseFloat(value)
	if (isNaN(seconds)) return null
	// Encode whole seconds as n/1, fractional as tenths.
	if (Number.isInteger(seconds)) return ((seconds & 0xffff) << 16) | 1
	return ((Math.round(seconds * 10) & 0xffff) << 16) | 10
}

/** Formats an EV number into tethr's exposure-comp string (e.g. '+1 1/3'). */
function formatExposureComp(ev: number): string {
	if (ev === 0) return '0'

	const sign = ev > 0 ? '+' : '-'
	const abs = Math.abs(ev)
	const integer = Math.floor(abs + 1e-6)
	const frac = abs - integer

	let fraction = ''
	if (Math.abs(frac - 1 / 3) < 0.05) fraction = '1/3'
	else if (Math.abs(frac - 1 / 2) < 0.05) fraction = '1/2'
	else if (Math.abs(frac - 2 / 3) < 0.05) fraction = '2/3'

	if (integer === 0) return `${sign}${fraction || '0'}`
	if (fraction === '') return `${sign}${integer}`
	return `${sign}${integer} ${fraction}`
}

function parseExposureComp(value: string): number | null {
	if (value === '0') return 0

	const match = value.match(/^([+-]?)([0-9]+)?\s?(1\/2|1\/3|2\/3)?$/)
	if (!match) return null

	const [, signStr, integerStr, fractionStr] = match
	const sign = signStr === '-' ? -1 : 1
	const integer = integerStr ? parseInt(integerStr, 10) : 0

	let frac = 0
	if (fractionStr === '1/3') frac = 1 / 3
	else if (fractionStr === '1/2') frac = 1 / 2
	else if (fractionStr === '2/3') frac = 2 / 3

	return sign * (integer + frac)
}
