import { Database } from 'lucide-react';
import type { Eple } from '../types/dashboard';
import { BudgetView } from './BudgetView';
import { AccountingView, AgencyAccountingView, AgencyFlowView, FlowView } from './domain/accounting-views';
import { AgencyFinancialAnalysisView, FinancialAnalysisView } from './domain/financial-analysis-views';
import { RiskMasteryView } from './domain/risk-mastery-view';
import { AgedView, AgencyAgedView } from './domain/aged-views';
import { AgencyTreasuryView, TreasuryView } from './domain/treasury-views';

type DomainViewProps = {
  title: string;
  current: Eple | null;
  all: Eple[];
  onSelect: (id: string) => void;
};

/** Routes a business domain to its dedicated view without embedding domain logic. */
export function DomainView({ title, current, all, onSelect }: DomainViewProps) {
  if (title === 'Maîtrise des risques') return <RiskMasteryView current={current} all={all} onSelect={onSelect} />;
  if (title === 'Dépenses') return <FlowView current={current} all={all} onSelect={onSelect} kind="expense" />;
  if (title === 'Recettes') return <FlowView current={current} all={all} onSelect={onSelect} kind="revenue" />;
  if (title === 'Analyse financière')
    return current ? (
      <FinancialAnalysisView current={current} />
    ) : (
      <AgencyFinancialAnalysisView all={all} onSelect={onSelect} />
    );
  if (title === 'Budget') return <BudgetView current={current} all={all} onSelect={onSelect} />;
  if (title === 'Trésorerie')
    return current ? <TreasuryView current={current} /> : <AgencyTreasuryView all={all} onSelect={onSelect} />;
  if (title === 'Comptabilité générale')
    return current ? <AccountingView current={current} /> : <AgencyAccountingView all={all} onSelect={onSelect} />;
  if (title === 'Clients')
    return current ? (
      <AgedView current={current} kind="clients" />
    ) : (
      <AgencyAgedView all={all} onSelect={onSelect} kind="clients" />
    );
  if (title === 'Fournisseurs')
    return current ? (
      <AgedView current={current} kind="suppliers" />
    ) : (
      <AgencyAgedView all={all} onSelect={onSelect} kind="suppliers" />
    );

  return (
    <div className="page">
      <div className="empty-domain">
        <Database size={34} />
        <span>VUE MÉTIER</span>
        <h2>{title}</h2>
        <p>
          {current ? `Périmètre : ${current.name}.` : 'Vue agence.'} Cette vue utilisera le même moteur explicable que
          le cockpit, sans dupliquer les données.
        </p>
      </div>
    </div>
  );
}
