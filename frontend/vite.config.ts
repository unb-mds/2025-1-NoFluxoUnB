/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'NoFluxo UNB',
				short_name: 'NoFluxo',
				description: 'Organize seu fluxograma acadêmico de forma fácil',
				theme_color: '#09090b',
				background_color: '#09090b',
				display: 'standalone',
				icons: [
					{
						src: 'favicon.svg',
						sizes: '192x192',
						type: 'image/svg+xml'
					},
					{
						src: 'favicon.svg',
						sizes: '512x512',
						type: 'image/svg+xml'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
				navigateFallback: '/'
			}
		})
	],
	server: {
		port: 5173,
		strictPort: false,
		watch: {
			// Evita loop: o SvelteKit reescreve .svelte-kit/generated a cada sync,
			// e sem isso o próprio watcher detecta essa escrita como mudança e
			// dispara outro sync sem parar, travando o event loop (visto em bind
			// mount do Windows onde o CPU do processo do Vite fica preso a ~100%).
			ignored: ['**/.svelte-kit/**', '**/build/**']
		}
	},
	preview: {
		port: 4173
	},
	ssr: {
		noExternal: ['@xyflow/svelte']
	},
	test: {
		// Só testes unitários de src/: os specs de tests-e2e/ são do PLAYWRIGHT
		// (rodam via `npm run test:integration`) e explodem se o Vitest os coletar.
		// O `include` fica em cada projeto (arrays do root e do projeto se somariam).
		projects: [
			{
				// Testes de lógica (stores, tipos, serviços): Node, componentes compilados em SSR.
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['**/node_modules/**', '**/*.a11y.test.ts']
				}
			},
			{
				// Testes de componente com Testing Library + axe: jsdom e resolução "browser",
				// para o Svelte montar no modo cliente. Só arquivos *.a11y.test.ts entram aqui.
				extends: true,
				resolve: { conditions: ['browser'] },
				test: {
					name: 'a11y',
					environment: 'jsdom',
					include: ['src/**/*.a11y.test.ts'],
					exclude: ['**/node_modules/**']
				}
			}
		]
	}
});
