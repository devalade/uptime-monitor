/**
 * Progressive enhancement for the server-rendered pages: dialogs, confirmations, busy buttons,
 * copy buttons, local times and tooltips. Pages work without it. Static text only.
 */

export const clientScript = `
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

// Monitor forms show only the fields of the chosen type
document.querySelectorAll("form[data-monitor-form]").forEach((form) => {
	const typeSelect = form.querySelector("select[name=type]");
	const sync = () => {
		form.querySelectorAll("[data-type-section]").forEach((section) => {
			section.hidden = !section.getAttribute("data-type-section").split(" ").includes(typeSelect.value);
		});
	};
	typeSelect.addEventListener("change", sync);
	sync();
});

// Copy buttons
document.querySelectorAll("[data-copy]").forEach((button) => {
	button.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(button.getAttribute("data-copy"));
			const label = button.textContent;
			button.textContent = "Copied";
			setTimeout(() => (button.textContent = label), 1500);
		} catch {}
	});
});

// datetime-local inputs carry no time zone, so send the browser's offset along
document.querySelectorAll("input[name=tz_offset]").forEach((input) => {
	input.value = String(new Date().getTimezoneOffset());
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

// Alert channel forms show only the fields of the chosen type
document.querySelectorAll("form[data-channel-form]").forEach((form) => {
	const select = form.querySelector("select[name=type]");
	const sync = () => form.querySelectorAll("[data-channel-section]").forEach((s) => (s.hidden = s.getAttribute("data-channel-section") !== select.value));
	select.addEventListener("change", sync);
	sync();
});

// Print buttons
document.querySelectorAll("[data-print]").forEach((button) => button.addEventListener("click", () => window.print()));
`;
