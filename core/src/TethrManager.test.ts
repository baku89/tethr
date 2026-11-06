import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createFakeS9} from './test/fakeS9'
import {TethrManager} from './TethrManager'

vi.mock('./TethrPTPUSB', async original => ({
	...(await original<typeof import('./TethrPTPUSB')>()),
	initTethrUSBPTP: vi.fn(),
}))

const {initTethrUSBPTP} = await import('./TethrPTPUSB')

describe('TethrManager', () => {
	const usb = {vendorId: 0x04da, productId: 0x2382} as USBDevice

	beforeEach(() => {
		vi.mocked(initTethrUSBPTP).mockReset()
		vi.mocked(initTethrUSBPTP).mockResolvedValue({
			status: 'ok',
			value: createFakeS9().transport as never,
		})

		vi.stubGlobal('navigator', {
			usb: {
				getDevices: async () => [usb],
				requestDevice: async () => usb,
				addEventListener: () => {},
			},
			mediaDevices: {
				enumerateDevices: async () => [],
				addEventListener: () => {},
			},
		})
	})

	it('does not open a device again when it is picked after being paired', async () => {
		const manager = new TethrManager()
		await vi.waitFor(() => expect(manager.pairedCameras).toHaveLength(1))

		const picked = await manager.requestCamera('ptpusb')

		expect(picked).toBe(manager.pairedCameras[0])
		expect(initTethrUSBPTP).toHaveBeenCalledOnce()
	})
})
