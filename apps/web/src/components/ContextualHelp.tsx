import { BookOpen, ChevronRight, FileSpreadsheet, HelpCircle, Info, X } from 'lucide-react';
import { useState } from 'react';
import ybalac01 from '../assets/help/ybalac/01-mnemonique.png';
import ybalac02 from '../assets/help/ybalac/02-periode.png';
import ybalac03 from '../assets/help/ybalac/03-gtpartrt.png';
import ybalac04 from '../assets/help/ybalac/04-epvd-excel.png';
import ybalac05 from '../assets/help/ybalac/05-executer.png';
import ybalaf01 from '../assets/help/ybalaf/01-mnemonique.png';
import ybalaf02 from '../assets/help/ybalaf/02-periode.png';
import ybalaf03 from '../assets/help/ybalaf/03-gtpartrt.png';
import ybalaf04 from '../assets/help/ybalaf/04-epvd-excel.png';
import ybalaf05 from '../assets/help/ybalaf/05-executer.png';

type HelpSpec={purpose:string;files:{name:string;format:string;status?:string}[];notes?:string[];guide?:'ybalac'|'ybalaf'};
const HELP:Record<string,HelpSpec>={
 'Analyse financière':{purpose:"Comprendre la situation financière de l’établissement à partir des données consolidées dans Vigie.",files:[{name:'YFDR',format:'CSV'},{name:'EBLC',format:'XLSX'},{name:'YCONSDEP / YCONSREC',format:'XLSX'},{name:'YBALAC / YBALAF',format:'XLSX'},{name:'Compte 5151',format:'CSV'}],notes:["Les pas-à-pas OP@LE seront ajoutés à mesure de leur validation terrain."]},
 'Budget':{purpose:"Suivre la construction et l’exécution budgétaires de l’établissement.",files:[{name:'Budget OP@LE',format:'.lis ou .xlsx'},{name:'EBLC',format:'XLSX'}],notes:["Le gabarit d’aide est prêt ; le parcours OP@LE reste à documenter."]},
 'Dépenses':{purpose:"Piloter l’exécution des dépenses et identifier les opérations à surveiller.",files:[{name:'YCONSDEP',format:'XLSX'}],notes:["Le parcours d’export OP@LE reste à documenter."]},
 'Recettes':{purpose:"Piloter l’exécution des recettes et identifier les opérations à surveiller.",files:[{name:'YCONSREC',format:'XLSX'}],notes:["Le parcours d’export OP@LE reste à documenter."]},
 'Trésorerie':{purpose:"Suivre la trajectoire de trésorerie à partir des écritures du compte 5151.",files:[{name:'Écritures du compte 5151',format:'CSV'}],notes:["Le parcours d’export OP@LE reste à documenter."]},
 'Clients':{purpose:"Analyser les créances clients, leur ancienneté et les situations nécessitant une attention particulière.",files:[{name:'YBALAC — Balance âgée clients',format:'XLSX · EPVD Excel',status:'Tutoriel disponible'}],guide:'ybalac'},
 'Fournisseurs':{purpose:"Analyser les dettes fournisseurs, leur ancienneté et les situations nécessitant une attention particulière.",files:[{name:'YBALAF — Balance âgée fournisseurs',format:'XLSX · EPVD Excel',status:'Tutoriel disponible'}],guide:'ybalaf'},
 'Comptabilité générale':{purpose:"Examiner les comptes des classes 1 à 8 et les anomalies comptables détectées par Vigie.",files:[{name:'Données comptables OP@LE — classes 1 à 8',format:'CSV'}],notes:["Le parcours d’export OP@LE reste à documenter."]},
 'Maîtrise des risques':{purpose:"Rassembler les signaux financiers et les éléments utiles à la maîtrise des risques.",files:[{name:'Données des vues métier Vigie',format:'Sources consolidées'}],notes:["Cette vue exploite les données déjà importées dans les autres vues métier."]},
};

