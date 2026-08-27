# Product Editor — Shopify Custom App

A custom Shopify admin app that fetches products from your store's catalogue
and lets you edit a product's **name** and **price** inline. Saves write
straight back to Shopify through the Admin GraphQL API, so changes show up
immediately in **Shopify Admin → Products**.

Built with the official Shopify app stack: **Remix + Polaris + App Bridge**,
using the Admin GraphQL API (`productUpdate` and
`productVariantsBulkUpdate` mutations).

---

## 1. Prerequisites

- Node.js `18.20+` / `20.10+` (check with `node -v`)
- A free **Shopify Partners** account: https://partners.shopify.com/signup
- A **development store** created inside your Partners dashboard
  (Partners Dashboard → Stores → Add store → Development store)

## 2. Install dependencies

The Shopify CLI is already listed as a dependency, so you don't need to
install anything globally.

```bash
npm install
```

## 3. Connect this folder to an app in your Partners account

Run the dev command — the first run walks you through login and app creation
interactively:

```bash
npm run dev
```

You'll be asked to:

1. Log in to your Partners account (opens a browser).
2. Choose **"Create a new app"** (or select an existing one).
3. Pick the development store you created earlier.

The CLI will then:

- Fill in `client_id` inside `shopify.app.toml` automatically
- Start a tunnel (Cloudflare) so Shopify can reach your local server
- Print a URL — press **`p`** in the terminal, or open the printed link, to
  install the app on your dev store and open it inside Shopify Admin

No paid plan, no billing — everything here runs on the free Partners +
development store setup.

## 4. Using the app

Open the app from your dev store's **Apps** section in Shopify Admin. You'll
see:

- A table of up to 25 products from your catalogue, pulled live via GraphQL
- An **Edit** button per row that turns the name and price into editable
  fields
- **Save** commits the change with two mutations:
  - `productUpdate` → updates the product title
  - `productVariantsBulkUpdate` → updates the first variant's price
- A toast confirms success, and a banner shows any validation/API errors
- Refresh the page (or check Shopify Admin → Products) to confirm the edit
  persisted on the real catalogue

If your dev store has no products yet, click **"Add a product in Shopify
admin"** from the empty state, add one or two products, then come back.

## 5. Project structure

```
app/
├── routes/
│   ├── app.tsx              # Embedded app shell: nav, auth, Polaris/App Bridge setup
│   ├── app._index.tsx       # The product editor: loader (fetch) + action (update) + UI
│   ├── auth.$.tsx           # OAuth callback route (Shopify-provided)
│   ├── auth.login/          # Login screen used outside the embedded context
│   ├── webhooks.app.uninstalled.tsx      # Cleans up session on uninstall
│   └── webhooks.app.scopes_update.tsx    # Keeps stored scopes in sync
├── shopify.server.ts        # Shopify app config: API version, scopes, session storage
├── db.server.ts             # Prisma client (SQLite) used for session storage
└── root.tsx                 # Remix root document

prisma/schema.prisma         # Session table schema (SQLite, zero setup)
shopify.app.toml             # App config: scopes, webhooks, client_id (filled by CLI)
```

All the assignment logic — fetching products and editing name/price — lives
in **`app/routes/app._index.tsx`**.

## 6. How the data flow works

1. **Loader** (`app._index.tsx`) authenticates the request and runs a
   GraphQL `products` query (title, status, image, first variant price, shop
   currency) — this populates the table on page load.
2. Clicking **Edit** switches that row into two `TextField`s (name, price)
   using local component state — nothing is sent to Shopify yet.
3. Clicking **Save** submits a Remix `fetcher` POST to the same route's
   **action**, which:
   - Validates the input (non-empty name, non-negative numeric price)
   - Calls `productUpdate` to rename the product
   - Calls `productVariantsBulkUpdate` to update the price
   - Returns success/error, which the UI turns into a toast or banner
4. Because these are real Admin API mutations, the change is permanent and
   visible in Shopify Admin → Products right away.

## 7. Required scope

`shopify.app.toml` already requests:

```toml
[access_scopes]
scopes = "write_products"
```

This covers reading and writing products/variants. If Shopify ever shows a
scope mismatch, run `npm run deploy` to push the config to your app.

## 8. Common commands

| Command                | What it does                                                 |
|-------------------------|---------------------------------------------------------------|
| `npm run dev`           | Start the local server + tunnel, install app on dev store    |
| `npm run build`         | Production build                                              |
| `npm run deploy`        | Push `shopify.app.toml` config (scopes, webhooks) to Shopify |
| `npm run config:link`   | Re-link this folder to a specific app in Partners             |

## 9. Troubleshooting

- **"No development store found"** → create one in Partners Dashboard →
  Stores before running `npm run dev`.
- **Blank page in Shopify Admin** → make sure the terminal tunnel is still
  running; stopping `npm run dev` also stops the app.
- **Scope errors on save** → run `npm run deploy` after any change to
  `shopify.app.toml`, then reinstall the app on the dev store.
