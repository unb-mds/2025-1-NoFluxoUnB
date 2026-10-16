/**
 * Estado do Montador de Grade guardado no servidor (tabela `grade_montador`).
 *
 * O banco manda; o `localStorage` é só cache para abrir rápido e funcionar sem
 * rede. A tela continua lendo/escrevendo as chaves locais de sempre — este módulo
 * reconcilia essas chaves com o servidor ANTES do `init` do store
 * (`sincronizarCacheComServidor`) e empurra as mudanças depois, com debounce e
 * sem reenviar o que não mudou (`agendarEnvio`).
 *
 * Limites (6 grades, 8 KB) valem no servidor; aqui só se evita mandar o que ele
 * recusaria.
 */
import { apiRequest } from '$lib/utils/api';

export const MAX_CENARIOS = 6;
const MAX_POOL = 200;
const DEBOUNCE_MS = 800;
const PREFIXO = 'nofluxo:grade:';
const RE_CODIGO = /^[A-Z0-9]{3,12}$/;

export type OrigemCenario = 'usuario' | 'opcao-solver' | 'darcy';

export interface CenarioServidor {
	id: string;
	nome: string;
	selecao: Record<string, number>;
	origem: OrigemCenario;
}

export interface EstadoServidor {
	grades: CenarioServidor[];
	activeId: string | null;
	pool: string[];
	prioritarias: string[];
	turnos: Array<'M' | 'T' | 'N'>;
	dispensadas: string[];
	incluirCursando: boolean;
}

export interface PeriodoSalvo {
	periodo: string;
	cenarios: number;
	/** Além de "atual + anterior": o app oferece baixar/apagar. */
	vencido: boolean;
}

// ─── Chaves do cache local ───────────────────────────────────────────────────

export function poolKey(idUser: number | null, periodo: string | null): string | null {
	return idUser != null && periodo ? `${PREFIXO}${idUser}:${periodo}:pool` : null;
}
export function cenariosKey(idUser: number | null, periodo: string | null): string | null {
	return idUser != null && periodo ? `${PREFIXO}${idUser}:${periodo}:cenarios` : null;
}
function versaoKey(idUser: number, periodo: string): string {
	return `${PREFIXO}${idUser}:${periodo}:versao`;
}
function pendenteKey(idUser: number, periodo: string): string {
	return `${PREFIXO}${idUser}:${periodo}:pendente`;
}

function ler(key: string): string | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
	} catch {
		return null;
	}
}
function gravar(key: string, valor: string | null): void {
	try {
		if (typeof localStorage === 'undefined') return;
		if (valor === null) localStorage.removeItem(key);
		else localStorage.setItem(key, valor);
	} catch {
		/* storage cheio/bloqueado: a tela segue com o estado em memória */
	}
}

/** Logout: as grades não ficam na máquina para o próximo que usar. */
export function limparCacheGrade(): void {
	try {
		if (typeof localStorage === 'undefined') return;
		const apagar: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k?.startsWith(PREFIXO)) apagar.push(k);
		}
		for (const k of apagar) localStorage.removeItem(k);
	} catch {
		/* ignora */
	}
	for (const t of timers.values()) clearTimeout(t);
	timers.clear();
	ultimoEnviado.clear();
}

// ─── Formato local ↔ servidor ────────────────────────────────────────────────

/** O que o store persiste em `...:cenarios` (+ o pool, que mora em outra chave). */
interface CenariosLocais {
	grades?: Array<Partial<CenarioServidor>>;
	activeId?: string;
	prioritarias?: string[];
	turnos?: Array<'M' | 'T' | 'N'>;
	dispensadas?: string[];
	/** Nome antigo do campo — o cache de quem já usava a tela antes da troca. */
	removidas?: string[];
	incluirCursando?: boolean;
}

function lerLocal(idUser: number, periodo: string): EstadoServidor | null {
	const raw = ler(cenariosKey(idUser, periodo)!);
	if (!raw) return null;
	try {
		const c = JSON.parse(raw) as CenariosLocais;
		const poolRaw = JSON.parse(ler(poolKey(idUser, periodo)!) ?? '[]');
		return normalizar({
			grades: (c.grades ?? []) as CenarioServidor[],
			activeId: c.activeId ?? null,
			pool: Array.isArray(poolRaw) ? poolRaw : [],
			prioritarias: c.prioritarias ?? [],
			turnos: c.turnos ?? ['M', 'T', 'N'],
			dispensadas: c.dispensadas ?? c.removidas ?? [],
			incluirCursando: c.incluirCursando !== false
		});
	} catch {
		return null;
	}
}

