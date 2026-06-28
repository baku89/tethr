import {BiMap} from 'bim'
import sleep from 'sleep-promise'

import {
	Aperture,
	BatteryLevel,
	ConfigName,
	DriveMode,
	ExposureComp,
	ExposureMode,
	ISO,
	ShutterSpeed,
	WhiteBalance,
} from '../configs'
import {LiveviewDriver} from '../LiveviewDriver'
import {ResCode} from '../PTPDatacode'
import {PTPDataView} from '../PTPDataView'
import {PTPPriority} from '../PTPDevice'
import {ConfigDesc, OperationResult, TakePhotoOption} from '../Tethr'
import {TethrObject} from '../TethrObject'
import {
	isntNil,
	readonlyConfigDesc,
	sliceJpegData,
	UnsupportedConfigDesc,
} from '../util'
import {TethrPTPUSB} from './TethrPTPUSB'

/**
 * Canon EOS PTP extension (the event-driven "EOS" dialect, vendor id 0x0b).
 *
 * Implemented from the libgphoto2 ptp2 camlib (ptp.h / ptp-pack.c / config.c /
 * library.c). EOS does not answer the standard GetDevicePropDesc; instead the
 * camera streams property values and their available-value lists through
 * GetEvent (0x9116). This class maintains a property cache fed by that stream,
 * sets values via SetDevicePropValueEx (0x9110), and drives capture/liveview
 * with the EOS remote-release and viewfinder ops.
 *
 * NOTE: developed without physical hardware — constants and byte layouts
 * follow libgphoto2, but the flows are unverified on a real camera. Object
 * browsing (storages/cards) uses EOS-specific ops not yet implemented here;
 * tethered shooting (configs, capture, liveview, AF) is the focus.
 */
enum OpCodeCanon {
	GetObject = 0x9104,
	GetPartialObject = 0x9107,
	SetDevicePropValueEx = 0x9110,
	SetRemoteMode = 0x9114,
	SetEventMode = 0x9115,
	GetEvent = 0x9116,
	TransferComplete = 0x9117,
	KeepDeviceOn = 0x911d,
	RequestDevicePropValue = 0x9127,
	RemoteReleaseOn = 0x9128,
	RemoteReleaseOff = 0x9129,
	GetViewFinderData = 0x9153,
	DoAf = 0x9154,
}

/** EOS event record types in the GetEvent stream. */
enum EventTypeCanon {
	PropValueChanged = 0xc189,
	AvailListChanged = 0xc18a,
	ObjectAddedEx = 0xc181,
	ObjectAddedEx64 = 0xc1a7,
}

/** EOS device property codes (PTP_DPC_CANON_EOS_*). */
enum DPCCanon {
	Aperture = 0xd101,
	ShutterSpeed = 0xd102,
	ISOSpeed = 0xd103,
	ExpCompensation = 0xd104,
	AutoExposureMode = 0xd105,
	DriveMode = 0xd106,
	WhiteBalance = 0xd109,
	ColorTemperature = 0xd10a,
	BatteryPower = 0xd111,
	EVFOutputDevice = 0xd1b0,
}

const CanonCodeToConfig = new BiMap<number, ConfigName>([
	[DPCCanon.Aperture, 'aperture'],
	[DPCCanon.ShutterSpeed, 'shutterSpeed'],
	[DPCCanon.ISOSpeed, 'iso'],
	[DPCCanon.ExpCompensation, 'exposureComp'],
	[DPCCanon.AutoExposureMode, 'exposureMode'],
	[DPCCanon.DriveMode, 'driveMode'],
	[DPCCanon.WhiteBalance, 'whiteBalance'],
	[DPCCanon.ColorTemperature, 'colorTemperature'],
	[DPCCanon.BatteryPower, 'batteryLevel'],
])

interface CanonProp {
	value?: number
	available: number[]
}

export class TethrCanon extends TethrPTPUSB {
	#props = new Map<number, CanonProp>()
	#pendingObjects: {handle: number; size: number}[] = []

	async open(): Promise<void> {
		await super.open()

		await this.#sendCanon('EOS SetRemoteMode', OpCodeCanon.SetRemoteMode, [1])
		await this.#sendCanon('EOS SetEventMode', OpCodeCanon.SetEventMode, [1])

		// Prime the property cache.
		await this.#pumpEvents()
	}

	async close(): Promise<void> {
		try {
			await this.#sendCanon('EOS SetEventMode', OpCodeCanon.SetEventMode, [0])
			await this.#sendCanon('EOS SetRemoteMode', OpCodeCanon.SetRemoteMode, [0])
		} catch {
			// best effort
		}
		await super.close()
	}

