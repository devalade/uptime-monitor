/**
 * Incidents page: write up incidents for the public status page and post updates
 * (investigating → identified → monitoring → resolved) as they progress.
 */

import type { Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import { FieldError, FormErrorSummary, invalidProps, LocalTime } from "~/app/http/views/ui";
import {
	statusPostImpactLabels,
	statusPostStatusLabels,
	type StatusPostFormErrors,
	type StatusPostFormValues,
	type StatusPostWithUpdates,
} from "~/app/services/status-posts";
import { statusPostImpacts, statusPostStatuses, type StatusPostStatus } from "~/database/schema";
import routes from "~/routes/web";

type RejectedUpdate = { postId: string; values: StatusPostFormValues; errors: StatusPostFormErrors };

export interface StatusPostsPageProps {
	posts: StatusPostWithUpdates[];
	form?: { values: StatusPostFormValues; errors: StatusPostFormErrors };
	/** A rejected update, shown on the post it was for. */
	updateForm?: RejectedUpdate;
}

function StatusOptions(handle: Handle<{ selected: string }>) {
	return () => (
		<>
			{statusPostStatuses.map((s) => (
				<option value={s} selected={s === handle.props.selected}>
					{statusPostStatusLabels[s]}
				</option>
			))}
		</>
	);
}

export function StatusPostsPage(handle: Handle<StatusPostsPageProps>) {
	return () => {
		const props = handle.props;
		const values = props.form?.values ?? {};
		const errors = props.form?.errors ?? {};
		const open = props.posts.filter((p) => p.post.resolved_at === null);
		const resolved = props.posts.filter((p) => p.post.resolved_at !== null);
		const post = (entry: StatusPostWithUpdates) => (
			<PostCard key={entry.post.id} entry={entry} rejected={props.updateForm?.postId === entry.post.id ? props.updateForm : undefined} />
		);

		return (
			<Layout title="Incidents" currentPath={routes.statusPosts.href()}>
				<div class="page-header">
					<div>
						<h1 class="page-title">Incidents</h1>
						<p class="page-subtitle">
							Tell your users what is going on. Open incidents show at the top of the public status page; resolved ones stay in its history for 7
							days. Outages detected by checks appear there automatically.
						</p>
					</div>
				</div>

				<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; align-items: start;">
					<section class="card">
						<h2>Open an incident</h2>
						{props.form ? <FormErrorSummary /> : null}
						<form method="POST" action={routes.createStatusPost.href()} novalidate>
							<div class="form-group">
								<label for="post-title">Title</label>
								<input
									id="post-title"
									name="title"
									class="form-control"
									placeholder="Payments are failing"
									value={values.title ?? ""}
									maxlength={150}
									{...invalidProps("post-title-error", errors.title)}
								/>
								<FieldError id="post-title-error" message={errors.title} />
							</div>
							<div class="form-row">
								<div class="form-group">
									<label for="post-impact">Impact</label>
									<select id="post-impact" name="impact" class="form-control">
										{statusPostImpacts.map((i) => (
											<option value={i} selected={i === (values.impact || "minor")}>
												{statusPostImpactLabels[i]}
											</option>
										))}
									</select>
								</div>
								<div class="form-group">
									<label for="post-status">Status</label>
									<select id="post-status" name="status" class="form-control">
										<StatusOptions selected={values.status || "investigating"} />
									</select>
								</div>
							</div>
							<div class="form-group">
								<label for="post-message">Message</label>
								<textarea
									id="post-message"
									name="message"
									rows={4}
									class="form-control"
									style="font-family: inherit; font-size: 0.8125rem;"
									placeholder="We are investigating failed card payments."
									value={values.message ?? ""}
									{...invalidProps("post-message-error", errors.message)}
								/>
								<FieldError id="post-message-error" message={errors.message} />
							</div>
							<div style="display: flex; justify-content: flex-end;">
								<button type="submit" class="btn btn-primary">
									Publish
								</button>
							</div>
						</form>
					</section>

					<div>
						{open.length === 0 ? (
							<section class="card">
								<h2>Open</h2>
								<p class="dim">No open incidents.</p>
							</section>
						) : (
							open.map(post)
						)}
						{resolved.length > 0 ? (
							<>
								<h3
									style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 1.5rem 0 0.75rem;"
								>
									Resolved
								</h3>
								{resolved.map(post)}
							</>
						) : null}
					</div>
				</div>
			</Layout>
		);
	};
}

function PostCard(handle: Handle<{ entry: StatusPostWithUpdates; rejected?: RejectedUpdate }>) {
	return () => {
		const { entry, rejected } = handle.props;
		const { post, updates } = entry;
		const updateErrors = rejected?.errors ?? {};
		const prefix = `u-${post.id}`;
		const impactBadge = post.impact === "major" ? "badge-down" : post.impact === "minor" ? "badge-degraded" : "badge-maintenance";

		return (
			<section class="card">
				<div style="display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-start;">
					<div>
						<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
							<h2 style="margin: 0;">{post.title}</h2>
							<span class={`badge ${impactBadge}`}>{post.impact}</span>
							<span class={`badge ${post.status === "resolved" ? "badge-up" : "badge-pending"}`}>{statusPostStatusLabels[post.status]}</span>
						</div>
						<div class="dim" style="margin-top: 0.25rem;">
							Opened <LocalTime at={post.created_at} />
							{post.resolved_at ? (
								<>
									{" "}
									· resolved <LocalTime at={post.resolved_at} />
								</>
							) : null}
						</div>
					</div>
					<form method="POST" action={routes.deleteStatusPost.href({ id: post.id })} data-confirm={`Delete “${post.title}” from the status page?`}>
						<button type="submit" class="btn btn-danger btn-sm">
							Delete
						</button>
					</form>
				</div>

				<div style="margin-top: 0.75rem;">
					{updates.map((u) => (
						<div key={u.id} style="border-left: 2px solid var(--border-strong); padding-left: 12px; margin-top: 0.625rem; font-size: 0.8125rem;">
							<b style="color: var(--text-primary);">{statusPostStatusLabels[u.status]}</b>{" "}
							<span class="dim mono">
								<LocalTime at={u.created_at} />
							</span>
							<div style="color: var(--text-secondary); white-space: pre-line; margin-top: 2px;">{u.message}</div>
						</div>
					))}
				</div>

				<details open={Boolean(rejected)} style="margin-top: 1rem;">
					<summary class="muted" style="cursor: pointer; font-size: 0.8125rem;">
						Post an update
					</summary>
					<form method="POST" action={routes.addStatusPostUpdate.href({ id: post.id })} style="margin-top: 0.75rem;" novalidate>
						<div class="form-group">
							<label for={`${prefix}-status`}>Status</label>
							<select id={`${prefix}-status`} name="status" class="form-control">
								<StatusOptions selected={rejected?.values.status || (post.status === "resolved" ? "resolved" : nextStatus(post.status))} />
							</select>
						</div>
						<div class="form-group">
							<label for={`${prefix}-message`}>Message</label>
							<textarea
								id={`${prefix}-message`}
								name="message"
								rows={3}
								class="form-control"
								style="font-family: inherit; font-size: 0.8125rem;"
								value={rejected?.values.message ?? ""}
								{...invalidProps(`${prefix}-message-error`, updateErrors.message)}
							/>
							<FieldError id={`${prefix}-message-error`} message={updateErrors.message} />
						</div>
						<div style="display: flex; justify-content: flex-end;">
							<button type="submit" class="btn btn-primary btn-sm">
								Post update
							</button>
						</div>
					</form>
				</details>
			</section>
		);
	};
}

function nextStatus(status: StatusPostStatus): StatusPostStatus {
	const index = statusPostStatuses.indexOf(status);
	return statusPostStatuses[Math.min(index + 1, statusPostStatuses.length - 1)];
}
