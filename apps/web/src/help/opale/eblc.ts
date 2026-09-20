import eblc01 from '../../assets/help/eblc/01-mnemonique.png';
import eblc03 from '../../assets/help/eblc/03-gtpartrt.png';
import eblc04 from '../../assets/help/eblc/04-eblc-excel.png';
import eblc05 from '../../assets/help/eblc/05-executer.png';
import eblc06 from '../../assets/help/eblc/06-cjobu.png';
import type { OpaleSourceHelp } from '../types';

export const EBLC_HELP: OpaleSourceHelp = {
  id: 'EBLC',
  label: 'Balance comptable',
  format: 'XLSX',
  variant: 'EBLC Excel',
  tutorialAvailable: true,
  beforeImport:
    'Conserver le fichier XLSX produit par OP@LE sans modifier sa structure. Dans Vigie, choisir l’ETS concerné : il sert de contexte de rattachement lorsque le fichier ne porte pas d’identifiant établissement exploitable.',
  steps: [
    { n: '1', title: 'Ouvrir EBLC', description: 'Saisir le mnémonique EBLC, puis cliquer sur OK.', image: eblc01 },
    {
      n: '2',
      title: 'Sélectionner la période',
      description:
        'Dans « Édition de la balance comptable », renseigner la période à exporter, puis cliquer sur la double flèche « Opérations liées ».'
    },
    {
      n: '3',
      title: 'Ouvrir le paramétrage du traitement',
      description: 'Cliquer sur GTPARTRT — Paramétrage du traitement.',
      image: eblc03
    },
    {
      n: '4',
      title: 'Choisir EBLC Excel',
      description: 'Dans « Mise en forme », sélectionner EBLC Excel.',
      image: eblc04
    },
    { n: '5', title: 'Exécuter le travail', description: 'Cliquer sur ▶ Exécuter le travail.', image: eblc05 },
    {
      n: '6',
      title: 'Récupérer le fichier',
      description:
        'Cliquer sur la clochette puis « Consulter tous mes travaux », ou saisir directement le mnémonique CJOBU, puis télécharger le fichier XLSX généré.',
      image: eblc06
    },
    {
      n: '7',
      title: 'Importer dans Vigie',
      description:
        'Dans Vigie, cliquer sur « Importer », choisir l’ETS concerné, sélectionner le fichier EBLC puis lancer l’import.'
    }
  ]
};
