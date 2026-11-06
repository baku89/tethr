import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ResCode} from './PTPDatacode'
import {PTPDevice} from './PTPDevice'

const Container = {Command: 1, Data: 2, Response: 3, Event: 4}
const Panasonic = 0x04da
const Sigma = 0x1003
const BulkEndpoint = 1
const InterruptEndpoint = 2
const OpenSession = 0x1002

function container(type: number, code: number, id: number, payload = new ArrayBuffer(0)) {
	const bytes = new Uint8Array(12 + payload.byteLength)
	const view = new DataView(bytes.buffer)
	view.setUint32(0, bytes.length, true)
	view.setUint16(4, type, true)
	view.setUint16(6, code, true)
	view.setUint32(8, id, true)
	bytes.set(new Uint8Array(payload), 12)
	return new DataView(bytes.buffer)
}

/**
 * A USBDevice speaking enough of PTP: each command gets an OK response, with
 * the data set for its opcode. Reads wait until something is there to read.
 */
class FakeUSBDevice {
	opened = false
	configuration: unknown = null
	serialNumber = ''
	productName = 'Fake'
	productId = 1
	configurations = [
		{
			configurationValue: 1,
			interfaces: [
				{
					interfaceNumber: 0,
					alternates: [
						{
							endpoints: [
								{endpointNumber: BulkEndpoint, type: 'bulk', direction: 'out'},
								{endpointNumber: BulkEndpoint, type: 'bulk', direction: 'in'},
								{
									endpointNumber: InterruptEndpoint,
									type: 'interrupt',
									direction: 'in',
								},
							],
						},
					],
				},
			],
		},
	]

	commands: {opcode: number; id: number}[] = []
	log: string[] = []
	/** Reset code to answer an opcode with, used up in order. */
	responses = new Map<number, number[]>()
	dataFor = new Map<number, ArrayBuffer>()
	/** Responses to this opcode wait until the next command arrives. */
	holdResponseTo: number | null = null

	#held: DataView[] = []
	#bulk: DataView[] = []
	#interrupt: DataView[] = []
	#waiting: {bulk?: () => void; interrupt?: () => void} = {}

	constructor(readonly vendorId: number) {}

	async open() {
		this.opened = true
	}
	async close() {
		this.opened = false
		this.#waiting.bulk?.()
		this.#waiting.interrupt?.()
	}
	async selectConfiguration() {
		this.configuration = this.configurations[0]
	}
	async reset() {
		this.log.push('reset')
	}
	async releaseInterface() {}
	async claimInterface() {
		this.log.push('claim')
	}
	async controlTransferOut({request}: {request: number}) {
		this.log.push(`control:0x${request.toString(16)}`)
		return {status: 'ok'}
	}
	async clearHalt(direction: string) {
		this.log.push(`clearHalt:${direction}`)
	}

	async transferOut(_endpoint: number, data: ArrayBuffer) {
		const view = new DataView(data)
		const type = view.getUint16(4, true)
		const opcode = view.getUint16(6, true)
		const id = view.getUint32(8, true)

		if (type === Container.Command) {
			this.commands.push({opcode, id})

			// Whatever was held comes out when the next command arrives
			this.#push('bulk', ...this.#held.splice(0))

			const replies = []
			const out = this.dataFor.get(opcode)
			if (out) replies.push(container(Container.Data, opcode, id, out))
			const code = this.responses.get(opcode)?.shift() ?? ResCode.OK
			replies.push(container(Container.Response, code, id))

			if (opcode === this.holdResponseTo) this.#held.push(...replies)
			else this.#push('bulk', ...replies)
		}

		return {status: 'ok', bytesWritten: data.byteLength}
	}

