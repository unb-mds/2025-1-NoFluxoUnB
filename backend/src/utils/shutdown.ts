// Encerramento gracioso do servidor HTTP (pré-mortem 27/09/2026, R55).
//
// Antes, SIGTERM fazia process.exit(0) na hora: todo rollout/reschedule do k8s
// cortava no meio as requisições em andamento (upload de histórico, chamadas
// de IA). Agora o servidor para de aceitar conexões, espera as requisições
// abertas terminarem e só então sai; se passar do prazo, sai com código 1.
//
// O prazo precisa ficar abaixo do terminationGracePeriodSeconds do pod (30 s
// por padrão no k8s), senão o SIGKILL chega antes e a drenagem não serve.

export interface ClosableServer {
    close(callback?: (err?: Error) => void): unknown;
    closeIdleConnections?(): void;
}

export interface ShutdownOptions {
    exit: (code: number) => void;
    timeoutMs?: number;
    log?: (message: string) => void;
    // Chamado antes de fechar o servidor (ex.: marcar /ready como 503).
    onStart?: () => void;
}

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 25_000;

export function createShutdown(server: ClosableServer, options: ShutdownOptions): (signal: string) => void {
    const { exit, timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS, log = () => {}, onStart } = options;
    let started = false;

    return (signal: string) => {
        // Segundo sinal (ex.: CTRL+C repetido) não reinicia o prazo.
        if (started) return;
        started = true;

        log(`${signal} recebido, drenando conexões (prazo ${timeoutMs} ms)`);
        onStart?.();

        // unref: o timer não segura o processo vivo se a drenagem terminar antes.
        setTimeout(() => {
            log(`Prazo de ${timeoutMs} ms esgotado com requisições abertas, saindo à força`);
            exit(1);
        }, timeoutMs).unref();

        server.close(() => exit(0));
        // Keep-alive ocioso não é requisição em andamento: fecha logo para o
        // close() não esperar o keepAliveTimeout dos clientes.
        server.closeIdleConnections?.();
    };
}
