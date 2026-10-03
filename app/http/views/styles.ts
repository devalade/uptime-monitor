/**
 * Styling for the server-rendered pages.
 *
 * `globalStylesheet` holds only what has to be global: design tokens, the reset and base element
 * defaults. It lives in the `base` cascade layer, which Remix's generated `css(...)` rules
 * (the `rmx` layer) always beat, so a reset can never override a component style.
 *
 * Everything else is a `css(...)` mixin applied with `mix`. A variant is its own complete mixin
 * built from a shared base object, so an element carries one generated class and the result never
 * depends on rule order. Static text only: nothing from a request is ever interpolated here.
 */

import { css } from "remix/component";

export const globalStylesheet = `
@layer base, rmx;

@layer base {
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

		--up: #3fb950;
		--up-bg: rgba(63, 185, 80, 0.12);
		--up-border: rgba(63, 185, 80, 0.3);
		--up-solid: #238636;
		--up-solid-hover: #2ea043;

		--down: #f85149;
		--down-bg: rgba(248, 81, 73, 0.12);
		--down-border: rgba(248, 81, 73, 0.35);
		--down-solid: #da3633;
		--down-text: #ff7b72;

		--degraded: #d29922;
		--degraded-bg: rgba(210, 153, 34, 0.12);
		--degraded-border: rgba(210, 153, 34, 0.35);
		--degraded-text: #e3b341;

		--brand: #58a6ff;
		--brand-bg: rgba(56, 139, 253, 0.15);
		--brand-border: rgba(56, 139, 253, 0.35);

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

	[hidden] {
		display: none !important;
	}

	@media print {
		body {
			background: #fff;
			color: #000;
		}
	}
}
`;

// ---------------------------------------------------------------------------------------------
// Document chrome
// ---------------------------------------------------------------------------------------------

export const siteHeader = css({
	position: "sticky",
	top: 0,
	zIndex: 50,
	background: "var(--bg-surface)",
	borderBottom: "1px solid var(--border-subtle)",
	"@media print": { display: "none" },
});

export const headerContainer = css({
	maxWidth: "1240px",
	margin: "0 auto",
	padding: "0.625rem 1.5rem",
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	height: "52px",
	"@media (max-width: 720px)": {
		padding: "0.625rem 1rem",
		height: "auto",
		flexWrap: "wrap",
		gap: "0.5rem",
	},
});

export const brandGroup = css({ display: "flex", alignItems: "center", gap: "1.25rem" });

export const brand = css({
	display: "flex",
	alignItems: "center",
	gap: "0.75rem",
	fontSize: "0.875rem",
	fontWeight: "600",
	color: "var(--text-primary)",
});

export const brandLogo = css({ height: "22px", maxWidth: "120px", objectFit: "contain" });

export const headerActions = css({ display: "flex", alignItems: "center", gap: "1rem" });

export const navMenu = css({
	display: "flex",
	alignItems: "center",
	gap: "0.25rem",
	"@media (max-width: 720px)": { flexWrap: "wrap" },
});

const navItemBase = {
	padding: "0.375rem 0.75rem",
	fontSize: "0.8125rem",
	fontWeight: "500",
	color: "var(--text-muted)",
	borderRadius: "4px",
	transition: "all 120ms ease",
	"&:hover": {
		color: "var(--text-primary)",
		background: "var(--bg-surface-hover)",
	},
};

export const navItem = css(navItemBase);

export const navItemActive = css({
	...navItemBase,
	color: "var(--text-primary)",
	background: "var(--bg-surface-active)",
	fontWeight: "600",
});

export const pageMain = css({
	flex: 1,
	maxWidth: "1240px",
	width: "100%",
	margin: "0 auto",
	padding: "1.5rem 1.5rem 4rem",
	"@media (max-width: 720px)": { padding: "1rem 1rem 3rem" },
});

export const siteFooter = css({
	borderTop: "1px solid var(--border-subtle)",
	padding: "1.5rem",
	textAlign: "center",
	fontSize: "0.75rem",
	color: "var(--text-dim)",
	background: "var(--bg-surface)",
	"@media print": { display: "none" },
});

export const footerLink = css({ textDecoration: "underline" });

