import { BookOpen, ChevronRight, FileSpreadsheet, HelpCircle, Info, X } from 'lucide-react';
import { useState } from 'react';
import { OPALE_HELP_REGISTRY } from '../help/opale';
import { VIEW_HELP } from '../help/views';
import type { OpaleSourceHelp, OpaleSourceId } from '../help/types';

function isOpaleSourceId(value: unknown): value is OpaleSourceId {
  return typeof value === 'string' && value in OPALE_HELP_REGISTRY;
}

function OpaleGuide({ source }: { source: OpaleSourceHelp }) {
  return <div className="help-guide">
    <div className="help-guide-title"><BookOpen size={17}/><div><b>Exporter {source.id} depuis OP@LE</b><small>{source.label}{source.variant ? ` · ${source.variant}` : ''} ({source.format.toLowerCase()})</small></div></div>
    {source.steps.map(step => <section className={`help-step${step.image ? '' : ' compact'}`} key={step.n}>
      <div className="help-step-heading"><i>{step.n}</i><div><b>{step.title}</b><p>{step.description}</p></div></div>
      {step.image && <img src={step.image} alt={`OP@LE — ${step.title}`}/>} 
    </section>)}
    {source.beforeImport && <div className="help-tip"><b>Avant l’import</b><span>{source.beforeImport}</span></div>}
  </div>;
}

export function ContextualHelp({view}:{view:string}) {
  const [open,setOpen]=useState(false);
  const [openSource,setOpenSource]=useState<OpaleSourceId|null>(null);
  const spec=VIEW_HELP[view];
  if(!spec)return null;
  const tutorialSources=spec.sources.filter(isOpaleSourceId);
  return <>
    <button className="context-help-button" onClick={()=>setOpen(true)}><HelpCircle size={17}/> Aide</button>
    {open&&<div className="help-veil" onClick={()=>setOpen(false)}><aside className="help-drawer" onClick={e=>e.stopPropagation()}>
      <header><div><span>AIDE CONTEXTUELLE</span><h2>{view}</h2></div><button onClick={()=>setOpen(false)} aria-label="Fermer"><X/></button></header>
      <div className="help-body">
        <section className="help-purpose"><Info size={18}/><p>{spec.purpose}</p></section>
        <section><h3>Fichier(s) attendu(s)</h3><div className="help-files">{spec.sources.map((entry,index)=>{
          if(isOpaleSourceId(entry)){
            const source=OPALE_HELP_REGISTRY[entry];
            return <div key={source.id}><FileSpreadsheet size={19}/><div><b>{source.id} — {source.label}</b><small>{source.format}{source.variant ? ` · ${source.variant}` : ''}</small></div>{source.tutorialAvailable&&<button className="help-source-link" onClick={()=>setOpenSource(openSource===source.id?null:source.id)}>Tutoriel</button>}</div>;
          }
          return <div key={`${entry.name}-${index}`}><FileSpreadsheet size={19}/><div><b>{entry.name}</b><small>{entry.format}</small></div>{entry.note&&<em>{entry.note}</em>}</div>;
        })}</div></section>
        {tutorialSources.length>0 ? tutorialSources.map(id => openSource===id ? <OpaleGuide key={id} source={OPALE_HELP_REGISTRY[id]}/> : null) : <section className="help-placeholder"><BookOpen size={20}/><div><b>Pas-à-pas d’export OP@LE</b><p>{spec.notes?.[0]||'Procédure à documenter.'}</p></div><ChevronRight size={18}/></section>}
      </div>
    </aside></div>}
  </>;
}
