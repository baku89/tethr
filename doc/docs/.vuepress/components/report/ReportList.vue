<script lang="ts" setup>
import {computed} from 'vue'

import {cameraTitle, parseReport, ReportDir,ReportRepo} from './reportFile'

const files = import.meta.glob('../../../../reports/*.yaml', {
	eager: true,
	query: '?raw',
	import: 'default',
}) as Record<string, string>

// Newest first, keeping one per model and firmware
const reports = computed(() => {
	const all = Object.entries(files)
		.map(([path, yaml]) => ({
			report: parseReport(yaml),
			filename: path.split('/').at(-1)!,
		}))
		.sort((a, b) => b.report.date.localeCompare(a.report.date))

	const seen = new Set<string>()
	return all.filter(({report: {camera}}) => {
		const key = `${cameraTitle(camera)}@${camera.firmware}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
})
</script>

<template>
	<section v-if="reports.length" class="ReportList">
		<h3>Reported cameras</h3>
		<table>
			<thead>
				<tr>
					<th>Camera</th>
					<th>Firmware</th>
					<th>OK</th>
					<th>Failed</th>
					<th>Tethr</th>
					<th>Date</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="{report, filename} in reports" :key="filename">
					<td>
						<a
							:href="`https://github.com/${ReportRepo}/blob/main/${ReportDir}/${filename}`"
							target="_blank"
						>
							{{ cameraTitle(report.camera) }}
						</a>
					</td>
					<td>{{ report.camera.firmware ?? '—' }}</td>
					<td>{{ report.summary.ok }}</td>
					<td>{{ report.summary.fail }}</td>
					<td>{{ report.environment.tethr }}</td>
					<td>{{ report.date }}</td>
				</tr>
			</tbody>
		</table>
	</section>
</template>

<style lang="stylus" scoped>
.ReportList
	margin-top 2rem

table
	display table
	width 100%
	font-size 0.85em
	font-variant-numeric tabular-nums

th
	text-align left
</style>
