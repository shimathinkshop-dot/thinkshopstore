# ThinkShop — Final Deploy Today

## Files to replace
- `index.html` ← `index_final.html`
- `worker.js` ← `worker.js` in this package
- `schema.sql` ← `schema.sql` in this package

Do NOT delete the existing Admin files (`functions`, `admin.html`, `login.js`, `settings.js`, `products.js`) unless you have a separate reason. The existing Admin product API contract is preserved.

## Before deployment
1. Back up the current D1 database.
2. Run the final `schema.sql` on the SAME D1 database used by the site.
3. Confirm the Worker has D1 binding named `DB`.
4. Keep the existing `ADMIN_PASSWORD` and `ADMIN_TOKEN` secrets.
5. Keep the existing `ASSETS` binding.
6. Commit/push the three files to the GitHub branch connected to Cloudflare Pages.

## Important inventory behavior
Existing products receive stock `0` during schema setup because the old database had no inventory data. Set real stock through Admin/API before expecting checkout to succeed.

## Payment
The payment endpoint is intentionally not fake. Until the real gateway credentials/adapter are supplied, payment stays `unpaid` and the API returns `PAYMENT_GATEWAY_NOT_CONFIGURED`.

## First live test
1. Open the site in an incognito window.
2. Confirm products appear without reload.
3. Register a customer.
4. Login.
5. Add an address.
6. Set stock for a product.
7. Add the product to cart.
8. Create the order.
9. Confirm the order in D1/Admin.
10. Track the order.


## Quick diagnostics after deploy

Open:
`https://YOUR-DOMAIN/api/health`

Expected:
`"ok": true`, `"db": true`, and every table in `"tables"` should be `true`.

If `/api/health` returns HTML or a 404, the Worker is NOT routing API requests on the deployed site. Do not debug the registration form first; fix the Cloudflare Worker/Pages binding/deployment.

If `/api/health` returns a table as `false`, run the final `schema.sql` migration against the SAME D1 database bound as `DB`.
