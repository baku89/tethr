import {DeviceInfo} from './DeviceInfo'
import {PropType} from './props'
import {
	LiveviewResult,
	PropDesc,
	SetPropResult,
	TakePictureOption,
	Tethr,
} from './Tethr'
import {TethrObject} from './TethrObject'

export function initTethrWebcam(media: MediaStream) {
	return new TethrWebcam(media)
}

export class TethrWebcam extends Tethr {
	private _opened = false

	public constructor(private media: MediaStream) {
		super()
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
	public async takePicture(
		options?: TakePictureOption
	): Promise<null | TethrObject[]> {
		return null
	}

	public async startLiveview(): Promise<void> {
		return
	}
	public async stopLiveview(): Promise<void> {
		return
	}

	public async getLiveview(): Promise<null | LiveviewResult> {
		return null
	}
}
