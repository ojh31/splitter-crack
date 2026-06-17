# splitter

A tiny bill-splitting app for roommates. Create a group, share the invite link,
log shared expenses, and get the minimal set of "who pays whom" to settle up.
No passwords — identity is a per-member sign-in link.

Stack: SvelteKit (adapter-node) + Drizzle ORM + Postgres. Deploys as a single
Railway service.

## How it works

- **Create a group** → you become the first member and get logged in.
- **Invite link** (`/join/:inviteToken`) → anyone with it joins by picking a name.
- **Personal sign-in link** (`/login/:loginToken`) → open it on another device to
  log in as yourself. Treat it like a password.
- **Add expenses** with equal splits; amounts stored as integer cents.
- **Settle up** uses net balances + greedy debt simplification so the group
  clears in the fewest transfers.
- **Weekly reminders** (opt-in) → add your email on the home page and a Monday
  job emails you what you owe / are owed across your groups.

See [BACKLOG.md](BACKLOG.md) for deferred features (multi-currency, recurring
bills, real accounts, etc.).

## Local development

Requires Node 20+ and a Postgres. Quick throwaway DB via Docker:

```bash
docker run -d --rm --name splitter-pg \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=splitter \
  -p 5544:5432 postgres:16-alpine
```

Then:

```bash
cp .env.example .env          # set DATABASE_URL + AUTH_SECRET
npm install
npm run db:migrate            # apply migrations
npm run dev                   # http://localhost:5173
```

For the Docker DB above, use:
`DATABASE_URL=postgres://postgres:dev@localhost:5544/splitter`

### Changing the schema

Edit `src/lib/server/db/schema.js`, then:

```bash
npm run db:generate           # writes a new migration to ./drizzle
npm run db:migrate            # applies it
```

Commit the generated migration files.

## Deploy to Railway

1. Push this repo to GitHub and create a Railway project from it.
2. Add the **Postgres** plugin to the project.
3. In the app service **Variables**, set:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference the plugin)
   - `AUTH_SECRET` = output of `openssl rand -hex 32`
   - `ORIGIN` = your public URL, e.g. `https://<app>.up.railway.app`
   - `NODE_ENV` = `production`
4. Deploy. [railway.json](railway.json) runs `npm run db:migrate` before starting,
   so migrations apply automatically on each release. The build (`npm run build`)
   and start (`node build`) are handled by Nixpacks + adapter-node, which listens
   on Railway's injected `PORT`.

> `ORIGIN` is required in production: adapter-node runs behind Railway's HTTPS
> proxy, and SvelteKit rejects cross-site form POSTs unless it knows the real
> origin.

## Weekly email reminders

Users opt in by saving an email on the home page (clearing it unsubscribes).
A standalone job sends the digest:

```bash
npm run reminders:weekly
```

It reuses the same balance math as the app and only emails users who have an
outstanding balance somewhere — settled users get nothing. Without an email
provider configured it runs read-only and just logs, which is handy for a dry run.

Mail is sent through [Brevo's](https://www.brevo.com) HTTP API rather than SMTP:
Railway blocks outbound SMTP ports, but Brevo's REST API is plain HTTPS, and its
free tier (300 emails/day) lets you send from a single **verified sender** with
no domain or DNS setup. To send for real, set these variables (see
[.env.example](.env.example)):

- `BREVO_API_KEY` — from [app.brevo.com/settings/keys/api](https://app.brevo.com/settings/keys/api)
- `EMAIL_FROM` — the sender, e.g. `Splitter <you@gmail.com>`. Verify this address
  first at [app.brevo.com/senders](https://app.brevo.com/senders) (one-click email
  confirmation — no domain needed).

### Scheduling on Railway

Add a **second service** in the same Railway project, pointed at this repo, with:

- **Cron Schedule**: `0 9 * * 1` (Mondays 09:00 UTC)
- **Start Command**: `npm run reminders:weekly`
- the same `DATABASE_URL` and `ORIGIN` as the web service, plus `BREVO_API_KEY`
  and `EMAIL_FROM`.
- **Config file**: point this service at [railway.cron.json](railway.cron.json)
  (Settings → Config-as-code) so it skips the SvelteKit build and runs the script.

Railway runs a cron service's start command on the schedule and lets it exit, so
the script runs once per week and stops — no long-running process.
