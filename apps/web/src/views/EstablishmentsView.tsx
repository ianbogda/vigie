import { useEffect, useMemo, useState } from 'react';
import { Archive, Building2, ChevronRight, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import type { Eple } from '../types/dashboard';
import { api } from '../lib/api';
import { StatusDot } from '../components/StatusDot';

type Registry={id:number;uai:string;name:string;opale_entity?:string|null;is_active:boolean;archived_at?:string|null};
export function EstablishmentsView({all,q,setQ,select,reload,canManage}:{all:Eple[];q:string;setQ:(v:string)=>void;select:(id:string)=>void;reload:()=>Promise<void>;canManage:boolean}){
 const[registry,setRegistry]=useState<Registry[]>([]),[editing,setEditing]=useState<Registry|null|undefined>(undefined),[error,setError]=useState('');
 const refresh=async()=>{const r=await api.establishments();setRegistry(r.establishments||[])};
 useEffect(()=>{void refresh()},[]);
 const rows=useMemo(()=>all.filter(e=>e.name.toLowerCase().includes(q.toLowerCase())),[all,q]);
 const archived=registry.filter(e=>!e.is_active&&e.name.toLowerCase().includes(q.toLowerCase()));
 async function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setError('');const f=new FormData(e.currentTarget),body={uai:String(f.get('uai')||''),name:String(f.get('name')||''),opaleEntity:String(f.get('opaleEntity')||'')};try{editing?.id?await api.updateEstablishment(editing.id,body):await api.createEstablishment(body);setEditing(undefined);await refresh();await reload()}catch(x){setError(x instanceof Error?x.message:'Erreur') }}
 async function remove(e:Eple){if(!e.registryId)return;if(!confirm(`Retirer ${e.name} de Vigie ?\n\nS'il possède des données, il sera archivé et celles-ci seront conservées.`))return;await api.deleteEstablishment(e.registryId);await refresh();await reload()}
 async function restore(e:Registry){await api.restoreEstablishment(e.id);await refresh();await reload()}
 return <div className="page"><div className="pagehead"><div><h2>Établissements</h2><p>Référentiel des EPLE suivis par Vigie.</p></div><div className="est-actions"><div className="search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher…"/></div>{canManage&&<button className="btn-primary-v" onClick={()=>setEditing(null)}><Plus size={16}/> Ajouter</button>}</div></div>
 <div className="est-cards">{rows.map(e=><div className="est-row" key={e.id}><button className="est-open" onClick={()=>select(e.id)}><Building2/><div><b>{e.name}</b><small>{e.uai||'UAI non renseigné'} · {e.opaleEntity||'ETS Op@le non renseigné'}</small></div><div className="dots"><StatusDot state={e.states.budget}/><StatusDot state={e.states.financial}/><StatusDot state={e.states.suppliers}/><StatusDot state={e.states.accounting}/></div><ChevronRight/></button>{canManage&&e.registryId&&<div className="est-tools"><button title="Modifier" onClick={()=>setEditing(registry.find(x=>x.id===e.registryId)||null)}><Pencil size={15}/></button><button title="Supprimer ou archiver" onClick={()=>void remove(e)}><Trash2 size={15}/></button></div>}</div>)}</div>
 {canManage&&archived.length>0&&<section className="archived-est"><h3><Archive size={16}/> Établissements archivés</h3>{archived.map(e=><div key={e.id}><span><b>{e.name}</b><small>{e.uai} · {e.opale_entity||'sans ETS'}</small></span><button className="btn-soft" onClick={()=>void restore(e)}><RotateCcw size={14}/> Réactiver</button></div>)}</section>}
 {editing!==undefined&&<div className="modalveil" onClick={()=>setEditing(undefined)}><div className="importbox" onClick={e=>e.stopPropagation()}><button className="x" onClick={()=>setEditing(undefined)}><X/></button><Building2 size={28}/><h3>{editing?'Modifier':'Ajouter'} un établissement</h3><form onSubmit={save}><label>UAI</label><input name="uai" defaultValue={editing?.uai||''} required disabled={!!editing}/><label>Nom de l'établissement</label><input name="name" defaultValue={editing?.name||''} required/><label>Code ETS Op@le</label><input name="opaleEntity" defaultValue={editing?.opale_entity||''} placeholder="P00846"/>{error&&<div className="result">{error}</div>}<button className="btn-primary-v">{editing?'Enregistrer':'Ajouter l’établissement'}</button></form></div></div>}
 </div>
}
