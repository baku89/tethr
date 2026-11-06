import {ResCode} from '../PTPDatacode'
import {
	PTPDataResponse,
	PTPDeviceDescriptor,
	PTPEvent,
	PTPEventCallback,
	PTPReceiveDataOption,
	PTPResponse,
	PTPSendCommandOption,
	PTPSendDataOption,
	PTPTransport,
} from '../PTPDevice'

export interface FakeCall {
	opcode: number
	parameters: number[]
	data?: ArrayBuffer
}

export interface FakeReply {
	resCode?: number
	data?: ArrayBuffer
}

export type FakeHandler = (call: FakeCall) => FakeReply | void

/**
 * In-memory {@link PTPTransport}. Replies come from per-opcode handlers, and
 * unexpected response codes throw as they do on {@link PTPDevice}.
 */
export class FakePTPTransport implements PTPTransport {
	readonly calls: FakeCall[] = []
	readonly pendingCount = 0
	readonly runningCount = 0

	#opened = false
	#handlers = new Map<number, FakeHandler>()
	#eventListeners = new Map<number, Set<PTPEventCallback>>()

	constructor(
		readonly descriptor: PTPDeviceDescriptor = {vendorId: 0, productId: 0}
	) {}

	handle(opcode: number, handler: FakeHandler) {
		this.#handlers.set(opcode, handler)
	}

	handlerOf(opcode: number) {
		return this.#handlers.get(opcode)
	}

	/** Calls with the opcode, in order. */
	callsOf(opcode: number) {
		return this.calls.filter(call => call.opcode === opcode)
	}

	emitEvent(eventCode: number, ...parameters: number[]) {
		for (const listener of [...(this.#eventListeners.get(eventCode) ?? [])]) {
			listener({eventCode, parameters})
		}
	}

	listenerCount(eventCode: number) {
		return this.#eventListeners.get(eventCode)?.size ?? 0
	}

	async open() {
		this.#opened = true
	}

	async close() {
		this.#opened = false
	}

	get opened() {
		return this.#opened
	}

	setLog() {}

	#run({opcode, parameters = [], expectedResCodes}: PTPSendCommandOption, data?: ArrayBuffer) {
		const call: FakeCall = {opcode, parameters, data}
		this.calls.push(call)

		const reply = this.#handlers.get(opcode)?.(call) ?? {}
		const resCode = reply.resCode ?? ResCode.OK

		if (!(expectedResCodes ?? [ResCode.OK]).includes(resCode)) {
			throw new Error(`Unexpected resCode 0x${resCode.toString(16)}`)
		}

		return {resCode, data: reply.data ?? new ArrayBuffer(0)}
	}

	async sendCommand(option: PTPSendCommandOption): Promise<PTPResponse> {
		const {resCode} = this.#run(option)
		return {resCode, parameters: []}
	}

	async sendData(option: PTPSendDataOption): Promise<PTPResponse> {
		const {resCode} = this.#run(option, option.data)
		return {resCode, parameters: []}
	}

	async receiveData(option: PTPReceiveDataOption): Promise<PTPDataResponse> {
		const {resCode, data} = this.#run(option)
		return {resCode, parameters: [], data}
	}

	onEventCode(eventCode: number, callback: PTPEventCallback) {
		if (!this.#eventListeners.has(eventCode)) {
			this.#eventListeners.set(eventCode, new Set())
		}
		this.#eventListeners.get(eventCode)!.add(callback)
	}

	offEventCode(eventCode: number, callback?: PTPEventCallback) {
		if (callback) this.#eventListeners.get(eventCode)?.delete(callback)
		else this.#eventListeners.delete(eventCode)
	}

	waitEvent(eventCode: number) {
		return new Promise<PTPEvent>(resolve => {
			const listener = (ev: PTPEvent) => {
				this.offEventCode(eventCode, listener)
				resolve(ev)
			}
			this.onEventCode(eventCode, listener)
		})
	}

	on() {}
	off() {}
}