/** Floating tooltip for the check timelines; the client script positions and shows it. */
export const tooltip = css({
	position: "fixed",
	display: "none",
	pointerEvents: "none",
	background: "var(--bg-surface)",
	border: "1px solid var(--border-medium)",
	borderRadius: "4px",
	padding: "6px 10px",
	fontSize: "11px",
	lineHeight: "1.4",
	color: "var(--text-secondary)",
	fontFamily: "var(--font-mono)",
	zIndex: 100000,
	boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
	whiteSpace: "pre-line",
});

export const noPrint = css({ "@media print": { display: "none" } });

// ---------------------------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------------------------

export const pageHeader = css({
	display: "flex",
	justifyContent: "space-between",
	alignItems: "flex-end",
	gap: "1rem",
	flexWrap: "wrap",
	marginBottom: "1.25rem",
});

export const pageTitle = css({
	fontSize: "1.25rem",
	fontWeight: "700",
	color: "var(--text-primary)",
	letterSpacing: "-0.01em",
	"@media print": { color: "#000" },
});

export const pageTitleCentered = css({
	fontSize: "1.25rem",
	fontWeight: "700",
	color: "var(--text-primary)",
	letterSpacing: "-0.01em",
	marginBottom: "0.5rem",
});

export const pageSubtitle = css({
	fontSize: "0.8125rem",
	color: "var(--text-muted)",
	marginTop: "0.125rem",
});

/** Side-by-side cards that collapse to one column when narrow. */
export const cardGrid = css({
	display: "grid",
	gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
	gap: "1.25rem",
	alignItems: "start",
});

export const cardGridWide = css({
	display: "grid",
	gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
	gap: "1.25rem",
	alignItems: "start",
});

const cardBase = {
	background: "var(--bg-surface)",
	border: "1px solid var(--border-medium)",
	borderRadius: "6px",
	padding: "1.25rem",
	marginBottom: "1.25rem",
	"@media print": {
		background: "#fff",
		color: "#000",
		borderColor: "#ccc",
	},
};

export const card = css(cardBase);

/** A card that holds a table edge to edge. */
export const cardFlush = css({ ...cardBase, padding: 0, overflowX: "auto" });

export const cardSplit = css({
	...cardBase,
	display: "grid",
	gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
	gap: "1.5rem",
});

export const cardTitle = css({
	fontSize: "0.9375rem",
	fontWeight: "600",
	color: "var(--text-primary)",
	marginBottom: "0.875rem",
});

export const cardTitleFlush = css({
	fontSize: "0.9375rem",
	fontWeight: "600",
	color: "var(--text-primary)",
});

export const cardHeaderRow = css({
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	gap: "1rem",
	flexWrap: "wrap",
	marginBottom: "0.875rem",
});

export const sectionTitle = css({
	fontSize: "1.125rem",
	fontWeight: "700",
	letterSpacing: "-0.01em",
});

export const sectionHeader = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	marginBottom: "1.25rem",
});

export const listRow = css({
	display: "flex",
	justifyContent: "space-between",
	alignItems: "flex-start",
	gap: "1rem",
	padding: "0.875rem 0",
	borderBottom: "1px solid var(--border-subtle)",
	"&:last-child": { borderBottom: "none" },
});

export const listRowDisabled = css({
	display: "flex",
	justifyContent: "space-between",
	alignItems: "flex-start",
	gap: "1rem",
	padding: "0.875rem 0",
	borderBottom: "1px solid var(--border-subtle)",
	opacity: 0.55,
	"&:last-child": { borderBottom: "none" },
});

export const grow = css({ minWidth: 0 });

export const rowActions = css({
	display: "flex",
	gap: "4px",
	flexWrap: "wrap",
	justifyContent: "flex-end",
});

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------

export const muted = css({ color: "var(--text-muted)" });
export const mutedSmall = css({ color: "var(--text-muted)", fontSize: "0.8125rem" });
export const mutedSmallSpaced = css({ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "0.75rem" });
export const dim = css({ color: "var(--text-dim)", fontSize: "0.75rem" });
export const dimSpaced = css({ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: "0.25rem" });
export const dimMono = css({ color: "var(--text-dim)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" });
export const mono = css({ fontFamily: "var(--font-mono)" });
export const strong = css({ color: "var(--text-primary)" });
export const link = css({ color: "var(--brand)" });
export const underlinedLink = css({ color: "inherit", textDecoration: "underline" });

