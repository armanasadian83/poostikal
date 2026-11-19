# Raboteb product import

Open `/admin/raboteb` in Poostikal. Upload a WooCommerce product CSV containing all columns and variations. The initial import includes only published, in-stock parent products, with their published variations. Existing manual products are left alone.

The importer preserves descriptions, short descriptions, attributes, categories, brand (including the brand attribute fallback), prices, sale dates, variations, and gallery/variation images. Images are downloaded from Raboteb's uploads directory, converted to WebP, and stored in Poostikal's media library. CSV exports do not provide image alt text, so the product name is the initial alt text; it can be edited in Poostikal.

Blank stock means the source does not provide a tracked quantity. It stays `null`, distinct from zero. A missing price is displayed as “contact for price” and cannot be added to the cart. Currency values use Raboteb's تومان unit, with no markup or exchange conversion.

## Optional automatic updates

Automatic updates are disabled until a WooCommerce read-only key is configured. In Raboteb, open **WooCommerce → Settings → Advanced → REST API**, add a key named `Poostikal catalog sync`, choose **Read**, and copy its Consumer Key and Consumer Secret into **Poostikal → Admin → Raboteb sync → Secure connection** (`/admin/raboteb`). The backend tests product access and the source currency before saving. An invalid replacement leaves the existing connection intact. Logging out of either admin or closing the browser does not stop the server worker.

For admin-managed credentials, generate the server encryption key once: from `backend`, run `node scripts/setup-supplier-key.mjs`, then restart the API. Credentials are stored with AES-256-GCM encryption in PostgreSQL and never returned to the frontend. Keep `SUPPLIER_ENCRYPTION_KEY` in the server environment, separate from database backups. When moving to a VPS, securely transfer this same encryption key and restore the database; do not generate a replacement for an existing encrypted connection. Alternatively, `RABOTEB_CONSUMER_KEY` and `RABOTEB_CONSUMER_SECRET` in `backend/.env` are supported. Admin-saved credentials take precedence. Never put any of these secrets in `NEXT_PUBLIC` variables or commit them.

The optional `RABOTEB_PROXY_URL` is only for computers that require an outgoing proxy; leave it empty on a VPS with direct HTTPS access. Keep the Nest API running under systemd, PM2, or another process supervisor with automatic restart. The worker runs inside Nest, independently of WordPress login cookies; no browser or cron is required. Admin can pause future automatic checks and resume them. A running job completes before a pause takes effect.

The server checks the full Raboteb catalog every 24 hours and imports newly published, in-stock products with their images and details. Between catalog checks it fetches linked product IDs every 15 minutes for price, stock, and variation updates. The schedule uses job history in PostgreSQL, so an overdue check runs when the backend resumes. A failed catalog check retries after one hour. The admin page shows the next catalog check and each job’s outcome. **همگام‌سازی همین حالا** runs a full catalog check immediately.

The worker reads WooCommerce REST v3 products, variations, and general settings to verify currency. IRT amounts are already تومان and IRR amounts are divided by ten. Unsupported currency or fractional-toman amounts fail safely.

Existing linked products receive price, discount, availability, quantity, and variation updates. Local names, descriptions, categories, image galleries, and animation settings are preserved during scheduled commercial updates. Newly published in-stock source products are imported fully. Deleted or unavailable source products become unavailable locally only after a successful complete source inventory fetch.

Raboteb is the authoritative editor for the linked product’s prices, discounts, stock, status, and variants. The Poostikal editor enforces this on the server and retains its local editorial fields. The worker skips source IDs excluded by Poostikal’s trash handling.

Poostikal calculates available inventory from the latest Raboteb quantities and its own active order allocations. Raboteb sales and catalog edits appear in Poostikal on the next successful sync.

## Reliability and operations

Jobs are stored in PostgreSQL and resumed after backend restarts. An advisory lock ensures only one worker runs, with up to three products processed concurrently. Checkpoints are saved after each batch; replaying an unfinished batch does not create duplicates. Media URLs are cached and content hashes avoid repeated storage. Network requests are bounded and retried; failures appear in the admin history. Reupload the same export to retry a partial initial import.

Transient connection failures and HTTP 408/429/500/502/503/504 responses are retried up to four attempts per request, with 1/2/4-second backoff. Retry-After can extend the delay up to 30 seconds. Each attempt has a 30-second overall timeout and a 20-second connection timeout. Authentication failures, certificate errors, invalid data, and size-limit violations fail without repeated requests. Do not disable TLS verification to work around connection errors.

The settings page shows the current phase (connection/currency, catalog pages, variations, or applying updates), retries, and the last fully successful synchronization. A running job with no product count is still fetching source data. A failed job with zero processed products has not changed local prices or stock. Historical failures remain visible; a later successful full sync is identified separately. New failures record safe error codes and attempt counts, without credentials or raw request URLs. Old `fetch failed` entries cannot reveal their original underlying cause retroactively.

When a local outgoing proxy is configured, that proxy must be running on the backend machine. A browser working through another proxy does not establish backend connectivity. After an interruption, the backend resumes a pending job or starts an overdue check. On a VPS, use its working outgoing connection and avoid carrying over a localhost proxy address unless that proxy also runs there.

Only Raboteb upload URLs are accepted for images. Redirects to other locations are rejected, image dimensions and download sizes are limited, and descriptions are sanitized. Backups include supplier mappings, media mappings, and job history. Back up `.env` separately using appropriate secret storage.

Run `npm run db:backup` for a database/media snapshot, and `npm run test:backend` for mapping, price, inventory, idempotency, authentication, and storage checks. Unit and integration checks use isolated databases; they do not modify Raboteb.
