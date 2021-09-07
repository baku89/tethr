import _ from 'lodash'

import {ResCode} from '../../PTPDatacode'
import {PTPDecoder} from '../../PTPDecoder'
import {
	Aperture,
	BatteryLevel,
	CameraControl,
	ExposureMode,
	ISO,
	PropDescEnum,
} from '../CameraControl'
import {
	SigmaApexApertureHalf,
	SigmaApexApertureOneThird,
	SigmaApexBatteryLevel,
	SigmaApexExposureMode,
	SigmaApexISO,
	SigmaApexShutterSpeedHalf,
	SigmaApexShutterSpeedOneThird,
} from './SigmaApexTable'

export class CameraControlSigma extends CameraControl {
	public open = async (): Promise<void> => {
		await super.open()

		const {data} = await this.device.receiveData({
			label: 'SigmaFP ConfigAPI',
			code: 0x9035,
			parameters: [0x0],
		})
		this.decodeIFD(data)

		await this.getCamDataGroup1()
		await this.getCamDataGroup2()
	}

	public getFocalLength = async (): Promise<null | number> => {
		const data = (await this.getCamDataGroup1()).currentLensFocalLength
		return this.decodeFocalLength(data)
	}

	public getAperture = async (): Promise<null | Aperture> => {
		const {aperture} = await this.getCamDataGroup1()
		if (aperture === 0x0) return 'auto'
		return (
			SigmaApexApertureOneThird.get(aperture) ??
			SigmaApexApertureHalf.get(aperture) ??
			null
		)
	}

	public setAperture = async (aperture: Aperture): Promise<boolean> => {
		if (aperture === 'auto') return false

		const byte = SigmaApexApertureOneThird.getKey(aperture)
		if (!byte) return false

		return this.setCamData(1, 1, byte)
	}

	public getApertureDesc = async (): Promise<PropDescEnum<Aperture>> => {
		const ifdEntries = await this.getCamCanSetInfo5()
		const info = ifdEntries.find(e => e.tag === 210)

		if (!info || !Array.isArray(info.value)) throw new Error('Invalid IFD')

		if (info.value.length === 0) {
			// Should be auto aperture
			return {
				canWrite: false,
				canRead: true,
				range: [],
			}
		}

		const [svMin, svMax, step] = info.value

		const isStepOneThird = Math.abs(step - 1 / 3) < Math.abs(step - 1 / 2)
		const table = isStepOneThird
			? SigmaApexApertureOneThird
			: SigmaApexApertureHalf

		const apertures = Array.from(table.values())

		const fMinRaw = Math.sqrt(Math.pow(2, svMin))
		const fMaxRaw = Math.sqrt(Math.pow(2, svMax))

		const fMin = _.minBy(apertures, a => Math.abs(a - fMinRaw))
		const fMax = _.minBy(apertures, a => Math.abs(a - fMaxRaw))

		if (!fMin || !fMax) throw new Error()

		const range = apertures.filter(a => fMin <= a && a <= fMax)

		return {
			canWrite: true,
			canRead: true,
			range,
		}
	}

	public getShutterSpeed = async (): Promise<null | string> => {
		const {shutterSpeed} = await this.getCamDataGroup1()
		if (shutterSpeed === 0x0) return 'auto'
		return (
			SigmaApexShutterSpeedOneThird.get(shutterSpeed) ??
			SigmaApexShutterSpeedHalf.get(shutterSpeed) ??
			null
		)
	}

	public setShutterSpeed = async (shutterSpeed: string): Promise<boolean> => {
		const byte = SigmaApexShutterSpeedOneThird.getKey(shutterSpeed)
		if (!byte) return false

		return this.setCamData(1, 0, byte)
	}

	public getISO = async (): Promise<null | ISO> => {
		const {isoAuto, isoSpeed} = await this.getCamDataGroup1()
		if (isoAuto === 0x01) {
			return 'auto'
		} else {
			return SigmaApexISO.get(isoSpeed) ?? null
		}
	}

	public setISO = async (iso: ISO): Promise<boolean> => {
		if (iso === 'auto') {
			return await this.setCamData(1, 3, 0x1)
		}

		const byte = SigmaApexISO.getKey(iso)
		if (!byte) return false

		return (
			(await this.setCamData(1, 3, 0x0)) && (await this.setCamData(1, 4, byte))
		)
	}

	public getExposureMode = async (): Promise<null | ExposureMode> => {
		const {exposureMode} = await this.getCamDataGroup2()
		return SigmaApexExposureMode.get(exposureMode) ?? null
	}

