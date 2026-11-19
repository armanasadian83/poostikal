# Poostikal backend

NestJS + PostgreSQL 18.6. The existing Next.js app proxies `/api/*` to the Nest server. The product catalog, brands, categories, variants, images, animation metadata, admin sessions, customer sessions and settings are persistent. There are no seeded catalog items or fictional orders/customers.

## Run locally

From the project folder:

```powershell
npm install
npm --prefix backend install
npm run dev
```

The first start initializes a local PostgreSQL cluster, a restricted application role and a random admin password. Existing data is never reset by startup. Local URLs:

- Storefront: http://127.0.0.1:7777
- Admin: http://127.0.0.1:7777/admin
- API health: http://127.0.0.1:4000/api/health
- PostgreSQL: 127.0.0.1:55432
- Redis for live stock notifications: 127.0.0.1:56379

Admin email and initial password are in **backend/.env**, under `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Bootstrap only creates the first administrator; changing this variable later does not reset an existing password. Keep this file and `.data/database-secrets.json` private. Neither is tracked by Git.

`npm run dev:web`, `npm run dev:api` and `npm run db:start` run services separately. `npm run build` builds both applications. For production, run `npm --prefix backend start` and `npm start` as separate supervised processes with PostgreSQL already available.

`npm run dev` reuses a running Redis instance on its local port or starts an available executable from `.data/redis-bin/server`, the Windows Memurai installation, or `PATH`. On Windows, install [Memurai Developer](https://www.memurai.com/get-memurai) or put its executable and accompanying files in `.data/redis-bin/server`. Use it for local development only. On Linux or macOS, install a current [Redis](https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/) or Valkey release. The local launcher binds to loopback and does not save data because the broker only transports stock notifications.

To connect a separately managed broker, set `REDIS_URL` in `backend/.env`. Each deployment sharing a broker should have a distinct `REDIS_NAMESPACE`. In production, use a supervised Redis service on a private network and prefer a `rediss://` URL with application credentials if the service is on a separate host. Store the URL as a backend secret. Production reverse proxies must pass through server-sent events from `/api/customer/stock-events` without response buffering or caching and allow the connection's periodic keep-alives. PostgreSQL remains the authority for stored baskets, stock, and orders. A temporary Redis disconnect can delay notifications while the app falls back to checking the database.

Each API process opens one PostgreSQL session for change notifications. Give that connection a direct or session-pooled database endpoint so `LISTEN` persists between transactions. Browsers recheck the basket after a stock event, on reconnect, and periodically while visible. Basket expiry is enforced on reads and checkout, 24 hours after the last successful edit. Baskets do not reserve stock.

## Data and files

- PostgreSQL local files: `.data/postgres` (do not edit or copy while running).
- Uploaded assets: `.data/media`; metadata lives in PostgreSQL.
- Images are decoded, oriented, stripped of metadata, bounded to 2400 pixels, and stored as WebP with transparency preserved.
- Images, variants, alt text, descriptions, product attributes and animation references are saved in a transaction. Price/stock fields and relational columns have database constraints and indexes. Product edits use versions to reject stale writes.
- Product and brand/category deletion checks foreign key dependencies. Do not use catalog deletion to delete historic order details.
- Public products are paginated, with a maximum of 100 per request. Drafts are private. Admin lists fetch bounded pages; the current UI aggregates these pages for its local filtering.
- Files are immutable URLs. Unreferenced uploads are retained rather than risking deletion of a file still in use; monitor storage and add a retention policy before a large import.

## Animation workflow

Admin → Add/edit product → انیمیشن now runs the complete **template-based unboxing** pipeline:

1. Upload closed/open/product/alternate-angle reference photos, with alt text and descriptions.
2. Choose dropper, pump, jar + carton, or **flat pouch + side-opening carton**. Enter dimensions in mm (defaults are shown). Select the four corners of the carton front and bottle label (or full pouch face), choose their source photo, and match the material/colors. Photos with hands can be used when hands stay outside these print selections. The pouch template includes left/right opening, pouch width/height/thickness, a hinged side flap, and continuous sideways extraction followed by settling alongside the carton. Switching between bottle and pouch shapes resets their incompatible dimensions and material defaults.
3. **ساخت انیمیشن محصول** uploads pending images and calls authenticated, same-origin POST /api/admin/animations/prepare. The server validates references and fit, rectifies perspective, and saves lossless WebP print textures. Low-resolution selections produce quality warnings. Nothing is sent to an external AI service.
4. Preview the actual product's generated geometry, texture and motion. Play/pause or scrub in either direction, confirm the result, then publish. The storefront loads the same renderer lazily, with scroll controlling its exact pose. The scene has no autonomous playback, frame swaps, or visible playback bars. Only the selected print surfaces are used; the rest of each photograph is excluded.

