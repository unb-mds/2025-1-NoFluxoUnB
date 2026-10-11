/**
 * SabiaService não deixa detalhe interno subir ao cliente
 * (pré-mortem 27/09/2026, R34).
 *
 *  - conexão recusada: a mensagem lançada embutia SABIA_API_URL (host interno);
 *  - stream: o Python manda `str(e)` cru no evento `stage: "error"`, que era
 *    repassado byte a byte ao navegador.
 */

import { SabiaService } from '../src/services/sabia.service';
import { ERRO_IA_GENERICO } from '../src/utils/erro_publico';

const URL_INTERNA = 'http://10.0.0.99-interno.svc:8000';

const envOriginal = { ...process.env };
const fetchOriginal = global.fetch;

beforeEach(() => {
    process.env.SABIA_API_URL = URL_INTERNA;
    process.env.MARITACA_API_KEY = 'fake';
    process.env.GOOGLE_API_KEY = 'fake';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

afterEach(() => {
    process.env = { ...envOriginal };
    global.fetch = fetchOriginal;
});

/** Resposta de fetch cujo corpo é o texto SSE dado. */
function respostaSse(texto: string) {
    return new globalThis.Response(texto, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function resFalso() {
    const escrito: string[] = [];
    const res: any = {
        write: jest.fn((c: string) => { escrito.push(c); return true; }),
        end: jest.fn(),
    };
    return { res, escrito };
}

describe('analyzarInteresse', () => {
    it('conexão recusada: erro lançado não carrega a URL interna', async () => {
        global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as any;
        const sabia = new SabiaService();

        await expect(sabia.analyzarInteresse('IA')).rejects.toThrow('Cannot connect to Sabiá API');
        await expect(sabia.analyzarInteresse('IA')).rejects.not.toThrow(URL_INTERNA);
    });
});

describe('analyzarInteresseStream', () => {
    it('troca a mensagem crua do evento de erro pela genérica', async () => {
        const sse =
            'data: {"stage": "thinking"}\n\n' +
            `data: {"stage": "error", "message": "psycopg2.OperationalError: could not connect to ${URL_INTERNA}"}\n\n`;
        global.fetch = jest.fn().mockResolvedValue(respostaSse(sse)) as any;
        const { res, escrito } = resFalso();

        await new SabiaService().analyzarInteresseStream('IA', '', res);

        const enviado = escrito.join('');
        expect(enviado).toContain('"stage": "thinking"');
        expect(enviado).toContain('"stage":"error"');
        expect(enviado).toContain(ERRO_IA_GENERICO);
        expect(enviado).toContain('requestId');
        expect(enviado).not.toContain('psycopg2');
        expect(enviado).not.toContain(URL_INTERNA);
    });

    it('mensagem de orientação do mcp_agent passa intacta', async () => {
        const sse = 'data: {"stage": "error", "message": "Envie o historico academico"}\n\n';
        global.fetch = jest.fn().mockResolvedValue(respostaSse(sse)) as any;
        const { res, escrito } = resFalso();

        await new SabiaService().analyzarInteresseStream('optativas', '', res);

        expect(escrito.join('')).toBe(sse);
    });

    it('guarda a mensagem crua do erro (não enviada) para o log marcar a falta de créditos', async () => {
        const corpo = '{\\"code\\":\\"insufficient_funds\\"}';
        const sse = `data: {"stage": "error", "message": "Error code: 403 - ${corpo}"}\n\n`;
        global.fetch = jest.fn().mockResolvedValue(respostaSse(sse)) as any;
        const { res, escrito } = resFalso();

        const r = await new SabiaService().analyzarInteresseStream('IA', '', res);

        expect(r.concluiu).toBe(false);
        expect(r.erroUpstream).toContain('insufficient_funds');
        expect(escrito.join('')).not.toContain('insufficient_funds');
    });

    it('stream sem erro: nenhum erroUpstream', async () => {
        global.fetch = jest.fn().mockResolvedValue(respostaSse('data: {"stage": "done"}\n\n')) as any;
        const { res } = resFalso();
        const r = await new SabiaService().analyzarInteresseStream('IA', '', res);
        expect(r.erroUpstream).toBeUndefined();
    });
});