// ---------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------

const buttonBase = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "0.375rem",
	padding: "0.375rem 0.75rem",
	fontSize: "0.75rem",
	fontWeight: "500",
	borderRadius: "4px",
	border: "1px solid transparent",
	cursor: "pointer",
	transition: "all 100ms ease",
	textDecoration: "none",
	lineHeight: "1.25",
	fontFamily: "inherit",
};

const buttonSmall = {
	padding: "0.25rem 0.5rem",
	fontSize: "0.6875rem",
	borderRadius: "3px",
};

const buttonPrimary = {
	background: "var(--up-solid)",
	color: "#ffffff",
	borderColor: "var(--up-solid-hover)",
	"&:hover": { background: "var(--up-solid-hover)" },
};

const buttonSecondary = {
	background: "var(--bg-surface-active)",
	borderColor: "var(--border-medium)",
	color: "var(--text-secondary)",
	"&:hover": {
		background: "var(--border-medium)",
		color: "var(--text-primary)",
	},
};

const buttonDanger = {
	background: "var(--down-bg)",
	borderColor: "var(--down-border)",
	color: "var(--down-text)",
	"&:hover": {
		background: "var(--down-solid)",
		color: "#ffffff",
		borderColor: "var(--down-solid)",
	},
};

export const button = {
	primary: css({ ...buttonBase, ...buttonPrimary }),
	secondary: css({ ...buttonBase, ...buttonSecondary }),
	danger: css({ ...buttonBase, ...buttonDanger }),
	primarySmall: css({ ...buttonBase, ...buttonPrimary, ...buttonSmall }),
	secondarySmall: css({ ...buttonBase, ...buttonSecondary, ...buttonSmall }),
	dangerSmall: css({ ...buttonBase, ...buttonDanger, ...buttonSmall }),
	primaryNoWrap: css({ ...buttonBase, ...buttonPrimary, whiteSpace: "nowrap" }),
	/** The round close button in a dialog corner. */
	close: css({ ...buttonBase, ...buttonSecondary, ...buttonSmall, borderRadius: "50%", width: "26px", height: "26px", padding: 0 }),
};

const filterButtonBase = {
	background: "transparent",
	border: "1px solid var(--border-medium)",
	color: "var(--text-muted)",
	padding: "4px 10px",
	borderRadius: "4px",
	fontSize: "11px",
	cursor: "pointer",
	fontFamily: "inherit",
};

export const filterButton = {
	idle: css(filterButtonBase),
	idleDown: css({ ...filterButtonBase, borderColor: "var(--down-border)", color: "var(--down-text)" }),
	active: css({
		...filterButtonBase,
		background: "var(--bg-surface-active)",
		color: "var(--text-primary)",
		borderColor: "var(--border-strong)",
		fontWeight: "600",
	}),
};

// ---------------------------------------------------------------------------------------------
// Status indicators
// ---------------------------------------------------------------------------------------------

const statusDotBase = {
	width: "6px",
	height: "6px",
	borderRadius: "50%",
	display: "inline-block",
	flexShrink: 0,
};

export const statusDot = {
	up: css({ ...statusDotBase, background: "var(--up)" }),
	down: css({ ...statusDotBase, background: "var(--down)" }),
	degraded: css({ ...statusDotBase, background: "var(--degraded)" }),
	paused: css({ ...statusDotBase, background: "var(--text-dim)" }),
};

const badgeBase = {
	display: "inline-flex",
	alignItems: "center",
	gap: "0.375rem",
	padding: "0.125rem 0.4375rem",
	borderRadius: "3px",
	fontSize: "0.6875rem",
	fontWeight: "600",
	fontFamily: "var(--font-mono)",
	textTransform: "uppercase",
};

