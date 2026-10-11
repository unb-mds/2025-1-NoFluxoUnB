import http from 'http';
import { AddressInfo } from 'net';
import { createShutdown } from '../src/utils/shutdown';

// Pré-mortem 27/09/2026, R55: SIGTERM fazia process.exit(0) na hora e cortava
// as requisições em andamento a cada rollout do k8s.

describe('createShutdown (R55)', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('espera a requisição em andamento terminar antes de sair com 0', async () => {
        let responder!: () => void;
        const server = http.createServer((_req, res) => {
            responder = () => res.end('ok');
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        const { port } = server.address() as AddressInfo;

        const exit = jest.fn();
        const shutdown = createShutdown(server, { exit, timeoutMs: 5_000 });

        // Requisição "lenta": o handler só responde quando mandarmos.
        const resposta = new Promise<{ status?: number; body: string }>((resolve, reject) => {
            http.get({ port, host: '127.0.0.1', agent: false }, res => {
                let body = '';
                res.on('data', c => (body += c));
                res.on('end', () => resolve({ status: res.statusCode, body }));
            }).on('error', reject);
        });
        await new Promise(r => setTimeout(r, 50));

        shutdown('SIGTERM');
        await new Promise(r => setTimeout(r, 50));
        // Ainda drenando: o processo não pode ter saído.
        expect(exit).not.toHaveBeenCalled();

        responder();
        await expect(resposta).resolves.toEqual({ status: 200, body: 'ok' });
        await new Promise(r => setTimeout(r, 50));
        expect(exit).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(0);
    });

    it('sai com 1 quando o prazo de drenagem estoura', () => {
        jest.useFakeTimers();
        const server = { close: jest.fn(), closeIdleConnections: jest.fn() };
        const exit = jest.fn();
        createShutdown(server, { exit, timeoutMs: 1_000 })('SIGTERM');

        expect(server.close).toHaveBeenCalledTimes(1);
        expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(999);
        expect(exit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(exit).toHaveBeenCalledWith(1);
    });

    it('segundo sinal é ignorado e onStart roda antes do close', () => {
        jest.useFakeTimers();
        const ordem: string[] = [];
        const server = { close: jest.fn(() => ordem.push('close')) };
        const shutdown = createShutdown(server, {
            exit: jest.fn(),
            onStart: () => ordem.push('onStart'),
        });
        shutdown('SIGTERM');
        shutdown('SIGINT');
        expect(ordem).toEqual(['onStart', 'close']);
    });
});
