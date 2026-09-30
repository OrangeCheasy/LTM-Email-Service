# LTM Email Service

A private, production webmail application developed and operated by Sanghyuk Mo.

> **Source-visible, not open source.** This repository is publicly viewable for portfolio, evaluation, and security-review purposes only. No permission is granted to use, copy, modify, run, deploy, redistribute, sublicense, sell, or create derivative works from this project. See [`LICENSE`](./LICENSE).

The production mailbox, credentials, stored email, connected accounts, and infrastructure remain private and are not part of this repository.

## Overview

LTM Email Service is a full-stack webmail application built around a private mailbox with optional connected Gmail accounts. It provides a responsive desktop/mobile mail client, authenticated API, inbound and outbound email processing, attachment handling, push notifications, and provider integrations.

## Architecture

- **React + TypeScript + Vite** — responsive webmail client
- **Cloudflare Workers** — API, authentication, inbound email handling, and provider integrations
- **Cloudflare Workers Static Assets** — frontend hosting
- **Cloudflare D1** — mail metadata/state, drafts, connected accounts, passkeys, sessions, and push subscriptions
- **Cloudflare R2** — raw RFC822/MIME messages, attachments, and profile assets
- **Cloudflare Email Routing / Email Service** — native inbound and outbound mail
- **WebAuthn / passkeys** — application authentication with server-side session state
- **Gmail API** — optional connected Gmail inboxes and sending accounts
- **Web Push / VAPID** — browser push notifications
- **GitHub Actions** — validation and security checks on version branches
- **Cloudflare Workers Builds + Wrangler** — production deployment from `main`

## Implemented features

The application currently includes:

- inbox, junk, starred, sent, drafts, archive, and trash folders; Junk displays messages Gmail currently labels as Spam for connected Gmail accounts
- native mailbox plus connected Gmail accounts
- account-aware compose/send
- reply and forward flows with threading metadata
- draft autosave
- read/unread, star, archive, and trash mutations
- search and automatic mailbox refresh
- attachment download and preview support
- sanitized rich HTML email rendering
- remote tracking-image blocking by default
- passkey setup/login and session management
- optional profile photo
- browser push notifications
- responsive mobile/PWA UI

## Security model

Repository visibility is **not** used as a security boundary. Production security depends on authenticated server-side controls and secret storage outside Git.

The current security model includes:

- WebAuthn/passkey authentication with required user verification
- secure, HTTP-only, same-site session cookies
- hashed server-side session tokens
- expiring, single-use authentication challenges
- authentication rate limiting
- same-origin checks for state-changing API requests
- restrictive API and attachment response headers
- sanitized inbound HTML with dangerous markup removed
- remote tracking images blocked by default
- provider OAuth credentials encrypted at rest
- outbound native sending restricted to the configured mailbox
- production credentials and cryptographic secrets supplied through protected runtime/CI secret stores rather than committed source
- production D1 identifiers resolved from the currently deployed Worker binding during authenticated deployment instead of being stored in the repository
- automated Gitleaks scanning across fetched branch/tag history on pull requests and major branches
- automated historical path auditing for accidentally committed environment files, mailbox exports, local databases, private-key files, and backup artifacts

No production mailbox contents, OAuth tokens, passkeys, session tokens, private cryptographic keys, API credentials, production database identifiers, mailbox exports, or local production database files are intended to be committed to this repository.

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
scripts/                    build/asset and deployment helper scripts
.github/workflows/          version-branch validation and security scanning
```

## Development and deployment

This repository reflects the source for a private production service. Runtime infrastructure, account configuration, credentials, and production-only values are managed separately from source control.

GitHub Actions run validation and full-history security checks only for pushes to version branches (`vX.XX`) and pull requests targeting those branches. They do not run on `main`.

Cloudflare Workers Builds is the only production deployment path. Its current `npm run build` and `npx wrangler deploy` commands are supported. The build hydrates the production D1 ID and applies remote migrations only for a Cloudflare production build on `main`. Recommended commands, with an additional deploy preflight, are:

- Build command: `npm run build:cloudflare`
- Deploy command: `npm run deploy`
- Production branch: `main`
- Build variables/secrets: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (secret)

The build resolves the production D1 binding from the deployed Worker before bundling, so the database ID stays out of source control. On preview branches, production binding hydration and migrations are skipped. The `npm run deploy` command refuses to run outside Cloudflare Workers Builds on `main`, verifies the generated config, applies D1 migrations, and deploys the Worker. Give the API token Workers Scripts read/edit and D1 edit access. Keep the preview command set to `npx wrangler preview`.

## Security reports

If you believe you have found a security vulnerability, **do not publish exploit details in a public issue**. Follow the private reporting instructions in [`SECURITY.md`](./SECURITY.md).

## License

**All rights reserved. No use is permitted.**

This project is proprietary source code made publicly visible for portfolio, evaluation, and security-review purposes. Public availability does **not** make this software open source and does not grant permission to use the software or its source code.

See [`LICENSE`](./LICENSE) for the complete terms.
