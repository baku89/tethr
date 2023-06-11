import vue from '@vitejs/plugin-vue'
import path from 'path'
import {defineConfig} from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
	base: './',
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
