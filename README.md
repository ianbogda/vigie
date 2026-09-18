# Vigie — v0.0.9

Cockpit financier et comptable d'EPLE Tools.

## Sources Op@le natives

- **Balance générale `.lis`** : snapshot comptable, soldes et premières alertes de comptabilité générale.
- **Budget `.lis`** : snapshot budgétaire avec Budget / Engagé / Réalisé comptable / En cours / Disponible et conservation des dimensions Op@le.
- **CLCA achats `.csv`** : commandes, fournisseurs, réceptions, facturation, comptes et CGR ; les lignes sources sont conservées en JSON pour audit.
- **CLCV ventes `.csv`** : prévu, mais non activé tant qu'un export contenant des données n'a pas permis de valider le mapping réel.

L'import `/api/import/opale` détecte automatiquement le type de fichier. Les snapshots ne sont jamais écrasés.

## Déploiement

Voir `INSTALL.md`. L'installateur Debian 13 build, applique les migrations PostgreSQL, redémarre explicitement Vigie et vérifie que `/health` annonce exactement `0.0.9` avant de valider l'installation.
