# Vigie — v0.0.6

Module EPLE Tools de détection rapide des difficultés budgétaires et comptables.

## Cette itération

Premier flux Op@le réel : **balance → contrôle → snapshot daté → analyse → alertes de comptabilité générale**.

- import XLSX/XLS/CSV ;
- reconnaissance tolérante des colonnes compte/libellé/solde ou débit/crédit ;
- rejet explicite d'un fichier non reconnu ;
- stockage PostgreSQL du snapshot et de chaque ligne ;
- conservation de l'historique des imports ;
- règles initiales : 471/472, 585, sens inhabituels 401/404 et 411/416 ;
- restitution immédiate des alertes après import ;
- historique des snapshots dans l'interface.

Les règles sont volontairement prudentes : elles signalent un point à examiner et ne constituent pas à elles seules un diagnostic comptable.

Production cible : `https://vigie.eple-tools.fr`.

## Sécurisation des imports — v0.0.6

- SheetJS (`xlsx`) supprimé ;
- `.xlsx` lu avec ExcelJS et `.csv` avec `csv-parse` ;
- `.xls` refusé explicitement ;
- limite de 15 Mo par fichier, 100 000 lignes et 20 feuilles ;
- correction de la réponse HTTP 404 sur les snapshots absents.
