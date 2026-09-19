import { BookOpen, ChevronRight, FileSpreadsheet, HelpCircle, Info, X } from 'lucide-react';
import { useState } from 'react';

type HelpSpec={purpose:string;files:{name:string;format:string;status?:string}[];notes?:string[];ybalac?:boolean};
const HELP:Record<string,HelpSpec>={
 'Analyse financière':{purpose:"Comprendre la situation financière de l’établissement à partir des données consolidées dans Vigie.",files:[{name:'YFDR',format:'CSV'},{name:'EBLC',format:'XLSX'},{name:'YCONSDEP / YCONSREC',format:'XLSX'},{name:'YBALAC / YBALAF',format:'XLSX'},{name:'Compte 5151',format:'CSV'}],notes:["Les pas-à-pas OP@LE seront ajoutés à mesure de leur validation terrain."]},
 'Budget':{purpose:"Suivre la construction et l’exécution budgétaires de l’établissement.",files:[{name:'Budget OP@LE',format:'.lis ou .xlsx'},{name:'EBLC',format:'XLSX'}],notes:["Le gabarit d’aide est prêt ; le parcours OP@LE reste à documenter."]},
 'Dépenses':{purpose:"Piloter l’exécution des dépenses et identifier les opérations à surveiller.",files:[{name:'YCONSDEP',format:'XLSX'}],notes:["Le parcours d’export OP@LE reste à documenter."]},
 'Recettes':{purpose:"Piloter l’exécution des recettes et identifier les opérations à surveiller.",files:[{name:'YCONSREC',format:'XLSX'}],notes:["Le parcours d’export OP@LE reste à documenter."]},
 'Trésorerie':{purpose:"Suivre la trajectoire de trésorerie à partir des écritures du compte 5151.",files:[{name:'Écritures du compte 5151',format:'CSV'}],notes:["Le parcours d’export OP@LE reste à documenter."]},
 'Clients':{purpose:"Analyser les créances clients, leur ancienneté et les situations nécessitant une attention particulière.",files:[{name:'YBALAC — Balance âgée clients',format:'XLSX · EPVD Excel',status:'Tutoriel disponible'}],ybalac:true},
 'Fournisseurs':{purpose:"Analyser les dettes fournisseurs, leur ancienneté et les situations nécessitant une attention particulière.",files:[{name:'YBALAF — Balance âgée fournisseurs',format:'XLSX'}],notes:["Le parcours d’export OP@LE reste à documenter."]},
 'Comptabilité générale':{purpose:"Examiner les comptes des classes 1 à 8 et les anomalies comptables détectées par Vigie.",files:[{name:'Données comptables OP@LE — classes 1 à 8',format:'CSV'}],notes:["Le parcours d’export OP@LE reste à documenter."]},
 'Maîtrise des risques':{purpose:"Rassembler les signaux financiers et les éléments utiles à la maîtrise des risques.",files:[{name:'Données des vues métier Vigie',format:'Sources consolidées'}],notes:["Cette vue exploite les données déjà importées dans les autres vues métier."]},
};

function YbalacGuide(){return <div className="help-guide"><div className="help-guide-title"><BookOpen size={17}/><div><b>Exporter YBALAC depuis OP@LE</b><small>Balance âgée clients · EPVD Excel (.xlsx)</small></div></div>
 {[
  ['1','Ouvrir YBALAC','Saisir le mnémonique YBALAC, puis cliquer sur OK.','/help/ybalac/01-mnemonique.png'],
  ['2','Sélectionner la période','Dans « Balance âgée clients », renseigner la période à analyser.','/help/ybalac/02-periode.png'],
  ['3','Ouvrir le paramétrage du traitement','Cliquer sur la double flèche en haut de la fenêtre YBALAC, puis sur GTPARTRT — Paramétrage du traitement.','/help/ybalac/03-gtpartrt.png'],
  ['4','Choisir EPVD Excel','Dans « Mise en forme », sélectionner EPVD Excel. Le résultat est produit au format XLSX.','/help/ybalac/04-epvd-excel.png'],
  ['5','Exécuter le travail','Cliquer sur ▶ Exécuter le travail ou appuyer sur F9.','/help/ybalac/05-executer.png'],
 ].map(([n,t,d,img])=><section className="help-step" key={n}><div className="help-step-heading"><i>{n}</i><div><b>{t}</b><p>{d}</p></div></div><img src={img} alt={`OP@LE — ${t}`}/></section>)}
 <section className="help-step compact"><div className="help-step-heading"><i>6</i><div><b>Récupérer le fichier</b><p>Ouvrir CJOBU — Consultation des travaux de l’utilisateur — puis récupérer le fichier XLSX généré.</p></div></div></section>
 <section className="help-step compact"><div className="help-step-heading"><i>7</i><div><b>Importer dans Vigie</b><p>Dans Clients, cliquer sur « Importer », choisir l’établissement, sélectionner le fichier créé puis cliquer sur « Importer ».</p></div></div></section>
 </div>}

export function ContextualHelp({view}:{view:string}){const [open,setOpen]=useState(false);const spec=HELP[view];if(!spec)return null;return <><button className="context-help-button" onClick={()=>setOpen(true)}><HelpCircle size={17}/> Aide</button>{open&&<div className="help-veil" onClick={()=>setOpen(false)}><aside className="help-drawer" onClick={e=>e.stopPropagation()}><header><div><span>AIDE CONTEXTUELLE</span><h2>{view}</h2></div><button onClick={()=>setOpen(false)} aria-label="Fermer"><X/></button></header><div className="help-body"><section className="help-purpose"><Info size={18}/><p>{spec.purpose}</p></section><section><h3>Fichier(s) attendu(s)</h3><div className="help-files">{spec.files.map(f=><div key={f.name}><FileSpreadsheet size={19}/><div><b>{f.name}</b><small>{f.format}</small></div>{f.status&&<em>{f.status}</em>}</div>)}</div></section>{spec.ybalac?<YbalacGuide/>:<section className="help-placeholder"><BookOpen size={20}/><div><b>Pas-à-pas d’export OP@LE</b><p>{spec.notes?.[0]||'Procédure à documenter.'}</p></div><ChevronRight size={18}/></section>}{spec.ybalac&&<div className="help-tip"><b>Avant l’import</b><span>Conserver le fichier XLSX produit par OP@LE sans modifier sa structure. Vigie identifie YBALAC à l’import.</span></div>}</div></aside></div>}</>}