	// Configs

	async getApertureDesc() {
		await this.#pumpEvents()
		return this.#desc(DPCCanon.Aperture, raw => ApertureTable.get(raw) ?? null)
	}
	async setAperture(value: Aperture) {
		return this.#setFromTable(DPCCanon.Aperture, ApertureTable, value)
	}

	async getShutterSpeedDesc() {
		await this.#pumpEvents()
		return this.#desc(
			DPCCanon.ShutterSpeed,
			raw => ShutterSpeedTable.get(raw) ?? null
		)
	}
	async setShutterSpeed(value: ShutterSpeed) {
		return this.#setFromTable(DPCCanon.ShutterSpeed, ShutterSpeedTable, value)
	}

	async getIsoDesc() {
		await this.#pumpEvents()
		return this.#desc(DPCCanon.ISOSpeed, raw => IsoTable.get(raw) ?? null)
	}
	async setIso(value: ISO) {
		return this.#setFromTable(DPCCanon.ISOSpeed, IsoTable, value)
	}

	async getExposureCompDesc() {
		await this.#pumpEvents()
		return this.#desc(
			DPCCanon.ExpCompensation,
			raw => ExposureCompTable.get(raw) ?? null
		)
	}
	async setExposureComp(value: ExposureComp) {
		return this.#setFromTable(DPCCanon.ExpCompensation, ExposureCompTable, value)
	}

	async getExposureModeDesc() {
		await this.#pumpEvents()
		return this.#desc(
			DPCCanon.AutoExposureMode,
			raw => ExposureModeTable.get(raw) ?? null
		)
	}
	async setExposureMode(value: ExposureMode) {
		return this.#setFromTable(DPCCanon.AutoExposureMode, ExposureModeTable, value)
	}

	async getWhiteBalanceDesc() {
		await this.#pumpEvents()
		return this.#desc(
			DPCCanon.WhiteBalance,
			raw => WhiteBalanceTable.get(raw) ?? null
		)
	}
	async setWhiteBalance(value: WhiteBalance) {
		return this.#setFromTable(DPCCanon.WhiteBalance, WhiteBalanceTable, value)
	}

	async getDriveModeDesc() {
		await this.#pumpEvents()
		return this.#desc(DPCCanon.DriveMode, raw => DriveModeTable.get(raw) ?? null)
	}
	async setDriveMode(value: DriveMode) {
		return this.#setFromTable(DPCCanon.DriveMode, DriveModeTable, value)
	}

	async getColorTemperatureDesc() {
		await this.#pumpEvents()
		return this.#desc(DPCCanon.ColorTemperature, raw => raw)
	}
	async setColorTemperature(value: number) {
		return this.#setProp(DPCCanon.ColorTemperature, value)
	}

	async getBatteryLevelDesc() {
		await this.#pumpEvents()
		return this.#desc(DPCCanon.BatteryPower, decodeBatteryPower)
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
		await this.#sendCanon('EOS DoAf', OpCodeCanon.DoAf, [])
		return {status: 'ok'}
	}

	async takePhoto({doDownload = true}: TakePhotoOption = {}): Promise<
		OperationResult<TethrObject[]>
	> {
		this.#pendingObjects = []

		// param1 = 3 (half+full press), param2 = 0 (AF).
		await this.#sendCanon('EOS RemoteReleaseOn', OpCodeCanon.RemoteReleaseOn, [
			3, 0,
		])
		await this.#sendCanon('EOS RemoteReleaseOff', OpCodeCanon.RemoteReleaseOff, [
			3,
		])

		const object = await this.#waitForObject(35000)
		if (!object) return {status: 'general error'}
		if (!doDownload) return {status: 'ok', value: []}

		const buffer = await this.#getCanonObject(object.handle, object.size)
		const blob = new Blob([buffer], {type: 'image/jpeg'})

		return {
			status: 'ok',
			value: [{id: object.handle, blob, format: 'jpeg'} as TethrObject],
		}
	}

	#liveview = new LiveviewDriver({
		grab: () => this.#getLiveviewImage(),
		isOpen: () => this.device.opened,
		onChange: stream => this.emit('liveviewChange', readonlyConfigDesc(stream)),
	})

	async startLiveview(): Promise<OperationResult<MediaStream>> {
		// Route the EVF to the PC.
		await this.#setProp(DPCCanon.EVFOutputDevice, 2)
		const stream = await this.#liveview.start()
		return {status: 'ok', value: stream}
	}

	async getLiveview(): Promise<MediaStream | null> {
		return this.#liveview.stream
	}

	async stopLiveview(): Promise<OperationResult> {
		this.#liveview.stop()
		try {
			await this.#setProp(DPCCanon.EVFOutputDevice, 0)
		} catch {
			// ignore
		}
		return {status: 'ok'}
	}

	async #getLiveviewImage(): Promise<Blob | null> {
		try {
			const {resCode, data} = await this.device.receiveData({
				label: 'EOS GetViewFinderData',
				opcode: OpCodeCanon.GetViewFinderData,
				parameters: [0x00200000, 0, 0],
				expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
				maxByteLength: 2_000_000,
				priority: PTPPriority.Liveview,
			})
			if (resCode !== ResCode.OK) return null

			// The payload is a sequence of [len u32, type u32, payload] records;
			// type 1 / 11 / 9 carry the JPEG. Fall back to scanning for the JPEG
			// markers if the framing isn't as expected.
			const jpeg = extractViewfinderJpeg(data)
			return jpeg ? new Blob([jpeg], {type: 'image/jpeg'}) : null
		} catch {
			return null
		}
	}

	// EOS transport helpers

	async #sendCanon(
		label: string,
		opcode: number,
		parameters: number[]
	): Promise<void> {
		await this.device.sendCommand({
			label,
			opcode,
			parameters,
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})
	}

	#desc<T>(code: number, decode: (raw: number) => T | null): ConfigDesc<T> {
		const prop = this.#props.get(code)
		if (!prop || prop.value === undefined) return UnsupportedConfigDesc

		const value = decode(prop.value)
		const values = prop.available.map(decode).filter(isntNil)

		if (values.length > 0) {
			return {writable: true, value, option: {type: 'enum', values}}
		}
		return {writable: false, value}
	}

	async #setFromTable<T>(
		code: number,
		table: BiMap<number, T>,
		value: T
	): Promise<OperationResult> {
		const raw = table.getKey(value)
		if (raw === undefined) return {status: 'invalid parameter'}
		return this.#setProp(code, raw)
	}

	async #setProp(code: number, value: number): Promise<OperationResult> {
		// SetDevicePropValueEx payload: [size u32 = 12][propcode u32][value u32].
		const dv = new PTPDataView()
		dv.writeUint32(0x0000000c)
		dv.writeUint32(code)
		dv.writeUint32(value)

		const {resCode} = await this.device.sendData({
			label: 'EOS SetDevicePropValueEx',
			opcode: OpCodeCanon.SetDevicePropValueEx,
			data: dv.toBuffer(),
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		// Ask the camera to re-emit and drain the event stream so the cache and
		// change events reflect the new value.
		await this.#sendCanon(
			'EOS RequestDevicePropValue',
			OpCodeCanon.RequestDevicePropValue,
			[code]
		)
		await this.#pumpEvents()

		return {status: resCode === ResCode.OK ? 'ok' : 'busy'}
	}

	#ensureProp(code: number): CanonProp {
		let prop = this.#props.get(code)
		if (!prop) {
			prop = {available: []}
			this.#props.set(code, prop)
		}
		return prop
	}

	/** Drains the EOS event stream into the property cache. */
	async #pumpEvents(): Promise<void> {
		const {data} = await this.device.receiveData({
			label: 'EOS GetEvent',
			opcode: OpCodeCanon.GetEvent,
			maxByteLength: 1_000_000,
		})

		const dv = new DataView(data)
		const changed = new Set<number>()
		let offset = 0

		while (offset + 8 <= data.byteLength) {
			const size = dv.getUint32(offset, true)
			const type = dv.getUint32(offset + 4, true)
			if (size < 8 || offset + size > data.byteLength) break

			const p = offset + 8

			switch (type) {
				case EventTypeCanon.PropValueChanged: {
					const code = dv.getUint32(p, true)
					const valLen = size - 12
					let value = 0
					if (valLen === 1) value = dv.getUint8(p + 4)
					else if (valLen === 2) value = dv.getUint16(p + 4, true)
					else if (valLen >= 4) value = dv.getUint32(p + 4, true)
					this.#ensureProp(code).value = value
					changed.add(code)
					break
				}
				case EventTypeCanon.AvailListChanged: {
					const code = dv.getUint32(p, true)
					const count = dv.getUint32(p + 8, true)
					const values: number[] = []
					for (let i = 0; i < count; i++) {
						const at = p + 12 + i * 4
						if (at + 4 > data.byteLength) break
						values.push(dv.getUint32(at, true))
					}
					this.#ensureProp(code).available = values
					changed.add(code)
					break
				}
				case EventTypeCanon.ObjectAddedEx:
				case EventTypeCanon.ObjectAddedEx64: {
					const handle = dv.getUint32(p, true)
					const objSize = dv.getUint32(offset + 0x1c, true)
					this.#pendingObjects.push({handle, size: objSize})
					break
				}
			}

			offset += size
		}

		for (const code of changed) {
			const name = CanonCodeToConfig.get(code)
			if (name) {
				const desc = await this.getDesc(name)
				this.emit(`${name}Change`, desc)
			}
		}
	}

	async #waitForObject(
		timeoutMs: number
	): Promise<{handle: number; size: number} | null> {
		const deadline = Date.now() + timeoutMs
		while (Date.now() < deadline) {
			if (this.#pendingObjects.length > 0) {
				return this.#pendingObjects.shift()!
			}
			await this.#pumpEvents()
			if (this.#pendingObjects.length === 0) await sleep(100)
		}
		return null
	}

	async #getCanonObject(handle: number, size: number): Promise<ArrayBuffer> {
		const {data} = await this.device.receiveData({
			label: 'EOS GetObject',
			opcode: OpCodeCanon.GetObject,
			parameters: [handle],
			maxByteLength: size + 1000,
			priority: PTPPriority.Bulk,
		})

		await this.#sendCanon(
			'EOS TransferComplete',
			OpCodeCanon.TransferComplete,
			[handle]
		)

		return data
	}
}