	public setExposureMode = async (
		exposureMode: ExposureMode
	): Promise<boolean> => {
		const byte = SigmaApexExposureMode.getKey(exposureMode)
		if (!byte) return false

		return this.setCamData(2, 2, byte)
	}

	public getExposureModeDesc = async (): Promise<
		PropDescEnum<ExposureMode>
	> => {
		const ifdEntries = await this.getCamCanSetInfo5()
		const info = ifdEntries.find(e => e.tag === 200)

		if (!info || !Array.isArray(info.value)) throw new Error('Invalid IFD')

		const range = info.value
			.map(n => SigmaApexExposureMode.get(n))
			.filter(m => m !== undefined) as ExposureMode[]

		return {
			canRead: false,
			canWrite: false,
			range,
		}
	}

	public getBatteryLevel = async (): Promise<null | BatteryLevel> => {
		const {batteryLevel} = await this.getCamDataGroup1()
		return SigmaApexBatteryLevel.get(batteryLevel) ?? null
	}

	public takePicture = async (): Promise<null | string> => {
		// https://github.com/gphoto/libgphoto2/blob/96925915768917ef6c245349b787baa275df608c/camlibs/ptp2/library.c#L5426

		const {data: camCaptStatusData} = await this.device.receiveData({
			label: 'SigmaFP GetCamCaptStatus',
			code: 0x9015,
			parameters: [0x0],
		})
		const camCaptStatus = this.decodeCamCaptStatus(camCaptStatusData)
		const id = camCaptStatus.imageDBTail

		// Snap
		const buffer = new ArrayBuffer(2)
		const dataView = new DataView(buffer)

		dataView.setUint8(0, 0x02)
		dataView.setUint8(1, 0x02)

		await this.device.sendData({
			label: 'SigmaFP SnapCommand',
			code: 0x901b,
			data: this.encodeParameter(buffer),
		})

		let tries = 50
		while (tries--) {
			const {data} = await this.device.receiveData({
				label: 'SigmaFP GetCamCaptStatus',
				code: 0x9015,
				parameters: [id],
			})

			const result = this.decodeCamCaptStatus(data)

			// Failure
			if ((result.status & 0xf000) === 0x6000) {
				switch (result.status) {
					case 0x6001:
						throw new Error('AF failure')
					case 0x6002:
						throw new Error('Buffer full')
					case 0x6003:
						throw new Error('Custom WB failure')
					case 0x6004:
						throw new Error('Image generation failed')
				}
				throw new Error('Capture failed')
			}
			// Success
			if ((result.status & 0xf000) === 0x8000) break
			if (result.status == 0x0002) break
			if (result.status == 0x0005) break

			await new Promise(r => setTimeout(r, 500))
		}

		const {data: pictInfoData} = await this.device.receiveData({
			label: 'SigmaFP GetPictFileInfo2',
			code: 0x902d,
		})
		const pictInfo = this.decodePictureFileInfoData2(pictInfoData)

		// Get file
		const {data: pictFileData} = await this.device.receiveData({
			label: 'SigmaFP GetBigPartialPictFile',
			code: 0x9022,
			parameters: [pictInfo.fileAddress, 0x0, pictInfo.fileSize],
		})

		const blob = new Blob([pictFileData.slice(4)], {type: 'image/jpeg'})
		const url = window.URL.createObjectURL(blob)

		await this.device.sendData({
			label: 'SigmaFP ClearImageDBSingle',
			code: 0x901c,
			parameters: [id],
			data: new ArrayBuffer(8),
		})

		return url
	}

	public getLiveView = async (): Promise<null | string> => {
		const {code, data} = await this.device.receiveData({
			label: 'SigmaFP GetCamViewFrame',
			code: 0x902b,
			parameters: [],
			expectedResCodes: [ResCode.OK, ResCode.DeviceBusy],
		})

		if (code !== ResCode.OK) return null

		const jpegData = CameraControl.extractJpeg(data)

		const blob = new Blob([jpegData], {type: 'image/jpg'})
		const url = window.URL.createObjectURL(blob)
		return url
	}

