import {ConfigType} from './configs'
import {ConfigDesc, OperationResult, TakePictureOption, Tethr} from './Tethr'
import {TethrObject} from './TethrObject'

export function initTethrWebcam(media: MediaStream) {
	return new TethrWebcam(media)
}

export class TethrWebcam extends Tethr {
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

	public async listConfigs(): Promise<(keyof ConfigType)[]> {
		return [
			'model',
			'liveviewEnabled',
			'canTakePicture',
			'canRunAutoFocus',
			'canRunManualFocus',
			'canStartLiveview',
		]
	}

	public async set(): Promise<OperationResult<void>> {
		return {
			status: 'unsupported',
		}
	}
	public async getDesc<N extends keyof ConfigType>(
		name: N
	): Promise<ConfigDesc<ConfigType[N]>> {
		switch (name) {
			case 'model':
				return {
					writable: false,
					value: 'Webcam' as ConfigType[N],
					options: [],
				}
			case 'liveviewEnabled':
				return {
					writable: false,
					value: true as ConfigType[N],
					options: [],
				}
			case 'canTakePicture':
			case 'canRunAutoFocus':
			case 'canRunManualFocus':
			case 'canStartLiveview':
				return {
					writable: false,
					value: true as ConfigType[N],
					options: [],
				}
		}

		return {
			writable: false,
			value: null,
			options: [],
		}
	}

	// Actions

	public async runAutoFocus(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}

	public async runManualFocus(): Promise<OperationResult<void>> {
		return {status: 'unsupported'}
	}

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
		return {
			status: 'ok',
			value: this.media,
		}
	}

	public async stopLiveview(): Promise<OperationResult<void>> {
		return {status: 'ok'}
	}
}
