# Vigie v0.0.39 — Aide contextuelle métier

- Ajout d’un bouton **Aide** sur chaque vue métier.
- Panneau latéral commun : objectif de la vue, fichiers attendus, formats et emplacement du pas-à-pas OP@LE.
- Les procédures non encore validées sont explicitement marquées **à documenter** : aucun parcours OP@LE n’est inventé.
- Vue **Clients** entièrement alimentée avec le tutoriel réel **YBALAC** : mnémonique, période, accès GTPARTRT, choix **EPVD Excel**, exécution F9/Play, récupération via **CJOBU**, puis import dans Vigie.
- Intégration des cinq captures OP@LE fournies dans le tutoriel.
- Référentiel d’aide centralisé dans `ContextualHelp.tsx`, prêt à recevoir YBALAF, YCONSDEP, YCONSREC, EBLC, 5151, etc.
