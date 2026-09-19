export type State = 'ok' | 'watch' | 'alert' | 'missing';

export type Evidence = { label: string; value: unknown; format?: 'percent' | 'currency' | 'text' };
export type Signal = {
  code: string; level: State; title: string; detail?: string; domain?: string; source?: string;
  condition?: string; interpretation?: string; evidence?: Evidence[];
};
export type BudgetMetrics = { budget?: number; committed?: number; accounted?: number; available?: number; engagementRate?: number; trajectoryTarget?: number };
export type FdrEntry = { amount: number; exercise: number | string; is_final?: boolean };
export type PcifAttention = { label: string; mastery?: number | null; majorRisks?: number };
export type PcifContext = {
  mastery_level?: number | null; mastery_scale?: string; completion?: number; answered?: number; total?: number;
  major_risks?: number; open_actions?: number; overdue_actions?: number; campaign_label?: string; campaign_status?: string;
  trend?: string | number | null; attention?: PcifAttention[]; source_url?: string; updated_at?: string;
};
export type Eple = {
  id: string; uai?: string | null; name: string; states: Record<string, State>; trend?: string; freshness: string | null;
  sources?: Record<string, unknown>; signals: Signal[]; budgetMetrics?: BudgetMetrics; fdrHistory?: FdrEntry[]; pcif?: PcifContext;
};
export type Dashboard = {
  generatedAt?: string; establishments: Eple[]; signals: Signal[];
  kpis: { totalAvailable?: number; totalBudget?: number; totalCommitted?: number };
};
