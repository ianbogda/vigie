import ybalaf01 from '../../assets/help/ybalaf/01-mnemonique.png';
import ybalaf02 from '../../assets/help/ybalaf/02-periode.png';
import ybalaf03 from '../../assets/help/ybalaf/03-gtpartrt.png';
import ybalaf04 from '../../assets/help/ybalaf/04-epvd-excel.png';
import ybalaf05 from '../../assets/help/ybalaf/05-executer.png';
import type { OpaleSourceHelp } from '../types';

export const YBALAF_HELP: OpaleSourceHelp = {
  id: 'YBALAF',
  label: 'Balance âgée fournisseurs',
  format: 'XLSX',
  variant: 'EPVD Excel',
  tutorialAvailable: true,
  beforeImport: 'Conserver le fichier XLSX produit par OP@LE sans modifier sa structure. Vigie identifie automatiquement le type de balance à l’import.',
  steps: [
    { n:'1', title:'Ouvrir YBALAF', description:'Saisir le mnémonique YBALAF, puis cliquer sur OK.', image:ybalaf01 },
    { n:'2', title:'Sélectionner la période', description:'Dans « Balance âgée fournisseurs », renseigner la période à analyser, puis cliquer sur la double flèche en haut de la fenêtre.', image:ybalaf02 },
    { n:'3', title:'Ouvrir le paramétrage du traitement', description:'Cliquer sur GTPARTRT — Paramétrage du traitement.', image:ybalaf03 },
    { n:'4', title:'Choisir EPVD Excel', description:'Dans « Mise en forme », sélectionner EPVD Excel. Le résultat est produit au format XLSX.', image:ybalaf04 },
    { n:'5', title:'Exécuter le travail', description:'Cliquer sur ▶ Exécuter le travail ou appuyer sur F9.', image:ybalaf05 },
    { n:'6', title:'Récupérer le fichier', description:'Ouvrir CJOBU — Consultation des travaux de l’utilisateur — puis télécharger le fichier XLSX généré.' },
    { n:'7', title:'Importer dans Vigie', description:'Dans Fournisseurs, cliquer sur « Importer », choisir l’établissement concerné, sélectionner le fichier XLSX créé puis cliquer sur « Importer ».' },
  ],
};
