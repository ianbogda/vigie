/** Formats a monetary value using the French locale. */
export function eur(value?: number | null): string {
  return value == null
    ? '—'
    : new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0
      }).format(value);
}

/** Parses an Op@le period expressed as YYYY-MM or MM/YYYY. */
export function periodDate(period?: string): Date | null {
  if (!period) return null;
  const raw = period.trim();
  let year: number;
  let month: number;
  let match = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
  } else {
    match = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    month = Number(match[1]);
    year = Number(match[2]);
  }
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 1900 || year > 2200 || month < 1 || month > 12)
    return null;
  const date = new Date(year, month - 1, 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a period as a French month and year. */
export function month(period?: string): string {
  const date = periodDate(period);
  return date ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date) : period || '—';
}

/** Formats a month number as a short French label. */
export function shortMonth(monthNumber: number): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'short' })
    .format(new Date(2020, monthNumber - 1, 1))
    .replace('.', '');
}

/** Formats a signed percentage. */
export function pct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} %`;
}

/** Computes a percentage change relative to a non-zero base. */
export function deltaRate(current: number, base: number | null): number | null {
  return base == null || base === 0 ? null : ((current - base) / Math.abs(base)) * 100;
}

/** Computes the median of finite values. */
export function median(values: number[]): number | null {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Formats a number using compact French notation. */
export function compact(value: number | null): string {
  return value == null
    ? '—'
    : new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Formate une date ISO dans le format français jj/mm/aaaa. */
export function dateFr(value?: string | null): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('fr-FR').format(date);
}
