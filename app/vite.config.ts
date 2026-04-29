import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'$components': path.resolve('./src/components'),
		}
	},
	// Required for Tauri — prevents HMR from blocking on mobile targets
	server: {
		strictPort: true,
		port: 5173,
	},
	// Env vars accessible in the frontend
	envPrefix: ['VITE_', 'TAURI_'],
});
