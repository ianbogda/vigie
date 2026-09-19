# Vigie v0.0.38 — Indicateurs N-4 à N

- fenêtre dynamique N-4 → N (5 exercices) dans le tableau et les courbes ;
- suppression de la colonne redondante « Situation courante » ;
- l'exercice N porte la situation courante et reste visuellement atténué ;
- résultat, FDR, BFR et trésorerie sont lus depuis `indicatorHistory`, calculé par exercice à partir des EBLC/YFDR ;
- une année sans source reste affichée à `—` ;
- les KPI courants BFR et trésorerie utilisent la même série consolidée que le tableau et les courbes.
