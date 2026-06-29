import {viteBundler} from '@vuepress/bundler-vite'
import {defaultTheme} from '@vuepress/theme-default'
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import glsl from 'vite-plugin-glsl'
import {defineUserConfig} from 'vuepress'

const require = createRequire(import.meta.url)

// `.vuepress` directory → tethr repo root is three levels up
// (doc/docs/.vuepress → doc/docs → doc → <tethr root>)
const vuepressDir = fileURLToPath(new URL('.', import.meta.url))
const tethrRoot = path.resolve(vuepressDir, '../../..')

// tweeq ships no built `lib`, so resolve straight to its TypeScript source —
// the same trick koma uses (vite alias → `tweeq/src`). Resolve wherever the
// git dependency landed (workspace hoist may put it in the monorepo root).
const tweeqPkgDir = path.dirname(require.resolve('tweeq/package.json'))
const tweeqSrc = path.join(tweeqPkgDir, 'src')

// koma imports tweeq eagerly, so vite's dep scanner pre-bundles tweeq's deps
// with CJS interop. We import tweeq lazily (client-only, for SSR safety), so the
// scanner misses them and CJS deps like `case` fail with "no default export".
// Force-include tweeq's runtime deps so vite pre-bundles them all.
const tweeqDeps = [
	...Object.keys(require('tweeq/package.json').dependencies ?? {}),
	// tweeq imports these but doesn't declare them in package.json
	'@baku89/pave',
].filter(d => !d.startsWith('@types/'))

export default defineUserConfig({
	base: '/tethr/',
	title: 'Tethr',
	description: 'A JavaScript/TypeScript library for controlling cameras',

	locales: {
		'/': {
			lang: 'en-US',
			title: 'Tethr',
			description: 'A JavaScript/TypeScript library for controlling cameras',
		},
		'/ja/': {
			lang: 'ja-JP',
			title: 'Tethr',
			description: 'カメラを制御するための JavaScript/TypeScript ライブラリ',
		},
	},

	head: [
		['link', {rel: 'icon', href: '/tethr/logo.svg'}],
		['link', {rel: 'preconnect', href: 'https://fonts.googleapis.com'}],
		[
			'link',
			{rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: ''},
		],
		[
			'link',
			{
				rel: 'stylesheet',
				href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Material+Symbols+Outlined&display=swap',
			},
		],
	],

	bundler: viteBundler({
		viteOptions: {
			plugins: [
				// tweeq imports GLSL shaders (InputColor) as strings
				glsl(),
			],
			resolve: {
				alias: {
					tethr: path.join(tethrRoot, 'core/src'),
					'@tethr/vue3': path.join(tethrRoot, 'integrations/vue3/src'),
					tweeq: tweeqSrc,
				},
			},
			define: {
				// Needed by tethr's PromiseQueue in the browser (carried over from
				// the old doc/vite.config.ts).
				'process.env.PROMISE_QUEUE_COVERAGE': 'false',
			},
			optimizeDeps: {
				include: [...tweeqDeps, 'js-yaml'],
			},
			ssr: {
				// tweeq is browser-only; never let SSR try to externalize/evaluate it.
				noExternal: ['tweeq'],
			},
		},
	}),

	theme: defaultTheme({
		logo: '/logo.svg',
		repo: 'baku89/tethr',
		docsRepo: 'baku89/tethr',
		docsBranch: 'main',
		docsDir: 'doc/docs',
		locales: {
			'/': {
				selectLanguageName: 'English',
				navbar: [
					{text: 'Guide', link: '/guide'},
					{text: 'Capability Report', link: '/report'},
					{text: 'Playground', link: '/playground'},
					{text: 'API', link: '/api/'},
				],
			},
			'/ja/': {
				selectLanguageName: '日本語',
				navbar: [
					{text: 'ガイド', link: '/ja/guide'},
					{text: '機能テスト', link: '/ja/report'},
					{text: 'プレイグラウンド', link: '/ja/playground'},
					{text: 'API', link: '/api/'},
				],
			},
		},
	}),

	markdown: {
		linkify: true,
		typographer: true,
	},

	extendsMarkdown: md => {
		// Better spacing around inline code/links in CJK text, matching linearly.
		// Loaded lazily so a missing optional dep never breaks the build.
		try {
			const cjk = require('markdown-it-cjk-friendly').default
			md.use(cjk)
		} catch {
			// optional
		}
	},
})
