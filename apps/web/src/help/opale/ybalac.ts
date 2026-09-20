import ybalac01 from '../../assets/help/ybalac/01-mnemonique.png';
import ybalac02 from '../../assets/help/ybalac/02-periode.png';
import ybalac03 from '../../assets/help/ybalac/03-gtpartrt.png';
import ybalac04 from '../../assets/help/ybalac/04-epvd-excel.png';
import ybalac05 from '../../assets/help/ybalac/05-executer.png';
import type { OpaleSourceHelp } from '../types';

export const YBALAC_HELP: OpaleSourceHelp = {
  id: 'YBALAC',
  label: 'Balance âgée clients',
  format: 'XLSX',
  variant: 'EPVD Excel',
  tutorialAvailable: true,
  beforeImport:
    'Conserver le fichier XLSX produit par OP@LE sans modifier sa structure. Vigie identifie automatiquement le type de balance à l’import.',
  steps: [
    {
      n: '1',
      title: 'Ouvrir YBALAC',
      description: 'Saisir le mnémonique YBALAC, puis cliquer sur OK.',
      image: ybalac01
    },
    {
      n: '2',
      title: 'Sélectionner la période',
      description:
        'Dans « Balance âgée clients », renseigner la période à analyser, puis cliquer sur la double flèche en haut de la fenêtre.',
      image: ybalac02
    },
    {
      n: '3',
      title: 'Ouvrir le paramétrage du traitement',
      description: 'Cliquer sur GTPARTRT — Paramétrage du traitement.',
      image: ybalac03
    },
    {
      n: '4',
      title: 'Choisir EPVD Excel',
      description: 'Dans « Mise en forme », sélectionner EPVD Excel. Le résultat est produit au format XLSX.',
      image: ybalac04
    },
    {
      n: '5',
      title: 'Exécuter le travail',
      description: 'Cliquer sur ▶ Exécuter le travail ou appuyer sur F9.',
      image: ybalac05
    },
    {
      n: '6',
      title: 'Récupérer le fichier',
      description: 'Ouvrir CJOBU — Consultation des travaux de l’utilisateur — puis télécharger le fichier XLSX généré.'
    },
    {
      n: '7',
      title: 'Importer dans Vigie',
      description:
        'Dans Clients, cliquer sur « Importer », choisir l’établissement concerné, sélectionner le fichier XLSX créé puis cliquer sur « Importer ».'
    }
  ]
};
