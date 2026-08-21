const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { rewritePackageJson } = require('../rewrite-shared-package-exports.cjs')

describe('rewrite-shared-package-exports', () => {
  it('maps every src subpath export onto dist js/d.ts', () => {
    const rewritten = rewritePackageJson({
      main: './src/index.ts',
      module: './src/index.ts',
      types: './src/index.ts',
      exports: {
        '.': { types: './src/index.ts', import: './src/index.ts' },
        './vehicleFeatures': {
          types: './src/vehicleFeatures.ts',
          import: './src/vehicleFeatures.ts',
          require: './src/vehicleFeatures.ts',
        },
        './vehicleLocation': {
          types: './src/vehicleLocation.ts',
          import: './src/vehicleLocation.ts',
        },
        './analytics/events': {
          types: './src/analytics/events.ts',
          import: './src/analytics/events.ts',
        },
        './validation': {
          types: './src/validation/index.ts',
          import: './src/validation/index.ts',
        },
      },
    })

    assert.equal(rewritten.main, './dist/index.js')
    assert.equal(rewritten.types, './dist/index.d.ts')
    assert.equal(rewritten.exports['.'].import, './dist/index.js')
    assert.equal(rewritten.exports['./vehicleFeatures'].import, './dist/vehicleFeatures.js')
    assert.equal(rewritten.exports['./vehicleFeatures'].types, './dist/vehicleFeatures.d.ts')
    assert.equal(rewritten.exports['./vehicleLocation'].import, './dist/vehicleLocation.js')
    assert.equal(rewritten.exports['./analytics/events'].import, './dist/analytics/events.js')
    assert.equal(rewritten.exports['./validation'].import, './dist/validation/index.js')
  })
})
