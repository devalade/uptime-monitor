/**
 * Status page announcements: incidents a person writes up for the public (investigating →
 * identified → monitoring → resolved), each with a timeline of updates.
 */

import { and, eq, gte, inList, isNull, notNull, or } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import {
	statusPostImpacts,
	statusPosts,
	statusPostStatuses,
	statusPostUpdates,
	type SelectStatusPost,
	type SelectStatusPostUpdate,
	type StatusPostImpact,
	type StatusPostStatus,
} from "~/database/schema";
import { DAY_MS } from "~/app/services/uptime-stats";

export const statusPostStatusLabels: Record<StatusPostStatus, string> = {
	investigating: "Investigating",
	identified: "Identified",
	monitoring: "Monitoring",
	resolved: "Resolved",
};

export const statusPostImpactLabels: Record<StatusPostImpact, string> = {
	none: "No impact (information)",
	minor: "Minor (some services affected)",
	major: "Major (outage)",
};

export interface StatusPostWithUpdates {
	post: SelectStatusPost;
	/** Newest first. */
	updates: SelectStatusPostUpdate[];
}

export interface PublicStatusPost {
	id: string;
	title: string;
	impact: StatusPostImpact;
	status: StatusPostStatus;
	createdAt: number;
	resolvedAt: number | null;
	updates: { status: StatusPostStatus; message: string; createdAt: number }[];
}

export interface CreateStatusPostInput {
	title: string;
	impact: StatusPostImpact;
	status: StatusPostStatus;
	message: string;
}

export async function createStatusPost(db: AppDatabase, input: CreateStatusPostInput): Promise<SelectStatusPost> {
	const now = Date.now();
	const post = await db.create(
		statusPosts,
		{
			id: crypto.randomUUID(),
			title: input.title,
			impact: input.impact,
			status: input.status,
			resolved_at: input.status === "resolved" ? now : null,
			created_at: now,
			updated_at: now,
		},
		{ returnRow: true },
	);
	await db.create(statusPostUpdates, {
		id: crypto.randomUUID(),
		post_id: post.id,
		status: input.status,
		message: input.message,
		created_at: now,
	});
	return post;
}

/** Adds an update and moves the post to its status. Returns null when the post does not exist. */
export async function addStatusPostUpdate(
	db: AppDatabase,
	postId: string,
	input: { status: StatusPostStatus; message: string },
): Promise<SelectStatusPost | null> {
	const post = await db.find(statusPosts, postId);
	if (!post) return null;

	const now = Date.now();
	await db.create(statusPostUpdates, {
		id: crypto.randomUUID(),
		post_id: postId,
		status: input.status,
		message: input.message,
		created_at: now,
	});
	return db.update(statusPosts, postId, {
		status: input.status,
		resolved_at: input.status === "resolved" ? (post.resolved_at ?? now) : null,
		updated_at: now,
	});
}

export async function deleteStatusPost(db: AppDatabase, id: string): Promise<void> {
	await db.deleteMany(statusPostUpdates, { where: eq(statusPostUpdates.post_id, id) });
	await db.delete(statusPosts, id);
}

export async function listStatusPosts(db: AppDatabase, limit = 30): Promise<StatusPostWithUpdates[]> {
	const posts = await db.findMany(statusPosts, { orderBy: [["created_at", "desc"]], limit });
	return withUpdates(db, posts);
}

/** Open posts, and posts resolved in the last 7 days, for the public page and feed. */
export async function listPublicStatusPosts(
	db: AppDatabase,
	now: number = Date.now(),
	historyDays = 7,
): Promise<{ active: PublicStatusPost[]; past: PublicStatusPost[] }> {
	const posts = await db.findMany(statusPosts, {
		where: or(isNull(statusPosts.resolved_at), and(notNull(statusPosts.resolved_at), gte(statusPosts.resolved_at, now - historyDays * DAY_MS))),
		orderBy: [["created_at", "desc"]],
		limit: 30,
	});
	const all = (await withUpdates(db, posts)).map(toPublic);
	return { active: all.filter((p) => p.resolvedAt === null), past: all.filter((p) => p.resolvedAt !== null) };
}

async function withUpdates(db: AppDatabase, posts: SelectStatusPost[]): Promise<StatusPostWithUpdates[]> {
	if (posts.length === 0) return [];
	const updates = await db.findMany(statusPostUpdates, {
		where: inList(statusPostUpdates.post_id, posts.map((p) => p.id)),
		orderBy: [["created_at", "desc"]],
	});
	return posts.map((post) => ({ post, updates: updates.filter((u) => u.post_id === post.id) }));
}

function toPublic({ post, updates }: StatusPostWithUpdates): PublicStatusPost {
	return {
		id: post.id,
		title: post.title,
		impact: post.impact,
		status: post.status,
		createdAt: post.created_at,
		resolvedAt: post.resolved_at,
		updates: updates.map((u) => ({ status: u.status, message: u.message, createdAt: u.created_at })),
	};
}

export type StatusPostFormField = "title" | "impact" | "status" | "message";
export type StatusPostFormValues = Partial<Record<StatusPostFormField, string>>;
export type StatusPostFormErrors = Partial<Record<StatusPostFormField, string>>;

export function readStatusPostForm(formData: FormData): StatusPostFormValues {
	const read = (field: StatusPostFormField) => formData.get(field)?.toString() ?? "";
	return { title: read("title"), impact: read("impact"), status: read("status"), message: read("message") };
}

export function parseStatusPostInput(
	values: StatusPostFormValues,
): { ok: true; value: CreateStatusPostInput } | { ok: false; errors: StatusPostFormErrors } {
	const errors: StatusPostFormErrors = {};
	const title = values.title?.trim() ?? "";
	if (!title) errors.title = "Give the incident a short title, e.g. Payments are failing.";
	else if (title.length > 150) errors.title = "Title must be 150 characters or fewer.";

	const impact = statusPostImpacts.find((i) => i === (values.impact || "minor"));
	if (!impact) errors.impact = "Pick the impact.";

	const update = parseStatusPostUpdate(values);
	if (!update.ok) Object.assign(errors, update.errors);

	if (Object.keys(errors).length > 0 || !impact || !update.ok) return { ok: false, errors };
	return { ok: true, value: { title, impact, ...update.value } };
}

export function parseStatusPostUpdate(
	values: StatusPostFormValues,
): { ok: true; value: { status: StatusPostStatus; message: string } } | { ok: false; errors: StatusPostFormErrors } {
	const errors: StatusPostFormErrors = {};
	const status = statusPostStatuses.find((s) => s === (values.status || "investigating"));
	if (!status) errors.status = "Pick a status.";
	const message = values.message?.trim() ?? "";
	if (!message) errors.message = "Write what is happening for your users.";
	else if (message.length > 2000) errors.message = "Message must be 2000 characters or fewer.";

	if (Object.keys(errors).length > 0 || !status) return { ok: false, errors };
	return { ok: true, value: { status, message } };
}
