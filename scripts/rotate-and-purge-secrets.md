# Runbook — rotate the leaked SkipCash credentials, then purge them from git history

**Status: NOT EXECUTED.** This runbook is written, reviewed and left un-run on purpose.
Nothing in it has been performed, and `scripts/purge-secrets.ps1` has never been invoked.
No force-push has been made.

---

## 0. What leaked, and where it still is

`https://github.com/Fares-ag/carflowing` is a **public** repository. Real SkipCash
merchant credentials were committed to it and **pushed**:

| Value | Env var | Committed in | Still in HEAD? |
|-------|---------|--------------|----------------|
| Sandbox client id | `SKIPCASH_CLIENT_ID` | `3094da1` (`docs/PRODUCTION_READINESS.md`, `.env.example`) | No — scrubbed |
| Sandbox key id | `SKIPCASH_KEY_ID` | `3094da1` | No — scrubbed |
| Sandbox webhook key | `SKIPCASH_WEBHOOK_KEY` | `3094da1` | **Yes** — as a denylist entry (see §2.0) |
| Production client id | `SKIPCASH_CLIENT_ID` | `3094da1` | No — scrubbed |
| Production key id | `SKIPCASH_KEY_ID` | `3094da1` | No — scrubbed |
| Production webhook key | `SKIPCASH_WEBHOOK_KEY` | `3094da1` | **Yes** — as a denylist entry (see §2.0) |

`SKIPCASH_KEY_SECRET` was never written out in full (`...` in every revision), but treat
it as burned anyway: it is used together with the key id, and the merchant account has
had a public advertisement of which account to attack.

Confirm the exact set yourself before touching anything — this command prints every
commit/blob that still contains one of them, without you having to retype the values:

```bash
git rev-list --all \
  | xargs git grep -l -E 'SKIPCASH_(CLIENT_ID|KEY_ID|WEBHOOK_KEY)[ =:`|]+[0-9a-f]{8}-[0-9a-f]{4}' \
  | sort -u
