#!/usr/bin/env tsx
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { bootstrapFirstAdmin, BootstrapAdminError } from '../src/services/bootstrapAdmin.js'

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined
  return process.argv[idx + 1]
}

async function promptLine(label: string): Promise<string> {
  const rl = readline.createInterface({ input, output })
  try {
    const answer = await rl.question(label)
    return answer.trim()
  } finally {
    rl.close()
  }
}

async function resolveCredentials(): Promise<{ email: string; name: string; password: string }> {
  let email = process.env.CREATE_ADMIN_EMAIL?.trim() || readArg('--email')
  let name = process.env.CREATE_ADMIN_NAME?.trim() || readArg('--name')
  let password = process.env.CREATE_ADMIN_PASSWORD || readArg('--password')

  if (!email) email = await promptLine('Admin email: ')
  if (!name) name = await promptLine('Admin name: ')
  if (!password) password = await promptLine('Admin password: ')

  if (!email || !name || !password) {
    console.error('email, name, and password are required (flags, env, or prompts)')
    process.exit(1)
  }

  return { email, name, password }
}

async function main(): Promise<void> {
  const { email, name, password } = await resolveCredentials()

  try {
    const admin = await bootstrapFirstAdmin({ email, name, password })
    console.log(`Created first admin: ${admin.email} (${admin.id})`)
  } catch (err) {
    if (err instanceof BootstrapAdminError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
