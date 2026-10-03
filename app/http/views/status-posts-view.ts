/**
 * Incidents page: write up incidents for the public status page and post updates
 * (investigating → identified → monitoring → resolved) as they progress.
 */

import { escapeHtml, renderTime } from "~/app/http/views/html";
import { renderLayout } from "~/app/http/views/layout";
import {
	statusPostImpactLabels,
	statusPostStatusLabels,
	type StatusPostFormErrors,
	type StatusPostFormValues,
	type StatusPostWithUpdates,
} from "~/app/services/status-posts";
import { statusPostImpacts, statusPostStatuses, type StatusPostStatus } from "~/database/schema";
import routes from "~/routes/web";

export interface StatusPostsViewProps {
	posts: StatusPostWithUpdates[];
	form?: { values: StatusPostFormValues; errors: StatusPostFormErrors };
	/** A rejected update, shown on the post it was for. */
	updateForm?: { postId: string; values: StatusPostFormValues; errors: StatusPostFormErrors };
}

export function renderStatusPostsView(props: StatusPostsViewProps): string {
	const values = props.form?.values ?? {};
	const errors = props.form?.errors ?? {};
	const field = (name: keyof StatusPostFormErrors, prefix: string, errs: StatusPostFormErrors) => ({
		error: errs[name] ? `<p class="form-error" id="${prefix}-${name}-error">${escapeHtml(errs[name] ?? "")}</p>` : "",
		invalid: errs[name] ? `aria-invalid="true" aria-describedby="${prefix}-${name}-error"` : "",
	});

	const statusOptions = (selected: string, exclude?: StatusPostStatus) =>
		statusPostStatuses
			.filter((s) => s !== exclude)
			.map((s) => `<option value="${s}" ${s === selected ? "selected" : ""}>${statusPostStatusLabels[s]}</option>`)
			.join("");

	const open = props.posts.filter((p) => p.post.resolved_at === null);
	const resolved = props.posts.filter((p) => p.post.resolved_at !== null);

	const renderPost = ({ post, updates }: StatusPostWithUpdates) => {
		const rejected = props.updateForm?.postId === post.id ? props.updateForm : undefined;
		const updateErrors = rejected?.errors ?? {};
		const prefix = `u-${post.id}`;
		const message = field("message", prefix, updateErrors);
		const impactBadge =
			post.impact === "major" ? "badge-down" : post.impact === "minor" ? "badge-degraded" : "badge-maintenance";
		return `
		<section class="card">
			<div style="display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-start;">
				<div>
					<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
						<h2 style="margin: 0;">${escapeHtml(post.title)}</h2>
						<span class="badge ${impactBadge}">${post.impact}</span>
						<span class="badge ${post.status === "resolved" ? "badge-up" : "badge-pending"}">${statusPostStatusLabels[post.status]}</span>
					</div>
					<div class="dim" style="margin-top: 0.25rem;">Opened ${renderTime(post.created_at)}${post.resolved_at ? ` · resolved ${renderTime(post.resolved_at)}` : ""}</div>
				</div>
				<form method="POST" action="${routes.deleteStatusPost.href({ id: post.id })}" data-confirm="${escapeHtml(`Delete “${post.title}” from the status page?`)}">
					<button type="submit" class="btn btn-danger btn-sm">Delete</button>
				</form>
			</div>

			<div style="margin-top: 0.75rem;">
				${updates
					.map(
						(u) => `<div style="border-left: 2px solid var(--border-strong); padding-left: 12px; margin-top: 0.625rem; font-size: 0.8125rem;">
					<b style="color: var(--text-primary);">${statusPostStatusLabels[u.status]}</b> <span class="dim mono">${renderTime(u.created_at)}</span>
					<div style="color: var(--text-secondary); white-space: pre-line; margin-top: 2px;">${escapeHtml(u.message)}</div>
				</div>`,
					)
					.join("")}
			</div>

			<details ${rejected ? "open" : ""} style="margin-top: 1rem;">
				<summary class="muted" style="cursor: pointer; font-size: 0.8125rem;">Post an update</summary>
				<form method="POST" action="${routes.addStatusPostUpdate.href({ id: post.id })}" style="margin-top: 0.75rem;" novalidate>
					<div class="form-group">
						<label for="${prefix}-status">Status</label>
						<select id="${prefix}-status" name="status" class="form-control">${statusOptions(rejected?.values.status || (post.status === "resolved" ? "resolved" : nextStatus(post.status)))}</select>
					</div>
					<div class="form-group">
						<label for="${prefix}-message">Message</label>
						<textarea id="${prefix}-message" name="message" rows="3" class="form-control" style="font-family: inherit; font-size: 0.8125rem;" ${message.invalid}>${escapeHtml(rejected?.values.message ?? "")}</textarea>
						${message.error}
					</div>
					<div style="display: flex; justify-content: flex-end;"><button type="submit" class="btn btn-primary btn-sm">Post update</button></div>
				</form>
			</details>
		</section>`;
	};

	const title = field("title", "post", errors);
	const message = field("message", "post", errors);

	const content = `
		<div class="page-header">
			<div>
				<h1 class="page-title">Incidents</h1>
				<p class="page-subtitle">Tell your users what is going on. Open incidents show at the top of the public status page; resolved ones stay in its history for 7 days. Outages detected by checks appear there automatically.</p>
			</div>
		</div>

		<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; align-items: start;">
			<section class="card">
				<h2>Open an incident</h2>
				${props.form ? `<div class="alert alert-error" role="alert">Please fix the highlighted fields.</div>` : ""}
				<form method="POST" action="${routes.createStatusPost.href()}" novalidate>
					<div class="form-group">
						<label for="post-title">Title</label>
						<input id="post-title" name="title" class="form-control" placeholder="Payments are failing" value="${escapeHtml(values.title ?? "")}" maxlength="150" ${title.invalid} />
						${title.error}
					</div>
					<div class="form-row">
						<div class="form-group">
							<label for="post-impact">Impact</label>
							<select id="post-impact" name="impact" class="form-control">
								${statusPostImpacts.map((i) => `<option value="${i}" ${i === (values.impact || "minor") ? "selected" : ""}>${statusPostImpactLabels[i]}</option>`).join("")}
							</select>
						</div>
						<div class="form-group">
							<label for="post-status">Status</label>
							<select id="post-status" name="status" class="form-control">${statusOptions(values.status || "investigating")}</select>
						</div>
					</div>
					<div class="form-group">
						<label for="post-message">Message</label>
						<textarea id="post-message" name="message" rows="4" class="form-control" style="font-family: inherit; font-size: 0.8125rem;" placeholder="We are investigating failed card payments." ${message.invalid}>${escapeHtml(values.message ?? "")}</textarea>
						${message.error}
					</div>
					<div style="display: flex; justify-content: flex-end;"><button type="submit" class="btn btn-primary">Publish</button></div>
				</form>
			</section>

			<div>
				${open.length === 0 ? `<section class="card"><h2>Open</h2><p class="dim">No open incidents.</p></section>` : open.map(renderPost).join("")}
				${resolved.length > 0 ? `<h3 class="history-title" style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 1.5rem 0 0.75rem;">Resolved</h3>${resolved.map(renderPost).join("")}` : ""}
			</div>
		</div>
	`;

	return renderLayout({ title: "Incidents", children: content, currentPath: routes.statusPosts.href() });
}

function nextStatus(status: StatusPostStatus): StatusPostStatus {
	const index = statusPostStatuses.indexOf(status);
	return statusPostStatuses[Math.min(index + 1, statusPostStatuses.length - 1)];
}
