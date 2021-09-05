import {CameraControl} from './CameraControl'

export class CameraControlLumix extends CameraControl {
	public takePicture = async (): Promise<void> => {
		await this.device.performTransaction({
			label: 'Shutter',
			opcode: 0x9404,
			parameters: [0x3000011],
		})
	}
}
