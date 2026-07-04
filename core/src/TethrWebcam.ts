import {
	OperationResult,
	TakePhotoOption,
	Tethr,
	TethrIdentifier,
} from './Tethr'
import {TethrObject} from './TethrObject'
import {readonlyConfigDesc, UnsupportedConfigDesc} from './util'

type CaptureHandler =
	| {type: 'imageCapture'; imageCapture: ImageCapture}
	| {
			type: 'canvas'
			canvas: HTMLCanvasElement
			context: CanvasRenderingContext2D
			video: HTMLVideoElement
	  }

/**
 * Chromium appends the USB `(vendorId:productId)` (4 hex : 4 hex) to a camera's
 * MediaDeviceInfo.label to disambiguate identical models. We key identity by
 * deviceId, so strip that noise for a clean display name.
 */
function cleanWebcamLabel(label: string): string {
	return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').trim()
}

/**
 * A single webcam, identified by its MediaDeviceInfo `deviceId`. Each connected
 * camera is its own TethrWebcam (the manager creates one per videoinput device)
 * rather than one webcam with a facing-mode switch. `deviceId`/`label` may be
 * empty until the user has granted camera permission at least once — until then
 * the browser hides them — so an instance can start "unresolved" (default cam)
 * and pin its real id/label on open().
 */
export class TethrWebcam extends Tethr {
	#media: MediaStream | null = null
	#captureHandler: CaptureHandler | null = null
	#deviceId: string
	#label: string

	constructor(deviceId = '', label = '') {
		super()
		this.#deviceId = deviceId
		this.#label = cleanWebcamLabel(label)
	}

	/** The webcam's stable id (empty only for an as-yet-unresolved default cam). */
	get deviceId() {
		return this.#deviceId
	}

	async open() {
		try {
			this.#media = await navigator.mediaDevices.getUserMedia({
				video: this.#deviceId
					? {deviceId: {exact: this.#deviceId}}
					: true,
			})
		} catch {
			throw new Error('No available webcam is connected')
		}

		// With permission now granted, pin the concrete id/label the browser hid
		// before (a default-cam instance opened with an empty deviceId learns which
		// device it actually is here, so its identifier round-trips).
		const settings = this.#media.getVideoTracks()[0]?.getSettings()
		if (settings?.deviceId) this.#deviceId = settings.deviceId
		if (!this.#label && settings?.deviceId) {
			const devices = await navigator.mediaDevices.enumerateDevices()
			const info = devices.find(d => d.deviceId === settings.deviceId)
			if (info?.label) this.#label = cleanWebcamLabel(info.label)
		}

		// Setup CaptureHandler
		if ('ImageCapture' in globalThis) {
			const videoTrack = this.#media.getVideoTracks()[0]
			this.#captureHandler = {
				type: 'imageCapture',
				imageCapture: new ImageCapture(videoTrack),
			}
		} else {
			const canvas = document.createElement('canvas')
			const context = canvas.getContext('2d')
			const video = document.createElement('video')

			video.autoplay = true
			video.muted = true
			video.style.display = 'none'
			video.playsInline = true
			document.body.appendChild(video)

			video.srcObject = this.#media

			if (context) {
				this.#captureHandler = {
					type: 'canvas',
					canvas,
					context,
					video,
				}
			}
		}
	}

	async close() {
		this.#media?.getTracks().forEach(t => t.stop())
		this.#media = null
		this.emit('liveviewChange', readonlyConfigDesc(null))
	}

	get opened() {
		return !!this.#media
	}

	get type(): 'webcam' {
		return 'webcam'
	}

	get name() {
		return this.#label || 'Webcam'
	}

	get identifier(): TethrIdentifier {
		return {
			type: 'webcam',
			deviceId: this.#deviceId || undefined,
			label: this.#label || undefined,
		}
	}

	// Configs
	async getCanStartLiveviewDesc() {
		return readonlyConfigDesc(true)
	}

	async getCanTakePhotoDesc() {
		return readonlyConfigDesc(this.#captureHandler !== null)
	}

	async getModelDesc() {
		return readonlyConfigDesc('Webcam')
	}

	async getLiveviewDesc() {
		return this.#media ? readonlyConfigDesc(this.#media) : UnsupportedConfigDesc
	}

	// Actions
	async takePhoto({doDownload = true}: TakePhotoOption = {}): Promise<
		OperationResult<TethrObject[]>
	> {
		if (!this.#media || !this.#captureHandler) {
			return {status: 'unsupported'}
		}

		if (!doDownload) return {status: 'ok', value: []}

		let blob: Blob

		if (this.#captureHandler.type === 'imageCapture') {
			blob = await this.#captureHandler.imageCapture.takePhoto()
		} else {
			const videoTrack = this.#media.getVideoTracks()[0]
			const {width, height} = {
				width: 640,
				height: 480,
				...videoTrack.getSettings(),
			}
			const {canvas, context, video} = this.#captureHandler

			canvas.width = width
			canvas.height = height

			video.play()
			context.drawImage(video, 0, 0, width, height)

			const blobOrNull = await new Promise<Blob | null>(resolve => {
				canvas.toBlob(resolve)
			})

			if (!blobOrNull) return {status: 'general error'}

			blob = blobOrNull
		}

		const now = new Date()

		const tethrObject: TethrObject = {
			id: 0,
			storageID: 0,
			format: 'jpeg',
			byteLength: blob.size,
			// protectionStatus: 0,
			image: {
				width: 0,
				height: 0,
				bitDepth: 8,
			},
			filename: 'capture.jpeg',
			sequenceNumber: 0,
			captureDate: now,
			modificationDate: now,
			blob,
		}

		return {status: 'ok', value: [tethrObject]}
	}

	async startLiveview(): Promise<OperationResult<MediaStream>> {
		if (!this.#media) {
			return {status: 'general error'}
		}

		this.emit('liveviewChange', readonlyConfigDesc(this.#media))

		return {
			status: 'ok',
			value: this.#media,
		}
	}

	async stopLiveview(): Promise<OperationResult> {
		return {status: 'ok'}
	}
}
