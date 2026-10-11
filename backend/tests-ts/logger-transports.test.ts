import winston from 'winston';

// Pré-mortem 27/09/2026, R57: em produção o logger gravava logs/all.log e
// logs/error.log sem rotação dentro do contêiner (disco efêmero do pod
// crescendo sem limite) e mandava códigos ANSI de cor para o stdout do k8s.
// Fora de development o destino é só o Console, em JSON.

// isolateModules recarrega o winston junto (e os transports dele são carregados
// sob demanda), então instanceof contra o winston deste arquivo não casa:
// compara pelo nome da classe.
const tipo = (t: winston.transport) => t.constructor.name;

function carregarLogger(nodeEnv: string | undefined): winston.Logger {
    const anterior = process.env.NODE_ENV;
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    let logger!: winston.Logger;
    try {
        jest.isolateModules(() => {
            logger = require('../src/logger').default;
        });
    } finally {
        process.env.NODE_ENV = anterior;
    }
    return logger;
}

// Intercepta o que o Console transport escreveria, já formatado.
function capturarSaida(logger: winston.Logger, logar: () => void): string {
    const console = logger.transports[0] as winston.transports.ConsoleTransportInstance;
    const linhas: string[] = [];
    const original = console.log!.bind(console);
    console.log = (info: any, next: () => void) => {
        linhas.push(info[Symbol.for('message')]);
        next();
    };
    try {
        logar();
    } finally {
        console.log = original;
    }
    return linhas.join('\n');
}

describe('logger — transports por ambiente (R57)', () => {
    it.each(['production', undefined])('NODE_ENV=%s: só Console, sem arquivo', (env) => {
        const logger = carregarLogger(env);
        expect(logger.transports.length).toBeGreaterThan(0);
        expect(logger.transports.every(t => tipo(t) === 'Console')).toBe(true);
    });

    it('produção: cada linha é JSON parseável e sem códigos ANSI', () => {
        const logger = carregarLogger('production');
        const saida = capturarSaida(logger, () => logger.error('falhou algo'));
        expect(saida).not.toMatch(/\u001b\[/);
        const obj = JSON.parse(saida);
        expect(obj).toMatchObject({ level: 'error', message: 'falhou algo' });
        expect(obj.timestamp).toBeDefined();
    });

    it('development: mantém os arquivos locais, todos com teto de tamanho', () => {
        const logger = carregarLogger('development');
        const arquivos = logger.transports.filter(
            t => tipo(t) === 'File',
        ) as winston.transports.FileTransportInstance[];
        expect(arquivos.length).toBe(2);
        for (const f of arquivos) {
            expect(f.maxsize).toBeGreaterThan(0);
            expect(f.maxFiles).toBeGreaterThan(0);
        }
        // Os File transports abrem o arquivo ao nascer; fecha para não vazar handle.
        logger.close();
    });
});
