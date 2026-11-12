export interface AppConfig {
  port: number;
  databaseUrl: string;
  apiKey: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Reads and validates env once at boot, so a bad deploy fails immediately instead of on the first request. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  const apiKey = env.API_KEY?.trim();
  const port = Number(env.PORT ?? 3001);

  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!apiKey || apiKey.length < 16) throw new Error('API_KEY is required and must be at least 16 characters');
  if (!Number.isInteger(port) || port <= 0) throw new Error('PORT must be a positive integer');

  return { port, databaseUrl, apiKey };
}
