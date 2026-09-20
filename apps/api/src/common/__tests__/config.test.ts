import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  it('refuse une production sans DATABASE_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('désactive CORS par défaut en production', () => {
    expect(loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://example/test' }).corsOrigin).toBe(false);
  });

  it('accepte une origine CORS explicitement configurée', () => {
    expect(
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://example/test',
        VIGIE_CORS_ORIGIN: 'https://vigie.example.fr'
      }).corsOrigin
    ).toBe('https://vigie.example.fr');
  });
});
