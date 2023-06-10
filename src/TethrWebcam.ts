import {BiMap} from 'bim'

import {ConfigDesc} from '.'
import {
	createReadonlyConfigDesc,
	OperationResult,
	TakePhotoOption,
	Tethr,
	UnsupportedConfigDesc,
} from './Tethr'
import {TethrObject} from './TethrObject'

export function initTethrWebcam() {
	return new TethrWebcam()
}

type CaptureHandler =
	| {type: 'imageCapture'; imageCapture: ImageCapture}
	| {
			type: 'canvas'
			canvas: HTMLCanvasElement
			context: CanvasRenderingContext2D
			video: HTMLVideoElement
	  }

export class TethrWebcam extends Tethr {
	private liveviewEnabled = false
	private media: MediaStream | null = null
	private captureHandler: CaptureHandler | null = null
	private facingModeDict = new BiMap<string, string>()

	public constructor() {
		super()
	}

	public async open() {
		try {
			this.media = await navigator.mediaDevices.getUserMedia({video: true})
		} catch {
			throw new Error('No available webcam is connected')
		}

		// Setup CaptureHandler
		if ('ImageCapture' in globalThis) {
			const videoTrack = this.media.getVideoTracks()[0]
			this.captureHandler = {
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

			video.srcObject = this.media

			if (context) {
				this.captureHandler = {
					type: 'canvas',
					canvas,
					context,
					video,
				}
			}
		}

		// Retrieve the camera's available facingModes
		const devices = await navigator.mediaDevices.enumerateDevices()

		const facingModeEntries = devices
			.filter(d => d.kind === 'videoinput')
			.map(d => [d.deviceId, d.label] as [string, string])

		this.facingModeDict = new BiMap(facingModeEntries)
	}

	public async close() {
		this.media?.getTracks().forEach(t => t.stop())
		this.media = null
	}

	public get opened() {
		return !!this.media
	}

	// Configs
	public async getCanStartLiveviewDesc() {
		return createReadonlyConfigDesc(true)
	}

	public async getCanTakePhotoDesc() {
		return createReadonlyConfigDesc(this.captureHandler !== null)
	}

	public async setFacingMode(value: string): Promise<OperationResult> {
		if (!this.media || !this.captureHandler) {
			return {status: 'unsupported'}
		}

		const desc = await this.getFacingModeDesc()
		if (desc.value === null) {
			return {status: 'unsupported'}
		}

		const deviceId = this.facingModeDict.getKey(value)

		if (!deviceId) {
			return {status: 'invalid parameter'}
		}

		// Stop all tracks at first
		this.media.getTracks().forEach(t => t.stop())

		// Then get a new media stream and notify the change
		this.media = await navigator.mediaDevices.getUserMedia({
			video: {deviceId: {exact: deviceId}},
		})
		this.emit('liveviewStreamUpdate', this.media)

		// Setup other variables
		const videoTrack = this.media.getVideoTracks()[0]

		if (this.captureHandler.type === 'imageCapture') {
			this.captureHandler.imageCapture = new ImageCapture(videoTrack)
		} else {
			const {video} = this.captureHandler
			video.srcObject = this.media
		}

		return {status: 'ok'}
	}

	public async getFacingModeDesc() {
		if (!this.media) {
			return UnsupportedConfigDesc
		}

		const videoTrack = this.media.getVideoTracks()[0]
		const currentId = videoTrack.getSettings().deviceId ?? ''
		const value = this.facingModeDict.get(currentId) ?? null

		return {
			writable: this.facingModeDict.size > 0,
			value,
			option: {
				type: 'enum',
				values: [...this.facingModeDict.values()],
			},
		} as ConfigDesc<string>
	}

	public async getModelDesc() {
		return createReadonlyConfigDesc('Webcam')
	}

	public async getLiveviewEnabledDesc() {
		return {
			writable: false,
			value: this.liveviewEnabled,
		}
	}

	// Actions
	public async takePhoto({download = true}: TakePhotoOption = {}): Promise<
		OperationResult<TethrObject[]>
	> {
		if (!this.media || !this.captureHandler) {
			return {status: 'unsupported'}
		}

		if (!download) return {status: 'ok', value: []}

		let blob: Blob

		if (this.captureHandler.type === 'imageCapture') {
			blob = await this.captureHandler.imageCapture.takePhoto()
		} else {
			const videoTrack = this.media.getVideoTracks()[0]
			const {width, height} = {
				width: 640,
				height: 480,
				...videoTrack.getSettings(),
			}
			const {canvas, context, video} = this.captureHandler

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

	public async startLiveview(): Promise<OperationResult<MediaStream>> {
		if (!this.media) {
			return {status: 'general error'}
		}

		this.liveviewEnabled = true
		this.emit('liveviewEnabledChanged', createReadonlyConfigDesc(true))
		return {
			status: 'ok',
			value: this.media,
		}
	}

	public async stopLiveview(): Promise<OperationResult> {
		this.liveviewEnabled = false
		this.emit('liveviewEnabledChanged', createReadonlyConfigDesc(false))
		return {status: 'ok'}
	}
}
