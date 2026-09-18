# Vigie — v0.0.8

Cockpit budgétaire et comptable EPLE Tools.

## Cette itération

- corrige et diagnostique le routage `/api/*` derrière Caddy ;
- teste `/api/snapshots` localement puis via HTTPS pendant l'installation ;
- affiche désormais le statut HTTP et la route lorsqu'un import échoue ;
- conserve l'import natif de balance Op@le `.lis` ;
- distingue une **balance générale `.lis`** des autres exports Op@le utilisant également l'extension `.lis` ;
- refuse explicitement un `.lis` budgétaire/édition au lieu de tenter de l'interpréter comme une balance ;
- conserve `.xlsx` et `.csv` comme formats secondaires ;
- snapshots PostgreSQL et premières alertes de comptabilité générale.

Le format `.lis` de référence d'une balance doit contenir `entitiesTrialBalance` et `accountsTrialBalance`.
