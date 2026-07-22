import {BiMap} from 'bim'

import {
	Aperture,
	BatteryLevel,
	ColorMode,
	ExposureComp,
	ExposureMode,
	FocusMode,
	ImageQuality,
	ISO,
	ManualFocusOption,
	ShutterSpeed,
	WhiteBalance,
} from '../configs'
import {LiveviewDriver} from '../LiveviewDriver'
import {OpCode, ResCode} from '../PTPDatacode'
import {PTPDataView} from '../PTPDataView'
import {PTPPriority} from '../PTPDevice'
import {ConfigDesc, OperationResult, TakePhotoOption} from '../Tethr'
import {TethrObject} from '../TethrObject'
import {
	isntNil,
	readonlyConfigDesc,
	sliceJpegData,
	toHexString,
} from '../util'
import {TethrPTPUSB} from './TethrPTPUSB'

/**
 * Canon EOS vendor extension opcodes (the event-driven "EOS" dialect spoken by
 * all EOS DSLRs/mirrorless; PowerShot/legacy Canon uses a different one).
 * Codes match libgphoto2 camlibs/ptp2/ptp.h `PTP_OC_CANON_EOS_*`.
 */
enum OpCodeCanon {
	GetStorageIDs = 0x9101,
	GetStorageInfo = 0x9102,
	GetObjectInfo = 0x9103,
	GetObject = 0x9104,
	DeleteObject = 0x9105,
	GetPartialObject = 0x9107,
	GetDeviceInfoEx = 0x9108,
	GetObjectInfoEx = 0x9109,
	GetThumbEx = 0x910a,
	RemoteRelease = 0x910f,
	SetDevicePropValueEx = 0x9110,
	SetRemoteMode = 0x9114,
	SetEventMode = 0x9115,
	GetEvent = 0x9116,
	TransferComplete = 0x9117,
	CancelTransfer = 0x9118,
	PCHDDCapacity = 0x911a,
	SetUILock = 0x911b,
	ResetUILock = 0x911c,
	KeepDeviceOn = 0x911d,
	BulbStart = 0x9125,
	BulbEnd = 0x9126,
	RequestDevicePropValue = 0x9127,
	RemoteReleaseOn = 0x9128,
	RemoteReleaseOff = 0x9129,
	SetRequestOLCInfoGroup = 0x913d,
	GetViewFinderData = 0x9153,
	DoAf = 0x9154,
	DriveLens = 0x9155,
	DepthOfFieldPreview = 0x9156,
	Zoom = 0x9158,
	ZoomPosition = 0x9159,
	SetLiveAfFrame = 0x915a,
	TouchAfPosition = 0x915b,
	AfCancel = 0x9160,
}

/** Vendor response codes (libgphoto2 `PTP_RC_CANON_*`). */
enum ResCodeCanon {
	/** No liveview frame ready yet — normal right after enabling liveview. */
	ObjectNotReady = 0xa102,
}

/**
 * Fired on the interrupt endpoint when the camera has queued event records —
 * the cue to call GetEvent now instead of waiting for the next poll tick.
 */
const EventCodeCanonRequestGetEvent = 0xc101

/**
 * Record types inside a GetEvent data blob. Each record is
 * `[uint32 size][uint32 type][payload…]`; these are the types we act on
 * (libgphoto2 `PTP_EC_CANON_EOS_*` — the in-blob codes reuse the event codes).
 * Capture results arrive as ObjectAdded* when saving to card, and as
 * RequestObjectTransfer* when the capture destination is the host (SDRAM).
 * The *64 variants are what newer bodies (R5 generation) send.
 */
enum CanonEventRecord {
	ObjectAddedEx = 0xc181,
	RequestObjectTransfer = 0xc186,
	PropValueChanged = 0xc189,
	AvailListChanged = 0xc18a,
	ObjectAddedEx64 = 0xc1a7,
	RequestObjectTransfer64 = 0xc1a9,
}

/**
 * EOS device property codes (libgphoto2 `PTP_DPC_CANON_EOS_*`). EOS props are
 * not exposed through standard GetDevicePropDesc/GetDevicePropValue — values
 * and their allowed lists arrive exclusively as GetEvent records, so we cache
 * both here.
 */
enum DevicePropCodeCanon {
	Aperture = 0xd101,
	ShutterSpeed = 0xd102,
	ISO = 0xd103,
	ExposureComp = 0xd104,
	ExposureMode = 0xd105,
	DriveMode = 0xd106,
	MeteringMode = 0xd107,
	FocusMode = 0xd108,
	WhiteBalance = 0xd109,
	ColorTemperature = 0xd10a,
	PictureStyle = 0xd110,
	BatteryPower = 0xd111,
	AvailableShots = 0xd11b,
	CaptureDestination = 0xd11c,
	ImageFormat = 0xd120,
	ImageFormatCF = 0xd121,
	ImageFormatSD = 0xd122,
	EVFOutputDevice = 0xd1b0,
	EVFMode = 0xd1b1,
	DepthOfFieldPreview = 0xd1b2,
}

/**
 * The ImageFormat props (0xd120-0xd122) carry a *composite* value, not a
 * scalar: `[u32 fileCount][per file: u32 0x10, u32 type, u32 size, u32
 * compression]` (libgphoto2 ptp-pack.c `ptp_unpack_EOS_ImageFormat`). type
 * 1 = JPEG, 6 = RAW; compression 4 = lossless RAW, 3 = fine JPEG / C-RAW,
 * 2 = normal JPEG.
 */
interface CanonImageFormatFile {
	type: number
	size: number
	compression: number
}

const CanonImageFormatProps = [
	DevicePropCodeCanon.ImageFormat,
	DevicePropCodeCanon.ImageFormatCF,
	DevicePropCodeCanon.ImageFormatSD,
] as number[]

const CanonJpegSizeNames = new BiMap<number, string>([
	[0x0, 'large'],
	[0x1, 'medium'],
	[0x2, 'small'],
	[0x5, 'medium1'],
	[0x6, 'medium2'],
	[0x7, 'medium3'],
	[0xe, 'small1'],
	[0xf, 'small2'],
	[0x10, 'small3'],
])

/** CaptureDestination (0xd11c) value for host (SDRAM) capture. */
const CaptureDestHost = 0x4
/** Card value is not fixed — it's whatever non-host value the camera lists. */
const CaptureDestCardFallback = 0x2

/** Bit in EVFOutputDevice that routes liveview frames to the PC. */
const EVFOutputPC = 0x2

/** FocusMode (0xd108) value for manual focus. */
const FocusModeManual = 3

/**
 * RemoteReleaseOn (0x9128) press codes — the Canon EDSDK PressShutterButton
 * values reused by the EOS PTP op. The 0x10000 bit means "no autofocus": the
 * shutter fires without driving the lens, which stop-motion needs (the focus
 * must stay put between frames). AF, when wanted, is a separate explicit action
 * (runAutoFocus). Verified on an EOS R5: a bare full press is rejected, the
 * AF-less half must be followed by the AF-less full (a plain 0x2 full press
 * after the AF-less half does not release the shutter), and this pair fires with
 * no lens movement.
 */
const ShutterHalfNonAF = 0x10001
const ShutterFullNonAF = 0x10003

/** Canon JPEG (EXIF) / CR2 / CR3 object format codes. */
const OFCJpeg = 0x3801
const OFCCr2 = 0xb101
const OFCCr3 = 0xb108

