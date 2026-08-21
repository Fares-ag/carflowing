#!/usr/bin/env tsx
import { bootstrapFirstAdmin, BootstrapAdminError } from '../src/services/bootstrapAdmin.js'

function usage(): never {
  console.error('Usage: bootstrap-admin --email <email> --name <name> --password <password>')
  process.exit(1)
}

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined
  return process.argv[idx + 1]
}

async function main(): Promise<void> {
  const email = readArg('--email')
  const name = readArg('--name')
  const password = readArg('--password')
  if (!email || !name || !password) usage()

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
