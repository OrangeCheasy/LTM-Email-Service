# LTM Email Service

Private webmail for `contact@liamthemo.com`, deployed at `email.liamthemo.com`.

## Current architecture

- **React + TypeScript + Vite** — responsive webmail client
- **Cloudflare Workers** — API, authentication, inbound email handling, and provider integrations
- **Cloudflare Workers Static Assets** — frontend hosting
- **Cloudflare D1** — mail metadata/state, drafts, connected accounts, passkeys, sessions, and push subscriptions
- **Cloudflare R2** — raw RFC822/MIME messages, attachments, and profile assets
- **Cloudflare Email Routing** — inbound mail for `contact@liamthemo.com`
- **Cloudflare Email Service** — outbound mail for the native LTM mailbox
- **WebAuthn/passkeys** — private application authentication with D1-backed sessions
- **Gmail API** — optional connected Gmail inboxes and sending accounts
- **Web Push / VAPID** — browser push notifications
- **GitHub Actions + Wrangler** — validation and production deployment

## Implemented mailbox features

The app currently includes:

- inbox, starred, sent, drafts, archive, and trash folders
- native `contact@liamthemo.com` mailbox plus connected Gmail accounts
- account-aware compose/send
- reply and forward flows with threading metadata
- draft autosave
- read/unread, star, archive, and trash mutations
- search and automatic mailbox refresh
- attachment download/preview support
- sanitized rich HTML email rendering
- blocked remote tracking images by default
- passkey setup/login and session management
- optional profile photo
- browser push notifications
- responsive mobile/PWA UI

## Local development

Requirements:

- Node.js 22+
- a Cloudflare account with Workers, D1, R2, Email Routing, and Email Service configured

Install dependencies:

```bash
npm ci
```

Apply local migrations and start Vite:

```bash
npm run db:migrate:local
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm run build
npm run cf-typegen
npm run db:migrate:remote
```

## Cloudflare resources

`wrangler.jsonc` expects these bindings:

- `DB` — D1 database `ltm-email-service`
- `MAIL` — R2 bucket `ltm-email-service-mail`
- `EMAIL` — outbound Email Service binding restricted to `contact@liamthemo.com`
- `ASSETS` — Workers Static Assets

Runtime variables include:

- `PRIMARY_ADDRESS=contact@liamthemo.com`
- `FORWARD_TO` — optional verified forwarding destination

## Secrets and private configuration

Configure sensitive values with Cloudflare secrets rather than committing them:

- `AUTH_SETUP_TOKEN` — initial passkey setup authorization
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — push notifications
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Gmail OAuth
- `PROVIDER_CREDENTIAL_KEY` — 32-byte base64url key used to encrypt provider credentials at rest

GitHub Actions production deployment also requires:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Authentication

The app uses its own WebAuthn/passkey authentication layer rather than Cloudflare Access.

Passkeys are stored in D1 as public-key credentials. Successful authentication creates a secure, HTTP-only, same-site session cookie backed by a hashed session token in D1. Session and registration/login challenges are automatically expired and cleaned up.

The initial passkey is registered using `AUTH_SETUP_TOKEN`. Once at least one passkey exists, additional passkeys require an authenticated session.

## Email security

- outbound native sending is restricted to `contact@liamthemo.com`
- raw inbound messages are preserved in R2
- inbound HTML is sanitized before rendering
- dangerous markup is removed and remote tracking images are blocked by default
- attachments are served with restrictive content/security headers
- API responses are `private, no-store` and protected by same-origin checks
- provider OAuth credentials are encrypted before storage

## CI and deployment

Pull requests run the development validation workflow, which:

1. installs dependencies with `npm ci`
2. generates and validates the browser favicon
3. runs TypeScript checks
4. builds the application

Pushes to `v1.02` also run validation.

Production deployment runs **only** on pushes to `main`. The production workflow builds the app, applies remote D1 migrations, and deploys the Worker through Wrangler.

## Repository structure

```text
src/client/                 React client and UI
src/client/components/      reusable UI components
src/worker/                 Cloudflare Worker entry point and shared server logic
src/worker/api/             authenticated API handlers
src/worker/email/           inbound/outbound email processing
src/worker/providers/       native/Gmail provider abstraction and OAuth helpers
migrations/                 D1 schema migrations
public/                     PWA/static assets
scripts/                    build/asset helper scripts
.github/workflows/          validation and production deployment
```

## Production verification

After deployment:

- the passkey screen should load at `email.liamthemo.com`
- `GET /api/health` should report the configured D1/R2 bindings after authentication
- native inbound/outbound mail and any connected Gmail account should be validated manually after changes that touch those paths
