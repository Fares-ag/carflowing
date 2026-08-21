# CarFlow — Why every deploy fails at Healthcheck (and how to fix it)

**Symptom:** Initialization ✓ · Build ✓ · Deploy ✓ (4s) · **Network › Healthcheck ✗ (1m31s)**

That timing pattern is the whole story. "Deploy ✓" only means *the container was created*. The 91 seconds is Railway retrying an HTTP request that gets **connection refused** — because the Node process already exited. Railway then gives up and shows a generic "Healthcheck failure" with no reason.

**The actual error is one line in the `Deploy Logs` tab.** Read that first. Everything below explains what it almost certainly says.

---

## Why this keeps happening on every platform

Three structural reasons, all in the repo — not in Railway, Fly, or Vercel:

1. **The app is built to refuse to boot.** `apps/backend/src/index.ts` calls `assertProductionSecrets()` on line 13 — *before* `app.listen()`. That function has **12+ `throw` conditions** and the Dockerfile sets `NODE_ENV=production`, so every one of them is armed. Any single misconfigured variable = `throw` = process exits in milliseconds = nothing ever listens. This is good security design (it's the guard the audit praised) but it fails **silently and identically** on every host.

2. **`/health` is a database readiness probe, not a liveness probe.** In `app.ts` it runs `SELECT 1` and returns **503** if the DB is unreachable. So even when the app boots perfectly, an unreachable Neon DB produces the exact same "Healthcheck failure".

3. **No committed platform config, and a decoy app at the repo root.** There is no `railway.json`/`railway.toml`, and the Dockerfile lives at `apps/backend/Dockerfile` — *not* at the repo root, so root-level auto-detection won't find it. Meanwhile the root contains a **legacy Vite app** (`index.html`, `vite.config.ts`, `src/`) and the root `package.json` has **no `start` script**. A builder that auto-detects at the root can easily build the wrong application entirely.

On top of that: there has never been a successful deploy on any platform, so there's no known-good baseline to diff against. Every attempt debugs from zero.

---

## Ranked causes — check in this order

### 1. `assertProductionSecrets()` threw (highest confidence)

If the 19 Railway variables were copied from the local `.env`, **the app throws on the very first check** and exits. The local `.env` fails at least six guards simultaneously:

| Local `.env` value | Guard in `productionGuards.ts` | Result |
|---|---|---|
| `JWT_ACCESS_SECRET=dev-access-secret-change-me` | `<32 chars` **and** matches `/change-me/i` | **throws** |
| `JWT_REFRESH_SECRET=dev-refresh-secret-change-me` | same | **throws** |
| `COOKIE_SECURE=false` | must be exactly `"true"` | **throws** |
| `UPLOAD_DRIVER=local` | must be `"blob"` (unless `VERCEL=1`) | **throws** |
| `PUBLIC_API_URL=http://localhost:3001` | must be HTTPS, non-localhost | **throws** |
| `CORS_ORIGINS=http://localhost:5173,...` | must not contain localhost | **throws** |
| `SKIPCASH_MODE=sandbox` + `SKIPCASH_KEY_ID` set | mode must be `production` when keys are set | **throws** |
| `SKIPCASH_WEBHOOK_KEY=7adcc306-8732-46b9-9da6-f8769699e8c4` | **exact match** in `COMPROMISED_SKIPCASH_VALUES` | **throws** |

That last one is worth pausing on: the webhook key in the local `.env` is hard-coded in the blocklist as a known-leaked value. Production boot will *always* refuse it until it's rotated in the SkipCash portal.

Also easy to miss: **`DEALER_APP_URL` is required in production** (`requireHttpsUrl`) but is absent from the local `.env` and from the README's production list. It only appears in `.env.example`.

**Log signature:** `Error: JWT_ACCESS_SECRET must be a strong secret (32+ chars) in production` (or whichever guard trips first), then the process exits.

### 2. The builder built the wrong app (high confidence if Build Logs don't mention the Dockerfile)

A 30-second build is suspicious for a Dockerfile that runs `npm ci` twice plus two workspace builds. If Railway used **Nixpacks** (because no Dockerfile exists at the repo root), it would have auto-detected the **legacy root Vite app**, not the Express API. With no `start` script in the root `package.json`, nothing sensible runs — nothing listens — healthcheck fails.

**Check:** Build Logs should explicitly say it used `apps/backend/Dockerfile`. If it mentions Nixpacks, `vite build`, or a root-level build, this is your cause.

### 3. Healthcheck path points at `/`

The app has **no `GET /` route** — only `/health`, `/api/*`, and `/skipcash-pay/*`. If Railway's healthcheck path is left at the default `/`, Express returns **404** and the check fails even on a perfectly healthy app.

**Check:** Railway service → Settings → Healthcheck Path must be exactly `/health`.

### 4. Database unreachable → `/health` returns 503

Even with a clean boot, `/health` does `SELECT 1`. Neon requires SSL — if `DATABASE_URL` lacks `?sslmode=require`, the query fails and `/health` returns 503 → healthcheck failure.

**Log signature:** `[db] connecting postgres://...` followed by a connection/SSL error.

### 5. Port mismatch

The Dockerfile hard-codes `ENV PORT=8080`, `EXPOSE 8080`, and a `HEALTHCHECK` against `http://127.0.0.1:8080/health`. Railway injects its own `PORT`. If `PORT` is pinned to 8080 in the Railway variables while Railway routes elsewhere, or vice versa, the check hits a closed port. The app itself is fine (`Number(process.env.PORT) || 3001`) — **do not set `PORT` in Railway variables**; let Railway inject it.

### 6. `startScheduler()` crashes the process after listen

`index.ts` calls `startScheduler()` **without `await` and without a `.catch()`**. On Node 20 an unhandled promise rejection **terminates the process by default**. If the DB is unreachable, the server starts listening, then dies moments later — which looks exactly like a healthcheck failure.

---

## Fix — in order

### Step 1 · Read the Deploy Logs
Everything above is a hypothesis until you read that one line. It will name the exact guard or error.

### Step 2 · Set the variables correctly

Generate real secrets:
```bash
openssl rand -base64 48   # run twice, once per JWT secret
```

Required in Railway (do **not** paste the local `.env`):
```
NODE_ENV=production
DATABASE_URL=postgresql://...@...neon.tech/carflow?sslmode=require
JWT_ACCESS_SECRET=<48+ random chars, no "secret"/"change-me"/"password">
JWT_REFRESH_SECRET=<different 48+ random chars>
COOKIE_SECURE=true
UPLOAD_DRIVER=blob
BLOB_READ_WRITE_TOKEN=<vercel blob token>
PUBLIC_API_URL=https://carflow-api-production-9a43.up.railway.app
CUSTOMER_APP_URL=https://<customer app>.vercel.app
DEALER_APP_URL=https://<dealer app>.vercel.app
CORS_ORIGINS=https://<customer>,https://<dealer>,https://<admin>
```

> The `WEAK_SECRET_PATTERN` is `/dev-.*-change-me|change-me|secret|password/i` — it matches the **literal substring "secret"**. A generated key containing "secret" anywhere will be rejected. Re-roll if so.

**Do not set `PORT`** — let Railway inject it.

**SkipCash:** either omit `SKIPCASH_KEY_ID` / `SKIPCASH_KEY_SECRET` entirely for now (the guard only arms when a key is present), or rotate the keys in the SkipCash portal and set `SKIPCASH_MODE=production` with all three new values. The current webhook key is permanently blocklisted in code.

### Step 3 · Force the correct builder

Add `railway.json` at the **repo root** so Railway stops guessing:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/backend/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Step 4 · Split liveness from readiness (do this, it prevents the whole class of failure)

In `apps/backend/src/app.ts`, keep `/health` as the DB-aware readiness probe but add a **liveness** endpoint that returns 200 whenever the process is alive, and point Railway's healthcheck at it:

```ts
// Liveness: the process is up. Never touches the DB.
app.get('/live', (_req, res) => res.json({ status: 'ok' }))
```

Then set `healthcheckPath` to `/live`. A DB blip should not tear down a running deployment.

### Step 5 · Make boot failures loud, and stop the scheduler killing the process

In `apps/backend/src/index.ts`:

```ts
try {
  assertProductionSecrets()
} catch (err) {
  console.error('[boot] production configuration rejected:', (err as Error).message)
  throw err
}
```

and

```ts
startScheduler().catch((err) => console.error('[scheduler] failed to start:', err))
```

(or wrap it if it's synchronous). Right now an async scheduler failure takes the whole API down.

### Step 6 · Remove the decoy
Delete or relocate the root `index.html`, `vite.config.ts`, and `src/` (the legacy Figma prototype flagged in the audit). While they sit at the repo root, every auto-detecting builder on every platform can pick the wrong app.

---

## The one-line summary

The app is doing exactly what it was written to do: **refuse to start when production configuration is wrong.** Every platform reports that refusal as a generic "healthcheck failure" because the process is gone before it can answer. Fix the variables, pin the builder, and split liveness from readiness — then the failure becomes a readable error instead of a 91-second silence.
