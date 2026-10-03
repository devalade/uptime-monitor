/**
 * Clean Production Layout for Uptime Monitor.
 * Inspired by Better Stack and modern devops telemetry systems.
 * Pure edge-rendered HTML/CSS, zero client hydration bundle, crisp typography, and responsive grid.
 */

import { renderAddMonitorDialog, type AddMonitorFormState } from "~/app/http/views/add-monitor-dialog";
import { escapeHtml } from "~/app/http/views/html";
import routes from "~/routes/web";

export interface LayoutProps {
	title: string;
	children: string;
	currentPath?: string;
	/** Public pages get no admin navigation or controls. */
	variant?: "admin" | "public";
	addMonitorForm?: AddMonitorFormState;
}

export function renderLayout(props: LayoutProps): string {
	const isAdmin = (props.variant ?? "admin") === "admin";
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${escapeHtml(props.title)} | Uptime Monitor</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
	<style>
		:root {
			--bg-root: #0d1117;
			--bg-surface: #161b22;
			--bg-surface-hover: #1c2128;
			--bg-surface-active: #21262d;
			
			--border-subtle: #21262d;
			--border-medium: #30363d;
			--border-strong: #484f58;

			--text-primary: #f0f6fc;
			--text-secondary: #c9d1d9;
			--text-muted: #8b949e;
			--text-dim: #6e7681;

			/* Semantic Accents */
			--up: #3fb950;
			--up-bg: rgba(63, 185, 80, 0.12);
			--up-border: rgba(63, 185, 80, 0.3);
			--up-solid: #238636;
			--up-solid-hover: #2ea043;

			--down: #f85149;
			--down-bg: rgba(248, 81, 73, 0.12);
			--down-border: rgba(248, 81, 73, 0.35);
			--down-solid: #da3633;

			--degraded: #d29922;
			--degraded-bg: rgba(210, 153, 34, 0.12);
			--degraded-border: rgba(210, 153, 34, 0.35);

			--brand: #58a6ff;
			--brand-bg: rgba(56, 139, 253, 0.15);

			--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			--font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		}

		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			background-color: var(--bg-root);
			color: var(--text-secondary);
			font-family: var(--font-sans);
			font-size: 13px;
			line-height: 1.5;
			min-height: 100vh;
			display: flex;
			flex-direction: column;
			-webkit-font-smoothing: antialiased;
		}

		a {
			color: inherit;
			text-decoration: none;
		}

		/* Top Navigation Bar */
		header {
			position: sticky;
			top: 0;
			z-index: 50;
			background: var(--bg-surface);
			border-bottom: 1px solid var(--border-subtle);
		}

		.header-container {
			max-width: 1240px;
			margin: 0 auto;
			padding: 0.625rem 1.5rem;
			display: flex;
			align-items: center;
			justify-content: space-between;
			height: 52px;
		}

		.brand {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			font-size: 0.875rem;
			font-weight: 600;
			color: var(--text-primary);
		}

		.brand-badge {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 11px;
			color: var(--text-muted);
			font-family: var(--font-mono);
		}

		.nav-menu {
			display: flex;
			align-items: center;
			gap: 0.25rem;
		}

		.nav-item {
			padding: 0.375rem 0.75rem;
			font-size: 0.8125rem;
			font-weight: 500;
			color: var(--text-muted);
			border-radius: 4px;
			transition: all 120ms ease;
		}

		.nav-item:hover {
			color: var(--text-primary);
			background: var(--bg-surface-hover);
		}

		.nav-item.active {
			color: var(--text-primary);
			background: var(--bg-surface-active);
			font-weight: 600;
		}

		main {
			flex: 1;
			max-width: 1240px;
			width: 100%;
			margin: 0 auto;
			padding: 1.5rem 1.5rem 4rem;
		}

		footer {
			border-top: 1px solid var(--border-subtle);
			padding: 1.5rem;
			text-align: center;
			font-size: 0.75rem;
			color: var(--text-dim);
			background: var(--bg-surface);
		}

		/* Button System */
		.btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.375rem;
			padding: 0.375rem 0.75rem;
			font-size: 0.75rem;
			font-weight: 500;
			border-radius: 4px;
			border: 1px solid transparent;
			cursor: pointer;
			transition: all 100ms ease;
			text-decoration: none;
			line-height: 1.25;
			font-family: inherit;
		}

		.btn-primary {
			background: var(--up-solid);
			color: #ffffff;
			border-color: #2ea043;
		}
		.btn-primary:hover {
			background: var(--up-solid-hover);
		}

		.btn-secondary {
			background: var(--bg-surface-active);
			border-color: var(--border-medium);
			color: var(--text-secondary);
		}
		.btn-secondary:hover {
			background: var(--border-medium);
			color: var(--text-primary);
		}

		.btn-danger {
			background: var(--down-bg);
			border-color: var(--down-border);
			color: #ff7b72;
		}
		.btn-danger:hover {
			background: var(--down-solid);
			color: #ffffff;
			border-color: var(--down-solid);
		}

		.btn-sm {
			padding: 0.25rem 0.5rem;
			font-size: 0.6875rem;
			border-radius: 3px;
		}

		/* Status Badges & Pips */
		.status-dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			display: inline-block;
			flex-shrink: 0;
		}
		.status-dot.up { background: var(--up); }
		.status-dot.down { background: var(--down); }
		.status-dot.degraded { background: var(--degraded); }
		.status-dot.paused { background: var(--text-dim); }

		.badge {
			display: inline-flex;
			align-items: center;
			gap: 0.375rem;
			padding: 0.125rem 0.4375rem;
			border-radius: 3px;
			font-size: 0.6875rem;
			font-weight: 600;
			font-family: var(--font-mono);
			text-transform: uppercase;
		}
		.badge-up { background: var(--up-bg); color: var(--up); border: 1px solid var(--up-border); }
		.badge-down { background: var(--down-bg); color: #ff7b72; border: 1px solid var(--down-border); }
		.badge-degraded { background: var(--degraded-bg); color: #e3b341; border: 1px solid var(--degraded-border); }
		.badge-pending { background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid var(--border-subtle); }

		/* Method Chips */
		.method-chip {
			font-family: var(--font-mono);
			font-size: 0.625rem;
			font-weight: 700;
			padding: 0.0625rem 0.3125rem;
			border-radius: 3px;
		}
		.method-get { background: rgba(56, 139, 253, 0.15); color: #58a6ff; border: 1px solid rgba(56, 139, 253, 0.3); }
		.method-head { background: rgba(187, 128, 255, 0.15); color: #bc8cff; border: 1px solid rgba(187, 128, 255, 0.3); }
		.method-post { background: rgba(63, 185, 80, 0.15); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.3); }

		/* Data Table & Stats Grid */
		.stats-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
			gap: 1rem;
			margin-bottom: 2rem;
		}
		.stat-card {
			background: var(--bg-surface);
			border: 1px solid var(--border-medium);
			border-radius: 6px;
			padding: 1.25rem;
		}
		.stat-label {
			font-size: 11px;
			color: var(--text-muted);
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
		}
		.stat-value {
			font-size: 1.75rem;
			font-weight: 700;
			color: var(--text-primary);
			margin-top: 0.375rem;
			font-feature-settings: 'tnum' 1;
		}

		.data-table {
			width: 100%;
			border-collapse: collapse;
			font-size: 12px;
		}
		.data-table th {
			background: var(--bg-root);
			color: var(--text-muted);
			font-weight: 600;
			text-transform: uppercase;
			font-size: 10px;
			letter-spacing: 0.04em;
			padding: 9px 16px;
			text-align: left;
			border-bottom: 1px solid var(--border-subtle);
		}
		.data-table td {
			padding: 10px 16px;
			border-bottom: 1px solid var(--border-subtle);
			color: var(--text-secondary);
		}
		.data-table tr:hover td {
			background: var(--bg-surface-hover);
		}
		.data-table tr:last-child td {
			border-bottom: none;
		}

		/* Top Health Strip */
		.health-banner {
			background: var(--bg-surface);
			border: 1px solid var(--border-medium);
			border-radius: 6px;
			padding: 0.875rem 1.25rem;
			display: flex;
			align-items: center;
			justify-content: space-between;
			flex-wrap: wrap;
			gap: 1rem;
			margin-bottom: 1.5rem;
		}

		/* Modal Dialog System */
		dialog {
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background: var(--bg-surface);
			color: var(--text-primary);
			border: 1px solid var(--border-medium);
			border-radius: 8px;
			padding: 1.5rem;
			width: 92%;
			max-width: 480px;
			box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
		}

		dialog::backdrop {
			background: rgba(0, 0, 0, 0.7);
			backdrop-filter: blur(4px);
			-webkit-backdrop-filter: blur(4px);
		}

		.form-group {
			margin-bottom: 1rem;
		}

		.form-group label {
			display: block;
			font-size: 0.75rem;
			font-weight: 600;
			margin-bottom: 0.375rem;
			color: var(--text-muted);
			text-transform: uppercase;
			letter-spacing: 0.04em;
		}

		.form-control {
			width: 100%;
			padding: 0.5rem 0.75rem;
			background-color: var(--bg-root);
			border: 1px solid var(--border-medium);
			border-radius: 4px;
			color: var(--text-primary);
			font-family: inherit;
			font-size: 0.8125rem;
			transition: border-color 100ms ease;
		}

		.form-control:focus {
			outline: none;
			border-color: #58a6ff;
			box-shadow: 0 0 0 2px rgba(56, 139, 253, 0.2);
		}

		.form-row {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.75rem;
		}

		/* Floating Tooltip / Popover */
		#proto-tooltip {
			position: fixed;
			display: none;
			pointer-events: none;
			background: #161b22;
			border: 1px solid #30363d;
			border-radius: 4px;
			padding: 6px 10px;
			font-size: 11px;
			line-height: 1.4;
			color: #c9d1d9;
			font-family: var(--font-mono);
			z-index: 100000;
			box-shadow: 0 8px 24px rgba(0,0,0,0.6);
			white-space: pre-line;
		}

		/* Check timelines */
		.timeline { display: flex; gap: 2px; align-items: center; }
		.tick { flex: 1; border-radius: 1px; transition: transform 60ms ease; }
		.tick:hover { transform: scaleY(1.35); }
		.tick.up { background: var(--up); }
		.tick.down { background: var(--down); }
		.tick.degraded { background: var(--degraded); }
		.tick.empty { background: var(--border-subtle); }

		/* Feedback */
		.alert {
			border-radius: 6px;
			padding: 0.625rem 0.875rem;
			font-size: 0.8125rem;
			margin-bottom: 1rem;
			border: 1px solid var(--border-medium);
			background: var(--bg-surface);
		}
		.alert-error { border-color: var(--down-border); background: var(--down-bg); color: #ff7b72; }
		.alert-warning { border-color: var(--degraded-border); background: var(--degraded-bg); color: #e3b341; }
		.alert code { font-family: var(--font-mono); font-size: 0.75rem; }
		.form-error { color: #ff7b72; font-size: 0.75rem; margin-top: 0.375rem; }
		.form-control[aria-invalid="true"] { border-color: var(--down); }
		.label-hint { text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--text-dim); }
		.checkbox { display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 1rem; cursor: pointer; }
		.advanced summary { cursor: pointer; font-size: 0.75rem; color: var(--text-muted); }

		@media (max-width: 720px) {
			.header-container { padding: 0.625rem 1rem; }
			.brand-badge { display: none; }
			main { padding: 1rem 1rem 3rem; }
			.form-row { grid-template-columns: 1fr; }
		}
	</style>
</head>
<body>
	<header>
		<div class="header-container">
			<div style="display: flex; align-items: center; gap: 1.25rem;">
				<a href="${isAdmin ? routes.home.href() : routes.status.href()}" class="brand">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--up)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
					<span>Uptime Monitor</span>
				</a>
			</div>

			${
				isAdmin
					? `<div style="display: flex; align-items: center; gap: 1rem;">
				<nav class="nav-menu">
					<a href="${routes.home.href()}" class="nav-item ${props.currentPath === routes.home.href() ? "active" : ""}">Dashboard</a>
					<a href="${routes.status.href()}" class="nav-item" target="_blank" rel="noopener">Public status page ↗</a>
				</nav>

				<button type="button" class="btn btn-primary" data-dialog-open="add-monitor-modal">
					+ New monitor
				</button>
			</div>`
					: ""
			}
		</div>
	</header>

	<main>
		${props.children}
	</main>

	<footer>
		Checks run every minute on Cloudflare Workers
	</footer>

	${isAdmin ? renderAddMonitorDialog(props.addMonitorForm) : ""}

	<!-- Tooltip for segmented timelines -->
	<div id="proto-tooltip"></div>

	<script>
		// Modal handling
		document.querySelectorAll("[data-dialog-open]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const dialog = document.getElementById(btn.getAttribute("data-dialog-open"));
				if (dialog) dialog.showModal();
			});
		});

		document.querySelectorAll("[data-dialog-close]").forEach((btn) => {
			btn.addEventListener("click", () => btn.closest("dialog")?.close());
		});

		document.querySelectorAll("dialog[data-open-on-load]").forEach((dialog) => dialog.showModal());

		// Destructive forms ask first; the message is read from an attribute, never built as code
		document.addEventListener("submit", (e) => {
			const message = e.target.getAttribute && e.target.getAttribute("data-confirm");
			if (message && !confirm(message)) e.preventDefault();
		});

		// Show buttons as busy while a check or save is in flight
		document.addEventListener("submit", (e) => {
			if (e.defaultPrevented) return;
			const button = e.target.querySelector("button[type=submit]");
			if (button && button.dataset.busy) {
				button.disabled = true;
				button.textContent = button.dataset.busy;
			}
		});

		// Local times
		document.querySelectorAll("time[data-local]").forEach((el) => {
			const date = new Date(el.getAttribute("datetime"));
			el.textContent = el.dataset.local === "date" ? date.toLocaleDateString() : date.toLocaleString();
		});

		// Timeline tooltips
		const tip = document.getElementById("proto-tooltip");
		document.addEventListener("mouseover", (e) => {
			const target = e.target.closest && e.target.closest("[data-tip]");
			if (!target || !tip) return;
			tip.textContent = target.getAttribute("data-tip");
			tip.style.display = "block";
			tip.style.left = Math.max(8, e.clientX - 60) + "px";
			tip.style.top = (e.clientY - 16 - tip.offsetHeight) + "px";
		});
		document.addEventListener("mouseout", (e) => {
			if (tip && e.target.closest && e.target.closest("[data-tip]")) tip.style.display = "none";
		});
	</script>
</body>
</html>`;
}

