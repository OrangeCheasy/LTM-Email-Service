# LTM Email Service Setup Status

This file tracks the infrastructure assumptions required by `main`.

## Production infrastructure

- Worker: `ltm-email-service`
- Custom domain: `email.liamthemo.com`
- Primary address: `contact@liamthemo.com`
- D1 binding: `DB` -> `ltm-email-service`
- R2 binding: `MAIL` -> `ltm-email-service-mail`
- Outbound email binding: `EMAIL`
- Frontend/static asset binding: `ASSETS`

## Deployment

Cloudflare may build/deploy the Worker from `main` using:

```text
npm run build
npx wrangler deploy
```

The GitHub production workflow remains gated by the repository variable `CLOUDFLARE_READY=true`. When enabled, it builds, applies remote D1 migrations, then deploys with Wrangler using `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` repository secrets.

## Verification

After deployment, `GET /api/health` should report both D1 and R2 bindings as available. The initial D1 migration must be applied before inbound email storage is expected to work.
