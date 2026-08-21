#!/usr/bin/env node
/**
 * Rewrite @carflow/shared package.json so Node can resolve subpath exports
 * from compiled dist/ instead of TypeScript src/. The Dockerfile copies dist
 * only; a hardcoded export map here previously omitted ./vehicleFeatures and
 * crashed every production boot with ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
const fs = require('fs')
const path = require('path')

function toDistJs(file) {
  return file.replace(/^\.\/src\//, './dist/').replace(/\.tsx?$/, '.js')
}

function toDistTypes(file) {
  return file.replace(/^\.\/src\//, './dist/').replace(/\.tsx?$/, '.d.ts')
}

function rewriteExports(exportsMap) {
  if (!exportsMap || typeof exportsMap !== 'object') return exportsMap
  const next = {}
  for (const [key, value] of Object.entries(exportsMap)) {
    if (typeof value === 'string') {
      next[key] = toDistJs(value)
      continue
    }
    if (!value || typeof value !== 'object') {
      next[key] = value
      continue
    }
    const cond = {}
    for (const [name, target] of Object.entries(value)) {
      if (typeof target !== 'string') {
        cond[name] = target
        continue
      }
      cond[name] = name === 'types' ? toDistTypes(target) : toDistJs(target)
    }
    next[key] = cond
  }
  return next
}

function rewritePackageJson(pkg) {
  const next = { ...pkg }
  if (typeof next.main === 'string') next.main = toDistJs(next.main)
  if (typeof next.module === 'string') next.module = toDistJs(next.module)
  if (typeof next.types === 'string') next.types = toDistTypes(next.types)
  next.exports = rewriteExports(next.exports)
  return next
}

function main() {
  const pkgPath = path.resolve(process.cwd(), process.argv[2] || './packages/shared/package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const rewritten = rewritePackageJson(pkg)
  fs.writeFileSync(pkgPath, `${JSON.stringify(rewritten, null, 2)}\n`)
  const subpaths = Object.keys(rewritten.exports || {}).filter((key) => key !== '.')
  console.log(`Rewrote ${pkgPath} exports: ${['.'].concat(subpaths).join(', ')}`)
}

module.exports = { rewritePackageJson, toDistJs, toDistTypes }

if (require.main === module) {
  main()
}