// Value tables (libgphoto2 config.c). Codes the camera may report but that
// alias a canonical value are omitted to keep the maps bijective.

const ApertureTable = new BiMap<number, Aperture>([
	[0x08, 1],
	[0x0b, 1.1],
	[0x0c, 1.2],
	[0x10, 1.4],
	[0x13, 1.6],
	[0x14, 1.8],
	[0x18, 2],
	[0x1b, 2.2],
	[0x1c, 2.5],
	[0x20, 2.8],
	[0x23, 3.2],
	[0x24, 3.5],
	[0x28, 4],
	[0x2b, 4.5],
	[0x2d, 5],
	[0x30, 5.6],
	[0x33, 6.3],
	[0x34, 6.7],
	[0x35, 7.1],
	[0x38, 8],
	[0x3b, 9],
	[0x3c, 9.5],
	[0x3d, 10],
	[0x40, 11],
	[0x43, 13],
	[0x45, 14],
	[0x48, 16],
	[0x4b, 18],
	[0x4c, 19],
	[0x4d, 20],
	[0x50, 22],
	[0x53, 25],
	[0x54, 27],
	[0x55, 29],
	[0x58, 32],
	[0x5b, 36],
	[0x5c, 38],
	[0x5d, 40],
	[0x60, 45],
	[0x63, 51],
	[0x65, 57],
	[0x68, 64],
	[0x6b, 72],
	[0x6d, 81],
	[0x70, 91],
])

