/**
 * Certificate and domain expiry checks for HTTPS monitors. Runs from the hourly sweep:
 * certificates are read twice a day, domains once a day. Alerts go out when the days left cross
 * a milestone (the monitor's warning days, then 7, 3, 1 and 0), once per milestone.
 */

import { and, eq, gt } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import { notifyMonitor, type AlertSettings } from "~/app/services/alerting";
import { fetchServerCertificate, type CertificateInfo } from "~/app/services/certificate";
import { fetchDomainExpiry } from "~/app/services/domain-expiry";
import { monitors, type SelectMonitor } from "~/database/schema";
import { logger } from "~/bootstrap/logger";

const DAY_MS = 24 * 60 * 60 * 1000;
const CERT_CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const DOMAIN_CHECK_EVERY_MS = DAY_MS;
/** Per hourly run, so a sweep never spends long on expiry checks. */
const MAX_CERT_CHECKS = 20;
const MAX_DOMAIN_CHECKS = 10;

export interface ExpiryLookups {
	certificate(host: string, port: number): Promise<CertificateInfo>;
	domain(host: string): Promise<{ domain: string; expiresAt: number } | null>;
}

const defaultLookups: ExpiryLookups = {
	certificate: (host, port) => fetchServerCertificate(host, port),
	domain: (host) => fetchDomainExpiry(host),
};

/** Whole days left, negative once expired. */
export function daysLeft(expiresAt: number, now: number): number {
	return Math.floor((expiresAt - now) / DAY_MS);
}

/**
 * The milestone to alert for now, or null. `warned` is the smallest milestone already alerted
 * for the current expiry date.
 */
export function dueMilestone(days: number, warningDays: number, warned: number | null): number | null {
	if (warningDays <= 0) return null;
	const milestones = [...new Set([warningDays, 7, 3, 1, 0].filter((m) => m <= warningDays))].sort((a, b) => a - b);
	const hit = milestones.find((m) => days <= m);
	if (hit === undefined) return null;
	return warned !== null && hit >= warned ? null : hit;
}

/** "https://api.example.com:8443/x" → host and port, or null for non-HTTPS URLs. */
export function httpsTarget(url: string): { host: string; port: number } | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return null;
		return { host: parsed.hostname.replace(/^\[|\]$/g, ""), port: parsed.port ? Number(parsed.port) : 443 };
	} catch {
		return null;
	}
}

export async function runExpiryChecks(
	db: AppDatabase,
	alerts: AlertSettings | undefined,
	now: number = Date.now(),
	lookups: ExpiryLookups = defaultLookups,
): Promise<void> {
	const candidates = (
		await db.findMany(monitors, {
			where: and(eq(monitors.type, "http"), eq(monitors.is_enabled, true), gt(monitors.expiry_warning_days, 0)),
		})
	).filter((m) => httpsTarget(m.url) !== null);

	const certDue = candidates
		.filter((m) => m.cert_checked_at === null || now - m.cert_checked_at >= CERT_CHECK_EVERY_MS)
		.slice(0, MAX_CERT_CHECKS);
	const domainDue = candidates
		.filter((m) => m.domain_checked_at === null || now - m.domain_checked_at >= DOMAIN_CHECK_EVERY_MS)
		.slice(0, MAX_DOMAIN_CHECKS);

	await Promise.allSettled([
		...certDue.map((monitor) => checkCertificate(db, alerts, monitor, now, lookups)),
		...domainDue.map((monitor) => checkDomain(db, alerts, monitor, now, lookups)),
	]);
}

