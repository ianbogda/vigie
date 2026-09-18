import { Database } from 'lucide-react';
import type { Eple } from '../types/dashboard';
export function DomainView({title,current}:{title:string;current:Eple|null}){return <div className="page"><div className="empty-domain"><Database size={34}/><span>VUE MÉTIER</span><h2>{title}</h2><p>{current?`Périmètre : ${current.name}.`:'Vue agence.'} Cette vue utilisera le même moteur explicable que le cockpit, sans dupliquer les données.</p></div></div>}