type GuideStep={n:string;title:string;description:string;image?:string};
function OpaleGuide({kind}:{kind:'ybalac'|'ybalaf'}){
 const isClient=kind==='ybalac';
 const code=isClient?'YBALAC':'YBALAF';
 const label=isClient?'Balance âgée clients':'Balance âgée fournisseurs';
 const images=isClient?[ybalac01,ybalac02,ybalac03,ybalac04,ybalac05]:[ybalaf01,ybalaf02,ybalaf03,ybalaf04,ybalaf05];
 const steps:GuideStep[]=[
  {n:'1',title:`Ouvrir ${code}`,description:`Saisir le mnémonique ${code}, puis cliquer sur OK.`,image:images[0]},
  {n:'2',title:'Sélectionner la période',description:`Dans « ${label} », renseigner la période à analyser, puis cliquer sur la double flèche en haut de la fenêtre.`,image:images[1]},
  {n:'3',title:'Ouvrir le paramétrage du traitement',description:'Cliquer sur GTPARTRT — Paramétrage du traitement.',image:images[2]},
  {n:'4',title:'Choisir EPVD Excel',description:'Dans « Mise en forme », sélectionner EPVD Excel. Le résultat est produit au format XLSX.',image:images[3]},
  {n:'5',title:'Exécuter le travail',description:'Cliquer sur ▶ Exécuter le travail ou appuyer sur F9.',image:images[4]},
  {n:'6',title:'Récupérer le fichier',description:'Ouvrir CJOBU — Consultation des travaux de l’utilisateur — puis télécharger le fichier XLSX généré.'},
  {n:'7',title:'Importer dans Vigie',description:`Dans ${isClient?'Clients':'Fournisseurs'}, cliquer sur « Importer », choisir l’établissement concerné, sélectionner le fichier XLSX créé puis cliquer sur « Importer ».`},
 ];
 return <div className="help-guide"><div className="help-guide-title"><BookOpen size={17}/><div><b>Exporter {code} depuis OP@LE</b><small>{label} · EPVD Excel (.xlsx)</small></div></div>
 {steps.map(step=><section className={`help-step${step.image?'':' compact'}`} key={step.n}><div className="help-step-heading"><i>{step.n}</i><div><b>{step.title}</b><p>{step.description}</p></div></div>{step.image&&<img src={step.image} alt={`OP@LE — ${step.title}`}/>}</section>)}
 </div>}

export function ContextualHelp({view}:{view:string}){const [open,setOpen]=useState(false);const spec=HELP[view];if(!spec)return null;return <><button className="context-help-button" onClick={()=>setOpen(true)}><HelpCircle size={17}/> Aide</button>{open&&<div className="help-veil" onClick={()=>setOpen(false)}><aside className="help-drawer" onClick={e=>e.stopPropagation()}><header><div><span>AIDE CONTEXTUELLE</span><h2>{view}</h2></div><button onClick={()=>setOpen(false)} aria-label="Fermer"><X/></button></header><div className="help-body"><section className="help-purpose"><Info size={18}/><p>{spec.purpose}</p></section><section><h3>Fichier(s) attendu(s)</h3><div className="help-files">{spec.files.map(f=><div key={f.name}><FileSpreadsheet size={19}/><div><b>{f.name}</b><small>{f.format}</small></div>{f.status&&<em>{f.status}</em>}</div>)}</div></section>{spec.guide?<OpaleGuide kind={spec.guide}/>:<section className="help-placeholder"><BookOpen size={20}/><div><b>Pas-à-pas d’export OP@LE</b><p>{spec.notes?.[0]||'Procédure à documenter.'}</p></div><ChevronRight size={18}/></section>}{spec.guide&&<div className="help-tip"><b>Avant l’import</b><span>Conserver le fichier XLSX produit par OP@LE sans modifier sa structure. Vigie identifie automatiquement le type de balance à l’import.</span></div>}</div></aside></div>}</>}
