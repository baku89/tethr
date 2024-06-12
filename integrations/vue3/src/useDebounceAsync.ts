import {readonly, ref} from 'vue'

interface DebounceAsyncOptions<T extends unknown[]> {
	onQueue?: (...args: T) => any
	onFinish?: () => any
}

export function useDebounceAsync<T extends unknown[]>(
	fn: (...args: T) => Promise<any>,
	options?: DebounceAsyncOptions<T>
) {
	const isExecuting = ref(false)
	let reservedArgs: T | null = null

	const debouncedFn = async (...args: T) => {
		options?.onQueue?.(...args)

		if (isExecuting.value) {
			reservedArgs = args
			return
		}

		try {
			isExecuting.value = true
			await fn(...args)
		} finally {
			isExecuting.value = false
		}

		if (!reservedArgs) {
			options?.onFinish?.()
		} else {
			args = reservedArgs
			reservedArgs = null
			debouncedFn(...args)
		}
	}

	return {fn: debouncedFn, isExecuting: readonly(isExecuting)}
}
