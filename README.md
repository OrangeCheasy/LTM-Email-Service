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
- **GitHub Actions + Wrangler** — validation and controlled production deployment

## Implemented features

The application currently includes:

- inbox, starred, sent, drafts, archive, and trash folders
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
- production D1 identifiers resolved from Cloudflare only during authenticated deployment instead of being stored in the repository
- automated Gitleaks scanning across fetched branch/tag history on pull requests and the current major development branch
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
.github/workflows/          validation, security scanning, and production deployment
```

## Development and deployment

This repository reflects the source for a private production service. Runtime infrastructure, account configuration, credentials, and production-only values are managed separately from source control.

Development validation includes dependency installation, generated-asset validation, TypeScript checks, a production build, and a full-history security audit. The security audit fetches repository branches/tags before scanning so stale refs are included rather than checking only the current working branch. It checks both secret patterns and sensitive historical artifact paths such as environment files, mailbox exports, local databases, key files, and backups.

Production deployment is intentionally isolated from ordinary development branches. Before migrations or deployment, the workflow authenticates to Cloudflare and resolves the configured D1 database by name, hydrating the local deployment config only inside the ephemeral CI workspace.

## Security reports

If you believe you have found a security vulnerability, **do not publish exploit details in a public issue**. Follow the private reporting instructions in [`SECURITY.md`](./SECURITY.md).

## License

**All rights reserved. No use is permitted.**

This project is proprietary source code made publicly visible for portfolio, evaluation, and security-review purposes. Public availability does **not** make this software open source and does not grant permission to use the software or its source code.

See [`LICENSE`](./LICENSE) for the complete terms.
