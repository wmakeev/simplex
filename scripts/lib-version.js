import { readFileSync, writeFileSync } from 'node:fs'
import path from 'path'

const pkg = JSON.parse(
  readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
)

const versionTag = '{{version}}'

const replaceVersion = file => {
  const fileContent = readFileSync(file, 'utf-8')
  writeFileSync(file, fileContent.replace(versionTag, pkg.version))
}

// js
replaceVersion(path.join(process.cwd(), 'build/src/version.js'))