	private async getCamDataGroup1() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroup1',
			code: 0x9012,
			parameters: [0x0],
		})

		const decoder = new PTPDecoder(data)
		decoder.getUint8() // Size
		decoder.getUint16() // FieldPreset

		const group1 = {
			shutterSpeed: decoder.getUint8(),
			aperture: decoder.getUint8(),
			programShift: decoder.getInt8(),
			isoAuto: decoder.getUint8(),
			isoSpeed: decoder.getUint8(),
			expCompensation: decoder.getUint8(),
			abValue: decoder.getUint8(),
			abSettings: decoder.getUint8(),
			frameBufferState: decoder.getUint8(),
			mediaFreeSpace: decoder.getUint16(),
			mediaStatus: decoder.getUint8(),
			currentLensFocalLength: decoder.getUint16(),
			batteryLevel: decoder.getUint8(),
			abShotRemainNumber: decoder.getUint8(),
			expCompExcludeAB: decoder.getUint8(),
		}

		return group1
	}

	private async getCamDataGroup2() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamDataGroup2',
			code: 0x9013,
			parameters: [0x0],
		})

		const decoder = new PTPDecoder(data)
		decoder.getUint8()
		decoder.getUint16() // FieldPreset

		const group2FirstOct = {
			driveMode: decoder.getUint8(),
			specialMode: decoder.getUint8(),
			exposureMode: decoder.getUint8(),
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

		return group2
	}

	private async getCamCanSetInfo5() {
		const {data} = await this.device.receiveData({
			label: 'SigmaFP GetCamCanSetInfo5',
			code: 0x9030,
			parameters: [0x0],
		})

		return this.decodeIFD(data)
	}

	private async setCamData(
		groupNumber: number,
		propNumber: number,
		value: number
	) {
		const buffer = new ArrayBuffer(3)
		const dataView = new DataView(buffer)

		dataView.setUint16(0, 1 << propNumber, true)
		dataView.setUint8(2, value)

		const data = this.encodeParameter(buffer)

		await this.device.sendData({
			label: 'SigmaFP SetCamDataGroup' + groupNumber,
			code: 0x9016 + groupNumber - 1,
			data,
		})

		return true
	}

	private decodeCamCaptStatus(data: ArrayBuffer) {
		const decoder = new PTPDecoder(data.slice(1))
		return {
			imageId: decoder.getUint8(),
			imageDBHead: decoder.getUint8(),
			imageDBTail: decoder.getUint8(),
			status: decoder.getUint16(),
			destination: decoder.getUint8(),
		}
	}

	private decodePictureFileInfoData2(data: ArrayBuffer) {
		const decoder = new PTPDecoder(data)

		decoder.skip(12)

		const chunk0 = {
			fileAddress: decoder.getUint32(),
			fileSize: decoder.getUint32(),
		}

		decoder.skip(8)

		const chunk1 = {
			fileExt: decoder.getByteString(),
			resolution: {
				width: decoder.getUint16(),
				height: decoder.getUint16(),
			},
			folderName: decoder.getByteString(),
			fileName: decoder.getByteString(),
		}

		return {...chunk0, ...chunk1}
	}

	private decodeIFD(data: ArrayBuffer) {
		const dataView = new DataView(data)
		const asciiDecoder = new TextDecoder('ascii')

		const entryCount = dataView.getUint32(4, true)

		const entries = []

		for (let i = 0; i < entryCount; i++) {
			const offset = 8 + 12 * i

			const tag = dataView.getUint16(offset, true)
			const type = dataView.getUint16(offset + 2, true)
			const count = dataView.getUint32(offset + 4, true)
			const valueOffset = dataView.getUint32(offset + 8, true)

			let value: number[] | string | null = null

			switch (type) {
				case 0x1: {
					// BYTES
					const off = count > 4 ? valueOffset : offset
					const buf = data.slice(off, off + count)
					value = [...new Uint8Array(buf)]
					break
				}
				case 0x2: {
					// ASCII
					const buf = data.slice(valueOffset, valueOffset + count - 1)
					value = asciiDecoder.decode(buf)
					break
				}
				case 0x8: {
					// SSHORT
					const off = count > 2 ? valueOffset : offset
					value = Array(count)
						.fill(0)
						.map((_, i) => {
							const f = dataView.getUint8(off + i * 2)
							const d = dataView.getUint8(off + i * 2 + 1)

							return d + f / 0x100
						})
					break
				}
			}

			entries.push({tag, value})

			// console.log(`IFD entry ${i}:`, {tag, type, count, valueOffset, value})
		}

		return entries
	}

	private decodeFocalLength(byte: number) {
		const integer = byte >> 4,
			fractional = byte & 0b1111

		return integer + fractional / 10
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
