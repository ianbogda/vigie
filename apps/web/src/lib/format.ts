export const eur = (value: unknown) => Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const pct = (value: unknown) => value == null ? '—' : `${(Number(value) * 100).toFixed(1)} %`;
export const dateFr = (value: unknown) => {
  if (value == null || value === '') return '—';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '—' : value.toLocaleDateString('fr-FR');
  }
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('fr-FR');
};
