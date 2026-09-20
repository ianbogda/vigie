import yfdr01 from '../../assets/help/yfdr/01-export.png';
import type { OpaleSourceHelp } from '../types';

export const YFDR_HELP: OpaleSourceHelp = {
  id: 'YFDR',
  label: 'Fonds de roulement',
  format: 'CSV',
  tutorialAvailable: true,
  beforeImport:
    'Conserver le CSV produit par OP@LE sans le modifier. Dans Vigie, choisir l’ETS concerné avant l’import ; cet ETS constitue le contexte de rattachement du fichier.',
  steps: [
    { n: '1', title: 'Ouvrir YFDR', description: 'Saisir le mnémonique YFDR, puis valider.', image: yfdr01 },
    {
      n: '2',
      title: 'Exporter les lignes',
      description:
        'Dans « Saisie du fonds de roulement », cliquer sur le symbole « page avec une flèche » à droite du tableau — Exporter les lignes de données.',
      image: yfdr01
    },
    {
      n: '3',
      title: 'Importer dans Vigie',
      description:
        'Dans Vigie, cliquer sur « Importer », choisir l’ETS concerné, sélectionner le fichier CSV téléchargé puis lancer l’import.'
    }
  ]
};
