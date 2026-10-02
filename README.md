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
   # npx cf d1 migrations apply uptime-db --local
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

### 3. Apply Remote Migrations
```bash
npm run db:remote:migrate
# Or: npx cf d1 migrations apply uptime-db
```

### 4. Deploy the Worker
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
- **Protocol Version**: `2026-07-28`
- **Available Tools**:
  - `list_monitors`: Lists all monitored endpoints and status.
  - `get_monitor`: Detailed metrics, uptime %, and recent checks for a given monitor ID.
  - `check_monitor_now`: Probes a monitor on-demand and returns immediate latency.
  - `create_monitor`: Adds a new HTTP/HTTPS endpoint to be monitored.