/** Object info carried by ObjectAdded* / RequestObjectTransfer* records. */
interface CanonObjectAddedInfo {
	id: number
	storageID: number
	formatCode: number
	byteLength: number
	filename: string
}

/**
 * GetEvent poll cadence — the ONLY channel for body-dial changes: the R5 never
 * raises the 0xc101 interrupt nudge for them (verified on-wire), so polling
 * cadence = UI reflection latency. 300 ms is affordable because an (empty)
 * GetEvent costs ~1 ms — PROVIDED the liveview loop breathes between frames
 * (frameGapMs below). Without that breathing room the camera's command
 * processor is pinned by flat-out GetViewFinderData polling and the very same
 * GetEvent takes ~250 ms, freezing the stream at every poll.
 */
const CanonEventPollIntervalMs = 300
/** gphoto2 sends KeepDeviceOn ~every 10 s to hold off the camera's auto-off. */
const CanonKeepAliveIntervalMs = 10_000
/** Max wait for the first captured object (covers long exposures). */
const CanonCaptureTimeoutMs = 15_000
/** After the first object, wait this long for siblings (RAW+JPEG pairs). */
const CanonCaptureSiblingWaitMs = 1_000

export class TethrCanon extends TethrPTPUSB {
	/** Latest raw value per EOS prop, fed by PropValueChanged records. */
	#propValues = new Map<number, number>()
	/** Allowed values per EOS prop, fed by AvailListChanged records. */
	#propOptions = new Map<number, number[]>()
	/** Current composite value per ImageFormat prop (0xd120-0xd122). */
	#imageFormatValues = new Map<number, CanonImageFormatFile[]>()
	/** Allowed composite values per ImageFormat prop. */
	#imageFormatOptions = new Map<number, CanonImageFormatFile[][]>()

	#isCapturing = false
	#polling = false
	#pollTimer: ReturnType<typeof setTimeout> | undefined
	#lastKeepAlive = 0

	/**
	 * Last live-view magnification we set. The camera doesn't report the current
	 * zoom back through GetEvent, so we cache it to answer getLiveviewMagnifyRatio.
	 */
	#liveviewMagnifyRatio = 1

	/** Resolvers waiting for captured objects (takePhoto). */
	#objectAddedWaiters: ((info: CanonObjectAddedInfo) => void)[] = []
	/**
	 * Captured-object infos that arrived before a waiter was registered. With
	 * RAW+JPEG the body emits both ObjectAdded records in a single GetEvent blob,
	 * which #handleEventData walks synchronously: the first record resolves the
	 * pending waiter, but the sibling waiter isn't registered until that resolved
	 * promise's microtask runs — so without this buffer the second object (e.g.
	 * the JPEG) is dropped and only one file comes back.
	 */
	#pendingObjects: CanonObjectAddedInfo[] = []

	/** EOS R bodies crash on partial transfers over ~1 MB (gphoto2 finding). */
	protected get objectChunkSize(): number {
		return 0x00100000
	}

	async open(): Promise<void> {
		await super.open()

		await this.device.sendCommand({
			label: 'Canon SetRemoteMode',
			opcode: OpCodeCanon.SetRemoteMode,
			parameters: [0x1],
		})
		await this.device.sendCommand({
			label: 'Canon SetEventMode',
			opcode: OpCodeCanon.SetEventMode,
			parameters: [0x1],
		})

		// Ask for the full on-screen-info group so focus/exposure records flow.
		try {
			const {operationsSupported} = await this.getDeviceInfo()
			if (
				operationsSupported.includes(OpCodeCanon.SetRequestOLCInfoGroup)
			) {
				await this.device.sendCommand({
					label: 'Canon SetRequestOLCInfoGroup',
					opcode: OpCodeCanon.SetRequestOLCInfoGroup,
					parameters: [0x00001fff],
				})
			}
		} catch {
			// Optional; older bodies don't support it.
		}

		// The camera answers the first GetEvent calls with a full snapshot of
		// every property value + allowed list. Drain them before reporting ready
		// so the first getDesc() calls see populated caches.
		await this.#pollEvents()

		this.device.onEventCode(EventCodeCanonRequestGetEvent, () => {
			// The nudge means "something changed" (usually a body dial) — fetch at
			// Interactive priority so the update isn't starved by liveview grabs.
			void this.#pollEvents(PTPPriority.Interactive)
		})

		this.#schedulePoll()
	}

