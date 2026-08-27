import { describe, expect, it, afterEach, vi } from 'vitest'
import { assertProductionSecrets } from '../productionGuards.js'

function prodEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const base: Record<string, string | undefined> = {
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    JWT_2FA_SECRET: 'z'.repeat(32),
    UPLOAD_DRIVER: 'blob',
    BLOB_READ_WRITE_TOKEN: 'blob-token',
    COOKIE_SECURE: 'true',
    COOKIE_DOMAIN: '.carflow.qa',
    PUBLIC_API_URL: 'https://api.carflow.qa',
    CUSTOMER_APP_URL: 'https://customer.carflow.qa',
    DEALER_APP_URL: 'https://dealer.carflow.qa',
    CORS_ORIGINS: 'https://customer.carflow.qa,https://dealer.carflow.qa',
    RESEND_API_KEY: 're_test',
    FROM_EMAIL: 'noreply@carflow.qa',
    SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
    DATABASE_URL: 'postgresql://carflow:carflow@ep-cool-mud-123.eu-central-1.aws.neon.tech/carflow',
    SKIPCASH_MODE: 'production',
    SKIPCASH_KEY_ID: 'kid',
    SKIPCASH_KEY_SECRET: 'secret',
    SKIPCASH_WEBHOOK_KEY: 'webhook-key',
    ...overrides,
  }
  return base
}

function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const prev = { ...process.env }
  Object.assign(process.env, env)
  try {
    fn()
  } finally {
    process.env = prev
  }
}

describe('assertProductionSecrets', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test'
  })

  it('passes with a complete production env fixture', () => {
    withEnv(prodEnv(), () => {
      expect(() => assertProductionSecrets()).not.toThrow()
    })
  })

  it('rejects local UPLOAD_DRIVER in production', () => {
    withEnv(prodEnv({ UPLOAD_DRIVER: 'local' }), () => {
      expect(() => assertProductionSecrets()).toThrow(/UPLOAD_DRIVER/)
    })
  })

  it('rejects local UPLOAD_DRIVER even when VERCEL=1', () => {
    withEnv(prodEnv({ UPLOAD_DRIVER: 'local', VERCEL: '1' }), () => {
      expect(() => assertProductionSecrets()).toThrow(/UPLOAD_DRIVER/)
    })
  })

  it('rejects ENABLE_JOBS=false without EXTERNAL_SCHEDULER', () => {
    withEnv(prodEnv({ ENABLE_JOBS: 'false' }), () => {
      expect(() => assertProductionSecrets()).toThrow(/ENABLE_JOBS/)
    })
  })

  it('allows ENABLE_JOBS=false when EXTERNAL_SCHEDULER=true', () => {
    withEnv(prodEnv({ ENABLE_JOBS: 'false', EXTERNAL_SCHEDULER: 'true' }), () => {
      expect(() => assertProductionSecrets()).not.toThrow()
    })
  })

  it('defaults ENABLE_JOBS to enabled when unset', () => {
    withEnv(prodEnv({ ENABLE_JOBS: undefined }), () => {
      expect(() => assertProductionSecrets()).not.toThrow()
    })
  })

  it('rejects JWT_2FA_SECRET equal to JWT_ACCESS_SECRET', () => {
    const secret = 'a'.repeat(32)
    withEnv(prodEnv({ JWT_ACCESS_SECRET: secret, JWT_2FA_SECRET: secret }), () => {
      expect(() => assertProductionSecrets()).toThrow(/JWT_2FA_SECRET must be distinct/)
    })
  })

  it('rejects localhost CUSTOMER_APP_URL', () => {
    withEnv(prodEnv({ CUSTOMER_APP_URL: 'http://localhost:5173' }), () => {
      expect(() => assertProductionSecrets()).toThrow(/CUSTOMER_APP_URL/)
    })
  })

  it('rejects SKIPCASH_MODE=sandbox when keys configured', () => {
    withEnv(prodEnv({ SKIPCASH_MODE: 'sandbox' }), () => {
      expect(() => assertProductionSecrets()).toThrow(/SKIPCASH_MODE/)
    })
  })

  it('rejects compromised SkipCash webhook key', async () => {
    withEnv(prodEnv({ SKIPCASH_WEBHOOK_KEY: '7adcc306-8732-46b9-9da6-f8769699e8c4' }), () => {
      expect(() => assertProductionSecrets()).toThrow(/committed/)
    })
  })

  it('rejects SKIPCASH_SAVED_CARDS_CHARGE_READY in production', () => {
    withEnv(prodEnv({ SKIPCASH_SAVED_CARDS_CHARGE_READY: 'true' }), () => {
      expect(() => assertProductionSecrets()).toThrow(/SKIPCASH_SAVED_CARDS_CHARGE_READY/)
    })
  })

  it('rejects missing RESEND_API_KEY in production', () => {
    withEnv(prodEnv({ RESEND_API_KEY: undefined }), () => {
      expect(() => assertProductionSecrets()).toThrow(/RESEND_API_KEY/)
    })
  })

  it('GUARD-EMAIL-01: rejects missing FROM_EMAIL in production', () => {
    withEnv(prodEnv({ FROM_EMAIL: undefined }), () => {
      expect(() => assertProductionSecrets()).toThrow(/FROM_EMAIL/)
    })
  })

  it('GUARD-SENTRY-01: rejects missing SENTRY_DSN in production', () => {
    withEnv(prodEnv({ SENTRY_DSN: undefined }), () => {
      expect(() => assertProductionSecrets()).toThrow(/SENTRY_DSN/)
    })
  })

  it('GUARD-SENTRY-02: allows no DSN with an explicit opt-out but warns loudly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    withEnv(prodEnv({ SENTRY_DSN: undefined, ALLOW_NO_ERROR_REPORTING: 'true' }), () => {
      expect(() => assertProductionSecrets()).not.toThrow()
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ALLOW_NO_ERROR_REPORTING'))
    warn.mockRestore()
  })

  it('GUARD-DB-01: rejects a pooled (PgBouncer) DATABASE_URL in production', () => {
    withEnv(
      prodEnv({
        DATABASE_URL:
          'postgresql://carflow:carflow@ep-cool-mud-123-pooler.eu-central-1.aws.neon.tech/carflow',
      }),
      () => {
        expect(() => assertProductionSecrets()).toThrow(/DIRECT \(non-pooled\) connection string/)
      }
    )
  })

  it('GUARD-BLOB-01: rejects BLOB_ACCESS=public in production', () => {
    withEnv(prodEnv({ BLOB_ACCESS: 'public' }), () => {
      expect(() => assertProductionSecrets()).toThrow(/BLOB_ACCESS/)
    })
  })

  it('GUARD-BLOB-02: allows the default private blob access', () => {
    withEnv(prodEnv({ BLOB_ACCESS: undefined }), () => {
      expect(() => assertProductionSecrets()).not.toThrow()
    })
  })

  it('warns when COOKIE_DOMAIN is missing with COOKIE_SECURE=true', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    withEnv(prodEnv({ COOKIE_DOMAIN: undefined }), () => {
      expect(() => assertProductionSecrets()).not.toThrow()
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('COOKIE_DOMAIN'))
    warn.mockRestore()
  })
})
