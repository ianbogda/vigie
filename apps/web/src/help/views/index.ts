import type { ViewHelpSpec } from '../types';

export const VIEW_HELP: Record<string, ViewHelpSpec> = {
  'Analyse financière': { purpose:"Comprendre la situation financière de l’établissement à partir des données consolidées dans Vigie.", sources:['YFDR','EBLC',{name:'YCONSDEP / YCONSREC',format:'XLSX'},'YBALAC','YBALAF',{name:'Compte 5151',format:'CSV'}], notes:["Les pas-à-pas OP@LE seront ajoutés à mesure de leur validation terrain."] },
  'Budget': { purpose:"Suivre la construction et l’exécution budgétaires de l’établissement.", sources:[{name:'Budget OP@LE',format:'.lis ou .xlsx'},'EBLC'], notes:["Le gabarit d’aide est prêt ; le parcours OP@LE reste à documenter."] },
  'Dépenses': { purpose:"Piloter l’exécution des dépenses et identifier les opérations à surveiller.", sources:[{name:'YCONSDEP',format:'XLSX'}], notes:["Le parcours d’export OP@LE reste à documenter."] },
  'Recettes': { purpose:"Piloter l’exécution des recettes et identifier les opérations à surveiller.", sources:[{name:'YCONSREC',format:'XLSX'}], notes:["Le parcours d’export OP@LE reste à documenter."] },
  'Trésorerie': { purpose:"Suivre la trajectoire de trésorerie à partir des écritures du compte 5151.", sources:[{name:'Écritures du compte 5151',format:'CSV'}], notes:["Le parcours d’export OP@LE reste à documenter."] },
  'Clients': { purpose:"Analyser les créances clients, leur ancienneté et les situations nécessitant une attention particulière.", sources:['YBALAC'] },
  'Fournisseurs': { purpose:"Analyser les dettes fournisseurs, leur ancienneté et les situations nécessitant une attention particulière.", sources:['YBALAF'] },
  'Comptabilité générale': { purpose:"Examiner les comptes des classes 1 à 8 et les anomalies comptables détectées par Vigie.", sources:[{name:'Données comptables OP@LE — classes 1 à 8',format:'CSV'}], notes:["Le parcours d’export OP@LE reste à documenter."] },
  'Maîtrise des risques': { purpose:"Rassembler les signaux financiers et les éléments utiles à la maîtrise des risques.", sources:[{name:'Données des vues métier Vigie',format:'Sources consolidées'}], notes:["Cette vue exploite les données déjà importées dans les autres vues métier."] },
};
