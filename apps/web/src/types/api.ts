export type NumericSummary = {
  budget?: number;
  committed?: number;
  accounted?: number;
  inProgress?: number;
  in_progress?: number;
  available?: number;
};

export type AgedSummary = {
  total: number;
  due: number;
  old: number;
  notDue: number;
};

export type AgedRow = {
  line_no: number;
  account?: string | null;
  account_label?: string | null;
  party_id?: string | null;
  party_label?: string | null;
  piece?: string | null;
  piece_type?: string | null;
  before_121: number;
  m91_120?: number;
  m61_90?: number;
  m46_60?: number;
  m31_45?: number;
  m1_30?: number;
  due: number;
  p1_30?: number;
  p31_45?: number;
  p46_60?: number;
  p61_90?: number;
  p91_120?: number;
  p121_plus?: number;
  not_due: number;
  total: number;
  age_days?: number;
  days?: number;
};

export type AgedResponse = {
  establishment: { name: string; opaleEntity: string };
  sourceType: 'YBALAC' | 'YBALAF';
  availableExercises: number[];
  effectiveExercise: number | null;
  snapshot: null | { id: number; snapshotDate: string; sourceFilename: string; rowCount: number };
  summary: AgedSummary | null;
  rows: AgedRow[];
};

export type FinancialIndicator = {
  exercise: number;
  isCurrent: boolean;
  isFinal: boolean;
  fdr: number | null;
  fdrFinal: boolean;
  fdrDays?: number | null;
  operatingCharges?: number | null;
  treasury: number | null;
  treasuryDays?: number | null;
  result: number | null;
  caf?: number | null;
  cafKind?: 'CAF' | 'IAF' | null;
  bfr: number | null;
  snapshotDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type AgedAggregate = AgedSummary & {
  snapshotDate?: string | null;
  sourceFilename?: string | null;
};

export type SrhExecution = {
  exercise: number;
  period: string | null;
  expenses: number;
  revenues: number;
  expenseBudget: number;
  revenueBudget: number;
  foodExpenses: number;
  foodCredit: number;
  foodRemaining: number;
  foodOverrun: number;
  result: number;
  coverage: number | null;
};

export type FinancialResponse = {
  expenses?: NumericSummary | null;
  revenues?: NumericSummary | null;
  indicatorHistory?: FinancialIndicator[];
  fdr?: { exercise: number; amount: number; is_final?: boolean; isFinal?: boolean } | null;
  srh?: SrhExecution | null;
  receivables?: AgedAggregate | null;
  payables?: AgedAggregate | null;
  sources?: Record<string, unknown>;
  balance?: {
    exercise?: number;
    period?: string | null;
    snapshotDate?: string | null;
    result?: number | null;
    caf?: number | null;
    operatingCharges?: number | null;
    tnr?: number | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

export type BudgetResponse = {
  availableExercises: number[];
  snapshot: unknown | null;
  summary: { expenses?: NumericSummary; revenues?: NumericSummary } | null;
  services: unknown[];
  rows: unknown[];
  signals: unknown[];
};

export type FdrAnalysisResponse = {
  exercise: number;
  sourceExercise: number;
  eblc: {
    snapshotDate: string;
    period: string | null;
    sourceFilename: string;
  } | null;
  accounts: {
    provisions: number;
    cautions: number;
    stocks: number;
    doubtful: number;
    class6: number;
  } | null;
  aged: {
    snapshotDate: string;
    sourceFilename: string;
    over120: number;
    total: number;
    overOneYear: number | null;
    exactOverOneYear: boolean;
    reason: string;
  } | null;
};
export type ApiMessage = { ok?: boolean; message?: string; error?: string };
