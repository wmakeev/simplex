#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const INPUT_FILE = path.join(process.cwd(), 'coverage', 'coverage-summary.json')
const OUT_FILE = path.join(process.cwd(), 'badges', 'coverage.json')

// lines, functions, branches, statements
const DEFAULT_METRIC = 'lines'

/**
 * Badge color.
 * @param {number} pct coverage percent.
 * @returns {string} color for shields.io.
 */
function getColor(pct) {
	if (pct > 80) {
		return 'brightgreen'
	}
	if (pct > 60) {
		return 'yellow'
	}
	return 'red'
}

async function convertCoverageToBadge() {
	const metric = process.argv[2] || DEFAULT_METRIC

	try {
		const rawData = await fs.readFile(INPUT_FILE, 'utf8')
		const coverageData = JSON.parse(rawData)

		const metricData = coverageData.total[metric]

		if (!metricData || typeof metricData.pct === 'undefined') {
			throw new Error(`Metric '${metric}' not found in ${INPUT_FILE}`)
		}

		const percentage = metricData.pct

		const badgeData = {
			schemaVersion: 1,
			label: `coverage`,
			message: `${percentage.toFixed(0)}%`,
			color: getColor(percentage),
			style: `flat-square`
		}

		const outputData = JSON.stringify(badgeData)
		await fs.writeFile(OUT_FILE, outputData)

		console.log(`Coverage badge updated.`)
	} catch (error) {
		console.error(`Coverage badge update error:`, error.message)
		process.exit(1)
	}
}

convertCoverageToBadge()
