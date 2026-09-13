# LTM Email Service

Private webmail for `contact@liamthemo.com`, deployed to Cloudflare at `email.liamthemo.com`.

## Architecture

- **React + TypeScript + Vite** — private webmail UI
- **Cloudflare Workers** — HTTP API and inbound `email()` handler
- **Cloudflare Workers Static Assets** — frontend hosting
- **Cloudflare D1** — message metadata, threads, state, drafts, and sent records
- **Cloudflare R2** — original RFC822/MIME messages and attachments
- **Cloudflare Email Routing** — inbound mail for `contact@liamthemo.com`
- **Cloudflare Email Service** — outbound mail from `contact@liamthemo.com`
- **Cloudflare Access** — authentication in front of the private app
- **GitHub Actions** — CI and production deployment from `main`

## Project status

This repository currently contains the v0.1 foundation: Cloudflare/Vite configuration, database schema, inbound email persistence, the API shell, responsive UI shell, and GitHub Actions. Mailbox features will be implemented incrementally on top of this base.

## Local setup

Requirements:

- Node.js 22+
- A Cloudflare account with Workers
- Email Routing enabled for `liamthemo.com`
- `contact@liamthemo.com` available to route to the Worker
- The `liamthemo.com` domain onboarded to Cloudflare Email Service for outbound sending

Install dependencies:

```bash
npm install
```

Create the production resources once:

```bash
npx wrangler d1 create ltm-email-service
npx wrangler r2 bucket create ltm-email-service-mail
```

Replace the placeholder D1 `database_id` in `wrangler.jsonc` with the ID returned by Cloudflare, then apply the schema:

```bash
npm run db:migrate:remote
```

For local development:

```bash
npm run db:migrate:local
npm run dev
```

## Cloudflare configuration still required

1. Point `email.liamthemo.com` at this Worker as a Worker custom domain.
2. Protect the Worker/application with Cloudflare Access and allow only the intended account.
3. Route `contact@liamthemo.com` to this Worker's `email()` handler.
4. Optionally set `FORWARD_TO` in `wrangler.jsonc` to an existing verified inbox to retain a forwarded copy of incoming mail.
5. Confirm the Email Service sending domain and `contact@liamthemo.com` sender are active.
6. Replace the placeholder D1 ID before enabling production deployment.

## GitHub Actions deployment

Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

After Cloudflare resources are configured, set the repository Actions variable `CLOUDFLARE_READY=true`. Pushes to `main` will then deploy automatically. Until that variable is enabled, CI still builds/type-checks the project but deployment is intentionally skipped.

## Security baseline

- Cloudflare Access is the authentication boundary; no custom password database is planned.
- Outbound email binding is restricted to `contact@liamthemo.com`.
- Raw inbound messages are preserved in R2.
- Email HTML will be sanitized before rendering and remote images will be blocked by default when the reader UI is implemented.
- Secrets stay in Cloudflare/GitHub secret storage and must not be committed.

## Planned v0.1 mailbox scope

Inbox, sent, archive, trash, reader, compose/reply, correct email threading, HTML/text bodies, attachments, read/unread state, search, responsive UI, sent-message persistence, optional inbound forwarding, and basic delivery/error state.
