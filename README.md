# Vigie — v0.0.7

Cockpit financier et comptable de la suite EPLE Tools.

## Cette itération

- import **natif recommandé** des balances Op@le `.lis` ;
- compatibilité `.xlsx` et `.csv` ;
- lecture tolérante du format `.lis` observé (Windows-1252 et intitulés contenant des guillemets non échappés) ;
- identification de `entity` et `entityLabel` ;
- conservation des 8 valeurs Op@le : cumuls antérieurs débit/crédit, période débit/crédit, soldes débit/crédit ;
- snapshot PostgreSQL daté ;
- premières alertes de comptabilité générale ;
- correction du typage ExcelJS de la v0.0.6 ;
- migrations SQL idempotentes ;
- domaine : `https://vigie.eple-tools.fr`.

Le `.lis` fourni pour validation n'est pas supposé être un JSON strict : Vigie utilise un parseur ciblé sur la structure de balance Op@le afin de tolérer les guillemets présents dans certains intitulés de comptes.
