import vue from '@vitejs/plugin-vue'
import path from 'path'
import {defineConfig} from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
	base: './',
	plugins: [vue()],
	resolve: {
		alias: {
			tethr: path.resolve('../core/src'),
			'@tethr': path.join(__dirname, '../integrations'),
		},
	},
	define: {
		// This is needed to make the PromiseQueue class available in the browser.
		'process.env.PROMISE_QUEUE_COVERAGE': false,
	},
})
