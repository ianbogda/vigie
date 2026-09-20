import ygpie101 from '../../assets/help/ygpie1/01-mnemonique.png';
import ygpie102 from '../../assets/help/ygpie1/02-transaction-export.png';
import ygpie103 from '../../assets/help/ygpie1/03-exporter.png';
import type { OpaleSourceHelp } from '../types';

export const YGPIE1_HELP: OpaleSourceHelp = {
  id: 'YGPIE1',
  label: 'Pièces non soldées',
  format: 'CSV',
  variant: 'Export des lignes de données',
  tutorialAvailable: true,
  beforeImport:
    'Sélectionner dans Vigie l’ETS concerné. Vigie contrôle l’ETS porté par YGPIE1 et refuse l’import s’il ne correspond pas au contexte choisi.',
  steps: [
    {
      n: '1',
      title: 'Ouvrir YGPIE1',
      description: 'Saisir le mnémonique YGPIE1, puis cliquer sur OK.',
      image: ygpie101
    },
    {
      n: '2',
      title: 'Exporter les lignes de données',
      description: 'Dans le bandeau bleu, cliquer sur Transaction, puis sur « Exporter les lignes de données ».',
      image: ygpie102
    },
    {
      n: '3',
      title: 'Lancer l’export CSV',
      description: 'Conserver la destination CSV et cliquer sur « Exporter ».',
      image: ygpie103
    },
    {
      n: '4',
      title: 'Importer dans Vigie',
      description:
        'Dans Vigie, choisir l’établissement concerné, cliquer sur « Importer », sélectionner le CSV YGPIE1 puis lancer l’import.'
    }
  ]
};
