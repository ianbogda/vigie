import { ExternalLink, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';
import { IndicatorInfo } from '../../components/IndicatorInfo';
import type { Eple } from '../../types/dashboard';

export function RiskMasteryView({
  current,
  all,
  onSelect
}: {
  current: Eple | null;
  all: Eple[];
  onSelect: (id: string) => void;
}) {
  const mastery = (v?: number | null) => (v == null ? '—' : `${Math.round(Number(v))} %`);
  const trend = (v?: string | number | null) => {
    const n = Number(v);
    return v == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${n} pt${Math.abs(n) !== 1 ? 's' : ''}`;
  };
  const domainInfo = (d: any) => {
    const answered = Number(d?.answered ?? d?.responses ?? 0),
      total = Number(d?.total ?? d?.questions ?? 0),
      completion = d?.completion == null ? (total ? (answered / total) * 100 : 0) : Number(d.completion),
      mastery = d?.mastery == null ? (d?.mastery_level == null ? null : Number(d.mastery_level)) : Number(d.mastery),
      major = Number(d?.majorRisks ?? d?.major_risks ?? 0);
    return { label: String(d?.label || d?.name || d?.code || 'Domaine'), answered, total, completion, mastery, major };
  };
  if (current) {
    const p = current.pcif,
      attention = Array.isArray(p?.attention) ? p.attention : [],
      consistency = Array.isArray(p?.consistency) ? p.consistency : [],
      pcifDomains = (p?.domains || []).map(domainInfo),
      reviews = consistency.filter((x) => x.status === 'REVIEW'),
      major = Number(p?.major_risks || 0),
      open = Number(p?.open_actions || 0),
      overdue = Number(p?.overdue_actions || 0),
      answered = Number(p?.answered || 0),
      total = Number(p?.total || 0),
      coverage = total ? Math.round((answered / total) * 100) : Number(p?.completion || 0);
    return (
      <div className="page fade-in risk-mastery">
        <div className="financial-head">
          <div>
            <span>MAÎTRISE DES RISQUES</span>
            <h2>
              <ShieldCheck size={24} /> Synthèse PCIF · {current.name}
            </h2>
            <p>
              Vigie résume le diagnostic et oriente vers les domaines à examiner ; le traitement reste dans PCIF
              Académie.
            </p>
          </div>
          {p?.source_url && (
            <a className="risk-pcif-link" href={p.source_url} target="_blank" rel="noreferrer">
              Ouvrir dans PCIF Académie <ExternalLink size={15} />
            </a>
          )}
        </div>
        {!p ? (
          <section className="treasury-panel">
            <p className="flow-muted">Aucune synthèse PCIF disponible pour cet établissement.</p>
          </section>
        ) : (
          <>
            <section className="risk-kpis">
              <article className={coverage < 50 ? 'muted-kpi' : ''}>
                <span>
                  Couverture du diagnostic <IndicatorInfo id="COUVERTURE_PCIF" />
                </span>
                <b>{total ? `${answered}/${total}` : `${coverage} %`}</b>
                <small>{coverage} % renseigné</small>
              </article>
              <article className={coverage < 50 ? 'muted-kpi' : ''}>
                <span>
                  Niveau de maîtrise <IndicatorInfo id="MAITRISE_PCIF" />
                </span>
                <b>{mastery(p.mastery_level)}</b>
                <small>
                  {coverage < 50
                    ? `sur ${coverage} % du diagnostic renseigné`
                    : p.campaign_label || 'Dernière campagne'}
                </small>
              </article>
              <article className={major ? 'attention' : ''}>
                <span>
                  Risques majeurs <IndicatorInfo id="RISQUES_MAJEURS_PCIF" />
                </span>
                <b>{major}</b>
                <small>identifiés dans le PCIF</small>
              </article>
              <article>
                <span>Actions ouvertes</span>
                <b>{open}</b>
                <small>programme d'action</small>
              </article>
              <article className={overdue ? 'attention' : ''}>
                <span>Actions en retard</span>
                <b>{overdue}</b>
                <small>échéance dépassée</small>
              </article>
              <article className={reviews.length ? 'attention' : ''}>
                <span>Cohérences à examiner</span>
                <b>{reviews.length}</b>
                <small>PCIF × observations Vigie</small>
              </article>
            </section>
            <section className="treasury-panel risk-domain-panel">
              <h3>Maîtrise par domaine</h3>
              <p className="flow-muted">
                La maîtrise est toujours lue avec la couverture du domaine. Un taux élevé sur un diagnostic peu
                renseigné est neutralisé.
              </p>
              <div className="risk-domain-list">
                {pcifDomains.length ? (
                  pcifDomains.map((d: any) => (
                    <div key={d.label}>
                      <div>
                        <b>{d.label}</b>
                        <small>
                          {d.total
                            ? `${d.answered}/${d.total} réponses · ${Math.round(d.completion)} % de couverture`
                            : `${Math.round(d.completion)} % de couverture`}
                        </small>
                      </div>
                      <div className="risk-domain-bar">
                        <i style={{ width: `${Math.max(0, Math.min(100, d.completion))}%` }} />
                      </div>
                      <strong className={d.completion < 50 ? 'neutralized' : ''}>
                        {d.mastery == null ? '—' : `${Math.round(d.mastery)} %`}
                      </strong>
                      <em>
                        {d.major
                          ? `${d.major} risque${d.major > 1 ? 's' : ''} ≥ 6`
                          : d.completion < 50
                            ? 'À compléter'
                            : '—'}
                      </em>
                    </div>
                  ))
                ) : (
                  <p className="flow-muted">Le détail par domaine n’est pas encore remonté par PCIF Académie.</p>
                )}
              </div>
            </section>
            <section className="risk-two-columns">
              <article className="treasury-panel">
                <h3>Domaines nécessitant une attention</h3>
                <p className="flow-muted">Lecture issue de la dernière synthèse PCIF.</p>
                <div className="risk-attention-list">
                  {attention.length ? (
                    attention.map((a, i) => (
                      <div key={`${a.label}-${i}`}>
                        <span
                          className={`agency-dot ${Number(a.majorRisks || 0) > 0 ? 'alert' : Number(a.mastery || 100) < 60 ? 'watch' : 'ok'}`}
                        />
                        <b>{a.label}</b>
                        <span>
                          {a.mastery != null
                            ? `${Math.round(Number(a.mastery))} % de maîtrise`
                            : 'Maîtrise non renseignée'}
                        </span>
                        <strong>
                          {a.majorRisks
                            ? `${a.majorRisks} risque${a.majorRisks > 1 ? 's' : ''} majeur${a.majorRisks > 1 ? 's' : ''}`
                            : '—'}
                        </strong>
                      </div>
                    ))
                  ) : (
                    <p className="flow-muted">Aucun domaine d'attention remonté.</p>
                  )}
                </div>
              </article>
              <article className="treasury-panel">
                <h3>Cohérence avec les observations Vigie</h3>
                <p className="flow-muted">
                  Les écarts servent à prioriser un contrôle, pas à modifier le diagnostic PCIF.
                </p>
                <div className="risk-consistency-list">
                  {consistency.length ? (
                    consistency.map((x, i) => (
                      <div key={`${x.vigieDomain}-${i}`} className={x.status.toLowerCase()}>
                        <span
                          className={`agency-dot ${x.status === 'REVIEW' ? 'watch' : x.status === 'COHERENT' ? 'ok' : 'missing'}`}
                        />
                        <b>{x.vigieDomain}</b>
                        <span>{x.reasons?.[0] || '—'}</span>
                        <strong>
                          {x.status === 'REVIEW'
                            ? 'À examiner'
                            : x.status === 'COHERENT'
                              ? 'Cohérent'
                              : x.status === 'PCIF_INSUFFICIENT'
                                ? 'À compléter'
                                : 'Non rapproché'}
                        </strong>
                      </div>
                    ))
                  ) : (
                    <p className="flow-muted">Aucun rapprochement disponible.</p>
                  )}
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    );
  }
  const rows = all.map((e) => ({ e, p: e.pcif })),
    withPcif = rows.filter((r) => r.p),
    missing = rows.length - withPcif.length,
    incomplete = withPcif.filter((r) => Number(r.p?.completion || 0) < 100).length,
    major = withPcif.reduce((n, r) => n + Number(r.p?.major_risks || 0), 0),
    overdue = withPcif.reduce((n, r) => n + Number(r.p?.overdue_actions || 0), 0),
    reviews = withPcif.reduce((n, r) => n + (r.p?.consistency || []).filter((x) => x.status === 'REVIEW').length, 0);
  const needing = withPcif.filter(
    (r) =>
      Number(r.p?.major_risks || 0) > 0 ||
      Number(r.p?.overdue_actions || 0) > 0 ||
      (r.p?.consistency || []).some((x) => x.status === 'REVIEW')
  ).length;
  const domains = new Map<string, { count: number; major: number; masteries: number[] }>();
  withPcif.forEach((r) =>
    (r.p?.attention || []).forEach((a) => {
      const x = domains.get(a.label) || { count: 0, major: 0, masteries: [] };
      x.count++;
      x.major += Number(a.majorRisks || 0);
      if (a.mastery != null) x.masteries.push(Number(a.mastery));
      domains.set(a.label, x);
    })
  );
  const common = [...domains.entries()].sort((a, b) => b[1].count - a[1].count || b[1].major - a[1].major).slice(0, 6);
  const improving = withPcif.filter((r) => Number(r.p?.trend) > 0).length,
    degrading = withPcif.filter((r) => Number(r.p?.trend) < 0).length,
    stable = withPcif.filter((r) => r.p?.trend != null && Number(r.p?.trend) === 0).length;
  const agencyDomainLabels = [
    ...new Set(withPcif.flatMap((r) => (r.p?.domains || []).map((d: any) => domainInfo(d).label)))
  ];
  return (
    <div className="page fade-in risk-mastery">
      <div className="financial-head">
        <div>
          <span>MAÎTRISE DES RISQUES · AGENCE</span>
          <h2>
            <ShieldCheck size={24} /> Synthèse des établissements
          </h2>
          <p>Repérer les EPLE et domaines qui nécessitent un accompagnement ou un contrôle particulier.</p>
        </div>
      </div>
      <section className="risk-kpis">
        <article className={needing ? 'attention' : ''}>
          <span>EPLE à accompagner</span>
          <b>{needing}</b>
          <small>risque majeur, retard ou cohérence à examiner</small>
        </article>
        <article className={major ? 'attention' : ''}>
          <span>
            Risques majeurs <IndicatorInfo id="RISQUES_MAJEURS_PCIF" />
          </span>
          <b>{major}</b>
          <small>ensemble de l'agence</small>
        </article>
        <article className={overdue ? 'attention' : ''}>
          <span>Actions en retard</span>
          <b>{overdue}</b>
          <small>toutes campagnes synchronisées</small>
        </article>
        <article className={incomplete ? 'attention' : ''}>
          <span>Campagnes incomplètes</span>
          <b>{incomplete}</b>
          <small>complétude &lt; 100 %</small>
        </article>
        <article className={missing ? 'attention' : ''}>
          <span>PCIF non disponible</span>
          <b>{missing}</b>
          <small>EPLE sans synthèse synchronisée</small>
        </article>
        <article className={reviews ? 'attention' : ''}>
          <span>Cohérences à examiner</span>
          <b>{reviews}</b>
          <small>PCIF × observations Vigie</small>
        </article>
      </section>
      <section className="treasury-panel">
        <h3>Synthèse PCIF par établissement</h3>
        <p className="flow-muted">Cliquer sur un établissement pour ouvrir sa synthèse.</p>
        <div className="accounting-table-wrap">
          <table className="accounting-table risk-agency-table">
            <thead>
              <tr>
                <th>Établissement</th>
                <th>Campagne</th>
                <th className="num">Maîtrise</th>
                <th className="num">Complétude</th>
                <th className="num">Risques majeurs</th>
                <th className="num">Actions ouvertes</th>
                <th className="num">En retard</th>
                <th>Évolution</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.e.id} onClick={() => onSelect(r.e.id)}>
                  <td>
                    <b>{r.e.name}</b>
                    <br />
                    <small>{r.e.uai || ''}</small>
                  </td>
                  <td>{r.p?.campaign_label || 'Non synchronisé'}</td>
                  <td className="num">{mastery(r.p?.mastery_level)}</td>
                  <td className="num">{r.p ? `${Number(r.p.completion || 0)} %` : '—'}</td>
                  <td className="num risk-cell-alert">{r.p?.major_risks ?? '—'}</td>
                  <td className="num">{r.p?.open_actions ?? '—'}</td>
                  <td className="num risk-cell-watch">{r.p?.overdue_actions ?? '—'}</td>
                  <td>{trend(r.p?.trend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {agencyDomainLabels.length > 0 && (
        <section className="treasury-panel">
          <h3>Maîtrise par domaine · agence</h3>
          <p className="flow-muted">
            Lecture croisée EPLE × domaines. La couverture reste prioritaire : une maîtrise calculée sur un diagnostic
            incomplet est neutralisée.
          </p>
          <div className="accounting-table-wrap">
            <table className="accounting-table risk-heatmap">
              <thead>
                <tr>
                  <th>Établissement</th>
                  {agencyDomainLabels.map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.e.id} onClick={() => onSelect(r.e.id)}>
                    <td>
                      <b>{r.e.name}</b>
                    </td>
                    {agencyDomainLabels.map((label) => {
                      const d = (r.p?.domains || []).map(domainInfo).find((x: any) => x.label === label);
                      if (!d)
                        return (
                          <td key={label} className="risk-heat-missing">
                            —
                          </td>
                        );
                      const cls =
                        d.completion < 50
                          ? 'risk-heat-incomplete'
                          : d.major > 0
                            ? 'risk-heat-alert'
                            : d.mastery != null && d.mastery < 60
                              ? 'risk-heat-watch'
                              : 'risk-heat-ok';
                      return (
                        <td key={label} className={cls}>
                          <b>{d.mastery == null ? '—' : `${Math.round(d.mastery)} %`}</b>
                          <small>{Math.round(d.completion)} % couvert</small>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="risk-two-columns">
        <article className="treasury-panel">
          <h3>Risques communs à l'agence</h3>
          <p className="flow-muted">Domaines d'attention remontés par plusieurs établissements.</p>
          <div className="risk-common-list">
            {common.length ? (
              common.map(([label, x]) => (
                <div key={label}>
                  <span className={`agency-dot ${x.major ? 'alert' : 'watch'}`} />
                  <b>{label}</b>
                  <span>
                    {x.count}/{withPcif.length} EPLE concernés
                  </span>
                  <strong>
                    {x.major
                      ? `${x.major} risque${x.major > 1 ? 's' : ''} majeur${x.major > 1 ? 's' : ''}`
                      : x.masteries.length
                        ? `Maîtrise moy. ${Math.round(x.masteries.reduce((a, b) => a + b, 0) / x.masteries.length)} %`
                        : '—'}
                  </strong>
                </div>
              ))
            ) : (
              <p className="flow-muted">Aucun domaine commun identifié.</p>
            )}
          </div>
        </article>
        <article className="treasury-panel">
          <h3>Dynamique inter-campagnes</h3>
          <p className="flow-muted">Évolution déclarée par rapport à la campagne précédente.</p>
          <div className="risk-dynamics">
            <div className="up">
              <TrendingUp size={18} />
              <b>{improving}</b>
              <span>EPLE en amélioration</span>
            </div>
            <div>
              <b>{stable}</b>
              <span>stables</span>
            </div>
            <div className="down">
              <TrendingDown size={18} />
              <b>{degrading}</b>
              <span>en dégradation</span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