export const badge = {
	up: css({ ...badgeBase, background: "var(--up-bg)", color: "var(--up)", border: "1px solid var(--up-border)" }),
	down: css({ ...badgeBase, background: "var(--down-bg)", color: "var(--down-text)", border: "1px solid var(--down-border)" }),
	degraded: css({ ...badgeBase, background: "var(--degraded-bg)", color: "var(--degraded-text)", border: "1px solid var(--degraded-border)" }),
	pending: css({ ...badgeBase, background: "rgba(255, 255, 255, 0.05)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }),
	maintenance: css({ ...badgeBase, background: "var(--brand-bg)", color: "var(--brand)", border: "1px solid var(--brand-border)" }),
};

const methodChipBase = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.625rem",
	fontWeight: "700",
	padding: "0.0625rem 0.3125rem",
	borderRadius: "3px",
};

export const methodChip = {
	get: css({ ...methodChipBase, background: "rgba(56, 139, 253, 0.15)", color: "#58a6ff", border: "1px solid rgba(56, 139, 253, 0.3)" }),
	head: css({ ...methodChipBase, background: "rgba(187, 128, 255, 0.15)", color: "#bc8cff", border: "1px solid rgba(187, 128, 255, 0.3)" }),
	post: css({ ...methodChipBase, background: "rgba(63, 185, 80, 0.15)", color: "#3fb950", border: "1px solid rgba(63, 185, 80, 0.3)" }),
	put: css({ ...methodChipBase, background: "rgba(210, 153, 34, 0.15)", color: "#e3b341", border: "1px solid rgba(210, 153, 34, 0.3)" }),
	patch: css({ ...methodChipBase, background: "rgba(210, 153, 34, 0.15)", color: "#e3b341", border: "1px solid rgba(210, 153, 34, 0.3)" }),
	delete: css({ ...methodChipBase, background: "var(--down-bg)", color: "var(--down-text)", border: "1px solid var(--down-border)" }),
	tcp: css({ ...methodChipBase, background: "rgba(219, 109, 40, 0.15)", color: "#f0883e", border: "1px solid rgba(219, 109, 40, 0.3)" }),
	dns: css(methodChipBase),
	heartbeat: css({ ...methodChipBase, background: "rgba(219, 97, 162, 0.15)", color: "#f778ba", border: "1px solid rgba(219, 97, 162, 0.3)" }),
};

export const timeline = css({ display: "flex", gap: "2px", alignItems: "center" });

const tickBase = {
	flex: 1,
	borderRadius: "1px",
	transition: "transform 60ms ease",
	"&:hover": { transform: "scaleY(1.35)" },
};

export const tick = {
	up: css({ ...tickBase, background: "var(--up)" }),
	down: css({ ...tickBase, background: "var(--down)" }),
	degraded: css({ ...tickBase, background: "var(--degraded)" }),
	maintenance: css({ ...tickBase, background: "var(--brand)" }),
	empty: css({ ...tickBase, background: "var(--border-subtle)" }),
};

// ---------------------------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------------------------

const alertBase = {
	borderRadius: "6px",
	padding: "0.625rem 0.875rem",
	fontSize: "0.8125rem",
	marginBottom: "1rem",
	border: "1px solid var(--border-medium)",
	background: "var(--bg-surface)",
	"& code": { fontFamily: "var(--font-mono)", fontSize: "0.75rem" },
};

export const alert = {
	info: css(alertBase),
	success: css({ ...alertBase, borderColor: "var(--up-border)", background: "var(--up-bg)", color: "var(--up)" }),
	error: css({ ...alertBase, borderColor: "var(--down-border)", background: "var(--down-bg)", color: "var(--down-text)" }),
	warning: css({ ...alertBase, borderColor: "var(--degraded-border)", background: "var(--degraded-bg)", color: "var(--degraded-text)" }),
	maintenance: css({ ...alertBase, borderColor: "var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand)" }),
};

// ---------------------------------------------------------------------------------------------
// Stats and tables
// ---------------------------------------------------------------------------------------------

export const statsGrid = css({
	display: "grid",
	gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
	gap: "1rem",
	marginBottom: "2rem",
});

const statCardBase = {
	background: "var(--bg-surface)",
	border: "1px solid var(--border-medium)",
	borderRadius: "6px",
	padding: "1.25rem",
};

export const statCard = css(statCardBase);
export const statCardEmpty = css({ ...statCardBase, padding: "2.5rem", textAlign: "center" });

export const statLabel = css({
	fontSize: "11px",
	color: "var(--text-muted)",
	fontWeight: "600",
	textTransform: "uppercase",
	letterSpacing: "0.04em",
});

const statValueBase = {
	fontSize: "1.75rem",
	fontWeight: "700",
	color: "var(--text-primary)",
	marginTop: "0.375rem",
	fontFeatureSettings: "'tnum' 1",
};

export const statValue = css(statValueBase);

/** Smaller value for timestamps. */
export const statValueMono = css({
	...statValueBase,
	fontSize: "1.125rem",
	marginTop: "0.75rem",
	fontFamily: "var(--font-mono)",
	color: "var(--text-secondary)",
});

export const statUnit = css({ fontSize: "1rem", color: "var(--text-muted)", marginLeft: "4px", fontWeight: "500" });

export const statCaption = css({ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" });

export const statLine = css({
	display: "flex",
	gap: "1rem",
	marginTop: "0.625rem",
	fontFamily: "var(--font-mono)",
	fontSize: "1.0625rem",
	fontWeight: "700",
});

export const tablePanel = css({
	background: "var(--bg-surface)",
	border: "1px solid var(--border-subtle)",
	borderRadius: "0.75rem",
	overflow: "hidden",
});

export const dataTable = css({
	width: "100%",
	borderCollapse: "collapse",
	fontSize: "12px",
});

export const tableRow = css({
	"&:hover td": { background: "var(--bg-surface-hover)" },
	"&:last-child td": { borderBottom: "none" },
});

export const tableHead = css({
	background: "var(--bg-root)",
	color: "var(--text-muted)",
	fontWeight: "600",
	textTransform: "uppercase",
	fontSize: "10px",
	letterSpacing: "0.04em",
	padding: "9px 16px",
	textAlign: "left",
	borderBottom: "1px solid var(--border-subtle)",
	"@media print": { background: "#fff", color: "#000", borderColor: "#ccc" },
});

const tableCellBase = {
	padding: "10px 16px",
	borderBottom: "1px solid var(--border-subtle)",
	color: "var(--text-secondary)",
	"@media print": { background: "#fff", color: "#000", borderColor: "#ccc" },
};

export const tableCell = css(tableCellBase);
export const tableCellPlainMono = css({ ...tableCellBase, fontFamily: "var(--font-mono)" });
export const tableCellMono = css({ ...tableCellBase, fontFamily: "var(--font-mono)", fontSize: "0.8125rem" });
export const tableCellMonoBold = css({ ...tableCellBase, fontFamily: "var(--font-mono)", fontWeight: "600" });
export const tableCellMuted = css({ ...tableCellBase, color: "var(--text-muted)" });
export const tableCellEmpty = css({ ...tableCellBase, textAlign: "center", color: "var(--text-muted)", padding: "2rem" });

export const settingsList = css({
	display: "grid",
	gap: "0.5rem",
	fontSize: "0.8125rem",
	"& div": { display: "grid", gridTemplateColumns: "140px 1fr", gap: "0.75rem" },
	"& dt": { color: "var(--text-muted)" },
	"& dd": {
		color: "var(--text-secondary)",
		fontFamily: "var(--font-mono)",
		fontSize: "0.75rem",
		wordBreak: "break-word",
	},
});

// ---------------------------------------------------------------------------------------------
// Forms and dialogs
// ---------------------------------------------------------------------------------------------

const dialogBase = {
	position: "fixed",
	top: "50%",
	left: "50%",
	transform: "translate(-50%, -50%)",
	background: "var(--bg-surface)",
	color: "var(--text-primary)",
	border: "1px solid var(--border-medium)",
	borderRadius: "8px",
	padding: "1.5rem",
	width: "92%",
	maxWidth: "480px",
	maxHeight: "90vh",
	overflowY: "auto",
	boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7)",
	"&::backdrop": {
		background: "rgba(0, 0, 0, 0.7)",
		backdropFilter: "blur(4px)",
	},
};

export const dialog = css(dialogBase);
export const dialogWide = css({ ...dialogBase, maxWidth: "560px" });

export const dialogHeader = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	marginBottom: "1.25rem",
});

