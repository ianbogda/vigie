export const eur = (value: unknown) => Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const pct = (value: unknown) => value == null ? '—' : `${(Number(value) * 100).toFixed(1)} %`;
export const dateFr = (value: unknown) => value ? new Date(String(value)).toLocaleDateString('fr-FR') : '—';
