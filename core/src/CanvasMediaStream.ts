import {vec2} from 'linearly'

export class CanvasMediaStream {
	#ctx: CanvasRenderingContext2D | null = null
	#stream: MediaStream | null = null

	async begin(
		initialDraw: () => PromiseLike<void>,
		frameRequestRate = 60,
		size?: vec2
	) {
		if (!this.#ctx) {
			const canvas = document.createElement('canvas')
			if (size) {
				canvas.width = size[0]
				canvas.height = size[1]
			}
			this.#ctx = canvas.getContext('2d')!
		}

		await initialDraw()

		this.#stream = this.#ctx.canvas.captureStream(frameRequestRate)
		return this.#stream
	}

	updateWithImage(image: ImageBitmap) {
		if (!this.#ctx) {
			throw new Error('CanvasMediaStream.begin() must be called first')
		}

		const sizeChanged =
			this.#ctx.canvas.width !== image.width ||
			this.#ctx.canvas.height !== image.height

		if (sizeChanged) {
			this.#ctx.canvas.width = image.width
			this.#ctx.canvas.height = image.height
		}

		this.#ctx.drawImage(image, 0, 0)
	}

	end() {
		this.#stream?.getTracks().forEach(track => track.stop())
	}
}
