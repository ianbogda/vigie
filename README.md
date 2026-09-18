# Vigie — v0.0.10

Vigie est le cockpit de détection budgétaire, financière et comptable d'EPLE Tools.

## Cette itération

- import natif de la balance générale Op@le `.lis` (EBLC) ;
- import Budget Op@le `.lis` ;
- import CLCA achats `.csv` ;
- **nouvel import FDR `.csv`**, avec historique et distinction définitif/provisoire ;
- **premier moteur d'analyse croisée** `/api/analysis` ;
- nouvelle vue **Analyse** alimentée par les snapshots réels ;
- règles initiales : mobilisation budgétaire, disponible négatif, commandes anciennes restant à facturer, réceptions restant à rapprocher, anomalies de balance, évolution du FDR ;
- fraîcheur et disponibilité de chaque source affichées explicitement.

Le moteur est déterministe et traçable. Un signal n'est pas un diagnostic et une donnée absente n'est jamais assimilée à zéro. Les comparaisons FDR signalent le caractère provisoire/définitif.

CLCV ventes reste en attente d'un export non vide pour valider son mapping réel.
