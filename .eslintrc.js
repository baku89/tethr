module.exports = {
	root: true,
	env: {
		browser: true,
		node: true,
		commonjs: true,
	},
	extends: [
		'eslint:recommended',
	],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
	},
	plugins: ['simple-import-sort', 'unused-imports'],
	rules: {
		'simple-import-sort/imports': 'error',
		'unused-imports/no-unused-imports-ts': 'error',
	},
}
