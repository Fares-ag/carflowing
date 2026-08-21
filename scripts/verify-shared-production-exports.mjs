import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('./packages/shared/package.json', 'utf8'))
const specs = Object.keys(pkg.exports || {})
  .filter((key) => key !== '.')
  .map((key) => `@carflow/shared/${key.slice(2)}`)

await Promise.all(specs.map((spec) => import(spec)))
console.log('shared production exports ok:', specs.join(', '))
