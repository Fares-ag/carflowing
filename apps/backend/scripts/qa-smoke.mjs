#!/usr/bin/env node
/**
 * Thin wrapper around the Vitest API integration suite.
 * For a live running server use: API_URL=http://localhost:3001 node scripts/qa-smoke.mjs
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, '..')

const result = spawnSync('npm', ['test'], {
  cwd: backendRoot,
  stdio: 'inherit',
  shell: true,
})

process.exit(result.status ?? 1)
