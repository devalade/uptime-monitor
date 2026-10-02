/**
 * Structured logger for the Uptime Monitor application.
 */

import { createLogger } from "@sdxc/logger";

export const logger = createLogger({
	service: "uptime-monitor",
});
