/**
 * Incidents page: write up incidents for the public status page and post updates
 * (investigating → identified → monitoring → resolved) as they progress.
 */

import { css, type Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import {
	pageHeader,
	pageTitle,
	pageSubtitle,
	cardGrid,
	card,
	cardTitle,
	cardTitleFlush,
	dim,
	dimSpaced,
	dimMono,
	strong,
	button,
	badge,
	formActions,
	formGroup,
	formRow,
	formLabel,
	formControl,
	formTextareaProse,
} from "~/app/http/views/styles";
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

const metaRow = css({ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" });
const postHeader = css({ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" });
const postUpdates = css({ marginTop: "0.75rem" });
const postUpdate = css({
	borderLeft: "2px solid var(--border-strong)",
	paddingLeft: "12px",
	marginTop: "0.625rem",
	fontSize: "0.8125rem",
});
const updateMessage = css({ color: "var(--text-secondary)", whiteSpace: "pre-line", marginTop: "2px" });
const updateDetails = css({ marginTop: "1rem" });
const updateSummary = css({ color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8125rem" });
const updateForm = css({ marginTop: "0.75rem" });
const resolvedHeading = css({
	fontSize: "0.75rem",
	color: "var(--text-muted)",
	textTransform: "uppercase",
	letterSpacing: "0.04em",
	margin: "1.5rem 0 0.75rem",
});

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
				<div mix={pageHeader}>
					<div>
						<h1 mix={pageTitle}>Incidents</h1>
						<p mix={pageSubtitle}>
							Tell your users what is going on. Open incidents show at the top of the public status page; resolved ones stay in its history for 7
							days. Outages detected by checks appear there automatically.
						</p>
					</div>
				</div>

				<div mix={cardGrid}>
					<section mix={card}>
						<h2 mix={cardTitle}>Open an incident</h2>
						{props.form ? <FormErrorSummary /> : null}
						<form method="POST" action={routes.createStatusPost.href()} novalidate>
							<div mix={formGroup}>
								<label for="post-title" mix={formLabel}>Title</label>
								<input
									id="post-title"
									name="title"
									mix={formControl}
									placeholder="Payments are failing"
									value={values.title ?? ""}
									maxlength={150}
									{...invalidProps("post-title-error", errors.title)}
								/>
								<FieldError id="post-title-error" message={errors.title} />
							</div>
							<div mix={formRow}>
								<div mix={formGroup}>
									<label for="post-impact" mix={formLabel}>Impact</label>
									<select id="post-impact" name="impact">
										{statusPostImpacts.map((i) => (
											<option value={i} selected={i === (values.impact || "minor")}>
												{statusPostImpactLabels[i]}
											</option>
										))}
									</select>
								</div>
								<div mix={formGroup}>
									<label for="post-status" mix={formLabel}>Status</label>
									<select id="post-status" name="status">
										<StatusOptions selected={values.status || "investigating"} />
									</select>
								</div>
							</div>
							<div mix={formGroup}>
								<label for="post-message" mix={formLabel}>Message</label>
								<textarea
									id="post-message"
									name="message"
									rows={4}
									mix={formTextareaProse}
									placeholder="We are investigating failed card payments."
									value={values.message ?? ""}
									{...invalidProps("post-message-error", errors.message)}
								/>
								<FieldError id="post-message-error" message={errors.message} />
							</div>
							<div mix={formActions}>
								<button type="submit" mix={button.primary}>
									Publish
								</button>
							</div>
						</form>
					</section>

					<div>
						{open.length === 0 ? (
							<section mix={card}>
								<h2 mix={cardTitle}>Open</h2>
								<p mix={dim}>No open incidents.</p>
							</section>
						) : (
							open.map(post)
						)}
						{resolved.length > 0 ? (
							<>
								<h3 mix={resolvedHeading}>Resolved</h3>
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
		const impactBadge = post.impact === "major" ? badge.down : post.impact === "minor" ? badge.degraded : badge.maintenance;

		return (
			<section mix={card}>
				<div mix={postHeader}>
					<div>
						<div mix={metaRow}>
							<h2 mix={cardTitleFlush}>{post.title}</h2>
							<span mix={impactBadge}>{post.impact}</span>
							<span mix={post.status === "resolved" ? badge.up : badge.pending}>{statusPostStatusLabels[post.status]}</span>
						</div>
						<div mix={dimSpaced}>
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
						<button type="submit" mix={button.dangerSmall}>
							Delete
						</button>
					</form>
				</div>

				<div mix={postUpdates}>
					{updates.map((u) => (
						<div key={u.id} mix={postUpdate}>
							<b mix={strong}>{statusPostStatusLabels[u.status]}</b>{" "}
							<span mix={dimMono}>
								<LocalTime at={u.created_at} />
							</span>
							<div mix={updateMessage}>{u.message}</div>
						</div>
					))}
				</div>

				<details open={Boolean(rejected)} mix={updateDetails}>
					<summary mix={updateSummary}>
						Post an update
					</summary>
					<form method="POST" action={routes.addStatusPostUpdate.href({ id: post.id })} mix={updateForm} novalidate>
						<div mix={formGroup}>
							<label for={`${prefix}-status`}>Status</label>
							<select id={`${prefix}-status`} name="status">
								<StatusOptions selected={rejected?.values.status || (post.status === "resolved" ? "resolved" : nextStatus(post.status))} />
							</select>
						</div>
						<div mix={formGroup}>
							<label for={`${prefix}-message`}>Message</label>
							<textarea
								id={`${prefix}-message`}
								name="message"
								rows={3}
								mix={formTextareaProse}
								value={rejected?.values.message ?? ""}
								{...invalidProps(`${prefix}-message-error`, updateErrors.message)}
							/>
							<FieldError id={`${prefix}-message-error`} message={updateErrors.message} />
						</div>
						<div mix={formActions}>
							<button type="submit" mix={button.primarySmall}>
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
