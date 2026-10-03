# Uptime Monitor — Built the Remix Way

An edge-native uptime monitoring service built with **Remix 3** and Sergio Xalambrí's architectural principles from [The Remix Way](https://sergiodxa.com/articles/the-remix-way), deployed to **Cloudflare Workers**.

---

## 🌟 Key Architectural Decisions ("The Remix Way")

1. **Explicit Routing & Separate Controllers**:
   - Routes declared typed via `remix/routes` (`routes/web.ts`, `routes/api.ts`).
   - Controllers split into dedicated files under `app/http/controllers/` using `createAction` and lazy route loading (`@sdxc/lazy-route`).

2. **Web Standard Types & Zero Unnecessary Hydration**:
   - Web standards first (`Request`, `Response`, `URL`, `FormData`, native `<dialog>` modals).
   - SSR HTML rendering via `remix/component` without heavyweight client-side bundle shipping.
   - Public Status Page (`/status`) with Cloudflare edge caching (`s-maxage=60, stale-while-revalidate=300`) to withstand traffic spikes during outages.

3. **Inversion of Control via Contracts**:
   - **Database**: `AppDatabase` via `@sdxc/data-table-d1` and `remix/data-table` (swappable between Cloudflare D1 in production and SQLite in tests).
   - **Cache**: `WorkerKVCache` vs. `MemoryCache`.
   - **Transport**: `CloudflareTransport` vs. `MemoryTransport` via `@sdxc/mail`.

4. **Background Jobs & Cron Sweeps**:
   - Scheduled monitor sweeps run via `@sdxc/jobs` triggered by Cloudflare Worker `crons = ["* * * * *"]`.

5. **Integrated Model Context Protocol (MCP) Server**:
   - Directly mounted on the Remix router at `/api/mcp` via `@sdxc/mcp`.
   - Exposes tools (`list_monitors`, `get_monitor`, `check_monitor_now`, `create_monitor`) for LLMs and AI agents.

6. **Structured Logging**:
   - Request, job, and cron execution logs structured with `@sdxc/logger`.

---

## 👤 Using It

| Page | Who | What it's for |
| --- | --- | --- |
| `/` | Admin (password) | Add, check, pause and delete monitors |
| `/monitors/:id` | Admin (password) | Uptime, response times, check log and incidents for one monitor |
| `/status` | Anyone | Public status page to share with your users |

**How a check works**
1. A Cron Trigger fires every minute and checks every enabled monitor that is due.
2. A check passes when the response status equals the expected status. If it passes but takes
   longer than the "slow after" threshold, the monitor is marked **degraded**.
3. A failed check is re-checked 2 seconds later. Only if that also fails does the monitor go
   down, open an incident and send a DOWN alert, so one-off network blips don't page anyone.
   The next passing check (up or degraded) resolves the incident and sends a RECOVERED alert.
4. Check results are kept for 30 days.

**Access** (Cloudflare Access)
- The dashboard, monitor pages, `/api/mcp` and `/api/cron/sweep` sit behind a Cloudflare Access
  application. People sign in through Access; MCP clients and schedulers use an Access service token.
- The Worker also verifies the `Cf-Access-Jwt-Assertion` token itself (signature, issuer and AUD),
  so a request that skips Access, e.g. via the `workers.dev` URL, gets a 403.
- Without `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, the admin pages work on `localhost` only and
  return 503 everywhere else.
- `/status` and `/api/health` are always public.

**Public status page**
Every monitor has a "Show on the public status page" setting (on by default). Hidden monitors
are marked *Private* on the dashboard. The public page never shows raw error messages, only
which service is affected and since when.

**Alerts**
Alerts go to every channel you configure; the dashboard shows a banner while none is set up.
- **Webhook** (easiest): `npx wrangler secret put ALERT_WEBHOOK_URL` with an https URL.
  Discord webhooks, Slack incoming webhooks and `https://ntfy.sh/<topic>` get their native
  format; any other URL receives JSON (`event`, `monitor`, `status`, `reason`, `timestamp`, `text`).
- **Email**: set `ALERT_EMAIL` and add a `send_email` binding named `EMAIL` (see `wrangler.jsonc` /
  `cloudflare.config.ts`). The recipient must be a verified Email Routing destination and
  `MAIL_FROM` must be on a domain you have in Cloudflare.

Use **Send test alert** on the dashboard to confirm delivery; it reports any channel that failed.

---

## 📁 Project Structure

```
uptime-monitor/
├── app/
│   ├── contracts/        # Database, Cache, and Transport contracts
│   ├── http/
│   │   ├── context.ts    # Request context keys & helpers
│   │   ├── controllers/  # Individual HTTP action controllers
│   │   ├── render.ts     # HTML SSR renderer
│   │   └── views/        # Component views (Dashboard, Detail, Layout)
│   ├── jobs/             # @sdxc/jobs definitions & handlers
│   ├── mcp/              # MCP Server tools & handler
│   └── services/         # Checker, Alerting & Monitor business logic
├── bootstrap/
│   ├── app.tsx           # Remix 3 Router setup with middleware
│   ├── logger.ts         # @sdxc/logger instance
│   └── worker.ts         # Cloudflare Worker entry (fetch, scheduled, queue)
├── database/
│   ├── migrations/       # D1 SQL migrations
│   └── schema.ts         # remix/data-table schema definitions
├── routes/
│   ├── api.ts            # API & MCP route declarations
│   └── web.ts            # Web UI route declarations
├── wrangler.jsonc        # Cloudflare Workers configuration
└── package.json
```