function escreverLocal(idUser: number, periodo: string, e: EstadoServidor): void {
	gravar(poolKey(idUser, periodo)!, JSON.stringify(e.pool));
	gravar(
		cenariosKey(idUser, periodo)!,
		JSON.stringify({
			grades: e.grades,
			activeId: e.activeId ?? e.grades[0]?.id ?? '',
			prioritarias: e.prioritarias,
			turnos: e.turnos,
			dispensadas: e.dispensadas,
			incluirCursando: e.incluirCursando
		})
	);
}

/** Só o que o servidor aceita: códigos válidos, teto de grades, origem conhecida. */
export function normalizar(e: EstadoServidor): EstadoServidor {
	const cods = (l: unknown) =>
		Array.isArray(l)
			? [
					...new Set(
						l
							.filter((c): c is string => typeof c === 'string')
							.map((c) => c.trim().toUpperCase())
							.filter((c) => RE_CODIGO.test(c))
					)
				].slice(0, MAX_POOL)
			: [];
	const grades = (e.grades ?? []).slice(0, MAX_CENARIOS).map((g) => ({
		id: g.id,
		nome: String(g.nome ?? 'Grade').slice(0, 40) || 'Grade',
		selecao: Object.fromEntries(
			Object.entries(g.selecao ?? {}).filter(
				([c, id]) => RE_CODIGO.test(c.toUpperCase()) && Number.isInteger(id) && id > 0
			)
		),
		origem: (['usuario', 'opcao-solver', 'darcy'] as const).includes(g.origem as OrigemCenario)
			? g.origem
			: ('usuario' as OrigemCenario)
	}));
	return {
		grades,
		activeId: grades.some((g) => g.id === e.activeId) ? e.activeId : (grades[0]?.id ?? null),
		pool: cods(e.pool),
		prioritarias: cods(e.prioritarias),
		turnos: (['M', 'T', 'N'] as const).filter((t) => (e.turnos ?? []).includes(t)),
		dispensadas: cods(e.dispensadas),
		incluirCursando: e.incluirCursando !== false
	};
}

/** Tela vazia (só "Grade 1" sem nada) não vale uma linha no banco. */
function semConteudo(e: EstadoServidor): boolean {
	return (
		e.pool.length === 0 &&
		e.grades.every((g) => Object.keys(g.selecao).length === 0) &&
		e.grades.length <= 1
	);
}

// ─── Servidor ────────────────────────────────────────────────────────────────

interface RespostaLeitura {
	estado: EstadoServidor | null;
	versao: number;
	outrosPeriodos: PeriodoSalvo[];
}

async function lerServidor(periodo: string): Promise<RespostaLeitura | null> {
	const { data, error } = await apiRequest<{
		estado: EstadoServidor | null;
		versao: number;
		outrosPeriodos: Array<{ periodo: string; cenarios: number; vencido: boolean }>;
	}>(`/planejamento/grade-estado?periodo=${encodeURIComponent(periodo)}`);
	if (error || !data) return null;
	return {
		estado: data.estado,
		versao: data.versao ?? 0,
		outrosPeriodos: data.outrosPeriodos ?? []
	};
}

type ResultadoEnvio =
	| { ok: true; versao: number }
	| { ok: false; conflito: true; versao: number }
	| { ok: false; conflito: false };

async function enviarServidor(
	periodo: string,
	estado: EstadoServidor,
	versaoBase: number
): Promise<ResultadoEnvio> {
	const r = await apiRequest<{ versao?: number; estado?: unknown }>(
		'/planejamento/grade-estado-salvar',
		{ method: 'POST', body: { periodo, estado, versaoBase } }
	);
	if (r.status === 200 && r.data?.versao != null) return { ok: true, versao: r.data.versao };
	if (r.status === 409) {
		// O corpo do erro vem como texto; a versão atual é o que interessa.
		try {
			const j = JSON.parse(r.error ?? '{}') as { versao?: number };
			return { ok: false, conflito: true, versao: Number(j.versao ?? 0) };
		} catch {
			return { ok: false, conflito: true, versao: 0 };
		}
	}
	return { ok: false, conflito: false };
}