	async transferIn(endpoint: number) {
		const lane = endpoint === InterruptEndpoint ? 'interrupt' : 'bulk'
		const queue = lane === 'bulk' ? this.#bulk : this.#interrupt

		while (queue.length === 0) {
			await new Promise<void>(resolve => (this.#waiting[lane] = resolve))
			if (!this.opened) {
				throw new DOMException('The transfer was cancelled.')
			}
		}
		this.log.push(`read:${lane}`)
		return {status: 'ok', data: queue.shift()!}
	}

	emitEvent(code: number, parameter: number) {
		const payload = new Uint32Array([parameter]).buffer
		this.#push('interrupt', container(Container.Event, code, 0xffffffff, payload))
	}

	get interruptReads() {
		return this.log.filter(l => l === 'read:interrupt').length
	}

	#push(lane: 'bulk' | 'interrupt', ...views: DataView[]) {
		;(lane === 'bulk' ? this.#bulk : this.#interrupt).push(...views)
		this.#waiting[lane]?.()
	}
}

const devices: PTPDevice[] = []

async function open(vendorId = Panasonic) {
	const usb = new FakeUSBDevice(vendorId)
	const device = new PTPDevice(usb as never, {log: false})
	devices.push(device)
	await device.open()
	return {usb, device}
}

beforeEach(() => {
	vi.stubGlobal('navigator', {usb: {addEventListener: () => {}}})
})

afterEach(async () => {
	await Promise.all(devices.splice(0).map(device => device.close()))
	vi.unstubAllGlobals()
})

describe('open', () => {
	it('does not reset a Panasonic, which would drop it off the bus', async () => {
		const {usb} = await open(Panasonic)
		expect(usb.log).not.toContain('reset')
	})

	it('resets other vendors', async () => {
		const {usb} = await open(Sigma)
		expect(usb.log).toContain('reset')
	})

	it.each([Panasonic, Sigma])(
		'heals a dirty session on vendor 0x%s',
		async vendorId => {
			const {usb} = await open(vendorId)
			expect(usb.log).toEqual(
				expect.arrayContaining([
					'claim',
					'control:0x66',
					'clearHalt:out',
					'clearHalt:in',
				])
			)
		}
	)
})

describe('events', () => {
	it('delivers events from a Panasonic', async () => {
		const {usb, device} = await open(Panasonic)
		const listener = vi.fn()
		device.onEventCode(0xc102, listener)

		usb.emitEvent(0xc102, 0x02000040)

		await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
		expect([...listener.mock.calls[0][0].parameters]).toEqual([0x02000040])
	})

	it('keeps listening after an event', async () => {
		const {usb, device} = await open(Panasonic)
		const listener = vi.fn()
		device.onEventCode(0xc102, listener)

		usb.emitEvent(0xc102, 1)
		await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
		usb.emitEvent(0xc102, 2)
		await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
	})

	// Not the goal, but other vendors depend on this until tested on the bodies
	// (see the note in PTPDevice.open): this should fail the day it's turned on.
	it('does not read events from other vendors', async () => {
		const {usb, device} = await open(Sigma)
		const listener = vi.fn()
		device.onEventCode(0xc102, listener)

		usb.emitEvent(0xc102, 1)
		await new Promise(resolve => setTimeout(resolve, 20))

		expect(listener).not.toHaveBeenCalled()
		expect(usb.interruptReads).toBe(0)
	})
})

describe('transactions', () => {
	it('sends a command and returns its response', async () => {
		const {usb, device} = await open()
		const {resCode} = await device.sendCommand({opcode: 0x9102})

		expect(resCode).toBe(ResCode.OK)
		expect(usb.commands.map(c => c.opcode)).toEqual([0x9102])
	})

	it('returns the data of a receive', async () => {
		const {usb, device} = await open()
		usb.dataFor.set(0x9108, new Uint8Array([1, 2, 3]).buffer)

		const {data} = await device.receiveData({opcode: 0x9108})

		expect([...new Uint8Array(data)]).toEqual([1, 2, 3])
	})

	it('retries while the body is busy', async () => {
		const {usb, device} = await open()
		usb.responses.set(0x9102, [ResCode.DeviceBusy, ResCode.OK])

		const {resCode} = await device.sendCommand({opcode: 0x9102})

		expect(resCode).toBe(ResCode.OK)
		expect(usb.commands).toHaveLength(2)
	})

	it('throws on a response code nobody expects', async () => {
		const {usb, device} = await open()
		usb.responses.set(0x9102, [ResCode.InvalidParameter])

		await expect(device.sendCommand({opcode: 0x9102})).rejects.toThrow(
			/0x201d/i
		)
	})

	it('returns an expected failure code', async () => {
		const {usb, device} = await open()
		usb.responses.set(0x9102, [ResCode.InvalidParameter])

		const {resCode} = await device.sendCommand({
			opcode: 0x9102,
			expectedResCodes: [ResCode.OK, ResCode.InvalidParameter],
		})

		expect(resCode).toBe(ResCode.InvalidParameter)
	})
})

describe('a response held back until the next command', () => {
	const data = new ArrayBuffer(4)

	it('deadlocks without a nudge, which is why it exists', async () => {
		const {usb, device} = await open()
		usb.holdResponseTo = 0x9403

		const settled = vi.fn()
		void device.sendData({opcode: 0x9403, data}).then(settled, settled)
		await new Promise(resolve => setTimeout(resolve, 60))

		expect(settled).not.toHaveBeenCalled()
		expect(usb.commands.map(c => c.opcode)).toEqual([0x9403])
	})

	it('is released by a nudge on sendData', async () => {
		const {usb, device} = await open()
		usb.holdResponseTo = 0x9403

		const {resCode} = await device.sendData({
			opcode: 0x9403,
			data,
			nudgeAfterMs: 10,
		})

		expect(resCode).toBe(ResCode.OK)
		expect(usb.commands.map(c => c.opcode)).toEqual([0x9403, OpenSession])
	})

	it('is released by a nudge on receiveData', async () => {
		const {usb, device} = await open()
		usb.holdResponseTo = 0x9108
		usb.dataFor.set(0x9108, new Uint8Array([7]).buffer)

		const res = await device.receiveData({opcode: 0x9108, nudgeAfterMs: 10})

		expect([...new Uint8Array(res.data)]).toEqual([7])
	})

	it('is released by a nudge on sendCommand', async () => {
		const {usb, device} = await open()
		usb.holdResponseTo = 0x9404

		const {resCode} = await device.sendCommand({
			opcode: 0x9404,
			nudgeAfterMs: 10,
		})

		expect(resCode).toBe(ResCode.OK)
	})

	it('leaves the next transaction unaffected by the nudge reply', async () => {
		const {usb, device} = await open()
		usb.holdResponseTo = 0x9403
		usb.responses.set(OpenSession, [ResCode.SessionAlreadyOpen])
		usb.dataFor.set(0x9108, new Uint8Array([9]).buffer)

		await device.sendData({opcode: 0x9403, data, nudgeAfterMs: 10})
		usb.holdResponseTo = null
		const {resCode, data: out} = await device.receiveData({opcode: 0x9108})

		expect(resCode).toBe(ResCode.OK)
		expect([...new Uint8Array(out)]).toEqual([9])
	})

	it('does not nudge a response that arrives in time', async () => {
		const {usb, device} = await open()

		await device.sendData({opcode: 0x9403, data, nudgeAfterMs: 10})
		await new Promise(resolve => setTimeout(resolve, 30))

		expect(usb.commands.map(c => c.opcode)).toEqual([0x9403])
	})
})