---

## 🚀 Local Development & Testing

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Apply local database migrations**:
   ```bash
   npm run db:local:migrate
   # Or using cf CLI directly:
   # npx wrangler d1 migrations apply uptime-db --local
   ```

3. **Start local dev server**:
   ```bash
   npm run dev
   # Runs via cf dev / Vite on http://localhost:8787
   ```

4. **Typecheck codebase**:
   ```bash
   npm run typecheck
   ```

5. **Run the tests** (Node's test runner against in-memory SQLite, no network):
   ```bash
   npm test
   ```

---

## 🌐 Deploying to Cloudflare (via `cf` CLI & `cloudflare.config.ts`)

The project uses the modern, typed **`cloudflare.config.ts`** format configured with the new Cloudflare CLI (`cf`).

### 1. Create Cloudflare D1 Database & KV Namespace
```bash
# Create production D1 database
npx cf d1 create uptime-db

# Create production KV namespace
npx cf kv namespace create KV
```

### 2. Configure `cloudflare.config.ts`
The [`cloudflare.config.ts`](file:///Users/macuser/Works/personal/uptime-monitor/cloudflare.config.ts) file supports environment variables and programmatic bindings:
```typescript
import { defineConfig, bindings, triggers } from "@cloudflare/config";

export default defineConfig({
  worker: {
    name: "uptime-monitor",
    entrypoint: "./bootstrap/worker.ts",
    compatibilityDate: "2026-10-01",
    compatibilityFlags: ["nodejs_compat"],

    env: {
      DB: bindings.d1({
        name: "uptime-db",
        id: process.env.D1_DATABASE_ID || "<YOUR-DATABASE-ID>",
      }),
      KV: bindings.kv({
        id: process.env.KV_NAMESPACE_ID || "<YOUR-KV-NAMESPACE-ID>",
      }),
      APP_ENV: bindings.text("production"),
      APP_URL: bindings.text("https://<YOUR-WORKER-DOMAIN>"),
      MAIL_FROM: bindings.text("alerts@uptime.local"),
      SESSION_SECRET: bindings.text(process.env.SESSION_SECRET || "production-session-secret-at-least-32-chars"),
    },

    triggers: [
      triggers.scheduled({
        schedule: "* * * * *",
      }),
    ],

    observability: {
      enabled: true,
    },
  },
});
```

### 3. Protect the Admin Pages with Cloudflare Access
In the Zero Trust dashboard (**Access → Applications**):

1. **Admin application**: add a *Self-hosted* application for the Worker's hostname
   (custom domain or `uptime-monitor.<subdomain>.workers.dev`) with:
   - an **Allow** policy including your email address (people who can use the dashboard);
   - a **Service Auth** policy including a service token (**Access → Service credentials**)
     for MCP clients and external schedulers.
2. **Public application**: add a second *Self-hosted* application on the same hostname with the
   paths `status` and `api/health`, and a **Bypass** policy including *Everyone*. The more specific
   paths take precedence, so the status page stays public.
3. Put the admin application's **Application Audience (AUD) Tag** and your **team domain**
   (e.g. `myteam.cloudflareaccess.com`) in the `deploy` script in `package.json`, which passes them
   as `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`. They are only set on deploy, so local dev stays open.

Current setup: team `devalade.cloudflareaccess.com`, applications
"uptime-monitor - Cloudflare Workers" (admin + service token) and "uptime-monitor - Public status" (bypass).

### 4. Apply Remote Migrations
```bash
npm run db:remote:migrate
# Or: npx wrangler d1 migrations apply uptime-db --remote
```

### 5. Deploy the Worker
```bash
npm run deploy
# Or: npx cf deploy
```

> [!NOTE]
> You can also dry-run your build and deployment at any time with `npx cf deploy --dry-run`.


---

## 🤖 MCP (Model Context Protocol) Integration

To connect AI assistants (Claude Desktop, Cursor, Antigravity, etc.) to this uptime monitor:
- **Endpoint**: `https://<your-worker-subdomain>.workers.dev/api/mcp`
- **Method**: `POST`
- **Auth**: Access service token headers `CF-Access-Client-Id` and `CF-Access-Client-Secret`
- **Protocol Version**: `2026-07-28`
- **Available Tools**:
  - `list_monitors`: Lists all monitored endpoints and status.
  - `get_monitor`: Detailed metrics, uptime %, and recent checks for a given monitor ID.
  - `check_monitor_now`: Probes a monitor on-demand and returns immediate latency.
  - `create_monitor`: Adds a new HTTP/HTTPS endpoint to be monitored.
