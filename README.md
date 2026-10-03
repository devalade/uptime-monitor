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
| `/` | Admin | Add, check, pause and delete monitors |
| `/monitors/:id` | Admin | Edit a monitor; uptime (24h, 7/30/90 days), response times, settings, checks and incidents |
| `/incidents` | Admin | Write incidents for the status page and post updates (investigating → resolved) |
| `/maintenance` | Admin | Schedule maintenance windows |
| `/alerts` | Admin | Alert channels: webhooks (Discord, Slack, Teams, Google Chat, ntfy.sh, JSON), Telegram, PagerDuty, Pushover, Opsgenie, Twilio SMS, email |
| `/reports` | Admin | Monthly uptime report per monitor; CSV download, prints to PDF |
| `/settings` | Admin | Status page branding, custom domain, email subscribers, API keys |
| `/status` | Anyone | Public status page with 90-day uptime bars |
| `/status/feed.xml` | Anyone | RSS feed of incidents and maintenance |
| `/status/badge/:id.svg` | Anyone | SVG badge for a public monitor; `?type=uptime&days=7\|30\|90` for uptime |
| `/api/health/ping/:token` | Your jobs | Heartbeat ping (any method); append `/fail` to report a failure |
| `/api/v1/*` | API clients | REST API and Prometheus metrics (API key or Access service token) |

**Monitor types**
- **HTTP(S)**: any method, custom headers and body. A check passes when the status is in the
  accepted list (`200`, `2xx`, `200-299, 301`), the body contains (or does not contain) a keyword,
  and a JSON path such as `$.status` exists or equals a value.
- **TCP**: passes when a connection to `host:port` opens (Workers `connect()`; port 25 is blocked).
- **DNS**: resolves an A, AAAA, CNAME, MX, TXT or NS record through Cloudflare DNS over HTTPS;
  passes when it resolves and contains the expected values (optional).
- **Heartbeat**: your cron job, backup or worker calls its private ping URL. If no ping arrives
  within the period plus the grace time, the monitor goes down. It stays pending until the first ping.

**How a check works**
1. A Cron Trigger fires every minute and checks every enabled monitor that is due. When any monitor
   uses a 30-second interval, the same invocation sweeps again half a minute later.
2. A check that passes but takes longer than the "slow after" threshold is marked **degraded**.
3. A new failure is re-checked from three other Cloudflare regions (Durable Objects pinned with
   location hints, `PROBE_REGIONS`, default `enam,weur,apac`). The monitor fails only when most
   locations agree. Without the binding it is re-checked locally 2 seconds later.
4. The monitor goes down after `failure_threshold` failed checks in a row (default 1), opens an
   incident and sends a DOWN alert. Optional reminders repeat it every N minutes while it stays down.
   The next passing check resolves the incident and sends a RECOVERED alert.
5. During a maintenance window checks still run, but no incident is opened, nobody is alerted
   and those checks do not count against uptime. An outage that outlasts the window opens an
   incident once it ends.
6. Raw check results are kept for 30 days; daily totals (`monitor_daily_stats`, refreshed hourly)
   are kept for good and power the 7/30/90-day figures and status page bars.

**Certificate and domain expiry** (HTTPS monitors)
- Twice a day the Worker reads the certificate the server actually serves: it starts a TLS 1.2
  handshake over a raw socket and parses the certificate, which TLS 1.2 sends unencrypted
  (`node:tls` in Workers does not implement `getPeerCertificate()`). Servers that only accept TLS 1.3
  are reported as such.
- Once a day it looks up the domain's expiry through RDAP (rdap.org).
- Alerts go out at the monitor's warning days (default 14), then 7, 3, 1 and 0 days left, once each,
  and a "renewed" alert follows a renewal.

**More alerting**
- Optional slowness alerts when a monitor turns degraded, and when it is back to normal.
- "Check from every region" on a monitor page shows the answer from each probe region.

