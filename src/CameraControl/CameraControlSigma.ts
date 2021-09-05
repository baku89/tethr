import {PTPDecoder} from '../PTPDecoder'
import {CameraControl, DriveMode} from './CameraControl'

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

		await this.setToManual()
	}

	public getFocalLength = async (): Promise<number> => {
		return (await this.getCamDataGroup1()).CurrentLensFocalLength
	}

	public getDriveMode = async (): Promise<DriveMode> => {
		return (await this.getCamDataGroup2()).DriveMode
	}

	private async getCamDataGroup1() {
		const res = await this.device.performTransaction({
			label: 'SigmaFP GetCamDataGroup1',
			opcode: 0x9012,
			parameters: [0x0],
		})
		if (!res.data) throw new Error('Failed to initialize Sigma fp')

		const decoder = new PTPDecoder(res.data)
		decoder.getUint8()

		const group1 = {
			FieldPreset: decoder.getUint16().toString(2),
			ShutterSpeed: decoder.getUint8(),
			Aperture: decoder.getUint8(),
			ProgramShift: decoder.getInt8(),
			ISOAuto: decoder.getUint8(),
			ISOSpeed: decoder.getUint8().toString(2),
			ExpCompensation: decoder.getUint8(),
			ABValue: decoder.getUint8(),
			ABSettings: decoder.getUint8(),
			FrameBufferState: decoder.getUint8(),
			MediaFreeSpace: decoder.getUint16(),
			MediaStatus: decoder.getUint8(),
			CurrentLensFocalLength: this.decodeFocalLength(decoder.getUint16()),
			BatteryState: decoder.getUint8(),
			ABShotRemainNumber: decoder.getUint8(),
			ExpCompExcludeAB: decoder.getUint8(),
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
		// decoder.getUint8()

		const group2 = {
			FieldPreset: decoder.getUint16().toString(2),
			DriveMode: this.decodeDriveMode(decoder.getUint8()),
			SpecialMode: decoder.getUint8(),
			ExposureMode: decoder.getUint8(),
			AEMeteringMode: decoder.getUint8(),
			__reserved0: decoder.getUint8(),
			__reserved1: decoder.getUint8(),
			__reserved2: decoder.getUint8(),
			__reserved3: decoder.getUint8(),
			FlashType: decoder.getUint8(),
			__reserved4: decoder.getUint8(),
			FlashMode: decoder.getUint8().toString(2),
			FlashSettings: decoder.getUint8(),
			WhiteBalance: decoder.getUint8(),
			Resolution: decoder.getUint8(),
			ImageQuality: decoder.getUint8(),
		}

		console.log('group2=', group2)

		const str = [...new Uint8Array(res.data)]
			.map(n => ('00' + n.toString(16)).slice(-2))
			.join(' ')
		console.log(str)

		return group2
	}

	private async setToManual() {
		const buffer = new ArrayBuffer(5)
		const dataView = new DataView(buffer)

		dataView.setUint8(0, 3)
		dataView.setUint16(1, 1 << 2, true) // Exposure
		dataView.setUint8(3, 0x04) // M

		let checksum = 0
		for (let i = 0; i < 4; i++) {
			checksum += dataView.getUint8(i)
		}
		checksum &= 0xff
		dataView.setUint8(4, checksum)

		const str = [...new Uint8Array(buffer)]
			.map(n => ('00' + n.toString(16)).slice(-2))
			.join(' ')
		console.log(str)

		const res = await this.device.performTransaction({
			label: 'SigmaFP SetCamDataGroup2',
			opcode: 0x9017,
			data: buffer,
		})

		console.log(res)
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

	private decodeFocalLength(bits: number) {
		const integer = bits >> 4,
			fractional = bits & 0b1111

		return integer + fractional / 10
	}

	private decodeDriveMode(bits: number): DriveMode {
		switch (bits & 0b111) {
			case 0x1:
				return DriveMode.P
			case 0x2:
				return DriveMode.A
			case 0x3:
				return DriveMode.S
			case 0x4:
				return DriveMode.M
			default:
				return DriveMode.Unknown
		}
	}

	private encodeDriveMode(mode: DriveMode): number {
		switch (mode) {
			case DriveMode.Unknown:
				return 0x0
			case DriveMode.P:
				return 0x1
			case DriveMode.A:
				return 0x2
			case DriveMode.S:
				return 0x3
			case DriveMode.M:
				return 0x4
		}
	}
}