	async close(): Promise<void> {
		if (this.#pollTimer !== undefined) clearTimeout(this.#pollTimer)
		this.#pollTimer = undefined

		await this.stopLiveview()

		try {
			await this.device.sendCommand({
				label: 'Canon SetEventMode',
				opcode: OpCodeCanon.SetEventMode,
				parameters: [0x0],
			})
		} catch {
			// Best-effort; the camera also drops remote mode on CloseSession.
		}

		await super.close()
	}

	#schedulePoll() {
		if (this.#pollTimer !== undefined) clearTimeout(this.#pollTimer)

		this.#pollTimer = setTimeout(async () => {
			if (!this.opened) return

			await this.#pollEvents()

			// Nudge the auto power-off timer while tethered.
			const now = Date.now()
			if (now - this.#lastKeepAlive > CanonKeepAliveIntervalMs) {
				this.#lastKeepAlive = now
				try {
					await this.device.sendCommand({
						label: 'Canon KeepDeviceOn',
						opcode: OpCodeCanon.KeepDeviceOn,
					})
				} catch {
					// Not all bodies implement it.
				}
			}

			this.#schedulePoll()
		}, CanonEventPollIntervalMs)
	}

	/**
	 * Fetch and apply pending event records, repeating until the camera reports
	 * no more (gphoto2 drains the same way). This is the only source of EOS
	 * property values/allowed lists, capture results, and change notifications.
	 *
	 * `priority` defaults to Bulk so the periodic fallback poll never cuts in
	 * front of pending liveview frames. Pass Interactive from paths that reflect
	 * a user action — the 0xc101 nudge (a dial was turned), the post-set
	 * confirmation, the capture-object wait — so those don't also sit out the
	 * starvation wait behind a continuously-polling liveview loop.
	 */
	async #pollEvents(priority: PTPPriority = PTPPriority.Bulk): Promise<void> {
		// The transaction queue serializes transfers anyway; this flag just avoids
		// stacking redundant GetEvent transactions when a poll tick, an interrupt
		// nudge and a post-set refresh coincide.
		if (this.#polling || !this.opened) return
		this.#polling = true

		try {
			for (let i = 0; i < 10; i++) {
				const {resCode, data} = await this.device.receiveData({
					label: 'Canon GetEvent',
					opcode: OpCodeCanon.GetEvent,
					expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
					maxByteLength: 2_000_000,
					priority,
				})
				if (resCode !== ResCode.OK) break

				const recordCount = this.#handleEventData(data)
				if (recordCount === 0) break
			}
		} catch {
			// Transient failures (e.g. mid-disconnect) just skip a tick.
		} finally {
			this.#polling = false
		}
	}

	/** @returns the number of meaningful (non-terminator) records handled. */
	#handleEventData(data: ArrayBuffer): number {
		const dataView = new DataView(data)
		const changedProps = new Set<number>()
		let recordCount = 0

		for (let offset = 0; offset + 8 <= data.byteLength; ) {
			const size = dataView.getUint32(offset, true)
			const type = dataView.getUint32(offset + 4, true)

			if (size < 8 || offset + size > data.byteLength) break
			// Terminator record
			if (size === 8 && type === 0) break

			recordCount++

			switch (type) {
				case CanonEventRecord.PropValueChanged: {
					if (size < 13) break
					const propCode = dataView.getUint32(offset + 8, true)
					if (CanonImageFormatProps.includes(propCode)) {
						// Composite value (see CanonImageFormatFile).
						const parsed = this.#parseImageFormatAt(
							dataView,
							offset + 12,
							offset + size
						)
						if (parsed) this.#imageFormatValues.set(propCode, parsed.files)
					} else {
						// The value width isn't on the wire; read what the record holds
						// (u8 props ship shorter records). String props get misread as
						// numbers, but we never map those so the garbage is inert.
						const payloadSize = size - 12
						const value =
							payloadSize >= 4
								? dataView.getUint32(offset + 12, true)
								: payloadSize >= 2
									? dataView.getUint16(offset + 12, true)
									: dataView.getUint8(offset + 12)
						this.#propValues.set(propCode, value)
						if (
							propCode === DevicePropCodeCanon.FocusMode &&
							value !== FocusModeManual
						) {
							this.#lastAFFocusRaw = value
						}
					}
					changedProps.add(propCode)
					break
				}
				case CanonEventRecord.AvailListChanged: {
					if (size < 20) break
					const propCode = dataView.getUint32(offset + 8, true)
					// +12: dpd type. Only type 3 (enum of values) is meaningful.
					const dpdType = dataView.getUint32(offset + 12, true)
					if (dpdType !== 3) break
					const count = dataView.getUint32(offset + 16, true)
					if (CanonImageFormatProps.includes(propCode)) {
						// Each allowed value is a variable-length composite.
						const options: CanonImageFormatFile[][] = []
						let o = offset + 20
						for (let i = 0; i < count; i++) {
							const parsed = this.#parseImageFormatAt(
								dataView,
								o,
								offset + size
							)
							if (!parsed) break
							options.push(parsed.files)
							o += parsed.byteLength
						}
						this.#imageFormatOptions.set(propCode, options)
					} else {
						// Scalar props list 4-byte-packed entries regardless of the
						// prop's datatype.
						const values: number[] = []
						for (
							let i = 0, o = offset + 20;
							i < count && o + 4 <= offset + size;
							i++, o += 4
						) {
							values.push(dataView.getUint32(o, true))
						}
						// An empty list means "not currently settable".
						this.#propOptions.set(propCode, values)
					}
					changedProps.add(propCode)
					break
				}
				case CanonEventRecord.ObjectAddedEx:
				case CanonEventRecord.ObjectAddedEx64:
				case CanonEventRecord.RequestObjectTransfer:
				case CanonEventRecord.RequestObjectTransfer64: {
					const info = this.#parseObjectRecord(dataView, offset, size, type)
					if (info) {
						const waiter = this.#objectAddedWaiters.shift()
						if (waiter) {
							waiter(info)
						} else if (this.#isCapturing) {
							// No waiter registered yet — this is the sibling of a
							// RAW+JPEG pair sharing one blob. Hold it so the next
							// #waitObjectAdded drains it instead of losing it.
							this.#pendingObjects.push(info)
						}
					}
					break
				}
			}

			offset += size
		}

		// Emit config change events once per affected config.
		for (const propCode of changedProps) {
			const name = this.#configNameForPropCode(propCode)
			if (!name) continue
			void this.getDesc(name).then(desc => this.emit(`${name}Change`, desc))
		}

		return recordCount
	}

	/**
	 * Field offsets from libgphoto2 ptp-pack.c (`ptp_unpack_CANON_changes`):
	 * - ObjectAddedEx (0xc181): handle@0x08, storage@0x0c, OFC(u16)@0x10,
	 *   size@0x1c, parent@0x20, filename@0x28
	 * - ObjectAddedEx64 (0xc1a7): handle@0x08, storage@0x0c, OFC@0x10,
	 *   size@0x1c, parent@0x24, filename@0x2c
	 * - RequestObjectTransfer(64) (0xc186/0xc1a9): handle@0x08, OFC@0x0c,
	 *   size@0x14, filename@0x1c — sent instead of ObjectAdded when the capture
	 *   destination is the host; the object lives in camera RAM (storage 0).
	 */
	#parseObjectRecord(
		dataView: DataView,
		offset: number,
		size: number,
		type: number
	): CanonObjectAddedInfo | null {
		try {
			switch (type) {
				case CanonEventRecord.ObjectAddedEx:
					return {
						id: dataView.getUint32(offset + 8, true),
						storageID: dataView.getUint32(offset + 12, true),
						formatCode: dataView.getUint16(offset + 16, true),
						byteLength: dataView.getUint32(offset + 0x1c, true),
						filename: this.#readAsciiAt(dataView, offset + 0x28, size - 0x28),
					}
				case CanonEventRecord.ObjectAddedEx64:
					return {
						id: dataView.getUint32(offset + 8, true),
						storageID: dataView.getUint32(offset + 12, true),
						formatCode: dataView.getUint16(offset + 16, true),
						byteLength: dataView.getUint32(offset + 0x1c, true),
						filename: this.#readAsciiAt(dataView, offset + 0x2c, size - 0x2c),
					}
				default:
					// RequestObjectTransfer / RequestObjectTransfer64
					return {
						id: dataView.getUint32(offset + 8, true),
						storageID: 0,
						formatCode: dataView.getUint16(offset + 12, true),
						byteLength: dataView.getUint32(offset + 0x14, true),
						filename: this.#readAsciiAt(dataView, offset + 0x1c, size - 0x1c),
					}
			}
		} catch {
			return null
		}
	}

	#readAsciiAt(dataView: DataView, offset: number, maxLength: number): string {
		let str = ''
		for (let i = 0; i < maxLength; i++) {
			const charCode = dataView.getUint8(offset + i)
			if (charCode === 0) break
			str += String.fromCharCode(charCode)
		}
		return str
	}

	/**
	 * Parse one composite ImageFormat value at `offset` (bounded by `end`):
	 * `[u32 fileCount][per file: u32 entrySize (0x10), u32 type, u32 size,
	 * u32 compression]`. Returns null on malformed data.
	 */
	#parseImageFormatAt(
		dataView: DataView,
		offset: number,
		end: number
	): {files: CanonImageFormatFile[]; byteLength: number} | null {
		if (offset + 4 > end) return null
		const fileCount = dataView.getUint32(offset, true)
		if (fileCount < 1 || fileCount > 3) return null

		const files: CanonImageFormatFile[] = []
		let o = offset + 4
		for (let i = 0; i < fileCount; i++) {
			if (o + 16 > end) return null
			const entrySize = dataView.getUint32(o, true)
			if (entrySize < 16 || o + entrySize > end) return null
			files.push({
				type: dataView.getUint32(o + 4, true),
				size: dataView.getUint32(o + 8, true),
				compression: dataView.getUint32(o + 12, true),
			})
			o += entrySize
		}
		return {files, byteLength: o - offset}
	}

	// Property plumbing --------------------------------------------------------

	async #setPropValue(
		propCode: number,
		value: number
	): Promise<OperationResult> {
		// Scalar payload is always 12 bytes ([size][propcode][value]) regardless
		// of the prop's nominal width; the value is little-endian zero-padded.
		const dataView = new PTPDataView()
		dataView.writeUint32(12)
		dataView.writeUint32(propCode)
		dataView.writeUint32(value)

		const {resCode} = await this.device.sendData({
			label: 'Canon SetDevicePropValueEx',
			opcode: OpCodeCanon.SetDevicePropValueEx,
			data: dataView.toBuffer(),
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		if (resCode !== ResCode.OK) return {status: 'busy'}

		// The camera confirms (and possibly clamps) the write by echoing a
		// PropValueChanged event; pull it now so caches and listeners stay fresh.
		await this.#pollEvents(PTPPriority.Interactive)

		return {status: 'ok'}
	}

	#descFromProp<T>(
		propCode: number,
		decode: (raw: number) => T | null
	): ConfigDesc<T> {
		const raw = this.#propValues.get(propCode)
		const value = raw === undefined ? null : decode(raw)

		// Dedupe: 1/3- and 1/2-step codes can decode to the same display value.
		const values = [
			...new Set(
				(this.#propOptions.get(propCode) ?? []).map(decode).filter(isntNil)
			),
		]

		// Only settable when there's a real choice. A single (or empty) allowed
		// list means nothing else can be picked — expose it read-only instead of a
		// one-entry dropdown that looks editable (e.g. FocusMode reporting only
		// "AF" while the lens switch, not the PC, owns AF/MF).
		if (values.length > 1) {
			return {writable: true, value, option: {type: 'enum', values}}
		}
		return {writable: false, value}
	}

	/**
	 * Encode a config value to its raw code, preferring a code the camera
	 * currently lists as available (a value like f/4.5 has both 1/3-step and
	 * 1/2-step codes, and only one of them is accepted at a time).
	 */
	#encodeWithOptions<T>(
		table: BiMap<number, T>,
		value: T,
		propCode: number
	): number | undefined {
		const options = this.#propOptions.get(propCode)
		if (options) {
			for (const raw of options) {
				if (table.get(raw) === value) return raw
			}
		}
		return table.getKey(value)
	}

	#configNameForPropCode(propCode: number) {
		switch (propCode) {
			case DevicePropCodeCanon.Aperture:
				return 'aperture' as const
			case DevicePropCodeCanon.ShutterSpeed:
				return 'shutterSpeed' as const
			case DevicePropCodeCanon.ISO:
				return 'iso' as const
			case DevicePropCodeCanon.ExposureComp:
				return 'exposureComp' as const
			case DevicePropCodeCanon.ExposureMode:
				return 'exposureMode' as const
			case DevicePropCodeCanon.WhiteBalance:
				return 'whiteBalance' as const
			case DevicePropCodeCanon.ColorTemperature:
				return 'colorTemperature' as const
			case DevicePropCodeCanon.PictureStyle:
				return 'colorMode' as const
			case DevicePropCodeCanon.ImageFormat:
			case DevicePropCodeCanon.ImageFormatCF:
			case DevicePropCodeCanon.ImageFormatSD:
				return 'imageQuality' as const
			case DevicePropCodeCanon.DepthOfFieldPreview:
				return 'depthOfFieldPreview' as const
			case DevicePropCodeCanon.FocusMode:
				return 'focusMode' as const
			case DevicePropCodeCanon.BatteryPower:
				return 'batteryLevel' as const
			case DevicePropCodeCanon.CaptureDestination:
				return 'destinationToSave' as const
			default:
				return null
		}
	}

	// Configs -------------------------------------------------------------------

	async getApertureDesc(): Promise<ConfigDesc<Aperture>> {
		return this.#descFromProp(DevicePropCodeCanon.Aperture, raw => {
			if (raw === 0x0 || raw === 0xffff || raw === 0xb0) return 'auto'
			return this.apertureTable.get(raw) ?? null
		})
	}

	async setAperture(value: Aperture): Promise<OperationResult> {
		if (value === 'auto') return {status: 'invalid parameter'}
		const raw = this.#encodeWithOptions(
			this.apertureTable,
			value,
			DevicePropCodeCanon.Aperture
		)
		if (raw === undefined) return {status: 'invalid parameter'}
		return this.#setPropValue(DevicePropCodeCanon.Aperture, raw)
	}

	async getShutterSpeedDesc(): Promise<ConfigDesc<ShutterSpeed>> {
		return this.#descFromProp(
			DevicePropCodeCanon.ShutterSpeed,
			raw => this.shutterSpeedTable.get(raw) ?? null
		)
	}

	async setShutterSpeed(value: ShutterSpeed): Promise<OperationResult> {
		const raw = this.#encodeWithOptions(
			this.shutterSpeedTable,
			value,
			DevicePropCodeCanon.ShutterSpeed
		)
		if (raw === undefined) return {status: 'invalid parameter'}
		return this.#setPropValue(DevicePropCodeCanon.ShutterSpeed, raw)
	}

	async getIsoDesc(): Promise<ConfigDesc<ISO>> {
		return this.#descFromProp(DevicePropCodeCanon.ISO, raw => {
			if (raw === 0x0 || raw === 0x1) return 'auto'
			return this.isoTable.get(raw) ?? null
		})
	}

	async setIso(value: ISO): Promise<OperationResult> {
		if (value === 'auto') {
			return this.#setPropValue(DevicePropCodeCanon.ISO, 0x0)
		}
		const raw = this.#encodeWithOptions(
			this.isoTable,
			value,
			DevicePropCodeCanon.ISO
		)
		if (raw === undefined) return {status: 'invalid parameter'}
		return this.#setPropValue(DevicePropCodeCanon.ISO, raw)
	}

	async getExposureCompDesc(): Promise<ConfigDesc<ExposureComp>> {
		return this.#descFromProp(DevicePropCodeCanon.ExposureComp, raw =>
			decodeCanonExposureComp(raw)
		)
	}

	async setExposureComp(value: ExposureComp): Promise<OperationResult> {
		const raw = encodeCanonExposureComp(value)
		if (raw === null) return {status: 'invalid parameter'}
		return this.#setPropValue(DevicePropCodeCanon.ExposureComp, raw)
	}

	async getExposureModeDesc(): Promise<ConfigDesc<ExposureMode>> {
		return this.#descFromProp(
			DevicePropCodeCanon.ExposureMode,
			raw =>
				this.exposureModeTable.get(raw) ??
				(`vendor:${toHexString(raw, 2)}` as ExposureMode)
		)
	}

	async setExposureMode(value: ExposureMode): Promise<OperationResult> {
		let raw: number | undefined = this.#encodeWithOptions(
			this.exposureModeTable,
			value,
			DevicePropCodeCanon.ExposureMode
		)
		if (raw === undefined && value.startsWith('vendor:0x')) {
			raw = parseInt(value.replace('vendor:', ''), 16)
		}
		if (raw === undefined) return {status: 'invalid parameter'}
		return this.#setPropValue(DevicePropCodeCanon.ExposureMode, raw)
	}

	async getWhiteBalanceDesc(): Promise<ConfigDesc<WhiteBalance>> {
		return this.#descFromProp(
			DevicePropCodeCanon.WhiteBalance,
			raw => this.whiteBalanceTable.get(raw) ?? null
		)
	}

	async setWhiteBalance(value: WhiteBalance): Promise<OperationResult> {
		const raw = this.#encodeWithOptions(
			this.whiteBalanceTable,
			value,
			DevicePropCodeCanon.WhiteBalance
		)
		if (raw === undefined) return {status: 'invalid parameter'}
		return this.#setPropValue(DevicePropCodeCanon.WhiteBalance, raw)
	}

	async getColorTemperatureDesc(): Promise<ConfigDesc<number>> {
		return this.#descFromProp(DevicePropCodeCanon.ColorTemperature, raw => raw)
	}

	async setColorTemperature(value: number): Promise<OperationResult> {
		return this.#setPropValue(DevicePropCodeCanon.ColorTemperature, value)
	}

	/** Picture Style (0xd110), exposed as the generic colorMode config. */
	async getColorModeDesc(): Promise<ConfigDesc<ColorMode>> {
		return this.#descFromProp(
			DevicePropCodeCanon.PictureStyle,
			raw => this.pictureStyleTable.get(raw) ?? `vendor:${toHexString(raw, 1)}`
		)
	}

	async setColorMode(value: ColorMode): Promise<OperationResult> {
		let raw: number | undefined = this.#encodeWithOptions(
			this.pictureStyleTable,
			value,
			DevicePropCodeCanon.PictureStyle
		)
		if (raw === undefined && value.startsWith('vendor:0x')) {
			raw = parseInt(value.replace('vendor:', ''), 16)
		}
		if (raw === undefined) return {status: 'invalid parameter'}
		return this.#setPropValue(DevicePropCodeCanon.PictureStyle, raw)
	}

	/**
	 * Which ImageFormat prop this body actually reports through — 0xd120 on
	 * single-slot bodies, 0xd121 (CF) / 0xd122 (SD) per card on dual-slot ones.
	 */
	#imageFormatPropCode(): number | undefined {
		return CanonImageFormatProps.find(
			code =>
				this.#imageFormatValues.has(code) ||
				(this.#imageFormatOptions.get(code)?.length ?? 0) > 0
		)
	}

	async getImageQualityDesc(): Promise<ConfigDesc<ImageQuality>> {
		const propCode = this.#imageFormatPropCode()
		if (propCode === undefined) return {writable: false, value: null}

		const files = this.#imageFormatValues.get(propCode)
		const value = files ? decodeCanonImageFormat(files) : null
		const values = (this.#imageFormatOptions.get(propCode) ?? []).map(
			decodeCanonImageFormat
		)

		if (values.length > 1) {
			return {writable: true, value, option: {type: 'enum', values}}
		}
		return {writable: false, value}
	}

	async setImageQuality(value: ImageQuality): Promise<OperationResult> {
		const propCode = this.#imageFormatPropCode()
		if (propCode === undefined) return {status: 'invalid parameter'}

		// Only combinations the camera itself listed are sendable; re-encode the
		// matching option rather than parsing the label.
		const files = (this.#imageFormatOptions.get(propCode) ?? []).find(
			option => decodeCanonImageFormat(option) === value
		)
		if (!files) return {status: 'invalid parameter'}

		const dataView = new PTPDataView()
		dataView.writeUint32(12 + files.length * 16)
		dataView.writeUint32(propCode)
		dataView.writeUint32(files.length)
		for (const file of files) {
			dataView.writeUint32(0x10)
			dataView.writeUint32(file.type)
			dataView.writeUint32(file.size)
			dataView.writeUint32(file.compression)
		}

		const {resCode} = await this.device.sendData({
			label: 'Canon SetDevicePropValueEx',
			opcode: OpCodeCanon.SetDevicePropValueEx,
			data: dataView.toBuffer(),
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})
		if (resCode !== ResCode.OK) return {status: 'busy'}

		await this.#pollEvents(PTPPriority.Interactive)
		return {status: 'ok'}
	}

	/**
	 * Depth-of-field preview (0xd1b2): stops the lens down to the taking
	 * aperture in live view. Host-driven toggle — the camera publishes no
	 * allowed list for it, so offer on/off whenever the prop exists.
	 */
	async getDepthOfFieldPreviewDesc(): Promise<ConfigDesc<boolean>> {
		const raw = this.#propValues.get(DevicePropCodeCanon.DepthOfFieldPreview)
		if (raw === undefined) return {writable: false, value: null}
		return {
			writable: true,
			value: raw !== 0,
			option: {type: 'enum', values: [false, true]},
		}
	}

	async setDepthOfFieldPreview(value: boolean): Promise<OperationResult> {
		return this.#setPropValue(
			DevicePropCodeCanon.DepthOfFieldPreview,
			value ? 1 : 0
		)
	}

	/**
	 * Live-view magnification via the EOS Zoom op (0x9158). Over this op the R5
	 * gives two steps — value 5 → 5×; 1 → 1× — and clamps everything else to 5×
	 * (6/10 also land on 5×, 15 is ignored). Its native 15× isn't reachable this
	 * way. Zoom centres on the current ZoomPosition (see setLiveviewMagnifyPos).
	 */
	async getLiveviewMagnifyRatioDesc(): Promise<ConfigDesc<number>> {
		return {
			writable: true,
			value: this.#liveviewMagnifyRatio,
			option: {type: 'enum', values: [1, 5]},
		}
	}

	async setLiveviewMagnifyRatio(value: number): Promise<OperationResult> {
		if (value !== 1 && value !== 5) return {status: 'invalid parameter'}
		try {
			await this.device.sendCommand({
				label: 'Canon Zoom',
				opcode: OpCodeCanon.Zoom,
				parameters: [value],
			})
			this.#liveviewMagnifyRatio = value
			this.emit(
				'liveviewMagnifyRatioChange',
				await this.getLiveviewMagnifyRatioDesc()
			)
			return {status: 'ok'}
		} catch {
			return {status: 'general error'}
		}
	}

	/**
	 * Move the magnified region via ZoomPosition (0x9159). `x`/`y` are normalized
	 * [0,1] positions in the frame, mapped linearly onto the zoom-rect coordinate
	 * space — the R5 sensor (8192×5464). The rect stops a little short of the far
	 * edge (~8000×5000) as it pins itself inside the frame, so corner clicks just
	 * clamp. TODO: the sensor size is hard-coded for the R5; read it from the
	 * camera so other bodies map correctly.
	 */
	static ZoomPosMax: readonly [number, number] = [8192, 5464]

	async setLiveviewMagnifyPos(x: number, y: number): Promise<OperationResult> {
		const [maxX, maxY] = TethrCanon.ZoomPosMax
		const px = Math.round(Math.max(0, Math.min(1, x)) * maxX)
		const py = Math.round(Math.max(0, Math.min(1, y)) * maxY)

		try {
			await this.device.sendCommand({
				label: 'Canon ZoomPosition',
				opcode: OpCodeCanon.ZoomPosition,
				parameters: [px, py],
			})
			return {status: 'ok'}
		} catch {
			return {status: 'general error'}
		}
	}

	async getFocusModeDesc(): Promise<ConfigDesc<FocusMode>> {
		// Deliberately read-only in the UI: AF/MF is the camera-side dial (per
		// UX decision), and switching TO AF from PTP is shaky anyway — while in
		// MF the allowed list only names MF, and the R5 silently ignores a
		// guessed AF code. Capture and click-AF hop modes internally via
		// #setPropValue regardless.
		const raw = this.#propValues.get(DevicePropCodeCanon.FocusMode)
		return {
			writable: false,
			value: raw === undefined ? null : raw === FocusModeManual ? 'mf' : 'af',
		}
	}

	async setFocusMode(value: FocusMode): Promise<OperationResult> {
		let raw: number | undefined
		if (value === 'mf') {
			raw = FocusModeManual
		} else {
			// The AF code isn't fixed across bodies (One-Shot / Servo / AI Focus
			// differ); prefer a listed non-manual value, then the last one seen.
			const options = this.#propOptions.get(DevicePropCodeCanon.FocusMode) ?? []
			raw =
				options.find(v => v !== FocusModeManual) ??
				this.#lastAFFocusRaw ??
				undefined
		}
		if (raw === undefined) return {status: 'invalid parameter'}
		return this.#setPropValue(DevicePropCodeCanon.FocusMode, raw)
	}

	async getBatteryLevelDesc(): Promise<ConfigDesc<BatteryLevel>> {
		const desc = this.#descFromProp(
			DevicePropCodeCanon.BatteryPower,
			raw => raw as BatteryLevel
		)
		return {writable: false, value: desc.value}
	}

	async getDestinationToSaveDesc(): Promise<ConfigDesc<string>> {
		return this.#descFromProp(DevicePropCodeCanon.CaptureDestination, raw =>
			raw === CaptureDestHost ? 'pc' : 'camera'
		)
	}

	async setDestinationToSave(value: string): Promise<OperationResult> {
		let raw: number | undefined

		if (value === 'pc') {
			raw = CaptureDestHost
		} else if (value === 'camera') {
			// The card value isn't fixed across bodies; use whatever non-host
			// value the camera currently lists (usually 1 or 2).
			const options =
				this.#propOptions.get(DevicePropCodeCanon.CaptureDestination) ?? []
			raw = options.find(v => v !== CaptureDestHost) ?? CaptureDestCardFallback
		}

		if (raw === undefined) return {status: 'invalid parameter'}

		const result = await this.#setPropValue(
			DevicePropCodeCanon.CaptureDestination,
			raw
		)

		if (result.status === 'ok' && raw === CaptureDestHost) {
			// With the host as capture target the camera checks our "disk" has
			// room before each shot; report a huge fake capacity (gphoto2 values).
			try {
				await this.device.sendCommand({
					label: 'Canon PCHDDCapacity',
					opcode: OpCodeCanon.PCHDDCapacity,
					parameters: [0x0fffffff, 0x00001000, 0x00000001],
				})
			} catch {
				// Some bodies reject it; capture may still work.
			}
		}

		return result
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

	async getManualFocusOptionsDesc() {
		return readonlyConfigDesc<ManualFocusOption[]>([
			'near:3',
			'near:2',
			'near:1',
			'far:1',
			'far:2',
			'far:3',
		])
	}

	// Actions -------------------------------------------------------------------

	async takePhoto({doDownload = true}: TakePhotoOption = {}): Promise<
		OperationResult<TethrObject[]>
	> {
		if (this.#isCapturing) return {status: 'busy'}
		this.#isCapturing = true
		// Drop any stragglers from a previous capture so they can't be miscounted
		// as siblings of this one.
		this.#pendingObjects = []

		try {
			const infos = await this.#captureAndCollectObjects()

			if (infos.length === 0) {
				return {status: 'general error', message: 'No image was captured'}
			}

			if (!doDownload) {
				// Host-destination objects sit in camera RAM until acknowledged;
				// release them even when the caller doesn't want the bytes.
				for (const info of infos) {
					if (info.storageID === 0) {
						try {
							await this.device.sendCommand({
								label: 'Canon TransferComplete',
								opcode: OpCodeCanon.TransferComplete,
								parameters: [info.id],
							})
						} catch {
							// Best-effort buffer cleanup.
						}
					}
				}
				return {status: 'ok', value: []}
			}

			const objects: TethrObject[] = []
			for (const info of infos) {
				const object = await this.#downloadCapturedObject(info)
				if (object) objects.push(object)
			}

			return {status: 'ok', value: objects}
		} finally {
			this.#isCapturing = false
		}
	}

	async #captureAndCollectObjects(): Promise<CanonObjectAddedInfo[]> {
		const {operationsSupported} = await this.getDeviceInfo()

		if (operationsSupported.includes(OpCodeCanon.RemoteReleaseOn)) {
			// EOS needs an explicit half press (SW1) before the full press (SW2) — a
			// bare full press is rejected (DeviceBusy). Use the AF-less variants
			// (ShutterHalfNonAF/ShutterFullNonAF) so the shutter fires without driving
			// the lens; stop-motion needs the focus held fixed between frames. AF,
			// when wanted, is a separate explicit action (runAutoFocus). param2=0.
			try {
				await this.device.sendCommand({
					label: 'Canon RemoteReleaseOn (half, no AF)',
					opcode: OpCodeCanon.RemoteReleaseOn,
					parameters: [ShutterHalfNonAF, 0x0],
				})
				await this.device.sendCommand({
					label: 'Canon RemoteReleaseOn (full, no AF)',
					opcode: OpCodeCanon.RemoteReleaseOn,
					parameters: [ShutterFullNonAF, 0x0],
				})
				await this.device.sendCommand({
					label: 'Canon RemoteReleaseOff (full)',
					opcode: OpCodeCanon.RemoteReleaseOff,
					parameters: [ShutterFullNonAF],
				})
			} finally {
				try {
					await this.device.sendCommand({
						label: 'Canon RemoteReleaseOff (half)',
						opcode: OpCodeCanon.RemoteReleaseOff,
						parameters: [ShutterHalfNonAF],
					})
				} catch {
					// Releasing a press that never registered can fail; ignore.
				}
			}
		} else {
			// Legacy one-shot release.
			await this.device.sendCommand({
				label: 'Canon RemoteRelease',
				opcode: OpCodeCanon.RemoteRelease,
			})
		}

		const infos: CanonObjectAddedInfo[] = []

		// First object: long timeout (exposure + processing). Subsequent objects
		// (the other half of a RAW+JPEG pair) come quickly or not at all.
		const first = await this.#waitObjectAdded(CanonCaptureTimeoutMs)
		if (!first) return infos
		infos.push(first)

		for (;;) {
			const sibling = await this.#waitObjectAdded(CanonCaptureSiblingWaitMs)
			if (!sibling) break
			infos.push(sibling)
		}

		return infos
	}

	#waitObjectAdded(timeoutMs: number): Promise<CanonObjectAddedInfo | null> {
		// A sibling object may already be buffered (arrived in the same blob as the
		// one that resolved the previous waiter); hand it over without waiting.
		const buffered = this.#pendingObjects.shift()
		if (buffered) return Promise.resolve(buffered)

		return new Promise(resolve => {
			// Poll aggressively while waiting: object records only surface through
			// GetEvent, and the interrupt nudge is not always sent.
			const interval = setInterval(
				() => void this.#pollEvents(PTPPriority.Interactive),
				100
			)

			const timeout = setTimeout(() => {
				const index = this.#objectAddedWaiters.indexOf(waiter)
				if (index !== -1) this.#objectAddedWaiters.splice(index, 1)
				clearInterval(interval)
				resolve(null)
			}, timeoutMs)

			const waiter = (info: CanonObjectAddedInfo) => {
				clearTimeout(timeout)
				clearInterval(interval)
				resolve(info)
			}

			this.#objectAddedWaiters.push(waiter)
		})
	}

	async #downloadCapturedObject(
		info: CanonObjectAddedInfo
	): Promise<TethrObject | null> {
		const isRaw = info.formatCode !== OFCJpeg
		const type =
			info.formatCode === OFCCr2
				? 'image/x-canon-cr2'
				: info.formatCode === OFCCr3
					? 'image/x-canon-cr3'
					: 'image/jpeg'

		try {
			if (info.storageID !== 0) {
				// Saved to card: the standard PTP object store works.
				const objectInfo = await this.getObjectInfo(info.id)
				const buffer = await this.getObjectBuffer(info.id)
				return {...objectInfo, blob: new Blob([buffer], {type})}
			}

			// Host-destination objects live in camera RAM under a pseudo handle;
			// fetch with (standard) GetPartialObject using the size from the event
			// — GetObjectInfo doesn't work on them. Keep chunks ≤1MB (see
			// objectChunkSize) and release the buffer with TransferComplete, or
			// the camera stops shooting once its RAM fills up.
			const chunkSize = this.objectChunkSize
			const chunks: Uint8Array[] = []
			for (let offset = 0; offset < info.byteLength; offset += chunkSize) {
				const length = Math.min(chunkSize, info.byteLength - offset)
				const {data} = await this.device.receiveData({
					label: 'Canon GetPartialObject',
					opcode: OpCode.GetPartialObject,
					parameters: [info.id, offset, length],
					maxByteLength: length + 64,
					priority: PTPPriority.Bulk,
				})
				chunks.push(new Uint8Array(data))
			}

			await this.device.sendCommand({
				label: 'Canon TransferComplete',
				opcode: OpCodeCanon.TransferComplete,
				parameters: [info.id],
			})

			return {
				id: info.id,
				storageID: info.storageID,
				format: isRaw ? 'raw' : 'jpeg',
				byteLength: info.byteLength,
				filename: info.filename,
				blob: new Blob(chunks, {type}),
			} as TethrObject
		} catch {
			return null
		}
	}

	/**
	 * Last non-manual FocusMode raw value the camera reported. Needed to switch
	 * back to AF: while in MF the allowed list only names MF, and the R5
	 * silently ignores a guessed 0 (answers OK, stays MF) — restoring the exact
	 * code we saw also preserves One-Shot vs Servo.
	 */
	#lastAFFocusRaw: number | null = null

	async runAutoFocus(): Promise<OperationResult> {
		try {
			await this.device.sendCommand({
				label: 'Canon DoAf',
				opcode: OpCodeCanon.DoAf,
			})
			await this.device.sendCommand({
				label: 'Canon AfCancel',
				opcode: OpCodeCanon.AfCancel,
			})
			return {status: 'ok'}
		} catch {
			return {status: 'general error'}
		}
	}

	async runManualFocus(option: ManualFocusOption): Promise<OperationResult> {
		// DriveLens moves the lens by steps; requires liveview to be running.
		// 0x0001-0x0003 = toward near (small→large), 0x8001-0x8003 = toward far.
		const [direction, speedStr] = option.split(':')
		const speed = parseInt(speedStr)

		if (!(speed >= 1 && speed <= 3)) return {status: 'invalid parameter'}

		const parameter = direction === 'near' ? speed : 0x8000 + speed

		try {
			await this.device.sendCommand({
				label: 'Canon DriveLens',
				opcode: OpCodeCanon.DriveLens,
				parameters: [parameter],
			})
			return {status: 'ok'}
		} catch {
			return {status: 'general error'}
		}
	}

	// Liveview ------------------------------------------------------------------

	#liveview = new LiveviewDriver({
		grab: () => this.#getLiveviewImage(),
		isOpen: () => this.device.opened,
		onChange: stream => this.emit('liveviewChange', readonlyConfigDesc(stream)),
		// GetViewFinderData answers NotReady whenever we poll faster than the
		// sensor produces frames — the *steady state* once we've caught up, not an
		// error. The driver's generic 200 ms backoff would stall the stream to
		// ~5 fps every time we catch up; retry quickly instead.
		backoffMs: 20,
		// Breathe between delivered frames. The R5 supplies ~22 fps (a frame per
		// ~45 ms); polling flat-out just burns NotReady round-trips (more than
		// half of all requests) and keeps the camera's command processor pinned —
		// suspected of inflating concurrent GetEvent answers to ~250 ms.
		frameGapMs: 25,
	})

	async startLiveview(): Promise<OperationResult<MediaStream>> {
		// EVFMode=1 enables liveview; routing bit 2 in EVFOutputDevice sends
		// frames to the PC (the camera screen keeps working alongside). Only
		// write when needed — redundant sets are slow and can return DeviceBusy.
		if (this.#propValues.get(DevicePropCodeCanon.EVFMode) !== 1) {
			await this.#setPropValue(DevicePropCodeCanon.EVFMode, 1)
		}

		const current =
			this.#propValues.get(DevicePropCodeCanon.EVFOutputDevice) ?? 0
		if (!(current & EVFOutputPC)) {
			await this.#setPropValue(
				DevicePropCodeCanon.EVFOutputDevice,
				current | EVFOutputPC
			)
		}

		const stream = await this.#liveview.start()
		return {status: 'ok', value: stream}
	}

	async getLiveview(): Promise<MediaStream | null> {
		return this.#liveview.stream
	}

	async stopLiveview(): Promise<OperationResult> {
		this.#liveview.stop()

		const current =
			this.#propValues.get(DevicePropCodeCanon.EVFOutputDevice) ?? EVFOutputPC
		try {
			await this.#setPropValue(
				DevicePropCodeCanon.EVFOutputDevice,
				current & ~EVFOutputPC
			)
		} catch {
			// Camera may already be off / disconnected.
		}

		return {status: 'ok'}
	}

	async #getLiveviewImage(): Promise<Blob | null> {
		try {
			const {resCode, data} = await this.device.receiveData({
				label: 'Canon GetViewFinderData',
				opcode: OpCodeCanon.GetViewFinderData,
				// 0x00200000 is what current gphoto2 sends for every EOS ("from
				// trace") — it advertises a 2 MB host buffer, so the camera won't
				// send more than that. NotReady/DeviceBusy = no *new* frame yet
				// (normal for ~1s after enabling liveview, and steady-state when
				// polling outpaces the sensor), which the driver backs off on.
				parameters: [0x00200000, 0x00000000, 0x00000000],
				expectedResCodes: [
					ResCode.OK,
					ResCode.DeviceBusy,
					ResCodeCanon.ObjectNotReady,
				],
				// Sized to the advertised buffer (+ header room): WebUSB allocates
				// this much per transferIn, so a 4 MB ask meant 4 MB of allocation
				// churn per frame for a ~300 KB JPEG.
				maxByteLength: 0x00200000 + 0x10000,
				priority: PTPPriority.Liveview,
			})

			if (resCode !== ResCode.OK) return null

			// The blob is a list of [size][type] records where type 1 holds the
			// JPEG, but scanning for SOI/EOI markers is simpler and version-proof.
			const jpegData = sliceJpegData(data)
			return new Blob([jpegData], {type: 'image/jpg'})
		} catch {
			return null
		}
	}

	// Tables ----------------------------------------------------------------------
	// Value encodings from libgphoto2 camlibs/ptp2/config.c. Aperture / shutter /
	// ISO / exposure comp are APEX-ish: 8 units per stop; within a stop, +3/+5
	// are the 1/3-step codes and +4 the 1/2-step code (which of them the camera
	// accepts follows its exposure-increment setting, hence #encodeWithOptions).

	protected apertureTable = new BiMap<number, Aperture>([
		[0x08, 1.0],
		[0x0b, 1.1],
		[0x0c, 1.2],
		[0x0d, 1.2],
		[0x10, 1.4],
		[0x13, 1.6],
		[0x14, 1.8],
		[0x15, 1.8],
		[0x18, 2.0],
		[0x1b, 2.2],
		[0x1c, 2.5],
		[0x1d, 2.5],
		[0x20, 2.8],
		[0x23, 3.2],
		[0x24, 3.5],
		[0x25, 3.5],
		[0x28, 4.0],
		[0x2b, 4.5],
		[0x2c, 4.5],
		[0x2d, 5.0],
		[0x30, 5.6],
		[0x33, 6.3],
		[0x34, 6.7],
		[0x35, 7.1],
		[0x38, 8.0],
		[0x3b, 9.0],
		[0x3c, 9.5],
		[0x3d, 10],
		[0x40, 11],
		[0x43, 13],
		[0x44, 13],
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
		[0x64, 54],
		[0x65, 57],
		[0x68, 64],
		[0x6b, 72],
		[0x6c, 76],
		[0x6d, 81],
		[0x70, 91],
	])

	protected shutterSpeedTable = new BiMap<number, ShutterSpeed>([
		[0x00, 'auto'],
		[0x04, 'bulb'],
		[0x0c, 'bulb'],
		[0x10, '30'],
		[0x13, '25'],
		[0x14, '20.3'],
		[0x15, '20'],
		[0x18, '15'],
		[0x1b, '13'],
		[0x1c, '10'],
		[0x1d, '10.3'],
		[0x20, '8'],
		[0x23, '6.3'],
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
		[0x45, '0.3'],
		[0x48, '1/4'],
		[0x4b, '1/5'],
		[0x4c, '1/6'],
		[0x4d, '1/6'],
		[0x50, '1/8'],
		[0x53, '1/10'],
		[0x54, '1/10'],
		[0x55, '1/13'],
		[0x58, '1/15'],
		[0x5b, '1/20'],
		[0x5c, '1/20'],
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
		[0xa8, '1/16000'],
	])

	protected isoTable = new BiMap<number, ISO>([
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
		[0x8b, 32000],
		[0x8d, 40000],
		[0x90, 51200],
		[0x93, 64000],
		[0x95, 80000],
		[0x98, 102400],
		[0xa0, 204800],
		[0xa8, 409600],
		[0xb0, 819200],
	])

	/**
	 * AutoExposureMode (0xd105) values. On most bodies the mode is a physical
	 * dial and the camera rejects sets (and sends no allowed list, so the desc
	 * stays read-only); R bodies with a MODE button may accept them.
	 */
	protected exposureModeTable = new BiMap<number, ExposureMode>([
		[0x00, 'P'],
		[0x01, 'S'], // Tv
		[0x02, 'A'], // Av
		[0x03, 'M'],
		[0x04, 'vendor:bulb'],
		[0x07, 'C1'],
		[0x09, 'vendor:green'], // Full auto on old bodies
		[0x10, 'C2'],
		[0x11, 'C3'],
		[0x13, 'vendor:creative auto'],
		[0x14, 'video'],
		[0x16, 'vendor:auto'],
		[0x19, 'vendor:SCN'],
		[0x31, 'vendor:HDR'],
		[0x37, 'vendor:Fv'],
	])

	/** PictureStyle (0xd110) codes, from libgphoto2 canon_eos_picturestyle. */
	protected pictureStyleTable = new BiMap<number, string>([
		[0x81, 'standard'],
		[0x82, 'portrait'],
		[0x83, 'landscape'],
		[0x84, 'neutral'],
		[0x85, 'faithful'],
		[0x86, 'monochrome'],
		[0x87, 'auto'],
		[0x88, 'fine detail'],
		[0x21, 'user1'],
		[0x22, 'user2'],
		[0x23, 'user3'],
	])

	protected whiteBalanceTable = new BiMap<number, WhiteBalance>([
		[0, 'auto'],
		[1, 'daylight'],
		[2, 'cloud'],
		[3, 'tungsten'],
		[4, 'fluorescent'],
		[5, 'flash'],
		[6, 'custom'], // Custom WB from a reference shot
		[8, 'shade'],
		[9, 'manual'], // Kelvin (use colorTemperature to pick the value)
		[23, 'auto cool'], // AWB White priority
	])
}

