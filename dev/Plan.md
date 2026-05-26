# Plan d'implémentation — Le Clos Bon Accueil

**Dernière mise à jour** : 2026-05-26
**État** : P1 ✅ P2 ✅ P3 ✅ P4 ✅ — prochaines : P5–P12

---

## Avancement

| Phase | Statut | Date |
|---|---|---|
| P1 — Scaffold monorepo | ✅ Terminé | 2026-05-20 |
| P2 — @clos/shared-types | ✅ Terminé | 2026-05-20 |
| P3 — Backend repository & erreurs typées | ✅ Terminé | 2026-05-21 |
| P4 — Backend : 29 handlers Lambda API | ✅ Terminé | 2026-05-26 |
| P5 — Backend : 3 Lambdas hors API GW | ⏳ À faire | — |
| P6 — Infrastructure CDK (5 stacks) | ⏳ À faire | — |
| P7 — Script de seed | ⏳ À faire | — |
| P8 — Frontend : Vite + Auth | ⏳ À faire | — |
| P9 — Frontend : HTTP client + hooks React Query | ⏳ À faire | — |
| P10 — Frontend : migration écrans prototype | ⏳ À faire | — |
| P11 — Tests E2E Playwright | ⏳ À faire | — |
| P12 — CI/CD GitHub Actions | ⏳ À faire | — |

---

## Dépendances techniques entre phases

| Phase | Dépend de | Raison |
|---|---|---|
| P4 | P3 ✅ | Utilise `http.ts`, `deps.ts`, `repository.ts` |
| P5 | P3 ✅ | Mêmes dépendances que P4 |
| P6 | P4 + P5 | Référence les handlers Lambda dans les `NodejsFunction` CDK |
| P7 | P2 ✅ + P3 ✅ | Utilise `todayIsoInAppTz()` et l'interface `Repository` |
| P8 | P1 ✅ + P2 ✅ | Utilise uniquement `@clos/shared-types` — **indépendant du backend** |
| P9 | P8 | Nécessite l'`AuthProvider` et le client fetch de P8 |
| P10 | P9 | Branche les écrans sur les hooks React Query de P9 |
| P11 | P10 + backend | Tests E2E bout-en-bout (frontend + backend) |
| P12 | Tout | Workflows CI/CD couvrent tous les workspaces |

---

## Groupes parallélisables

```
[Dès maintenant — 3 streams indépendants]

  P4 (25 handlers API) ──┐
  P5 (3 Lambdas) ────────┤──► P6 (CDK) ─────────────────────────────► P12
  P7 (seed) ─────────────┘

  P8 (frontend bootstrap) ──► P9 (hooks RQ) ──► P10 (écrans) ──► P11 (E2E) ──► P12
```

### Groupe 1 — Démarrables immédiatement (zéro overlap de fichiers)

| Stream | Phases | Fichiers touchés |
|---|---|---|
| Backend handlers | P4 + P5 | `backend/src/handlers/`, `backend/src/api/schemas/` |
| Frontend | P8 | `frontend/src/`, `frontend/vite.config.ts` |
| Seed | P7 | `backend/scripts/seed.ts` |

> **Meilleure paire pour agents parallèles** : **P4 + P8** — backend handlers vs frontend bootstrap, aucun fichier partagé.

### Groupe 2 — Après groupe 1

| Stream | Phase | Débloqué par |
|---|---|---|
| Infrastructure | P6 | P4 + P5 terminés |
| Frontend hooks | P9 | P8 terminé |

### Groupe 3 — Chaîne séquentielle finale

```
P10 → P11 → P12
```

---

## Contrainte PROMPT-ORCHESTRATEUR

Le fichier `PROMPT-ORCHESTRATEUR.md` impose **une phase à la fois avec validation manuelle** entre chaque phase. L'analyse ci-dessus identifie les phases parallélisables d'un point de vue technique, utile si l'on choisit d'exécuter plusieurs agents en parallèle (`Agent tool` avec `isolation: worktree`).

Si le mode séquentiel est conservé, l'ordre recommandé pour minimiser le temps total est :

```
P3 ✅ → P4 → P5 → P7 → P8 → P6 → P9 → P10 → P11 → P12
         (pendant P4 : P8 peut commencer sur une branche parallèle)
```
