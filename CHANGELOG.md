# CHANGELOG — Le Clos Bon Accueil

---

## ✅ Phase P1 — Scaffold du monorepo npm workspaces

**Date** : 2026-05-20

### Fichiers créés

| Fichier / Dossier | Description |
|---|---|
| `package.json` | Racine workspaces (shared-types, backend, frontend, infra) |
| `tsconfig.base.json` | Config TypeScript partagée (strict, ES2020, commonjs) |
| `.eslintrc.json` | ESLint v8 + @typescript-eslint + prettier |
| `.prettierrc.json` | 2 espaces, trailingComma es5, semi, printWidth 100 |
| `.gitignore` | node_modules, dist, cdk.out, .env, coverage, cdk.context.json |
| `specs/` | Copie des specs de référence (01-data-model, 02-api-contract, 03-infrastructure, README) |
| `shared-types/package.json` | Workspace @clos/shared-types |
| `shared-types/tsconfig.json` | Extends tsconfig.base.json, rootDir=src |
| `shared-types/src/index.ts` | Stub placeholder (sera remplacé en P2) |
| `backend/package.json` | Workspace @clos/backend, dépend de @clos/shared-types |
| `backend/tsconfig.json` | Extends tsconfig.base.json, include src + scripts |
| `backend/src/index.ts` | Stub placeholder (sera remplacé en P3) |
| `frontend/package.json` | Workspace @clos/frontend, dépend de @clos/shared-types |
| `frontend/tsconfig.json` | Extends tsconfig.base.json, jsx=react-jsx, module=ESNext |
| `frontend/src/index.ts` | Stub placeholder (sera remplacé en P8) |
| `infra/package.json` | Workspace @clos/infra, CDK v2.147.3 |
| `infra/tsconfig.json` | Extends tsconfig.base.json, include lib + bin |
| `infra/lib/index.ts` | Stub placeholder (sera remplacé en P6) |
| `infra/bin/app.ts` | Stub placeholder CDK entry-point (sera remplacé en P6) |

### Commandes exécutées et résultats

```
$ npm install
✅ 218 packages installés (2m)

$ npm run typecheck --workspaces
✅ @clos/shared-types : 0 errors
✅ @clos/backend : 0 errors
✅ @clos/frontend : 0 errors
✅ @clos/infra : 0 errors
```

### Décisions / Obstacles

- `dev/` (non-tracké git) contient les orchestration files. Les 4 specs ont été copiés dans `specs/` pour correspondre aux références du PROMPT-ORCHESTRATEUR (`specs/01-data-model.md § X.X`).
- `build/` (anciens fichiers trackés, déjà supprimés du disque) : supprimés de l'index git via `git rm -r --cached build/`.
- Stubs `export {};` créés dans chaque workspace pour satisfaire TypeScript (`TS18003 : No inputs found`). Ils seront remplacés phase par phase.

---
