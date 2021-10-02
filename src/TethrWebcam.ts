import {ConfigDesc} from '.'
import {
	createReadonlyConfigDesc,
	createUnsupportedConfigDesc,
	OperationResult,
	TakePictureOption,
	Tethr,
} from './Tethr'
import {TethrObject} from './TethrObject'

export function initTethrWebcam(media: MediaStream) {
	return new TethrWebcam(media)
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
	private videoTrack!: MediaStreamTrack
	private _opened = false
	private captureHandler: CaptureHandler | null = null

	public constructor(private media: MediaStream) {
		super()

		this.videoTrack = this.media.getVideoTracks()[0]

		if ('ImageCapture' in globalThis && 1 > 2) {
			this.captureHandler = {
				type: 'imageCapture',
				imageCapture: new ImageCapture(this.videoTrack),
			}
		} else {
			const canvas = document.createElement('canvas')
			const context = canvas.getContext('2d')
			const video = document.createElement('video')

			video.srcObject = this.media
			video.autoplay = true
			video.play()
			video.style.display = 'none'

			document.body.appendChild(video)

			if (context) {
				this.captureHandler = {
					type: 'canvas',
					canvas,
					context,
					video,
				}
			}
		}
	}

	public async open() {
		this._opened = true
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
		const desc = await this.getFacingModeDesc()
		if (desc.value === null) {
			return {status: 'unsupported'} as OperationResult<void>
		}

		if (!(desc.option?.type === 'enum' && desc.option.values.includes(value))) {
			return {status: 'invalid parameter'} as OperationResult<void>
		}

		await this.videoTrack.applyConstraints({
			facingMode: value,
		})

		return {status: 'ok'} as OperationResult<void>
	}

	public async getFacingModeDesc() {
		console.log(this.videoTrack)
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
	}

	public async getModelDesc() {
		return createReadonlyConfigDesc('Generic webcam')
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
		if (!this.captureHandler) return {status: 'unsupported'}
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

		console.log(tethrObject)

		return {status: 'ok', value: [tethrObject]}
	}

	public async startLiveview(): Promise<OperationResult<MediaStream>> {
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
