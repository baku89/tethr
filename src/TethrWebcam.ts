import {BiMap} from 'bim'

import {ConfigDesc} from '.'
import {
	createReadonlyConfigDesc,
	createUnsupportedConfigDesc,
	OperationResult,
	TakePictureOption,
	Tethr,
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
	private videoTrack: MediaStreamTrack | null = null
	private _opened = false
	private captureHandler: CaptureHandler | null = null

	private facingModeDict = new BiMap<string, string>()

	public constructor() {
		super()
	}

	public async open() {
		this._opened = true

		this.media = await navigator.mediaDevices.getUserMedia({video: true})
		this.videoTrack = this.media.getVideoTracks()[0]

		// Setup CaptureHandler
		if ('ImageCapture' in globalThis) {
			this.captureHandler = {
				type: 'imageCapture',
				imageCapture: new ImageCapture(this.videoTrack),
			}
		} else {
			const canvas = document.createElement('canvas')
			const context = canvas.getContext('2d')
			const video = document.createElement('video')

			video.autoplay = true
			video.style.display = 'none'
			document.body.appendChild(video)

			video.srcObject = this.media
			video.play()

			if (context) {
				this.captureHandler = {
					type: 'canvas',
					canvas,
					context,
					video,
				}
			}
		}

		// Retrieve deviceIDs for front/rear cameras
		const devices = await navigator.mediaDevices.enumerateDevices()

		const entries = devices
			.filter(d => d.kind === 'videoinput')
			.map(d => [d.deviceId, d.label] as [string, string])

		this.facingModeDict = new BiMap(entries)
	}

	public async close() {
		this._opened = false
	}

	public get opened() {
		return this._opened
	}

	// Configs
	public async getCanStartLiveviewDesc() {
		return createReadonlyConfigDesc(true)
	}

	public async getCanTakePictureDesc() {
		return createReadonlyConfigDesc(this.captureHandler !== null)
	}

	public async setFacingMode(value: string) {
		if (!this.media || !this.videoTrack || !this.captureHandler) {
			return {status: 'unsupported'} as OperationResult<void>
		}

		const desc = await this.getFacingModeDesc()
		if (desc.value === null) {
			return {status: 'unsupported'} as OperationResult<void>
		}

		const deviceId = this.facingModeDict.getKey(value)

		if (!deviceId) {
			return {status: 'invalid parameter'} as OperationResult<void>
		}

		// Stop all tracks at first
		this.media.getTracks().forEach(t => t.stop())

		// Then get a new media stream and notify the change
		this.media = await navigator.mediaDevices.getUserMedia({
			video: {deviceId: {exact: deviceId}},
		})
		this.emit('updateLiveviewStream', this.media)

		// Setup other variables
		this.videoTrack = this.media.getVideoTracks()[0]

		if (this.captureHandler.type === 'imageCapture') {
			this.captureHandler.imageCapture = new ImageCapture(this.videoTrack)
		} else {
			const {video} = this.captureHandler
			video.srcObject = this.media
			video.play()
		}

		/*
		await this.videoTrack.applyConstraints({
			facingMode: value,
		})
		*/

		return {status: 'ok'} as OperationResult<void>
	}

	public async getFacingModeDesc() {
		if (!this.media || !this.videoTrack) {
			return createUnsupportedConfigDesc<string>()
		}

		const currentId = this.videoTrack.getSettings().deviceId ?? ''
		const value = this.facingModeDict.get(currentId) ?? null

		return {
			writable: this.facingModeDict.size > 0,
			value,
			option: {
				type: 'enum',
				values: [...this.facingModeDict.values()],
			},
		} as ConfigDesc<string>

		/*
		const settings = this.videoTrack.getSettings()
		const capabilities = this.videoTrack.getCapabilities()

		const value = settings.facingMode
		const values = capabilities.facingMode

		if (!value || !values) {
			return createUnsupportedConfigDesc<string>()
		}

		return {
			writable: true,
			value,
			option: {
				type: 'enum',
				values,
			},
		} as ConfigDesc<string>
		*/
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
	public async takePicture({download = true}: TakePictureOption = {}): Promise<
		OperationResult<TethrObject[]>
	> {
		if (!this.captureHandler || !this.videoTrack) {
			return {status: 'unsupported'}
		}

		if (!download) return {status: 'ok', value: []}

		let blob: Blob

		if (this.captureHandler.type === 'imageCapture') {
			blob = await this.captureHandler.imageCapture.takePhoto()
		} else {
			const {width, height} = {
				width: 640,
				height: 480,
				...this.videoTrack.getSettings(),
			}
			const {canvas, context, video} = this.captureHandler

			canvas.width = width
			canvas.height = height

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

	public async stopLiveview(): Promise<OperationResult<void>> {
		this.liveviewEnabled = false
		this.emit('liveviewEnabledChanged', createReadonlyConfigDesc(false))
		return {status: 'ok'}
	}
}