export const dialogTitle = css({ fontSize: "1rem", fontWeight: "600", color: "var(--text-primary)" });
export const dialogSubtitle = css({ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.125rem" });
export const formActions = css({ display: "flex", justifyContent: "flex-end", gap: "0.5rem" });
export const formActionsSpaced = css({ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" });
export const formActionsSplit = css({ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" });
export const inlineForm = css({ display: "flex", gap: "0.5rem", marginTop: "0.75rem" });

// `<select>` rejects a `css(...)` mixin in its `mix` prop (its element type is too narrow for the
// mixin's), so selects are styled through the form group that wraps them.
const formControlBase = {
	width: "100%",
	padding: "0.5rem 0.75rem",
	backgroundColor: "var(--bg-root)",
	border: "1px solid var(--border-medium)",
	borderRadius: "4px",
	color: "var(--text-primary)",
	fontFamily: "inherit",
	fontSize: "0.8125rem",
	transition: "border-color 100ms ease",
	"&:focus": {
		outline: "none",
		borderColor: "var(--brand)",
		boxShadow: "0 0 0 2px rgba(56, 139, 253, 0.2)",
	},
	"&[aria-invalid='true']": { borderColor: "var(--down)" },
};

export const formGroup = css({ marginBottom: "1rem", border: "none", "& select": formControlBase });

export const formRow = css({
	display: "grid",
	gridTemplateColumns: "1fr 1fr",
	gap: "0.75rem",
	"@media (max-width: 720px)": { gridTemplateColumns: "1fr" },
});

export const formLabel = css({
	display: "block",
	fontSize: "0.75rem",
	fontWeight: "600",
	marginBottom: "0.375rem",
	color: "var(--text-muted)",
	textTransform: "uppercase",
	letterSpacing: "0.04em",
});

export const labelHint = css({
	textTransform: "none",
	letterSpacing: 0,
	fontWeight: "400",
	color: "var(--text-dim)",
});

export const fieldsetLegend = css({
	fontSize: "0.75rem",
	fontWeight: "600",
	marginBottom: "0.5rem",
	color: "var(--text-muted)",
	textTransform: "uppercase",
	letterSpacing: "0.04em",
});

export const formControl = css(formControlBase);
export const formControlGrow = css({ ...formControlBase, flex: 1, minWidth: "220px" });
export const formControlInline = css({ ...formControlBase, flex: 1 });
export const formTextarea = css({ ...formControlBase, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: "0.75rem" });
export const formTextareaProse = css({ ...formControlBase, resize: "vertical", fontFamily: "inherit", fontSize: "0.8125rem" });

export const formHelp = css({ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.375rem", lineHeight: "1.5" });
export const formHelpTight = css({ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "-0.5rem", marginBottom: "1rem", lineHeight: "1.5" });
export const formHelpBlock = css({ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: "1.5" });
export const formError = css({ color: "var(--down-text)", fontSize: "0.75rem", marginTop: "0.375rem" });

const checkboxBase = {
	display: "flex",
	alignItems: "center",
	gap: "8px",
	fontSize: "0.8125rem",
	color: "var(--text-secondary)",
	cursor: "pointer",
};

export const checkbox = css({ ...checkboxBase, marginBottom: "1rem" });
export const checkboxTight = css({ ...checkboxBase, marginBottom: "0.375rem" });
export const checkboxTighter = css({ ...checkboxBase, marginBottom: "0.25rem" });
export const checkboxIndent = css({ paddingLeft: "1.5rem" });
export const checkboxIndentScroll = css({ paddingLeft: "1.5rem", maxHeight: "180px", overflowY: "auto" });

export const advanced = css({
	marginBottom: "0.75rem",
	"& summary": { cursor: "pointer", fontSize: "0.75rem", color: "var(--text-muted)" },
});
export const advancedBody = css({ marginTop: "0.75rem" });

export const honeypot = css({ position: "absolute", left: "-9999px" });

const copyFieldBase = {
	display: "flex",
	gap: "0.5rem",
	alignItems: "center",
	"& code": {
		flex: 1,
		minWidth: 0,
		overflowX: "auto",
		whiteSpace: "nowrap",
		background: "var(--bg-root)",
		border: "1px solid var(--border-medium)",
		borderRadius: "4px",
		padding: "0.4375rem 0.625rem",
		fontFamily: "var(--font-mono)",
		fontSize: "0.75rem",
		color: "var(--text-primary)",
	},
};

export const copyField = css(copyFieldBase);
export const copyFieldSpaced = css({ ...copyFieldBase, marginBottom: "0.5rem" });
export const copyFieldAbove = css({ ...copyFieldBase, marginTop: "0.5rem" });