**Status page**
- Branding (title, description, logo, accent colour, link, footer) on `/settings`.
- Custom domain: add it to the Worker in the Cloudflare dashboard, then deploy with
  `STATUS_HOSTNAME=status.example.com`. On that host `/` opens the status page and admin pages 404.
- Email subscribers: visitors confirm their address, then get emails for outages of public monitors,
  incidents and maintenance, with one-click unsubscribe. Needs a domain onboarded to Cloudflare Email
  Sending; deploy with `MAIL_FROM=status@yourdomain.com` (adds the `EMAIL` binding).

**REST API** (`/api/v1`)
- `GET/POST /monitors`, `GET/PATCH/DELETE /monitors/:id` (`PATCH` takes `{"paused": true}` too),
  `GET /incidents`, `GET /metrics` (Prometheus).
- Authenticate with `Authorization: Bearer um_…` (create keys on `/settings`; only a hash is stored)
  or an Access service token. For key-only clients, add `api/v1` to the public Access application's
  paths so Access lets the request through; the Worker still requires the key.

**Access** (Cloudflare Access)
- The admin pages, `/api/mcp` and `/api/cron/sweep` sit behind a Cloudflare Access application.
  People sign in through Access; MCP clients and schedulers use an Access service token.
- The Worker also verifies the `Cf-Access-Jwt-Assertion` token itself (signature, issuer and AUD),
  so a request that skips Access, e.g. via the `workers.dev` URL, gets a 403.
- Without `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, the admin pages work on `localhost` only and
  return 503 everywhere else.
- `/status`, everything under `/status/` and `/api/health` (including `/api/health/ping/*`) are
  public. They match the paths the public Access application bypasses.

**Public status page**
Every monitor has a "Show on the public status page" setting. The public page never shows raw
error messages, only which service is affected and since when. Incidents written on `/incidents`,
running and upcoming maintenance (next 7 days) and the last 7 days of history are shown too.

**Alerts**
Add channels on `/alerts`; each monitor sends to every channel or only the ones picked in its
Alerting settings. Channels from the environment still work and show up there read-only:
- `ALERT_WEBHOOK_URL` secret (https only).
- `ALERT_EMAIL` with a `send_email` binding named `EMAIL`. The recipient must be a verified Email
  Routing destination and `MAIL_FROM` must be on a domain you have in Cloudflare.

PagerDuty gets one dedup key per monitor, so DOWN and RECOVERED trigger and resolve the same
PagerDuty incident. Use **Test** on a channel, or **Test every channel**, to confirm delivery.

---

## 📁 Project Structure

```
uptime-monitor/
├── app/
│   ├── contracts/        # Database, Cache, and Transport contracts
│   ├── http/
│   │   ├── context.ts    # Request context keys & helpers
│   │   ├── controllers/  # Individual HTTP action controllers
│   │   ├── pages.tsx     # Data loading for pages shared by several controllers
│   │   └── views/        # Remix components rendered with ctx.render(); RSS feed and badges use remix/html-template
│   ├── jobs/             # @sdxc/jobs definitions & handlers
│   ├── mcp/              # MCP Server tools & handler
│   └── services/         # Checker, Alerting & Monitor business logic
├── bootstrap/
│   ├── app.ts            # Remix 3 Router setup with middleware
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
  - `list_monitors`: All monitors with type, status and target.
  - `get_monitor`: Settings, 24h/7d/30d/90d uptime, recent checks, open incidents, heartbeat ping URL.
  - `check_monitor_now`: Probes a monitor on demand.
  - `create_monitor` / `update_monitor`: HTTP, TCP or heartbeat monitors with every setting.
  - `set_monitor_paused`: Pause or resume a monitor.
  - `list_incidents`: Detected outages, optionally open only or for one monitor.
  - `post_status_update`: Open a status page incident or post an update to one.
  - `schedule_maintenance`: Schedule a maintenance window.