/**
 * Human label for a composite ImageFormat value, e.g. 'craw + large fine',
 * 'raw', 'small1 normal'. Derived purely from the camera's own data, so the
 * option list always mirrors what the body offers.
 */
function decodeCanonImageFormat(files: CanonImageFormatFile[]): string {
	return files
		.map(file => {
			if (file.type === 6) return file.compression === 3 ? 'craw' : 'raw'
			const size =
				CanonJpegSizeNames.get(file.size) ?? `size${file.size.toString(16)}`
			const compression =
				file.compression === 3
					? 'fine'
					: file.compression === 2
						? 'normal'
						: `c${file.compression}`
			return `${size} ${compression}`
		})
		.join(' + ')
}

/**
 * Canon exposure compensation byte: signed, 8 units per EV, with 3/8 ≒ 1/3 and
 * 4/8 = 1/2 sub-steps (e.g. `0x0b` = +1 1/3, `0xf5` = -1 1/3).
 */
function decodeCanonExposureComp(raw: number): ExposureComp {
	const eighths = (raw << 24) >> 24 // sign-extend the byte

	if (eighths === 0) return '0'

	const sign = eighths > 0 ? '+' : '-'
	const abs = Math.abs(eighths)
	const integer = Math.floor(abs / 8)
	let fraction = ''

	switch (abs % 8) {
		case 3:
			fraction = '1/3'
			break
		case 4:
			fraction = '1/2'
			break
		case 5:
			fraction = '2/3'
			break
	}

	if (integer === 0) return `${sign}${fraction}`
	if (fraction === '') return `${sign}${integer}`
	return `${sign}${integer} ${fraction}`
}

function encodeCanonExposureComp(value: ExposureComp): number | null {
	if (value === '0') return 0

	const match = value.match(/^([+-])([0-9]+)?\s?(1\/3|1\/2|2\/3)?$/)
	if (!match) return null

	const [, signStr, integerStr, fractionStr] = match

	const integer = integerStr ? parseInt(integerStr) : 0
	let fractionEighths = 0
	switch (fractionStr) {
		case '1/3':
			fractionEighths = 3
			break
		case '1/2':
			fractionEighths = 4
			break
		case '2/3':
			fractionEighths = 5
			break
	}

	const eighths = integer * 8 + fractionEighths
	if (eighths === 0) return null

	return (signStr === '-' ? 0x100 - eighths : eighths) & 0xff
}
