import {OpCode, ResCode} from '../../PTPDatacode'
import {PTPDecoder} from '../../PTPDecoder'
import {Aperture, ExposureMode, ISO, Tethr} from '../Tethr'

export class TethrPanasnoic extends Tethr {
	public open = async (): Promise<void> => {
		await super.open()

		await this.device.sendCommand({
			label: 'Panasonic OpenSession',
			code: 0x9102,
			parameters: [0x00010001],
		})
	}

	public close = async (): Promise<void> => {
		await this.device.sendCommand({
			label: 'Panasonic CloseSession',
			code: 0x9103,
			parameters: [0x00010001],
		})

		await super.open()
	}

	public getAperture = async (): Promise<null | Aperture> => {
		const {data} = await this.device.receiveData({
			label: 'Panasonic GetAperture',
			code: 0x9402,
			parameters: [0x02000041],
		})

		const decoder = new PTPDecoder(data)

		/*const dpc =*/ decoder.getUint32()
		/*const bytes = */ decoder.getUint32()
		const aperture: Aperture = decoder.getUint16() / 10

		return aperture
	}

	public getShutterSpeed = async (): Promise<null | string> => {
		const {data} = await this.device.receiveData({
			label: 'Panasonic GetShutterSpeed',
			code: 0x9402,
			parameters: [0x02000031],
		})

		const decoder = new PTPDecoder(data)

		/*const dpc =*/ decoder.getUint32()
		/*const bytes = */ decoder.getUint32()
		const value = decoder.getUint32()

		switch (value) {
			case 0xffffffff:
				return 'bulb'
			case 0x0fffffff:
				return 'auto'
			case 0x0ffffffe:
				return 'Unknown'
			default:
				if ((value & 0x80000000) === 0x00000000) {
					return '1/' + value / 1000
				} else {
					return ((value & 0x7fffffff) / 1000).toString()
				}
		}
	}

	public getISO = async (): Promise<null | ISO> => {
		const {data} = await this.device.receiveData({
			label: 'Panasonic GetISO',
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
			code: OpCode.GetObject,
			parameters: [objectInfo.objectID],
		})

		const blob = new Blob([data], {type: 'image/jpeg'})
		const url = window.URL.createObjectURL(blob)

		return url
	}

	public startLiveView = async (): Promise<void> => {
		await this.device.sendCommand({
			label: 'Panasonic StartLiveView',
			code: 0x9412,
			parameters: [0x0d000010],
		})
	}

	public stopLiveView = async (): Promise<void> => {
		await this.device.sendCommand({
			label: 'Panasonic StopLiveView',
			code: 0x9412,
			parameters: [0x0d000011],
		})
	}

	public getLiveView = async (): Promise<null | string> => {
		const {code, data} = await this.device.receiveData({
			label: 'Panasonic LiveView',
			code: 0x9706,
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		if (code !== ResCode.OK) return null

		// This does work somehow
		const jpegData = data.slice(180) //TethrPanasnoic.extractJpeg(data)

		const blob = new Blob([jpegData], {type: 'image/jpg'})
		const url = window.URL.createObjectURL(blob)
		return url
	}
}
