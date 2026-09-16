# LTM Email Service

Private webmail for `contact@liamthemo.com`, deployed to Cloudflare at `email.liamthemo.com`.

## Architecture

- **React + TypeScript + Vite** — private webmail UI
- **Cloudflare Workers** — HTTP API and inbound `email()` handler
- **Cloudflare Workers Static Assets** — frontend hosting
- **Cloudflare D1** — message metadata, threads, state, drafts, sent records, and authentication state
- **Cloudflare R2** — original RFC822/MIME messages and attachments
- **Cloudflare Email Routing** — inbound mail for `contact@liamthemo.com`
- **Cloudflare Email Service** — outbound mail from `contact@liamthemo.com`
- **Passkeys + trusted-device SMS verification** — private application authentication
- **GitHub Actions** — CI and production deployment from `main`

## Project status

This repository contains the private LTM Mails application and its Cloudflare Worker backend.

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
2. Route `contact@liamthemo.com` to this Worker's `email()` handler.
3. Optionally set `FORWARD_TO` in `wrangler.jsonc` to an existing verified inbox to retain a forwarded copy of incoming mail.
4. Confirm the Email Service sending domain and `contact@liamthemo.com` sender are active.
5. Replace the placeholder D1 ID before enabling production deployment.

## Trusted-device SMS second factor

SMS verification is deliberately disabled unless **all** required backend secrets are present. Never commit the phone number or Twilio credentials to the repository.

Configure these as Cloudflare Worker secrets:

- `TWILIO_API_KEY`
- `TWILIO_API_SECRET`
- `TWILIO_VERIFY_SERVICE_SID`
- `SMS_RECIPIENT_E164` — the private destination number in E.164 format

Once all four are configured, a valid passkey on an unknown browser does **not** create a login session immediately. The backend sends an SMS verification through Twilio Verify, and the session is created only after the code succeeds. Successful verification installs a random HttpOnly trusted-device cookie so that browser does not require SMS on every future passkey login. The trusted-device lifetime is 180 days and the session lifetime remains 7 days.

The phone number and Twilio credentials are read only by the Worker. They are never returned by the API or included in the frontend bundle.

## GitHub Actions deployment

Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Pushes to `main` run the production deployment workflow.

## Security baseline

- Passkey authentication requires user verification.
- Unknown browsers can require a server-side SMS second factor before a session is issued.
- Trusted-browser tokens and session tokens are random, HttpOnly, Secure, SameSite=Strict cookies; only their hashes are stored in D1.
- Authentication endpoints are rate limited.
- Outbound email binding is restricted to `contact@liamthemo.com`.
- Raw inbound messages are preserved in R2.
- Secrets stay in Cloudflare/GitHub secret storage and must not be committed.
