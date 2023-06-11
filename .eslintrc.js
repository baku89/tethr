module.exports = {
	root: true,
	env: {
		browser: true,
		node: true,
	},
	parser: '@typescript-eslint/parser',
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'prettier',
	],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2022,
	},
	plugins: ['simple-import-sort', 'unused-imports', 'import'],
	rules: {
		'no-mixed-spaces-and-tabs': 'off',
		'simple-import-sort/imports': 'error',
		'simple-import-sort/exports': 'error',
		'import/first': 'error',
		'unused-imports/no-unused-imports-ts': 'error',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/explicit-module-boundary-types': 'off',
	},
}
