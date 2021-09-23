import {DeviceInfo} from './DeviceInfo'
import {PropType} from './props'
import {PropDesc, SetPropResult, TakePictureOption, Tethr} from './Tethr'
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

	public async listProps(): Promise<(keyof PropType)[]> {
		return []
	}

	public async get<N extends keyof PropType>(
		name: N
	): Promise<PropType[N] | null> {
		return null
	}

	public async set<N extends keyof PropType>(
		name: N,
		value: PropType[N]
	): Promise<SetPropResult<PropType[N]>> {
		return {
			status: 'unsupported',
			value: null,
		}
	}
	public async getDesc<N extends keyof PropType>(
		name: N
	): Promise<PropDesc<PropType[N]>> {
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

	public async runAutoFocus(): Promise<boolean> {
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
