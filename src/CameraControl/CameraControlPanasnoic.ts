import {OpCode} from '../PTPDatacode'
import {PTPDecoder} from '../PTPDecoder'
import {CameraControl, ExposureMode, ISO} from './CameraControl'

export class CameraControlPanasnoic extends CameraControl {
	public open = async (): Promise<void> => {
		await super.open()

		await this.device.sendCommand({
			label: 'Panasonic OpenSession',
			code: 0x9102,
			parameters: [0x00010001],
		})
	}

	public getISO = async (): Promise<null | ISO> => {
		const {data} = await this.device.receiveData({
			code: 0x9402,
			parameters: [0x02000021],
		})

		const decoder = new PTPDecoder(data)

		/*const dpc =*/ decoder.getUint32()
		/*const bytes = */ decoder.getUint32()
		let iso: ISO = decoder.getUint32()

		if (iso === 0xffffffff) iso = 'auto'
		if (iso === 0xfffffffe) iso = 'auto' // i-ISO

		return iso
	}

	public getExposureMode = async (): Promise<null | ExposureMode> => {
		const {data} = await this.device.receiveData({
			label: 'Panasonic GetProperty',
			code: 0x9402,
			parameters: [0x02000082],
		})

		const decoder = new PTPDecoder(data)

		/*const dpc =*/ decoder.getUint32()
		decoder.skip(4)
		const mode = decoder.getUint16()

		switch (mode) {
			case 0x0:
				return ExposureMode.P
			case 0x1:
				return ExposureMode.A
			case 0x2:
				return ExposureMode.S
			case 0x3:
				return ExposureMode.M
		}

		return null
	}

	public takePicture = async (): Promise<null | string> => {
		await this.device.sendCommand({
			label: 'Panasonic Shutter',
			code: 0x9404,
			parameters: [0x3000011],
		})

		const objectAdded = await this.device.waitEvent(0xc108)
		const objectID = objectAdded.parameters[0]

		const objectInfo = await this.getObjectInfo(objectID)

		const {data} = await this.device.receiveData({
			label: 'GetObject',
			code: OpCode.for('GetObject'),
			parameters: [objectInfo.objectID],
		})

		const blob = new Blob([data], {type: 'image/jpeg'})
		const url = window.URL.createObjectURL(blob)

		return url
	}
}
