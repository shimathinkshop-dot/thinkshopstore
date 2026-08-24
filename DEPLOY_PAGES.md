# ThinkShop — Cloudflare Pages Git Deployment

## Critical fix
This repository is a **Cloudflare Pages** Git project. A root `worker.js` is NOT automatically a Pages Function just because it exists in the repository.

This package adds:
`functions/api/[[path]].js`

That catch-all Pages Function routes `/api/*` requests into the same `worker.js` logic.

## GitHub files
Keep:
- index.html
- worker.js
- functions/api/[[path]].js
- schema.sql
- admin.html
- login.js
- settings.js
- products.js

## Cloudflare Pages
1. Push these files to the GitHub repository connected to the TEST Pages project.
2. Let Pages deploy.
3. Make sure the Pages project has the D1 binding named `DB` available to Functions.
4. Keep `ADMIN_PASSWORD` and `ADMIN_TOKEN` as environment variables/secrets.
5. Do not delete the old production site.

## Diagnostic
Open:
`https://thinkshopstore.ir/api/health`

Expected JSON, not the homepage.

If it still shows the homepage, the Pages project is not deploying the `functions/` directory or the domain is pointing at a different project.

## D1
Run the final schema migration on the same D1 database bound as `DB` before testing registration/cart/orders.

## Important
Do NOT run schema repeatedly if it has already succeeded; the statements are mostly IF NOT EXISTS, but the correct database must be used.
