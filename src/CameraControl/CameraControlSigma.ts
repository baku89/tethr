import {PTPDecoder} from '../PTPDecoder'
import {BatteryLevel, CameraControl, DriveMode} from './CameraControl'

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
		return (await this.getCamDataGroup1()).currentLensFocalLength
	}

	public getDriveMode = async (): Promise<null | DriveMode> => {
		return (await this.getCamDataGroup2()).driveMode
	}

	public getBatteryLevel = async (): Promise<null | BatteryLevel> => {
		return (await this.getCamDataGroup1()).batteryState
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
			batteryState: this.decodeBatteryState(decoder.getUint8()),
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
		// decoder.getUint8()
		decoder.getUint16() // FieldPreset

		const group2 = {
			driveMode: this.decodeDriveMode(decoder.getUint8()),
			specialMode: decoder.getUint8(),
			exposureMode: decoder.getUint8(),
			aeMeteringMode: decoder.getUint8(),
			__reserved0: decoder.getUint8(),
			__reserved1: decoder.getUint8(),
			__reserved2: decoder.getUint8(),
			__reserved3: decoder.getUint8(),
			flashType: decoder.getUint8(),
			__reserved4: decoder.getUint8(),
			flashMode: decoder.getUint8().toString(2),
			flashSettings: decoder.getUint8(),
			whiteBalance: decoder.getUint8(),
			resolution: decoder.getUint8(),
			imageQuality: decoder.getUint8(),
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

	private decodeFocalLength(byte: number) {
		const integer = byte >> 4,
			fractional = byte & 0b1111

		return integer + fractional / 10
	}

	private decodeBatteryState(byte: number): null | BatteryLevel {
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

	private decodeDriveMode(bits: number): null | DriveMode {
		switch (bits & 0b111) {
			case 0x1:
				return DriveMode.P
			case 0x2:
				return DriveMode.A
			case 0x3:
				return DriveMode.S
			case 0x4:
				return DriveMode.M
		}
		return null
	}

	private encodeDriveMode(mode: DriveMode): number {
		switch (mode) {
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
