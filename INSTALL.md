# Installation — Vigie v0.0.2

## Développement

```bash
npm install
npm run dev
```

Web : port Vite par défaut. API : `3211`.

## Production

```bash
npm install
npm run build
```

Servir `apps/web/dist` sur `https://vigie.epele-tools.fr` et proxifier `/api/*` vers l'API Fastify sur `127.0.0.1:3211` lorsque l'API sera consommée par le front.

Exemple Caddy :

```caddy
vigie.epele-tools.fr {
    handle /api/* {
        reverse_proxy 127.0.0.1:3211
    }
    handle {
        root * /opt/vigie/apps/web/dist
        try_files {path} /index.html
        file_server
    }
}
```
