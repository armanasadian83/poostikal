# Poostikal

Persian RTL ecommerce storefront and glass-styled admin, built with Next.js, TypeScript, NestJS and PostgreSQL 18.6. The catalog is now database-backed; no sample products, brands, customers or orders are seeded.

## Start

Requires Node.js 22.22.3+ and npm 10.9.8+ on this Windows development machine.

```powershell
npm ci
npm --prefix backend ci
npm run dev
```

This starts the persistent local PostgreSQL database, Nest API and Next.js storefront. It also starts or reuses a local Redis broker when available. See [Redis setup](BACKEND.md#run-locally).

- Store: http://127.0.0.1:7777
- Admin: http://127.0.0.1:7777/admin
- API health: http://127.0.0.1:4000/api/health

The initial admin email/password are stored privately in `backend/.env`. Do not publish that file or `.data/database-secrets.json`. Startup preserves existing data.

## Search visibility

The Next.js server uses `SITE_URL` for canonical links, social previews and the sitemap. The default is `https://poostikal.ir`. Set it to the public HTTPS origin if the deployment uses another domain. The identity and SEO section of Admin Settings controls the homepage title, description and public indexing. The public sitemap is served at `/sitemap.xml` and crawl rules at `/robots.txt`. Login, account, cart, checkout and admin routes are excluded from crawling and their responses carry a noindex header.

## Connected features

- Protected administrator sessions and validated product, brand and category editing.
- Product names, slugs, descriptions, attributes, variants, prices, discounts and stock in PostgreSQL.
- Multiple uploaded images with alt text, captions and ordering; processed images and animation files stored separately from the database.
- Photo galleries and product-specific scroll-controlled 3D unboxing. The animation studio prepares artwork from four reference photos, supports dropper/pump/jar and side-opening carton + pouch templates with measured proportions, previews the actual product, and publishes the same renderer to its product page. Pouches support left/right extraction and independent width, height and thickness. Custom animated GLB/MP4 uploads remain supported.
- Storefront search, brand/category filters, pagination, related products and banner products read the API. Favorites remain browser-local. Signed-in customers have a shared basket across tabs and devices. It expires 24 hours after the last basket change and refreshes its stock information as inventory changes.
- OpenRouter chat integration with private server credentials, limits and catalog context. Configure the key in `backend/.env`, then enable the assistant in Admin Settings.
- Phone verification and customer accounts. Save the SMS.ir API key, approved template ID, and login-code parameter name in **Admin → Settings → تنظیمات SMS**. See [the backend setup](BACKEND.md#customer-login-and-checkout).
- Backup/restore scripts and isolated database integration/load tests.

Manual bank transfers are available after checkout. Set the destination card and account holder as the owner in **Admin → Settings → کارت بانکی**. Only the purchasing customer can reopen their confirmation or see it in their order history. The delivery phone is contact information and does not grant access. Under **سفارشات → فیش های واریزی**, compare the receipt against its order and approve or reject it. Approval records payment without changing fulfillment status. Buyers can resubmit after rejection.

Receipt uploads accept JPEG, PNG or WebP up to 10 MiB. The API re-encodes them without source metadata and stores only private WebP images below 2,000,000 bytes in PostgreSQL. They expire seven days after upload and are purged at API startup and every minute while running. The order keeps its payment result; the application backup deliberately excludes receipt images.

Online gateway callbacks and arbitrary photo-to-mesh reconstruction are not enabled. The app displays explicit unavailable states for unconfigured external services.

## Development and operations

Product short/full descriptions use Persian RTL rich-text editors with visual and HTML modes. Both modes save sanitized HTML in the existing product document; older plain-text descriptions still display correctly. Short descriptions appear beside the purchase controls and full descriptions below the product presentation. Cards and metadata use plain text. The shared `packages/rich-text` package defines the editor/API/storefront HTML allowlist and visible-text limits (500 / 20,000 characters); install dependencies from the repository root as well as `backend`. Executable HTML, embedded media and unsafe links are removed on the server. `backend/test/rich-text.mjs` and the catalog integration test cover these rules and persistence.

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:backend
npm run db:backup
```

See [BACKEND.md](BACKEND.md) for environment configuration, database/media locations, startup commands, restore instructions, deployment requirements and capacity-test details. `npm start` serves the built frontend; production also needs the API and PostgreSQL running under supervision.

## Design and source layout

The storefront keeps its existing Persian typography, purple/pink palette, glass navigation/cards, moving waves, lips login transition, rotating product display, skin model and treatment-story section. The admin uses a separate responsive glass shell. Login/chat omit the storefront navigation and footer.

- `src/app/`: Next.js routes and styles
- `src/components/`: storefront, account, chat and admin UI
- `src/lib/`: shared types, validation helpers and API client
- `backend/src/`: NestJS API, database access, authentication and provider adapters
- `backend/migrations/`: versioned PostgreSQL schema
- `backend/scripts/`: local database, backups and restoration
- `backend/test/`: isolated integration and load checks
- `public/brand/`, `public/images/`: approved branding and design assets with source notes

Original design/reference assets remain on disk for the editor and site artwork; they do not populate the catalog. Publish real products through Admin to make them appear in the store.
