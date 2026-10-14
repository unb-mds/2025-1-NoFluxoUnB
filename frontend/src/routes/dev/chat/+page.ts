import { error } from '@sveltejs/kit';

export const ssr = false;

// Harness de desenvolvimento: some do build de produção. Não usa $lib/config
// porque o CI (a11y.spec) roda sem PUBLIC_ENVIRONMENT.
export function load() {
	if (!import.meta.env.DEV) {
		throw error(404, 'Not Found');
	}
	return {};
}
