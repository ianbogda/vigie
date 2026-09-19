import { useCallback, useEffect, useState } from 'react';
import './pcif.css';
import './treasury.css';
import { BadgeEuro, BookOpenCheck, Building2, CalendarDays, CheckCircle2, Home, Landmark, LineChart, ReceiptText, RefreshCw, ShieldCheck, Upload, UsersRound, WalletCards } from 'lucide-react';
import { api } from './lib/api';
import { dateFr } from './lib/format';
import type { Dashboard, Eple } from './types/dashboard';
import { ImportModal } from './components/ImportModal';
import { HomeView } from './views/HomeView';
import { EstablishmentsView } from './views/EstablishmentsView';
import { DomainView } from './views/DomainView';

const NAV=[['Accueil',Home],['Établissements',Building2],['Analyse financière',LineChart],['Budget',ReceiptText],['Dépenses',BadgeEuro],['Recettes',WalletCards],['Trésorerie',Landmark],['Fournisseurs',UsersRound],['Comptabilité générale',BookOpenCheck],['Maîtrise des risques',ShieldCheck]] as const;
export default function App(){
 const[dash,setDash]=useState<Dashboard|null>(null),[selectedId,setSelectedId]=useState('all'),[view,setView]=useState('Accueil'),[modal,setModal]=useState(false),[result,setResult]=useState<any>(null),[openSignal,setOpenSignal]=useState<string|null>(null),[q,setQ]=useState(''),[pcifSyncing,setPcifSyncing]=useState(false);
 const load=useCallback(async()=>{try{setDash(await api.dashboard())}catch(error){console.error('Chargement du cockpit impossible',error)}},[]);
 useEffect(()=>{void load()},[load]);
 const all:Eple[]=dash?.establishments||[]; const current=selectedId==='all'?null:all.find(e=>e.id===selectedId)||null;
 async function syncPcif(uai:string){setPcifSyncing(true);try{await api.syncPcif([uai]);await load()}catch(error){console.error('Synchronisation PCIF impossible',error)}finally{setPcifSyncing(false)}}
 async function upload(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setResult({loading:true});try{const x=await api.importOpale(new FormData(e.currentTarget));setResult(x);await load()}catch(error){setResult({error:error instanceof Error?error.message:'Erreur inconnue'})}}
 return <div className="shell"><aside className="sidebar"><div className="logo"><div className="lighthouse">V</div><div><strong>VIGIE EPLE</strong><small>Observer · Analyser · Anticiper</small></div></div><nav>{NAV.map(([n,I])=><button className={view===n?'active':''} onClick={()=>setView(n)} key={n}><I size={18}/>{n}</button>)}</nav><div className="side-quote">« Anticiper aujourd'hui<br/>pour sécuriser demain »</div><small className="version">VIGIE v0.0.20</small></aside>
 <main className="content"><header className="topbar"><div className="est-select"><span>Établissement</span><select value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="all">Vue agence · tous les EPLE</option>{all.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div><div className="situation"><span>Situation au</span><b><CalendarDays size={16}/> {dateFr(current?.freshness||dash?.generatedAt)}</b><small><CheckCircle2 size={14}/> Données historisées</small></div><div className="top-actions"><button onClick={()=>void load()} className="btn-soft" aria-label="Actualiser"><RefreshCw size={16}/></button><button onClick={()=>setModal(true)} className="btn-primary-v"><Upload size={16}/> Importer</button></div></header>
 {dash?(view==='Accueil'?<HomeView dash={dash} current={current} openSignal={openSignal} setOpenSignal={setOpenSignal} onPcifSync={syncPcif} pcifSyncing={pcifSyncing}/>:view==='Établissements'?<EstablishmentsView all={all} q={q} setQ={setQ} select={id=>{setSelectedId(id);setView('Accueil')}}/>:<DomainView title={view} current={current}/>):<div className="loading">Construction du cockpit…</div>}</main>
 {modal&&<ImportModal result={result} onClose={()=>setModal(false)} onSubmit={upload}/>}</div>
}
