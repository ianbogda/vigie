import { Building2, ChevronRight, Search } from 'lucide-react';
import { useMemo } from 'react';
import { StatusDot } from '../components/StatusDot';
import { dateFr } from '../lib/format';
import type { Eple } from '../types/dashboard';
export function EstablishmentsView({all,q,setQ,select}:{all:Eple[];q:string;setQ:(v:string)=>void;select:(id:string)=>void}){const rows=useMemo(()=>all.filter(e=>e.name.toLowerCase().includes(q.toLowerCase())),[all,q]);return <div className="page"><div className="pagehead"><div><h2>Établissements</h2><p>Une plateforme, plusieurs EPLE, une lecture homogène.</p></div><div className="search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher…"/></div></div><div className="est-cards">{rows.map(e=><button key={e.id} onClick={()=>select(e.id)}><Building2/><div><b>{e.name}</b><small>Dernière situation : {dateFr(e.freshness)}</small></div><div className="dots"><StatusDot state={e.states.budget}/><StatusDot state={e.states.financial}/><StatusDot state={e.states.suppliers}/><StatusDot state={e.states.accounting}/></div><ChevronRight/></button>)}</div></div>}
