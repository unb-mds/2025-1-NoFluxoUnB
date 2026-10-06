import winston from 'winston';

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Sem NODE_ENV, assume produção (o contêiner não define development)
const isDevelopment = (process.env.NODE_ENV || 'production') === 'development';

// Define level based on environment
const level = () => (isDevelopment ? 'debug' : 'warn');

// Define colors for each level
const colors = {

    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

// Tell winston that we want to link the colors
winston.addColors(colors);

// Formato de desenvolvimento: legível e colorido no terminal
const devFormat = winston.format.combine(
    // Add timestamp
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    // Format the message
    winston.format.printf((info) => {
        // Apply colors only to the level
        const colorizer = winston.format.colorize();
        const levelColored = colorizer.colorize(info.level, info.level.toUpperCase());
        return `[${info.timestamp}][${levelColored}] ${info.message}`;
    }),
);

// Formato de produção: uma linha JSON por evento, sem códigos ANSI — é o que
// o coletor de stdout do cluster consegue indexar (pré-mortem 27/09/2026, R57).
const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
);

// Define which transports the logger must use.
// Fora de development o destino é só o stdout: arquivo dentro do contêiner
// crescia sem rotação no disco efêmero do pod e duplicava o que já vai
// para `kubectl logs`.
const transports: winston.transport[] = [new winston.transports.Console()];
if (isDevelopment) {
    transports.push(
        // File transport for errors
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3,
        }),
        // File transport for all logs
        new winston.transports.File({
            filename: 'logs/all.log',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 3,
        }),
    );
}

// Create the logger instance
const logger = winston.createLogger({
    level: level(),
    levels,
    format: isDevelopment ? devFormat : prodFormat,
    transports,
});

export default logger; 