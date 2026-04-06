# Supabase Integration Guide

This guide walks you through connecting CarFlow to Supabase for auth, database, storage, and (optionally) edge functions.

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Choose your organization, name the project (e.g. `carflow`), set a database password, and select a region
4. Wait for the project to be provisioned

## 2. Get Your Credentials

1. In the Supabase dashboard, go to **Settings** → **API**
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

## 3. Configure Environment Variables

1. Copy `.env.example` to `.env` in the project root:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   VITE_USE_MOCK_API=false
   ```

> **Note:** All three apps (admin, customer, dealer) read these vars. Place `.env` at the monorepo root.

## 4. Run Database Migrations

In the Supabase dashboard, open **SQL Editor** and run the following **in order**:

### 4.1 Schema (tables, enums, storage buckets)

Run the entire contents of `supabase/schema.sql`.

### 4.2 Auth Trigger (auto-create profile on signup)

Run the entire contents of `supabase/trigger.sql`.

This creates a trigger so that when a user signs up via Supabase Auth, a row is automatically inserted into `profiles` with `role = 'customer'` by default.

### 4.3 Row Level Security (RLS)

Run the entire contents of `supabase/rls.sql`.

### 4.4 Storage Policies (for vehicle image uploads)

Run `supabase/migrations/storage_policies.sql` to allow authenticated users to upload images to the `vehicle-images` bucket.

## 5. Create Auth Users

You can create users in two ways:

### Option A: Supabase Dashboard (recommended for initial setup)

1. Go to **Authentication** → **Users** → **Add user**
2. Enter email and password
3. Create users for testing, e.g.:
   - `admin@carflow.dev` (password: your choice)
   - `dealer@carflow.dev`
   - `customer@carflow.dev`

4. After creating users, run `supabase/seed.sql` in the SQL Editor to:
   - Set roles (admin/dealer/customer) for those emails
   - Create a starter plan
   - Create a dealer record linked to the dealer user

### Option B: Sign up from the app (customer)

If your app has a sign-up form, new users will get a profile automatically via the trigger (with `role = 'customer'`). No manual seed needed for them.

## 6. Seed Data (Optional)

Run `supabase/seed.sql` to:

- Assign roles to existing auth users (admin, dealer, customer)
- Create a starter plan
- Create a dealer record for the dealer user

**Important:** The seed expects auth users with emails `admin@carflow.dev`, `dealer@carflow.dev`, `customer@carflow.dev`. Create those first in **Authentication** → **Users**.

## 7. Verify the Setup

1. Start the apps:
   ```bash
   npm run dev
   ```

2. **Customer app** (http://localhost:5173):
   - Browse cars (works without login; reads from `vehicles`)
   - Log in with `customer@carflow.dev` / your password
   - Add to favorites, create a booking request

3. **Admin app** (http://localhost:5174):
   - Log in with `admin@carflow.dev`

4. **Dealer app** (http://localhost:5175):
   - Log in with `dealer@carflow.dev`

## 8. Common Issues

### " profiles" relation does not exist

- Ensure `supabase/schema.sql` was run completely before `trigger.sql` and `rls.sql`.

### Login fails / "Unable to load profile"

- The user has no row in `profiles`. Either:
  - Run the auth trigger (`supabase/trigger.sql`) so new signups get a profile, or
  - For existing users, run the seed or manually insert into `profiles`:
    ```sql
    insert into profiles (id, email, name, role, status)
    select id, email, split_part(email, '@', 1), 'customer', 'active'
    from auth.users where email = 'your-user@example.com'
    on conflict (id) do nothing;
    ```

### RLS policy violations

- Check that the logged-in user has a profile with the correct `role`.
- Policies use `auth.uid()` and `profiles.role`; missing or wrong profiles will block access.

### Env vars not loading

- Ensure `.env` is at the monorepo root.
- Restart the dev server after changing `.env`.

## 9. Local Development with Supabase CLI (Optional)

To run Supabase locally:

```bash
npx supabase init
npx supabase start
```

Then link to your project or use local credentials. See [Supabase local development](https://supabase.com/docs/guides/cli/local-development).
