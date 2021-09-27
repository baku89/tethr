module.exports = {
	root: true,
	env: {
		browser: true,
		node: true,
		commonjs: true,
	},
	parser: '@typescript-eslint/parser',
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'prettier',
	],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
	},
	plugins: ['simple-import-sort', 'unused-imports'],
	rules: {
		'no-mixed-spaces-and-tabs': 'off',
		'simple-import-sort/imports': 'error',
		'unused-imports/no-unused-imports-ts': 'error',
		'@typescript-eslint/explicit-member-accessibility': 'error',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/explicit-module-boundary-types': 'off',
	},
}
