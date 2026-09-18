import { ChevronDown } from 'lucide-react';
import { eur, pct } from '../lib/format';
import type { Signal } from '../types/dashboard';
import { StatusDot } from './StatusDot';

export function SignalCard({ signal, open, onToggle }: { signal: Signal; open: boolean; onToggle: () => void }) {
  return <div className="signal"><button onClick={onToggle}><StatusDot state={signal.level}/><div><b>{signal.title}</b><small>{signal.detail}</small></div><ChevronDown className={open?'rot':''} size={17}/></button>{open&&<div className="why"><strong>Pourquoi ce signal ?</strong>{signal.evidence?.map((e,i)=><div key={`${e.label}-${i}`}><span>{e.label}</span><b>{e.format==='percent'?pct(e.value):e.format==='currency'||typeof e.value==='number'?eur(e.value):String(e.value)}</b></div>)}<p><b>Règle :</b> {signal.condition||signal.code}</p><p><b>Lecture :</b> {signal.interpretation||'Signal à investiguer dans son contexte.'}</p><small>Source : {signal.source||signal.domain} · règle {signal.code}</small></div>}</div>;
}
