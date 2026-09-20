# PCIF Académie — TODO intégration Vigie

Objectif : PCIF Académie reste propriétaire des données de contrôle interne. Vigie ne consomme qu'une synthèse contextualisée, identifiée par UAI.

## API à exposer

- [ ] Créer une authentification applicative serveur-à-serveur et le scope `vigie:summary:read`.
- [ ] Stocker les clés sous forme hachée, avec libellé client, date de création/révocation et journal d'usage.
- [ ] Exposer `POST /api/integrations/vigie/summaries` avec un corps `{ "uais": ["0280036M"] }`.
- [ ] Limiter la réponse aux UAI autorisés pour la clé cliente.
- [ ] Ne jamais exposer les 267 réponses brutes par cette API.
- [ ] Ajouter ensuite, si utile, des endpoints ciblés `processes`, `risks` et `actions`.

## Contrat minimal de réponse

```json
{
  "summaries": [
    {
      "uai": "0280036M",
      "campaign": { "id": "...", "label": "2026-2027", "status": "ACTIVE" },
      "mastery": { "level": 2.4, "trend": "IMPROVING" },
      "risks": { "major": 3 },
      "actions": { "open": 6, "overdue": 2 },
      "sourceUrl": "https://pcif.eple-tools.fr/..."
    }
  ]
}
```

## Référentiel commun à préparer

- [ ] Définir des `processCode` stables communs à PCIF Académie et Vigie : `DEPENSE_ENGAGEMENT`, `DEPENSE_SERVICE_FAIT`, `DEPENSE_FACTURE`, `RECETTE`, `RECOUVREMENT`, `TRESORERIE`, `BUDGET`, `SRH`, etc.
- [ ] Rattacher les risques/actions PCIF à ces codes sans casser le référentiel PCIF existant.
- [ ] Prévoir un lien profond vers établissement + campagne + processus.

## Sécurité / exploitation

- [ ] HTTPS uniquement ; clé dans l'en-tête `Authorization: Bearer ...`.
- [ ] Rate limiting et journal d'audit des appels.
- [ ] Réponse batch pour éviter un appel par EPLE.
- [ ] Ajouter un test de contrat API automatisé.
- [ ] Documenter la rotation/révocation d'une clé Vigie.

## Principe métier

Vigie doit présenter le PCIF comme **contexte de maîtrise du processus**, jamais comme preuve automatique qu'un signal financier est causé par une faiblesse PCIF.
