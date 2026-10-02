import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
	plugins: [cloudflare()],
	resolve: {
		alias: {
			"~": fileURLToPath(new URL("./", import.meta.url)),
		},
	},
});
