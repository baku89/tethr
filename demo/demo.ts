import {PTPDecoder} from '../src/PTPDecoder'
import {PTPDevice} from '../src/PTPDevice'
import {
	DevicePropCodeTable,
	EventTypeTable,
	ObjectFormatCodeTable,
	OpcodeTable,
} from '../src/PTPTable'

const initDevice = async () => {
	const device = new PTPDevice()
	await device.connect()

	const GetDeviceInfo = 0x1001
	const OpenSession = 0x1002
	const GetStorageIDs = 0x1004
	const GetStorageInfo = 0x1005
	const CloseSession = 0x1003
	const ResetDevice = 0x1010

	{
		const result = await device.performTransaction({
			label: 'Get Device Info',
			opcode: GetDeviceInfo,
		})
		if (!result.data) throw new Error()
		const decoder = new PTPDecoder(result.data)

		console.log('deviceInfo=', {
			StandardVersion: decoder.getUint16(),
			VendorExtensionID: decoder.getUint32(),
			VendorExtensionVersion: decoder.getUint16(),
			VendorExtensionDesc: decoder.getString(),
			FunctionalMode: decoder.getUint16(),
			OperationsSupported: decoder.getUint16Array(
				getCodeTransformer(OpcodeTable)
			),
			EventsSupported: decoder.getUint16Array(
				getCodeTransformer(EventTypeTable)
			),
			DevicePropertiesSupported: decoder.getUint16Array(
				getCodeTransformer(DevicePropCodeTable)
			),
			CaptureFormats: decoder.getUint16Array(
				getCodeTransformer(ObjectFormatCodeTable)
			),
			ImageFormats: decoder.getUint16Array(
				getCodeTransformer(ObjectFormatCodeTable)
			),
			Manufacturer: decoder.getString(),
			Model: decoder.getString(),
			DeviceVersion: decoder.getString(),
			SerialNumber: decoder.getString(),
		})

		await device.performTransaction({
			label: 'Open Session',
			opcode: OpenSession,
			parameters: [0x1],
		})
	}

	await device.performTransaction({
		label: 'Shutter',
		opcode: 0x9404,
		parameters: [0x3000011],
	})

	{
		const result = await device.performTransaction({
			label: 'Get Storage IDs',
			opcode: GetStorageIDs,
		})
		if (!result.data) throw new Error()
		const decoder = new PTPDecoder(result.data)

		const storageIDs = decoder.getUint32Array()
		console.log('storage ids =', storageIDs)

		const r = await device.performTransaction({
			label: 'GetStorageInfo',
			parameters: [storageIDs[0]],
			opcode: GetStorageInfo,
		})
		if (!r.data) throw new Error()
		const storageInfo = new PTPDecoder(r.data)

		console.log('storage info=', {
			storageType: storageInfo.getUint16(),
			filesystemType: storageInfo.getUint16(),
			accessCapability: storageInfo.getUint16(),
			maxCapability: storageInfo.getUint64(),
			freeSpaceInBytes: storageInfo.getUint64(),
			freeSpaceInImages: storageInfo.getUint32(),
		})
	}

	await device.performTransaction({
		label: 'Close Session',
		opcode: CloseSession,
	})

	device.close()

	// await sendCommand(0x901b, [0x06])
	// await sendData(0x901b)
	// await receiveResponse()
}

function getCodeTransformer(table: Record<number, string>) {
	return (code: number) => {
		if (code in table) {
			return table[code]
		} else {
			return '0x' + ('0000' + code.toString(16)).slice(-4)
		}
	}
}

document.getElementById('execute')?.addEventListener('click', initDevice)