const ShutterSpeedTable = new BiMap<number, ShutterSpeed>([
	[0x0c, 'bulb'],
	[0x10, '30'],
	[0x13, '25'],
	[0x15, '20'],
	[0x18, '15'],
	[0x1b, '13'],
	[0x1c, '10'],
	[0x20, '8'],
	[0x24, '6'],
	[0x25, '5'],
	[0x28, '4'],
	[0x2b, '3.2'],
	[0x2c, '3'],
	[0x2d, '2.5'],
	[0x30, '2'],
	[0x33, '1.6'],
	[0x34, '1.5'],
	[0x35, '1.3'],
	[0x38, '1'],
	[0x3b, '0.8'],
	[0x3c, '0.7'],
	[0x3d, '0.6'],
	[0x40, '0.5'],
	[0x43, '0.4'],
	[0x44, '0.3'],
	[0x48, '1/4'],
	[0x4b, '1/5'],
	[0x4c, '1/6'],
	[0x50, '1/8'],
	[0x53, '1/10'],
	[0x55, '1/13'],
	[0x58, '1/15'],
	[0x5b, '1/20'],
	[0x5d, '1/25'],
	[0x60, '1/30'],
	[0x63, '1/40'],
	[0x64, '1/45'],
	[0x65, '1/50'],
	[0x68, '1/60'],
	[0x6b, '1/80'],
	[0x6c, '1/90'],
	[0x6d, '1/100'],
	[0x70, '1/125'],
	[0x73, '1/160'],
	[0x74, '1/180'],
	[0x75, '1/200'],
	[0x78, '1/250'],
	[0x7b, '1/320'],
	[0x7c, '1/350'],
	[0x7d, '1/400'],
	[0x80, '1/500'],
	[0x83, '1/640'],
	[0x84, '1/750'],
	[0x85, '1/800'],
	[0x88, '1/1000'],
	[0x8b, '1/1250'],
	[0x8c, '1/1500'],
	[0x8d, '1/1600'],
	[0x90, '1/2000'],
	[0x93, '1/2500'],
	[0x94, '1/3000'],
	[0x95, '1/3200'],
	[0x98, '1/4000'],
	[0x9b, '1/5000'],
	[0x9c, '1/6000'],
	[0x9d, '1/6400'],
	[0xa0, '1/8000'],
])

