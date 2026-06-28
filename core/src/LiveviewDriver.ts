import sleep from 'sleep-promise'

import {CanvasMediaStream} from './CanvasMediaStream'

export interface LiveviewDriverOptions {
	/**
	 * Fetch a single liveview frame. Return `null` when none is available (camera
	 * busy during AF/capture, transient error, etc.) — the loop will back off
	 * instead of spinning. Implementations should enqueue the underlying PTP
	 * transfer at `PTPPriority.Liveview` so it yields to user operations and
	 * slips between bulk-download chunks.
	 */
	grab: () => Promise<Blob | null>
	/** Whether the transport is still connected; the loop stops when it isn't. */
	isOpen: () => boolean
	/** Notified with the stream on start and with `null` on stop. */
	onChange: (stream: MediaStream | null) => void
	/** Delay after a delivered frame. Default 0 (go as fast as the pipe allows). */
	frameGapMs?: number
	/** Delay after an empty/failed frame, to avoid busy-looping. Default 200. */
	backoffMs?: number
}

/**
 * Drives a manually-polled liveview into a {@link MediaStream}.
 *
 * Uses a self-rescheduling loop rather than the transport's `idle` event. The
 * `idle` event only fires when the transaction queue fully drains, so once any
 * other traffic shares the pipe — config polling, capture, or a long object
 * read — it stops re-firing and liveview freezes (notably it never recovered
 * after the first frame, and stalled for the whole duration of a big readout).
 * This loop instead requests frames on its own; each request still goes through
 * the queue (at `PTPPriority.Liveview`), so it interleaves with everything else.
 *
 * Loop rules:
 * - **one frame in flight** — never enqueue a new frame before the previous
 *   resolves, so a slow pipe can't pile up frame requests.
 * - **fast when delivering, back off when empty** — yields the pipe to other
 *   work while the camera is busy.
 * - **swallow errors** — a failed fetch (typically a disconnect) must not
 *   surface as an unhandled rejection; the `isOpen` check stops the loop.
 */
export class LiveviewDriver {
	#canvas = new CanvasMediaStream()
	#stream: MediaStream | null = null
	#active = false
	#inFlight = false

	#grab: LiveviewDriverOptions['grab']
	#isOpen: LiveviewDriverOptions['isOpen']
	#onChange: LiveviewDriverOptions['onChange']
	#frameGapMs: number
	#backoffMs: number

	constructor(options: LiveviewDriverOptions) {
		this.#grab = options.grab
		this.#isOpen = options.isOpen
		this.#onChange = options.onChange
		this.#frameGapMs = options.frameGapMs ?? 0
		this.#backoffMs = options.backoffMs ?? 200
	}

	/** The current stream, or null when liveview is not running. */
	get stream(): MediaStream | null {
		return this.#stream
	}

	get active(): boolean {
		return this.#active
	}

	async start(): Promise<MediaStream> {
		if (this.#stream) return this.#stream

		const stream = await this.#canvas.begin(async () => {
			await this.#tick()
		})

		this.#stream = stream
		this.#active = true
		this.#onChange(stream)

		this.#loop()

		return stream
	}

	stop() {
		this.#active = false
		this.#canvas.end()
		this.#stream = null
		this.#onChange(null)
	}

	async #loop() {
		while (this.#active && this.#isOpen()) {
			const delivered = await this.#tick()
			await sleep(delivered ? this.#frameGapMs : this.#backoffMs)
		}
	}

	async #tick(): Promise<boolean> {
		if (!this.#isOpen() || this.#inFlight) return false

		this.#inFlight = true
		try {
			const blob = await this.#grab()
			if (!blob) return false

			const bitmap = await createImageBitmap(blob)
			this.#canvas.updateWithImage(bitmap)
			return true
		} catch {
			return false
		} finally {
			this.#inFlight = false
		}
	}
}