/**
 * Chamar ANTES de hidratar o pool/`init`. Deixa o cache local igual ao servidor
 * (ou sobe o local se o servidor estiver vazio). Nunca lança: sem rede, a tela
 * segue com o cache.
 *
 * - servidor vazio + local com conteúdo → sobe (migração do localStorage);
 * - alteração local ainda não enviada (`pendente`) → o local vence e é reenviado;
 * - senão o servidor vence e sobrescreve o cache.
 */
export async function sincronizarCacheComServidor(
	idUser: number | null,
	periodo: string
): Promise<{ outrosPeriodos: PeriodoSalvo[] }> {
	if (idUser == null) return { outrosPeriodos: [] };
	try {
		const srv = await lerServidor(periodo);
		if (!srv) return { outrosPeriodos: [] };
		const local = lerLocal(idUser, periodo);
		const pendente = ler(pendenteKey(idUser, periodo)) === '1';

		if (!srv.estado) {
			if (local && !semConteudo(local)) await empurrar(idUser, periodo, local, 0);
		} else if (pendente && local) {
			await empurrar(idUser, periodo, local, srv.versao);
		} else {
			escreverLocal(idUser, periodo, normalizar(srv.estado));
			gravar(versaoKey(idUser, periodo), String(srv.versao));
			gravar(pendenteKey(idUser, periodo), null);
			ultimoEnviado.set(`${idUser}:${periodo}`, JSON.stringify(normalizar(srv.estado)));
		}
		return { outrosPeriodos: srv.outrosPeriodos };
	} catch {
		return { outrosPeriodos: [] };
	}
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Último estado que o servidor confirmou — evita reenviar o que não mudou. */
const ultimoEnviado = new Map<string, string>();

async function empurrar(
	idUser: number,
	periodo: string,
	estado: EstadoServidor,
	versaoBase: number
): Promise<boolean> {
	const chave = `${idUser}:${periodo}`;
	const corpo = JSON.stringify(estado);
	let r = await enviarServidor(periodo, estado, versaoBase);
	// Conflito: outra aba/dispositivo gravou antes. É o mesmo aluno e o que está na tela é a
	// intenção mais recente dele — uma segunda tentativa em cima da versão atual.
	if (!r.ok && r.conflito) r = await enviarServidor(periodo, estado, r.versao);
	if (r.ok) {
		gravar(versaoKey(idUser, periodo), String(r.versao));
		gravar(pendenteKey(idUser, periodo), null);
		ultimoEnviado.set(chave, corpo);
		return true;
	}
	gravar(pendenteKey(idUser, periodo), '1');
	return false;
}

/**
 * Agenda o envio do estado atual (debounce). `obter` é chamado só na hora do
 * envio, então pega a versão mais recente. Não reenvia o que já está no servidor.
 */
export function agendarEnvio(idUser: number | null, periodo: string | null): void {
	if (idUser == null || !periodo) return;
	const chave = `${idUser}:${periodo}`;
	// Marca já: se a aba fechar antes do debounce, o próximo init sabe que tem coisa a enviar.
	gravar(pendenteKey(idUser, periodo), '1');
	const antigo = timers.get(chave);
	if (antigo) clearTimeout(antigo);
	timers.set(
		chave,
		setTimeout(() => {
			timers.delete(chave);
			const estado = lerLocal(idUser, periodo);
			if (!estado) return;
			const corpo = JSON.stringify(estado);
			if (ultimoEnviado.get(chave) === corpo) {
				gravar(pendenteKey(idUser, periodo), null);
				return;
			}
			const versaoBase = Number(ler(versaoKey(idUser, periodo)) ?? 0) || 0;
			void empurrar(idUser, periodo, estado, versaoBase);
		}, DEBOUNCE_MS)
	);
}

export async function apagarPeriodoSalvo(periodo: string, idUser: number | null): Promise<boolean> {
	const r = await apiRequest('/planejamento/grade-estado-apagar', {
		method: 'POST',
		body: { periodo }
	});
	if (r.error) return false;
	if (idUser != null) {
		for (const k of [
			poolKey(idUser, periodo),
			cenariosKey(idUser, periodo),
			versaoKey(idUser, periodo),
			pendenteKey(idUser, periodo)
		]) {
			if (k) gravar(k, null);
		}
	}
	return true;
}

/** Conteúdo de um período salvo (JSON) — para o "Baixar" antes de apagar. */
export async function exportarPeriodo(periodo: string): Promise<string | null> {
	const srv = await lerServidor(periodo);
	if (!srv?.estado) return null;
	return JSON.stringify({ periodo, ...srv.estado }, null, 2);
}
