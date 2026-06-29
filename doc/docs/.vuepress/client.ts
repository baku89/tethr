import {defineClientConfig} from 'vuepress/client'

// Everything Tweeq/Tethr touches (pinia stores read `localStorage`, WebUSB,
// `getUserMedia`, the HTML Popover API…) is browser-only and would crash during
// VuePress's SSR pass. So we bootstrap it lazily and ONLY on the client: the
// dynamic imports keep Tweeq + its heavy deps (monaco, regl…) out of any code
// path the server ever evaluates. Pages embed the components inside
// `<ClientOnly>`, so SSR renders a placeholder and the client hydrates the real
// thing once these registrations have run.
export default defineClientConfig({
	async enhance({app}) {
		if (__VUEPRESS_SSR__) return

		const {createPinia} = await import('pinia')
		app.use(createPinia())

		const {initTweeq} = await import('tweeq/useTweeq')
		initTweeq('com.baku89.tethr-doc', {
			colorMode: 'dark',
			accentColor: '#C85168',
		})

		const [{default: CameraReport}, {default: Playground}] = await Promise.all([
			import('./components/CameraReport.vue'),
			import('./components/Playground.vue'),
		])

		app.component('CameraReport', CameraReport)
		app.component('Playground', Playground)
	},
})
