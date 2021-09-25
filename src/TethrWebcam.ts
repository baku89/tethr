import {ConfigType} from './configs'
import {DeviceInfo} from './DeviceInfo'
import {
	ConfigDesc,
	SetConfigResult as SetConfigResult,
	TakePictureOption,
	Tethr,
} from './Tethr'
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
		return ['model']
	}

	public async listActions() {
		return []
	}

	public async set<N extends keyof ConfigType>(): Promise<
		SetConfigResult<ConfigType[N]>
	> {
		return {
			status: 'unsupported',
			value: null,
		}
	}
	public async getDesc<N extends keyof ConfigType>(
		name: N
	): Promise<ConfigDesc<ConfigType[N]>> {
		if (name === 'model') {
			return {
				writable: false,
				value: 'Webcam' as ConfigType[N],
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
	public async getDeviceInfo(): Promise<DeviceInfo> {
		return {} as any
	}

	public async runAutoFocus() {
		return false
	}

	public async runManualFocus() {
		return false
	}

	public async takePicture({download = true}: TakePictureOption = {}): Promise<
		null | TethrObject[]
	> {
		if (!download) return null

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

		return [tethrObject]
	}

	public async startLiveview(): Promise<null | MediaStream> {
		return this.media
	}

	public async stopLiveview(): Promise<void> {
		return
	}
}
