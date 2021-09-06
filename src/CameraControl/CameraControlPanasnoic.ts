import {CameraControl} from './CameraControl'

export class CameraControlPanasnoic extends CameraControl {
	public open = async (): Promise<void> => {
		await super.open()

		await this.device.sendCommand({
			label: 'Panasonic OpenSession',
			code: 0x9102,
			parameters: [0x00010001],
		})
	}

	public takePicture = async (): Promise<null | string> => {
		await this.device.sendCommand({
			label: 'Panasonic Shutter',
			code: 0x9404,
			parameters: [0x3000011],
		})

		const objectAdded = await this.device.waitEvent(0xc108)
		const objectID = objectAdded.parameters[0]

		return null //await this.getObjectInfo(objectID)
	}
}
