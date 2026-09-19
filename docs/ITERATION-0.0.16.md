# Vigie 0.0.16 — fournisseur de signaux EPLE Tools

Vigie expose ses signaux déterministes au contrat `eple-tools/v1`.

Routes :
- `GET /api/eple-tools/v1/health`
- `GET /api/eple-tools/v1/signals?uai=0280036M`

Authentification : `Authorization: Bearer <EPLE_TOOLS_API_KEY>`.
Les signaux possèdent un identifiant stable, UAI, domaine, processCode, type, gravité, date d'observation, preuve et règle.
