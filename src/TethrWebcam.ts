import {
	createReadonlyConfigDesc,
	OperationResult,
	TakePictureOption,
	Tethr,
} from './Tethr'
import {TethrObject} from './TethrObject'

export function initTethrWebcam(media: MediaStream) {
	return new TethrWebcam(media)
}

export class TethrWebcam extends Tethr {
	private liveviewEnabled = false
	private _opened = false
	private imageCapture!: ImageCapture

	public constructor(private media: MediaStream) {
		super()

		const videoTrack = this.media.getVideoTracks()[0]
		this.imageCapture = new ImageCapture(videoTrack)
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
		return createReadonlyConfigDesc(true)
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
		if (!download) return {status: 'ok', value: []}

		const blob = await this.imageCapture.takePhoto()

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