```

---

## 1. ROTATE FIRST — before any history rewrite

**Rotation is the containment action. The history purge is not.** By the time you read
this, the repository has been public for weeks: GitHub has served it to crawlers, search
indexes and forks; anyone who cloned it holds the values forever; GitHub keeps unreferenced
objects reachable through `refs/pull/*` and forks even after a force-push. Rewriting
history changes who can find the secret *next week*. It does nothing about who already has
it. A force-push also *advertises* that something sensitive was in a specific file, which
is a nudge to anyone watching the repo.

So: rotate, verify the new values work, and only then consider §2.

### 1a. SkipCash merchant portal

Log in to the SkipCash merchant portal — **do this for both the sandbox merchant account
and the production (`www.carflow.qa`) merchant account**:

| Credential | Where | Action |
|------------|-------|--------|
| `SKIPCASH_KEY_SECRET` | Portal → API keys → *Copy Key* | Generate a new key, copy the secret once |
| `SKIPCASH_KEY_ID` | Same screen — the id is issued with the secret | Take the new id from the newly generated pair |
| `SKIPCASH_CLIENT_ID` | Portal → account / integration settings | Reissue |
| `SKIPCASH_WEBHOOK_KEY` | Portal → webhook configuration | Regenerate |

`SKIPCASH_KEY_ID` and `SKIPCASH_KEY_SECRET` are a **pair** — regenerating the secret
issues a new id, so they must be updated together or webhook signature verification fails.

Then, in order:

1. Set the new sandbox values on the staging host and run one full sandbox payment
   (create-intent → `/skipcash-pay/callback` → booking → dealer approve → rental) and one
   refund. Both are rows in the go/no-go checklist in `docs/PRODUCTION_READINESS.md`.
2. Set the new production values as **Railway service variables only**:
   ```powershell
   railway service carflow-api
   railway variable set SKIPCASH_CLIENT_ID=<new> SKIPCASH_KEY_ID=<new> SKIPCASH_KEY_SECRET=<new> SKIPCASH_WEBHOOK_KEY=<new>
   ```
   Never into `.env`, never into a script, never into a doc.
3. Revoke / delete the old key pair in the portal. Rotation without revocation is not
   rotation.

> The backend refuses to boot in production if `SKIPCASH_WEBHOOK_KEY` is one of the two
> committed webhook keys (`COMPROMISED_SKIPCASH_VALUES` in
> `apps/backend/src/utils/productionGuards.ts`). If boot fails with that error, the
> rotation did not actually reach Railway.

### 1b. Production admin password

`scripts/setup-live-api.ps1` (now deleted) ran `db:seed` against the production database.
`db:seed` plants `admin@carflow.dev` / `password123`, and that password is printed in
public repo documentation.

1. In the admin portal, **delete** every `*@carflow.dev` seed account
   (`admin@carflow.dev`, `customer@carflow.dev`, `dealer@carflow.dev`) that exists in
   production.
2. Change the password of the real production admin, and enrol it in 2FA.
3. Rotate `.production-admin.local` on every operator laptop — that file is now gitignored
   but it was reachable by `git add -A` before today.

### 1c. While you are here

Two of the archive tarballs at the repo root (`_audit_snapshot.tar.gz`,
`_to_delete/*.tar.gz`) contain `.env` files. They were never committed, but if any of them
was ever shared, rotate: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_2FA_SECRET`
(all three invalidate live sessions — expect every user to be logged out),
`BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `DATABASE_URL` password, and any Twilio /
WhatsApp tokens.

---

## 2. Purge the values from git history (`git-filter-repo`)

Only after §1 is complete and verified.

### 2.0 Pre-step you must not skip

`apps/backend/src/utils/productionGuards.ts` deliberately contains **both burned webhook
keys** as a denylist, and so do its tests
(`apps/backend/src/utils/__tests__/productionGuards.test.ts`,
`apps/backend/src/routes/__tests__/production-remediation.test.ts`) and
`RAILWAY_DEPLOY_FIX.md`. `--replace-text` rewrites the **working tree at HEAD** as well as
history, so a naive purge silently replaces both entries with `***REMOVED***`, the `Set`
collapses to one useless entry, and the guard stops rejecting the leaked keys.

Before purging, change that denylist to hold **SHA-256 hashes** of the burned values
instead of the values themselves, and update the two test files to match. Then the purge
has nothing to hit in HEAD and the guard survives it.

### 2.1 Install the tool

```bash
pipx install git-filter-repo     # or: pip install --user git-filter-repo
git filter-repo --version
```

### 2.2 Work on a fresh clone

`git-filter-repo` refuses to run in a repo that is not a fresh clone, because the fresh
clone *is* your backup. Do not defeat that check with `--force` — make the fresh clone.

```bash
cd ..
git clone https://github.com/Fares-ag/carflowing.git carflowing-purge
cd carflowing-purge
```

### 2.3 Build the replacements file — OUTSIDE the repo

The replacements file contains the secrets in cleartext. It must live outside any git
working tree and be deleted afterwards.

Format (`--replace-text`): one expression per line. Each is treated as literal text unless
prefixed with `regex:` or `glob:`. `==>` gives the replacement; without it the replacement
is `***REMOVED***`.

```
# ~/carflow-secret-replacements.txt   (NEVER commit this file)
literal:<sandbox client id>==>***REMOVED-SKIPCASH-SANDBOX-CLIENT-ID***
literal:<sandbox key id>==>***REMOVED-SKIPCASH-SANDBOX-KEY-ID***
literal:<sandbox webhook key>==>***REMOVED-SKIPCASH-SANDBOX-WEBHOOK-KEY***
literal:<production client id>==>***REMOVED-SKIPCASH-PROD-CLIENT-ID***
literal:<production key id>==>***REMOVED-SKIPCASH-PROD-KEY-ID***
literal:<production webhook key>==>***REMOVED-SKIPCASH-PROD-WEBHOOK-KEY***
```

Fill the six `<...>` placeholders from commit `3094da1`:

```bash
git show 3094da1:docs/PRODUCTION_READINESS.md | grep -E 'SKIPCASH_(CLIENT_ID|KEY_ID|WEBHOOK_KEY)'
```

A catch-all alternative, if you would rather not enumerate ids — this also scrubs any GUID
assigned to a SkipCash variable that we have not spotted:

```
regex:(SKIPCASH_(?:CLIENT_ID|KEY_ID|KEY_SECRET|WEBHOOK_KEY)\s*[=:]\s*`?)[0-9A-Fa-f-]{16,}==>\1***REMOVED***
```

### 2.4 Run the rewrite

```bash
git filter-repo \
  --replace-text ~/carflow-secret-replacements.txt \
  --sensitive-data-removal
```

- `--replace-text <file>` — the substitutions above.
- `--sensitive-data-removal` — tells `git-filter-repo` this rewrite exists to remove
  sensitive data. It gathers the extra information needed for cleanup and prints the hash
  of the **first changed commit**, which §4 uses to verify, plus instructions for cleaning
  up other copies.
- Do **not** add `--partial` or `--refs`: both leave a mixture of old and new history, and
  `--refs` skips exactly the refs you are trying to clean.
- `--force` only if you truly cannot use a fresh clone. It skips the safety check and
  immediately prunes reflogs and old objects — irreversible.

`git-filter-repo` removes the `origin` remote on purpose, so that a stray `git pull` cannot
merge the old history back in.

Then delete the replacements file: `shred -u ~/carflow-secret-replacements.txt` (or
`Remove-Item` on Windows).

---

## 3. Force-push — and what it costs

```bash
git remote add origin https://github.com/Fares-ag/carflowing.git
git push --force --mirror origin
```

If the forge refuses some refs (protected `main`, `refs/pull/*`), unprotect `main`
temporarily and fall back to:

```bash
git push --force --all origin
git push --force --tags origin
```

**Consequences — tell every collaborator before you do this:**

- **Every existing clone is broken.** Commit IDs all change. Anyone who runs
  `git pull` afterwards merges the un-rewritten history straight back in and undoes the
  purge. The only safe instruction is: *delete your clone and re-clone*.
- **Open pull requests are invalidated.** They point at commits that no longer exist on
  any branch. Expect to close and reopen them from re-created branches.
- **`refs/pull/*` and forks keep the old objects.** Those refs are server-side; your push
  does not rewrite them, and GitHub will not garbage-collect on its own. Delete every fork
  and then open a GitHub Support ticket asking them to purge the cached views and run GC.
  Until they do, the old commit is still fetchable by SHA.
- CI caches, release artifacts, deploy tags and anything that pinned a SHA all break.
- This is precisely why §1 comes first: none of the above actually un-leaks the value.

---

## 4. Verify the values are gone from all refs

In the rewritten clone:

```bash
# 1. The first changed commit must no longer exist. A "fatal" here is SUCCESS.
git cat-file -t <HASH_OF_FIRST_CHANGED_COMMIT>   # printed by --sensitive-data-removal

# 2. No blob on any ref contains a leaked value (expect no output).
git rev-list --all | xargs git grep -l '<leaked value>' ; echo "exit=$?"

# 3. Nothing in any commit's content history introduces it (expect no output).
git log --all --oneline -S'<leaked value>'
```

Then, against the forge, from a **brand-new clone**:

```bash
cd /tmp && git clone https://github.com/Fares-ag/carflowing.git verify && cd verify
git rev-list --all | xargs git grep -l '<leaked value>' ; echo "exit=$?"

# The pre-rewrite commit must 404. While this returns 200, the old blob is still served.
curl -s -o /dev/null -w '%{http_code}\n' \
  https://api.github.com/repos/Fares-ag/carflowing/commits/3094da106ef2e33a60ca34c2ad6ddbfc6f670600
```

Finally, re-run the repo's own gate:

```bash
bash scripts/scan-secrets.sh
```

A clean local history plus a `200` from that API call means GitHub is still serving the old
object: keep the support ticket open until it 404s.

---

## 5. Alternative: make the repository private and treat every value as burned

Rewriting public history is loud, breaks every clone, and — as §3 explains — does not
recover the secret. The cheaper, lower-risk path:

1. GitHub → Settings → *Change repository visibility* → **Private**. Delete every fork
   first; forks of a public repo do not follow it into private, and each fork keeps the
   whole old history.
2. Treat all six SkipCash values, the seed admin password, and anything else in §1c as
   **permanently burned**. Rotate them (§1) and never reuse them.
3. Leave history as it is. Keep the `COMPROMISED_SKIPCASH_VALUES` denylist (§2.0) in place
   forever, so a burned key can never be re-introduced by an operator copying an old doc.
4. Enable GitHub secret scanning + push protection so the next one is blocked at push time,
   and keep `secret-scan` (`scripts/scan-secrets.sh`) green in CI.

**Recommendation:** do §1 today, do §5 today, and schedule §2–§4 for a planned maintenance
window when no PR is open. The purge is hygiene; the rotation is the fix.
