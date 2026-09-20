import { ChevronRight, Database } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApiResource } from '../../hooks/use-api-resource';
import { IndicatorInfo } from '../../components/IndicatorInfo';
import { api } from '../../lib/api';
import type { AgedResponse } from '../../types/api';
import type { Eple } from '../../types/dashboard';
import { dateFr, eur } from './domain-utils';

export function AgencyAgedView({
  all,
  onSelect,
  kind
}: {
  all: Eple[];
  onSelect: (id: string) => void;
  kind: 'clients' | 'suppliers';
}) {
  const isClient = kind === 'clients',
    [rows, setRows] = useState<Array<{ e: Eple; g: AgedResponse }>>([]),
    [loading, setLoading] = useState(true),
    [exercise, setExercise] = useState(new Date().getFullYear());
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all(
      all.map(async (e) => {
        if (!e.opaleEntity) return null;
        const g = await api.aged(e.opaleEntity, kind, exercise).catch(() => null);
        return g?.snapshot ? { e, g } : null;
      })
    )
      .then((x) => live && setRows(x.filter((row): row is { e: Eple; g: AgedResponse } => row !== null)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [all, kind, exercise]);
  const exercises = [
    ...new Set<number>(rows.flatMap((r) => r.g.availableExercises).filter((x): x is number => Number.isInteger(x)))
  ].sort((a, b) => b - a);
  const ets = rows
    .map(({ e, g }) => {
      const s = g.summary ?? { total: 0, due: 0, old: 0, notDue: 0 },
        parties = new Map<string, { amount: number; old: number; pieces: number }>();
      for (const x of g.rows || []) {
        const k = x.party_label || x.party_id || 'Tiers non renseigné',
          p = parties.get(k) || { amount: 0, old: 0, pieces: 0 };
        p.amount += Math.abs(Number(x.total || 0));
        p.old += Math.abs(Number(x.before_121 || 0));
        p.pieces++;
        parties.set(k, p);
      }
      const top = [...parties.entries()].sort((a, b) => b[1].amount - a[1].amount)[0],
        oldest = Math.max(0, ...g.rows.map((x) => Number(x.age_days || x.days || 0)));
      return {
        e,
        total: Math.abs(Number(s.total || 0)),
        due: Math.abs(Number(s.due || 0)),
        old: Math.abs(Number(s.old || 0)),
        parties: parties.size,
        pieces: [...parties.values()].reduce((n, p) => n + p.pieces, 0),
        top: top ? { name: top[0], ...top[1] } : null,
        snapshot: g.snapshot?.snapshotDate ?? '',
        oldest
      };
    })
    .sort((a, b) => b.old - a.old);
  const total = ets.reduce((n, r) => n + r.total, 0),
    old = ets.reduce((n, r) => n + r.old, 0),
    due = ets.reduce((n, r) => n + r.due, 0),
    attention = ets.filter((r) => r.old > 0 && (r.total ? r.old / r.total > 0.2 : true)),
    multi = ets.filter((r) => r.parties >= 5).length;
  const bubble = ets.filter((r) => r.total > 0),
    maxX = Math.max(30, ...bubble.map((r) => r.oldest || 0)),
    maxY = Math.max(1, ...bubble.map((r) => r.total)),
    maxPieces = Math.max(1, ...bubble.map((r) => r.pieces || 0));
  if (loading)
    return (
      <div className="page">
        <div className="loading">Construction de la vue agence {isClient ? 'Clients' : 'Fournisseurs'}…</div>
      </div>
    );
  return (
    <div className="page flow-page agency-flow">
      <div className="financial-head">
        <div>
          <span>{isClient ? 'CLIENTS' : 'FOURNISSEURS'} · VUE AGENCE</span>
          <h2>{isClient ? 'Débiteurs et risques de recouvrement' : 'Fournisseurs et dettes à surveiller'}</h2>
          <p>
            {isClient
              ? 'Suivre les débiteurs, leur ancienneté et les concentrations de risque.'
              : 'Repérer les concentrations, les dettes anciennes et les fournisseurs exposés.'}
          </p>
        </div>
        <label className="flow-exercise">
          Exercice
          <select value={exercise} onChange={(e) => setExercise(Number(e.target.value))}>
            {(exercises.length ? exercises : [exercise]).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      <section className="flow-kpis">
        <article>
          <span>{isClient ? 'Encours clients' : 'Dettes fournisseurs'}</span>
          <b>{eur(total)}</b>
          <small>{ets.length} EPLE alimentés</small>
        </article>
        <article className={old ? 'attention' : ''}>
          <span>Stock &gt; 121 jours {isClient ? <IndicatorInfo id="STOCK_ANCIEN_CLIENTS" /> : null}</span>
          <b>{eur(old)}</b>
          <small>{total ? `${((old / total) * 100).toFixed(0)} % du stock` : '—'}</small>
        </article>
        <article className={attention.length ? 'attention' : ''}>
          <span>EPLE en vigilance</span>
          <b>{attention.length}</b>
          <small>ancienneté &gt; 20 % du stock</small>
        </article>
        <article>
          <span>{isClient ? 'Tiers nombreux' : 'Exposition diffuse'}</span>
          <b>{multi}</b>
          <small>EPLE avec au moins 5 tiers</small>
        </article>
      </section>
      <div className="agency-watch-grid">
        <section className="treasury-panel">
          <h3>{isClient ? 'Débiteurs : ancienneté × encours' : 'Fournisseurs : ancienneté × dettes'}</h3>
          <p className="flow-muted">
            X = ancienneté · Y = encours en € · couleur = ancienneté · taille = nombre de pièces.
          </p>
          <div className="agency-scatter">
            {bubble.length ? (
              <svg viewBox="0 0 820 390">
                <g className="scatter-grid">
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <line key={`v${t}`} x1={70 + t * 650} y1="30" x2={70 + t * 650} y2="320" />
                  ))}
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <line key={`h${t}`} x1="70" y1={320 - t * 280} x2="720" y2={320 - t * 280} />
                  ))}
                </g>
                <line className="scatter-axis" x1="70" y1="320" x2="720" y2="320" />
                <line className="scatter-axis" x1="70" y1="30" x2="70" y2="320" />
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                  <text key={`xt${t}`} x={70 + t * 650} y="342" textAnchor="middle">
                    {Math.round(maxX * t)} j
                  </text>
                ))}
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                  <text key={`yt${t}`} x="62" y={324 - t * 280} textAnchor="end">
                    {eur(maxY * t)}
                  </text>
                ))}
                {bubble.map((r) => {
                  const x = 70 + (r.oldest / maxX) * 650,
                    y = 320 - (r.total / maxY) * 280,
                    rad = 8 + (r.pieces / maxPieces) * 15,
                    sev = r.oldest > 90 ? 'alert' : r.oldest > 30 ? 'watch' : 'ok';
                  return (
                    <g key={r.e.id} className={`agency-scatter-point ${sev}`} onClick={() => onSelect(r.e.id)}>
                      <circle cx={x} cy={y} r={rad} />
                      <text x={x + rad + 4} y={y - 3}>
                        {r.e.name.slice(0, 18)}
                      </text>
                      <title>{`${r.e.name} · ${eur(r.total)} · ${r.oldest} j · ${r.pieces} pièce(s) · ${r.parties} tiers`}</title>
                    </g>
                  );
                })}
                <text x="395" y="370" textAnchor="middle">
                  Plus ancienne position (jours) →
                </text>
                <text x="18" y="175" transform="rotate(-90 18 175)" textAnchor="middle">
                  Encours (€)
                </text>
              </svg>
            ) : (
              <div className="agency-fin-empty">Aucune balance âgée exploitable pour cet exercice.</div>
            )}
          </div>
          <div className="agency-scatter-legend">
            <div>
              <b>Ancienneté</b>
              <span>
                <i className="ok" /> ≤ 30 j
              </span>
              <span>
                <i className="watch" /> 31–90 j
              </span>
              <span>
                <i className="alert" /> &gt; 90 j
              </span>
            </div>
            <div>
              <b>Taille de la bulle</b>
              <span>Nombre de pièces composant l'encours</span>
            </div>
          </div>
        </section>
        <section className="treasury-panel">
          <h3>{isClient ? 'Débiteurs à surveiller' : 'Fournisseurs à surveiller'}</h3>
          <div className="agency-alert-table">
            {ets
              .filter((r): r is typeof r & { top: NonNullable<typeof r.top> } => r.top !== null)
              .slice(0, 8)
              .map((r) => (
                <button key={r.e.id} onClick={() => onSelect(r.e.id)}>
                  <span className={`agency-dot ${r.top.old ? 'alert' : 'watch'}`} />
                  <b>{r.top.name}</b>
                  <span>
                    {r.e.name} · {eur(r.top.amount)}
                    {r.top.old ? ` · ancien ${eur(r.top.old)}` : ''}
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
export function AgedView({ current, kind }: { current: Eple | null; kind: 'clients' | 'suppliers' }) {
  const isClient = kind === 'clients';
  const { data, loading } = useApiResource(current?.opaleEntity ? () => api.aged(current.opaleEntity!, kind) : null, [
    current?.opaleEntity,
    kind
  ]);
  if (!current)
    return (
      <div className="page">
        <div className="empty-domain">
          <Database size={34} />
          <h3>Sélectionne un établissement</h3>
          <p>La balance âgée est contextualisée par EPLE.</p>
        </div>
      </div>
    );
  if (loading)
    return (
      <div className="page">
        <div className="loading">Chargement de la balance âgée…</div>
      </div>
    );
  if (!data?.snapshot)
    return (
      <div className="page aged-page">
        <div className="aged-head">
          <span>{isClient ? 'CLIENTS' : 'FOURNISSEURS'}</span>
          <h2>{isClient ? 'Créances clients' : 'Dettes fournisseurs'}</h2>
        </div>
        <div className="empty-domain">
          <Database size={34} />
          <h3>Données {isClient ? 'YBALAC' : 'YBALAF'} non importées</h3>
          <p>Utilise « Importer » pour charger la balance âgée de {current.name}.</p>
        </div>
      </div>
    );
  const x = data.summary ?? { total: 0, due: 0, old: 0, notDue: 0 },
    ratio = (n: number) => (x.total ? `${(Math.abs(n / x.total) * 100).toFixed(1)} %` : '—');
  return (
    <div className="page aged-page">
      <div className="aged-head">
        <div>
          <span>{isClient ? 'CLIENTS' : 'FOURNISSEURS'}</span>
          <h2>{isClient ? 'Créances clients' : 'Dettes fournisseurs'}</h2>
          <p>
            {current.name} · {data.sourceType} · situation au {dateFr(data.snapshot.snapshotDate)}
          </p>
        </div>
      </div>
      <div className="aged-kpis">
        <div>
          <span>{isClient ? 'Créances totales' : 'Dettes totales'}</span>
          <b>{eur(x.total)}</b>
        </div>
        <div>
          <span>dont échues {!isClient && <IndicatorInfo id="DETTES_EXIGIBLES" />}</span>
          <b>{eur(x.due)}</b>
          <small>{ratio(x.due)} du total</small>
        </div>
        <div>
          <span>dont anciennes (+121 j) {isClient && <IndicatorInfo id="STOCK_ANCIEN_CLIENTS" />}</span>
          <b>{eur(x.old)}</b>
          <small>{ratio(x.old)} du total</small>
        </div>
        <div>
          <span>dont non échues</span>
          <b>{eur(x.notDue)}</b>
        </div>
      </div>
      <section className="aged-table-card">
        <div className="aged-table-head">
          <div>
            <h3>Détail par tiers et pièce</h3>
            <small>
              {data.rows.length} ligne(s) · {data.snapshot.sourceFilename}
            </small>
          </div>
        </div>
        <div className="aged-table-scroll">
          <table className="aged-table">
            <thead>
              <tr>
                <th>Compte</th>
                <th>Tiers</th>
                <th>Pièce</th>
                <th>Type</th>
                <th>Total</th>
                <th>Échu</th>
                <th>+121 j</th>
                <th>Non échu</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={`${r.line_no}-${r.piece}-${r.party_id}`}>
                  <td>
                    <b>{r.account || '—'}</b>
                    <small>{r.account_label}</small>
                  </td>
                  <td>
                    <b>{r.party_label || r.party_id || '—'}</b>
                    <small>{r.party_id}</small>
                  </td>
                  <td>{r.piece || '—'}</td>
                  <td>{r.piece_type || '—'}</td>
                  <td className="num">
                    <b>{eur(r.total)}</b>
                  </td>
                  <td className="num">{eur(r.due)}</td>
                  <td className="num">{eur(r.before_121)}</td>
                  <td className="num">{eur(r.not_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