Builds are immutable, versioned records in animation_builds with a configuration fingerprint. Identical requests reuse the existing build. At most two preparations run concurrently per API process; duplicate requests share a job, requests are rate-limited, and processing yields periodically. Failed builds clean up their output files. Texture URLs are verified against the saved build on product save; changes require a rebuild and renewed review. Backups include builds and texture media. Animation reference images retain their original resolution (up to the upload/pixel limits) and are stored as lossless WebP without metadata; they remain available for later editing.

This reuses the original CAFFEINA animation/lighting approach; it is **not arbitrary 3D reconstruction from four photographs**. The selected template supplies the geometry and unseen plain surfaces; uploaded photos supply the actual printing. Photo sharpness, accurate crops and dimensions determine fidelity. For unusual packaging or exact custom geometry, upload an externally prepared animated GLB or MP4 in the advanced section and review it before publishing. Animated GLB files share their pose renderer between admin preview and storefront; MP4 quality during scroll depends on the video's keyframe spacing. WebGL-unavailable devices fall back to the reference image; reduced-motion users see the final static pose.



## OpenRouter

Set `OPENROUTER_API_KEY` in `backend/.env` and restart the API. In Admin → Settings select a model and enable the assistant. The key never goes to the browser. The server applies request limits, a 45-second timeout, bounded message history, maximum output tokens, a daily request ceiling (`AI_DAILY_REQUEST_LIMIT`) and a concurrency cap of 10 AI calls per API process. Local chat history remains in the user's browser. Usage totals are in PostgreSQL.

Actual model calls require provider credit and an available model ID. They were not executed without a key. The catalog workload test does not measure OpenRouter latency or capacity.

## Customer login and checkout

Phone login uses six-digit, single-use, five-minute challenges, HMAC hashing with `OTP_SECRET`, bounded attempts, request limits and HTTP-only sessions.

Provision a stable random `OTP_SECRET` and a 64-character hexadecimal `SUPPLIER_ENCRYPTION_KEY` in the backend environment at deployment. Keep the encryption key with the database when migrating to the VPS, as it protects saved service credentials. The development initializer generates both secrets for a fresh installation.

In **Admin → Settings → تنظیمات SMS**, enter the SMS.ir API key, the numeric ID of an approved verification template, and the name of the template parameter that receives the login code. Match the parameter's capitalization. For a placeholder such as `#OtpToken#`, enter `OtpToken` or paste the full placeholder. Saving all three enables SMS login immediately. The key is encrypted in PostgreSQL and the panel only shows whether a key has been saved. Customer login is disabled until SMS.ir is configured. Accounts created with the former local PIN remain in admin history, but their old sessions are rejected. [SMS.ir verification example](https://github.com/IPeCompany/SmsPanelV2.TypeScript#sendverifycodemobile-templateid-parameters)