const IsoTable = new BiMap<number, ISO>([
	[0x00, 'auto'],
	[0x28, 6],
	[0x30, 12],
	[0x38, 25],
	[0x40, 50],
	[0x43, 64],
	[0x45, 80],
	[0x48, 100],
	[0x4b, 125],
	[0x4d, 160],
	[0x50, 200],
	[0x53, 250],
	[0x55, 320],
	[0x58, 400],
	[0x5b, 500],
	[0x5d, 640],
	[0x60, 800],
	[0x63, 1000],
	[0x65, 1250],
	[0x68, 1600],
	[0x6b, 2000],
	[0x6d, 2500],
	[0x70, 3200],
	[0x73, 4000],
	[0x75, 5000],
	[0x78, 6400],
	[0x7b, 8000],
	[0x7d, 10000],
	[0x80, 12800],
	[0x83, 16000],
	[0x85, 20000],
	[0x88, 25600],
	[0x90, 51200],
	[0x98, 102400],
])

const ExposureCompTable = new BiMap<number, ExposureComp>([
	[0x00, '0'],
	[0x03, '+1/3'],
	[0x04, '+1/2'],
	[0x05, '+2/3'],
	[0x08, '+1'],
	[0x0b, '+1 1/3'],
	[0x0c, '+1 1/2'],
	[0x0d, '+1 2/3'],
	[0x10, '+2'],
	[0x13, '+2 1/3'],
	[0x14, '+2 1/2'],
	[0x15, '+2 2/3'],
	[0x18, '+3'],
	[0xfd, '-1/3'],
	[0xfc, '-1/2'],
	[0xfb, '-2/3'],
	[0xf8, '-1'],
	[0xf5, '-1 1/3'],
	[0xf4, '-1 1/2'],
	[0xf3, '-1 2/3'],
	[0xf0, '-2'],
	[0xed, '-2 1/3'],
	[0xec, '-2 1/2'],
	[0xeb, '-2 2/3'],
	[0xe8, '-3'],
])

const ExposureModeTable = new BiMap<number, ExposureMode>([
	[0x00, 'P'],
	[0x01, 'S'],
	[0x02, 'A'],
	[0x03, 'M'],
	[0x04, 'vendor:bulb'],
	[0x05, 'vendor:a-dep'],
	[0x06, 'vendor:dep'],
	[0x14, 'video'],
	[0x16, 'vendor:auto'],
])

const WhiteBalanceTable = new BiMap<number, WhiteBalance>([
	[0, 'auto'],
	[1, 'daylight'],
	[2, 'cloud'],
	[3, 'tungsten'],
	[4, 'fluorescent'],
	[5, 'flash'],
	[6, 'manual'],
	[8, 'shade'],
	[9, 'custom'],
])

const DriveModeTable = new BiMap<number, DriveMode>([
	[0x00, 'normal'],
	[0x01, 'burst'],
])

function decodeBatteryPower(raw: number): BatteryLevel | null {
	switch (raw) {
		case 0:
			return 'low'
		case 1:
			return 50
		case 2:
			return 100
		case 4:
			return 75
		case 5:
			return 25
		default:
			return null
	}
}

/**
 * Extracts the JPEG from an EOS viewfinder payload. The payload is a sequence
 * of [len u32, type u32, data] records; the image record types are 1, 9 and
 * 11. Falls back to scanning for JPEG SOI/EOI markers.
 */
function extractViewfinderJpeg(buffer: ArrayBuffer): ArrayBuffer | null {
	const dv = new DataView(buffer)
	let offset = 0

	while (offset + 8 <= buffer.byteLength) {
		const len = dv.getUint32(offset, true)
		const type = dv.getUint32(offset + 4, true)
		if (len < 8 || offset + len > buffer.byteLength) break

		if (type === 1 || type === 9 || type === 11) {
			return buffer.slice(offset + 8, offset + len)
		}

		offset += len
	}

	try {
		return sliceJpegData(buffer)
	} catch {
		return null
	}
}
