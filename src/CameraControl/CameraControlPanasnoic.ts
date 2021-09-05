import {ObjectInfo} from '@/ObjectInfo'

import {CameraControl} from './CameraControl'

export class CameraControlPanasnoic extends CameraControl {
	public open = async (): Promise<void> => {
		await super.open()

		await this.device.performTransaction({
			label: 'Panasonic OpenSession',
			opcode: 0x9102,
			parameters: [0x00010001],
		})
	}

	public takePicture = async (): Promise<ObjectInfo> => {
		await this.device.performTransaction({
			label: 'Panasonic Shutter',
			opcode: 0x9404,
			parameters: [0x3000011],
		})

		const objectAdded = await this.device.waitEvent(0xc108)
		const objectID = objectAdded.parameters[0]

		return await this.getObjectInfo(objectID)
	}
}
