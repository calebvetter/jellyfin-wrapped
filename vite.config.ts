import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: '0.0.0.0',
		port: Number(process.env.DEV_PORT ?? 5173),
		strictPort: true,
		// Allow access from LAN devices by hostname (IPs are always allowed).
		allowedHosts: true
	},
	preview: { host: '0.0.0.0', port: 4173 },
	test: {
		include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
		environment: 'node'
	}
});
