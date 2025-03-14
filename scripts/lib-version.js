import { readFileSync, writeFileSync } from 'node:fs'
import path from 'path'

const pkg = JSON.parse(
  readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
)

writeFileSync(
  path.join(process.cwd(), 'src/version.ts'),
  `export const version = '${pkg.version}'\n`
)