export async function checkCertificate(
	db: AppDatabase,
	alerts: AlertSettings | undefined,
	monitor: SelectMonitor,
	now: number,
	lookups: ExpiryLookups = defaultLookups,
): Promise<SelectMonitor> {
	const target = httpsTarget(monitor.url);
	if (!target) return monitor;

	let certificate: CertificateInfo;
	try {
		certificate = await lookups.certificate(target.host, target.port);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const log = logger.open("job", { monitorId: monitor.id, error: message });
		log.note("Could not read the TLS certificate");
		log.emit();
		return db.update(monitors, monitor.id, { cert_error: message, cert_checked_at: now, updated_at: now });
	}

	// A later expiry date means the certificate was renewed: tell whoever was warned, start over.
	const renewed = monitor.cert_expires_at !== null && certificate.notAfter > monitor.cert_expires_at + DAY_MS;
	let warned = renewed ? null : monitor.cert_warned_days;
	if (renewed && monitor.cert_warned_days !== null) {
		await notifyMonitor(db, alerts, monitor, {
			monitor,
			previousStatus: monitor.last_status,
			currentStatus: monitor.last_status ?? "up",
			kind: "cert_renewed",
			reason: `The certificate now expires on ${new Date(certificate.notAfter).toISOString().slice(0, 10)}`,
			timestamp: now,
		});
	}

	const days = daysLeft(certificate.notAfter, now);
	const milestone = dueMilestone(days, monitor.expiry_warning_days, warned);
	if (milestone !== null) {
		await notifyMonitor(db, alerts, monitor, {
			monitor,
			previousStatus: monitor.last_status,
			currentStatus: monitor.last_status ?? "up",
			kind: "cert_expiring",
			reason: `${days < 0 ? "The TLS certificate expired" : `The TLS certificate expires in ${days} day${days === 1 ? "" : "s"}`} (${new Date(certificate.notAfter).toISOString().slice(0, 10)}, issued by ${certificate.issuer ?? "unknown"})`,
			timestamp: now,
		});
		warned = milestone;
	}

	return db.update(monitors, monitor.id, {
		cert_expires_at: certificate.notAfter,
		cert_issuer: certificate.issuer,
		cert_error: null,
		cert_checked_at: now,
		cert_warned_days: warned,
		updated_at: now,
	});
}

export async function checkDomain(
	db: AppDatabase,
	alerts: AlertSettings | undefined,
	monitor: SelectMonitor,
	now: number,
	lookups: ExpiryLookups = defaultLookups,
): Promise<SelectMonitor> {
	const target = httpsTarget(monitor.url);
	if (!target) return monitor;

	let result: { domain: string; expiresAt: number } | null;
	try {
		result = await lookups.domain(target.host);
	} catch (error) {
		const log = logger.open("job", { monitorId: monitor.id, error: error instanceof Error ? error.message : String(error) });
		log.note("Could not look up the domain expiry");
		log.emit();
		return db.update(monitors, monitor.id, { domain_checked_at: now, updated_at: now });
	}
	if (!result) return db.update(monitors, monitor.id, { domain_checked_at: now, domain_expires_at: null, updated_at: now });

	const renewed = monitor.domain_expires_at !== null && result.expiresAt > monitor.domain_expires_at + DAY_MS;
	let warned = renewed ? null : monitor.domain_warned_days;
	if (renewed && monitor.domain_warned_days !== null) {
		await notifyMonitor(db, alerts, monitor, {
			monitor,
			previousStatus: monitor.last_status,
			currentStatus: monitor.last_status ?? "up",
			kind: "domain_renewed",
			reason: `${result.domain} now expires on ${new Date(result.expiresAt).toISOString().slice(0, 10)}`,
			timestamp: now,
		});
	}

	const days = daysLeft(result.expiresAt, now);
	const milestone = dueMilestone(days, monitor.expiry_warning_days, warned);
	if (milestone !== null) {
		await notifyMonitor(db, alerts, monitor, {
			monitor,
			previousStatus: monitor.last_status,
			currentStatus: monitor.last_status ?? "up",
			kind: "domain_expiring",
			reason: `${days < 0 ? `${result.domain} expired` : `${result.domain} expires in ${days} day${days === 1 ? "" : "s"}`} (${new Date(result.expiresAt).toISOString().slice(0, 10)}). Renew it with your registrar.`,
			timestamp: now,
		});
		warned = milestone;
	}

	return db.update(monitors, monitor.id, { domain_expires_at: result.expiresAt, domain_checked_at: now, domain_warned_days: warned, updated_at: now });
}
