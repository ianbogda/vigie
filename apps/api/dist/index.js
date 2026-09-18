import Fastify from 'fastify';
import cors from '@fastify/cors';
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
const establishments = [
    { id: 1, name: 'Collège A', budget: 'ok', treasury: 'watch', recovery: 'ok', suppliers: 'ok', accounting: 'ok', trend: 'stable' },
    { id: 2, name: 'Collège B', budget: 'alert', treasury: 'watch', recovery: 'alert', suppliers: 'ok', accounting: 'watch', trend: 'down' },
    { id: 3, name: 'LP C', budget: 'ok', treasury: 'ok', recovery: 'ok', suppliers: 'alert', accounting: 'alert', trend: 'down' },
    { id: 4, name: 'LPO D', budget: 'watch', treasury: 'ok', recovery: 'watch', suppliers: 'ok', accounting: 'ok', trend: 'stable' }
];
const alerts = [
    { level: 'alert', eple: 'Collège B', domain: 'Budget', message: 'Projection de dépassement SRH : 18 400 €' },
    { level: 'alert', eple: 'LP C', domain: 'Comptabilité', message: 'Compte 4718 : 24 300 € à régulariser' },
    { level: 'watch', eple: 'Collège A', domain: 'Recouvrement', message: '3 créances > 90 jours : 7 820 €' },
    { level: 'watch', eple: 'LPO D', domain: 'Fournisseurs', message: '14 factures non payées depuis > 30 jours' }
];
app.get('/health', () => ({ ok: true, version: '0.0.1' }));
app.get('/api/dashboard', () => ({ updatedAt: new Date().toISOString(), kpis: { eple: 8, alerts: 3, treasury: 2800000, execution: 0.96 }, establishments, alerts }));
app.listen({ port: Number(process.env.PORT || 3211), host: '0.0.0.0' });
