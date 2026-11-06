import {describe, expect, it} from 'vitest'

import {DeviceInfo} from '../DeviceInfo'
import {FakePTPTransport} from '../test/FakePTPTransport'
import {createFakeS9} from '../test/fakeS9'
import {getVendorSpecificPTPUSBClass} from './getVendorSpecificPTPUSB'
import {TethrCanon} from './TethrCanon'
import {TethrPanasonic} from './TethrPanasonic'
import {TethrPTPUSB} from './TethrPTPUSB'
import {TethrRicohTheta} from './TethrRicohTheta'
import {TethrSigma} from './TethrSigma'

function info(fields: Partial<DeviceInfo>): DeviceInfo {
	return {
		standardVersion: 100,
		vendorExtensionID: 0,
		vendorExtensionVersion: 0,
		vendorExtensionDesc: '',
		functionalMode: 0,
		operationsSupported: [],
		eventsSupported: [],
		devicePropsSupported: [],
		captureFormats: [],
		imageFormats: [],
		manufacturer: '',
		model: '',
		deviceVersion: '',
		serialNumber: '',
		...fields,
	}
}

describe('getVendorSpecificPTPUSBClass', () => {
	it('picks Panasonic for what a real S9 reports', async () => {
		const {transport} = createFakeS9()
		const s9 = await TethrPTPUSB.getDeviceInfo(transport as FakePTPTransport)

		expect(s9.model).toBe('DC-S9')
		expect(s9.serialNumber).toMatch(/^0+$/) // Removed from the fixture
		expect(getVendorSpecificPTPUSBClass(s9)).toBe(TethrPanasonic)
	})

	it('picks Sigma from the extension description', () => {
		expect(
			getVendorSpecificPTPUSBClass(
				info({vendorExtensionID: 6, vendorExtensionDesc: 'SIGMA'})
			)
		).toBe(TethrSigma)
	})

	it('picks Theta from the model', () => {
		expect(
			getVendorSpecificPTPUSBClass(
				info({vendorExtensionID: 6, model: 'RICOH THETA S'})
			)
		).toBe(TethrRicohTheta)
	})

	it('picks Canon only for EOS bodies', () => {
		expect(
			getVendorSpecificPTPUSBClass(
				info({vendorExtensionID: 0xb, operationsSupported: [0x9116]})
			)
		).toBe(TethrCanon)
		expect(
			getVendorSpecificPTPUSBClass(info({vendorExtensionID: 0xb}))
		).toBeUndefined()
	})

	it('leaves anything else to the generic class', () => {
		expect(
			getVendorSpecificPTPUSBClass(info({vendorExtensionID: 6}))
		).toBeUndefined()
	})
})
