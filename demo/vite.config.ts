import path from 'path'
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			tethr: path.resolve('../src'),
		},
	},
	define: {
		'process.env.PROMISE_QUEUE_COVERAGE': false,
	},
})
