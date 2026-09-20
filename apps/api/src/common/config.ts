import { readFileSync } from 'node:fs';

export type AppConfig = {
  databaseUrl: string;
  nodeEnv: string;
  port: number;
  version: string;
  corsOrigin: boolean | string;
};

function packageVersion(): string {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version?: string;
  };
  return String(packageJson.version || '0.0.0');
}

/** Loads and validates the runtime configuration used by the API. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  const databaseUrl =
    env.DATABASE_URL || (nodeEnv === 'production' ? '' : 'postgresql://vigie:vigie@127.0.0.1:5432/vigie');
  if (!databaseUrl) throw new Error('DATABASE_URL est obligatoire en production.');

  const port = Number(env.PORT || 3211);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT invalide : ${env.PORT}`);

  const configuredOrigin = String(env.VIGIE_CORS_ORIGIN || '').trim();
  const corsOrigin = configuredOrigin || nodeEnv !== 'production';

  return { databaseUrl, nodeEnv, port, version: packageVersion(), corsOrigin };
}