The signed-in customer can access their basket and orders. A stored basket expires 24 hours after its last change and does not reserve stock. Checkout validates delivery options and product availability in PostgreSQL before reserving stock and recording the order. Bank transfer and receipt review are available once the owner configures the destination account. See [the payment workflow](README.md#connected-features).

## Backup and restore

```powershell
npm run db:backup
```

Creates a transaction-consistent application snapshot (`database.json.gz`) plus referenced assets under `backups/<timestamp>`. Includes password hashes; store backups privately. Sessions and OTPs are deliberately excluded. This local backup does not include PostgreSQL roles/extensions/settings; migrations recreate the schema. Production should also use managed PostgreSQL backups/PITR or `pg_dump` and offsite media backup.

Restore only into a **new, empty database**, never over the running database. Apply the migrations without creating an admin, then restore:

```powershell
# Set these only in the terminal, using the new destination's credentials.
$env:RESTORE_DATABASE_URL='postgresql://.../new_empty_database'
$env:RESTORE_MEDIA_DIR='C:/path/to/new/media'
cd backend
node --env-file=.env scripts/migrate.mjs --restore-target
node --env-file=.env scripts/restore.mjs C:/path/to/backup
```

The restore script rejects a nonempty destination and mismatched migration history. Test restoration before relying on backups.

## Deployment and capacity

The Windows embedded launcher is a **local development convenience**, using packaged PostgreSQL binaries. For hosting, use managed PostgreSQL or a supervised PostgreSQL installation, persistent media storage/shared object storage, TLS, secure environment variables, monitoring and regular backups. Set `NODE_ENV=production`, `DATABASE_URL`, optional `DATABASE_SSL=true`, `APP_ORIGIN`, and `API_INTERNAL_URL` for Next.js. Set `HOST=0.0.0.0` only on a private/container network when needed.

The API defaults to loopback and no trusted forwarding headers. Behind an edge proxy, overwrite client-supplied `X-Forwarded-For` at the edge, keep direct API access private, and configure `TRUST_PROXY` for only the known proxy address. Otherwise IP-based limits will see the Next.js server's address. Do not trust arbitrary public forwarding headers.

The database pool defaults to 20 connections per API process; size total pools below the database connection limit. 2,000 products is a small catalog for PostgreSQL. Actual capacity depends on hardware, media bandwidth, cache behavior, query mix and provider rate limits.

## Validation

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:backend
```

The backend suite creates and drops its **own isolated test database**, checks authentication/CSRF, upload validation, persistence, prices, duplicate/stale edits, FK safeguards and draft visibility, then issues 1,000 catalog requests from 100 concurrent clients against 2,000 synthetic products. Metrics are saved in `backend/test-results/latest.json`; test data never enters the store database.

Set `TEST_REDIS_URL=redis://127.0.0.1:56379` when running the backend suite to exercise real Redis broadcasts and loopback disconnect/reconnect. The basket test starts two API processes on the same isolated database with a unique channel namespace and also exercises PostgreSQL delivery while Redis is unavailable.


## Access policy and performance checks

Nest checks the declared route and HTTP method before invoking a handler. New endpoints outside the admin/customer namespaces are denied until explicitly classified in `backend/src/route-access.ts`. Admin endpoints require an active admin session. Changing the bank account or SMS, AI and supplier connection settings requires the store owner. Customer order and receipt queries also check the order's purchasing account. Private responses, including authorization errors, are marked `private, no-store`.

In production, set `NODE_ENV=production` and the exact HTTPS `APP_ORIGIN` on the API. The edge should redirect HTTP to HTTPS, accept only the configured host, and keep both the API and PostgreSQL off the public network. No wildcard trusted proxies. Session cookies are HTTP-only, secure in production, and checked by the API. The Next server checks the relevant session before rendering account, checkout, cart and nested admin pages. Local OTP identities cannot authenticate against the production API. Keeping only one authorized channel per cookie also prevents admin and customer sessions from being interchangeable.

Product listing pages verify their ordered IDs, PostgreSQL row revisions and current brand labels in one database snapshot. The API keeps a bounded per-process cache of public product summaries (up to 256 pages / 24 MiB of serialized payload). Neither checkout nor private admin records are served from it. Repeated reads can reuse the sanitized summaries while committed catalog changes take effect on the next request. Do not add time-based CDN caching to prices, checkout, sessions or private responses without designing an invalidation policy.

The catalog load test measures API latency and error counts, not full-page rendering, payment processing or external services. Re-run it on staging with representative product data and VPS hardware before sizing connection pools.

### Production storefront load test

Start the compiled API, run `npm run build` with its `API_INTERNAL_URL`, then start the storefront with `npm start` and the same API URL. The production launcher serves anonymous public pages, public catalog JSON, immutable build assets and optimized public product images from a bounded 48 MiB memory cache per gateway worker. The launcher starts two gateway workers when four or more logical CPUs are available and one otherwise. Both use a single private Next renderer on loopback. Running the generated standalone server directly skips this cache.

Public page and catalog hits check a PostgreSQL revision before serving. Product, category, brand and settings changes advance the revision in the same transaction as the change. Signed-in shoppers receive the same public catalog representation and load their personal data through the authenticated API. Account, admin, checkout, writes, preview cookies and Next client-navigation requests use the normal application. Run the following commands on the launcher's loopback port.

```sh
node scripts/load-storefront.mjs 7777 5000 1
node scripts/load-storefront.mjs 7777 5000 60
```

The harness uses four local workers and 20 ms arrival intervals. It discovers real URLs in the catalog, warms them, and sends 20% page HTML, 40% public API reads, 20% product images and 20% CSS. It reports requests sent within the target window, complete successful responses, missed arrivals, errors, response bytes and latency from scheduled arrival to the last byte. Afterward it checks the public page content and catalog data again. Run it against a production-mode staging instance with products and uploaded images.

For a separate cold-render scenario, restart the staging storefront and add `--product-spike` to the one-second command. This spreads traffic across the sitemap's product pages without warming them. The launcher bounds concurrent cold renders and can return HTTP 503 with `Retry-After` when its pending queue is full.
