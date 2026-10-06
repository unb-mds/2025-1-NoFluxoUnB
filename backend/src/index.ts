// IMPORTANT: Load .env FIRST, before any other imports
import dotenv from "dotenv";
import path from 'path';

const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// Now import everything else (services will have env vars available)
import { SupabaseWrapper } from './supabase_wrapper'
import express, { Express, Request, Response } from 'express';
import { EndpointController, RequestType } from './interfaces';
import cors from "cors";
import { buildCorsOptions } from './config/cors';
import { applyBodyParsers } from './config/body_limit';
import helmet from 'helmet';
import { applyRateLimits } from './config/rate_limit';
import { FluxogramaController } from './controllers/fluxograma_controller';
import logger from './logger';
import { UsersController } from './controllers/users_controller';
import { CursosController } from './controllers/cursos_controller';
import { MateriasController } from './controllers/materias_controller';
import { AssistenteController } from './controllers/assistente_controller';
import { PlanejamentoController } from './controllers/PlanejamentoController';
import { ChatController } from './controllers/chat_controller';
import { createReadyHandler, supabaseProbe } from './utils/readiness';
import { createShutdown } from './utils/shutdown';

// Log loaded environment variables (for debugging)
logger.info('Environment variables loaded:');
logger.info(`  MARITACA_API_KEY: ${!!process.env.MARITACA_API_KEY}`);
logger.info(`  SUPABASE_URL: ${!!process.env.SUPABASE_URL}`);
logger.info(`  SUPABASE_KEY: ${!!process.env.SUPABASE_KEY}`);

SupabaseWrapper.init();
logger.info('Supabase client initialized');

// Marcado no início do shutdown: /ready passa a responder 503 enquanto drena.
let shuttingDown = false;

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});



const router = express.Router();

const controllers: EndpointController[] = [
    FluxogramaController,
    UsersController,
    CursosController,
    MateriasController,
    AssistenteController,
    PlanejamentoController,
    ChatController,
];
router.get('/', (_req: Request, res: Response) => {
    logger.info(`\b[GET][/]`);

    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

// Liveness: só confirma que o processo responde (não toca no banco, para uma
// instabilidade do Supabase não virar restart em loop dos pods).
router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Readiness: 503 se o Supabase não responder em 2 s ou durante o shutdown.
router.get('/ready', createReadyHandler({ probe: supabaseProbe, isShuttingDown: () => shuttingDown }));

controllers.forEach(controller => {
    Object.keys(controller.routes).forEach(route_name => {
        const route = controller.routes[route_name];
        const method = route.key;
        const callback = route.value;
        const routePath = `/${controller.name}/${route_name}`;

        logger.info(`Registering route: ${method} ${routePath}`);

        switch (method) {
            case RequestType.GET:
                router.get(routePath, async (req: Request, res: Response) => {
                    try {
                        logger.http(`\b[GET][${routePath}]`);
                        await callback(req, res);
                        logger.http(`\b[GET][${routePath}] completed successfully`);
                    } catch (error) {
                        logger.error(`\b[GET][${routePath}] Error: ${error}`);
                        res.status(500).json({ error: 'Internal server error' });
                    }
                });
                break;
            case RequestType.POST:
                router.post(routePath, async (req: Request, res: Response) => {
                    try {
                        logger.http(`\b[POST][${routePath}]`);
                        await callback(req, res);
                        logger.http(`\b[POST][${routePath}] completed successfully`);
                    } catch (error) {
                        logger.error(`\b[POST][${routePath}] Error: ${error}`);
                        res.status(500).json({ error: 'Internal server error' });
                    }
                });
                break;
            case RequestType.PUT:
                router.put(routePath, async (req: Request, res: Response) => {
                    try {
                        logger.http(`\b[PUT][${routePath}]`);
                        await callback(req, res);
                        logger.http(`\b[PUT][${routePath}] completed successfully`);
                    } catch (error) {
                        logger.error(`\b[PUT][${routePath}] Error: ${error}`);
                        res.status(500).json({ error: 'Internal server error' });
                    }
                });
                break;
            case RequestType.DELETE:
                router.delete(routePath, async (req: Request, res: Response) => {
                    try {
                        logger.http(`\b[DELETE][${routePath}]`);
                        await callback(req, res);
                        logger.http(`\b[DELETE][${routePath}] completed successfully`);
                    } catch (error) {
                        logger.error(`\b[DELETE][${routePath}] Error: ${error}`);
                        res.status(500).json({ error: 'Internal server error' });
                    }
                });
                break;
            default:
                logger.warn(`Unhandled request type: ${method} for route ${routePath}`);
                break;
        }
    });
});

const app: Express = express();

//expressws(app);

// Security headers — aplicar helmet antes das demais middlewares (CLAUDE.md).
app.use(helmet());

// Allowlist de origens: ver src/config/cors.ts
const corsOptions = buildCorsOptions();
app.use(cors(corsOptions));

// OPTIONS preflight deve ser tratado antes das rotas — com as MESMAS opções do
// middleware acima; `cors()` puro aqui liberaria qualquer origem no preflight.
app.options('*', cors(corsOptions));

// Rate limiting: trust proxy (IP real atrás do Traefik), limiter global e
// limiter apertado nas rotas de IA paga. Ver src/config/rate_limit.ts.
applyRateLimits(app);

// Limite de corpo (global + overrides por rota): ver src/config/body_limit.ts
applyBodyParsers(app);


app.use(router);

const port = process.env.PORT ?? 3000;
const server = app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
});

// SIGTERM (rollout do k8s) e CTRL+C: para de aceitar conexões e espera as
// requisições em andamento terminarem antes de sair (ver utils/shutdown.ts).
const shutdown = createShutdown(server, {
    exit: (code) => process.exit(code),
    log: (message) => logger.warn(message),
    onStart: () => { shuttingDown = true; },
});
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
