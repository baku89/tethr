import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'

const root = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
	resolve: {
		alias: {tethr: path.join(root, 'core/src')},
	},
	test: {
		include: ['docs/.vuepress/**/*.test.ts'],
		setupFiles: [path.join(root, 'core/src/test/setup.ts')],
	},
})
