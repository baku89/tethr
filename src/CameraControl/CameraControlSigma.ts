import {PTPDecoder} from '../PTPDecoder'
import {BatteryLevel, CameraControl, ExposureMode} from './CameraControl'

export class CameraControlSigma extends CameraControl {
	public open = async (): Promise<void> => {
		await super.open()

		const res = await this.device.performTransaction({
			label: 'SigmaFP ConfigAPI',
			opcode: 0x9035,
			parameters: [0x0],
		})
		if (!res.data) throw new Error('Failed to initialize Sigma fp')
		this.parseIFD(res.data)

		await this.getCamDataGroup1()
		await this.getCamDataGroup2()
	}

	public getFocalLength = async (): Promise<number> => {
		return (await this.getCamDataGroup1()).currentLensFocalLength
	}

	public getExposureMode = async (): Promise<null | ExposureMode> => {
		return (await this.getCamDataGroup2()).exposureMode
	}
	public setExposureMode = async (mode: ExposureMode): Promise<void> => {
		const buffer = new ArrayBuffer(3)
		const dataView = new DataView(buffer)

		dataView.setUint16(0, 1 << 2, true) // Exposure
		dataView.setUint8(2, this.encodeExposureMode(mode))

		const data = this.encodeParameter(buffer)

		const res = await this.device.performTransaction({
			label: 'SigmaFP SetCamDataGroup2',
			opcode: 0x9017,
			data,
		})
	}

	public getBatteryLevel = async (): Promise<null | BatteryLevel> => {
		return (await this.getCamDataGroup1()).batteryLevel
	}

	private async getCamDataGroup1() {
		const res = await this.device.performTransaction({
			label: 'SigmaFP GetCamDataGroup1',
			opcode: 0x9012,
			parameters: [0x0],
		})
		if (!res.data) throw new Error('Failed to initialize Sigma fp')

		const decoder = new PTPDecoder(res.data)
		decoder.getUint8() // Size
		decoder.getUint16() // FieldPreset

		const group1 = {
			shutterSpeed: decoder.getUint8(),
			aperture: decoder.getUint8(),
			programShift: decoder.getInt8(),
			iSOAuto: decoder.getUint8(),
			iSOSpeed: decoder.getUint8().toString(2),
			expCompensation: decoder.getUint8(),
			abValue: decoder.getUint8(),
			abSettings: decoder.getUint8(),
			frameBufferState: decoder.getUint8(),
			mediaFreeSpace: decoder.getUint16(),
			mediaStatus: decoder.getUint8(),
			currentLensFocalLength: this.decodeFocalLength(decoder.getUint16()),
			batteryLevel: this.decodeBatteryLevel(decoder.getUint8()),
			abShotRemainNumber: decoder.getUint8(),
			expCompExcludeAB: decoder.getUint8(),
		}

		console.log('group1=', group1)

		return group1
	}

	private async getCamDataGroup2() {
		const res = await this.device.performTransaction({
			label: 'SigmaFP GetCamDataGroup2',
			opcode: 0x9013,
			parameters: [0x0],
		})
		if (!res.data) throw new Error('Failed to initialize Sigma fp')

		const decoder = new PTPDecoder(res.data)
		decoder.getUint8()
		decoder.getUint16() // FieldPreset

		const group2FirstOct = {
			driveMode: decoder.getUint8(),
			specialMode: decoder.getUint8(),
			exposureMode: this.decodeExposureMode(decoder.getUint8()),
			aeMeteringMode: decoder.getUint8(),
		}

		decoder.skip(4)

		const group2SecondOct = {
			flashType: decoder.getUint8(),
			flashMode: decoder.getUint8().toString(2),
			flashSettings: decoder.getUint8(),
			whiteBalance: decoder.getUint8(),
			resolution: decoder.getUint8(),
			imageQuality: decoder.getUint8(),
		}

		const group2 = {...group2FirstOct, ...group2SecondOct}

		console.log('group2=', group2)

		const str = [...new Uint8Array(res.data)]
			.map(n => ('00' + n.toString(16)).slice(-2))
			.join(' ')
		console.log(str)

		return group2
	}

	private parseIFD(data: ArrayBuffer) {
		const dataView = new DataView(data)
		const size = data.byteLength
		const asciiDecoder = new TextDecoder('ascii')

		const entryCount = dataView.getUint32(4, true)

		for (let i = 0; i < entryCount; i++) {
			const offset = 8 + 12 * i

			const tag = dataView.getUint16(offset, true)
			const type = dataView.getUint16(offset + 2, true)
			const count = dataView.getUint32(offset + 4, true)
			const valueOffset = dataView.getUint32(offset + 8, true)

			let value: any = null

			switch (type) {
				case 2: {
					// ASCII
					const buf = data.slice(valueOffset, valueOffset + count - 1)
					value = asciiDecoder.decode(buf)
					break
				}
			}

			console.log(`IFD entry ${i}:`, {tag, type, count, valueOffset, value})
		}

		console.log('IFD=', asciiDecoder.decode(data))

		const str = [...new Uint8Array(data)]
			.map(n => ('00' + n.toString(16)).slice(-2))
			.join(' ')

		console.log('ConfigAPI IFD=', str)
	}

	private decodeFocalLength(byte: number) {
		const integer = byte >> 4,
			fractional = byte & 0b1111

		return integer + fractional / 10
	}

	private decodeBatteryLevel(byte: number): null | BatteryLevel {
		switch (byte) {
			case 0x00:
				return null
			case 0x01:
				return 1 // Full
			case 0x02:
				return 2 / 3
			case 0x03:
				return 1 / 3
			case 0x04:
				return 0.1 // Low
			case 0x05:
				return 0
			case 0x06:
				return null
			case 0x07:
				return 0
			case 0x08:
				return 'ac'
			case 0x09:
				return null
			case 0x0a:
				return 4 / 5
			case 0x0b:
				return 3 / 5
			case 0x0c:
				return null
		}

		return null
	}

	private decodeExposureMode(byte: number): null | ExposureMode {
		console.log('decode', byte && 0b111)
		switch (byte & 0b111) {
			case 0x1:
				return ExposureMode.P
			case 0x2:
				return ExposureMode.A
			case 0x3:
				return ExposureMode.S
			case 0x4:
				return ExposureMode.M
		}
		return null
	}

	private encodeExposureMode(mode: ExposureMode): number {
		switch (mode) {
			case ExposureMode.P:
				return 0x1
			case ExposureMode.A:
				return 0x2
			case ExposureMode.S:
				return 0x3
			case ExposureMode.M:
				return 0x4
		}
	}

	private encodeParameter(buffer: ArrayBuffer) {
		const bytes = new Uint8Array(buffer)

		const size = buffer.byteLength
		const encodedBuffer = new ArrayBuffer(size + 2)
		const encodedBytes = new Uint8Array(encodedBuffer)

		// Set size at the first byte
		encodedBytes[0] = size

		// Insert the content
		for (let i = 0; i < size; i++) {
			encodedBytes[1 + i] = bytes[i]
		}

		// Add checksum on the last
		let checksum = 0
		for (let i = 0; i <= size; i++) {
			checksum += encodedBytes[i]
		}
		encodedBytes[size + 1] = checksum

		return encodedBuffer
	}
}
