# 03 — Infrastructure & déploiement

> **Source of Truth.** Ce fichier définit l'intégralité de l'infrastructure
> AWS, son organisation CDK, le pipeline CI/CD, les paramètres
> opérationnels et le plan de bring-up. Aucune ressource AWS n'est créée
> hors CDK (à l'exception du domaine et de la hosted zone Route 53, qui
> sont des prérequis manuels — cf. § 3.11).

---

## 3.1 — Organisation du repository

Le repository est un **monorepo TypeScript** organisé avec **npm workspaces** :

```
clos-bon-accueil/
├── shared-types/          # types partagés frontend/backend
│   ├── src/
│   │   ├── domain.ts      # cf. 01 § 1.1
│   │   ├── dto.ts         # cf. 01 § 1.11
│   │   ├── dates.ts       # cf. 01 § 1.8
│   │   └── events.ts      # cf. 02 § 2.6.2
│   └── package.json       # nom: "@clos/shared-types"
├── frontend/              # React SPA (Vite)
│   ├── src/
│   │   ├── api/           # client.ts, hooks.ts
│   │   ├── auth/          # LoginScreen, AuthProvider
│   │   ├── screens/       # écrans migrés du proto
│   │   ├── ui/            # primitives partagées
│   │   └── App.tsx
│   ├── public/
│   ├── package.json       # consomme @clos/shared-types
│   └── vite.config.ts
├── backend/               # Lambdas
│   ├── src/
│   │   ├── data/          # repository.ts
│   │   ├── api/           # http.ts, deps.ts, logger.ts, schemas/
│   │   ├── handlers/      # une Lambda = un fichier
│   │   └── shared/        # identifiers.ts, etc.
│   ├── scripts/
│   │   └── seed.ts
│   └── package.json       # consomme @clos/shared-types
├── infra/                 # AWS CDK
│   ├── bin/
│   │   └── app.ts         # entry-point CDK
│   ├── lib/
│   │   ├── config.ts
│   │   ├── data-stack.ts
│   │   ├── auth-stack.ts
│   │   ├── api-stack.ts
│   │   ├── frontend-stack.ts
│   │   ├── notifications-stack.ts
│   │   └── ses-templates/
│   ├── cdk.json
│   └── package.json
├── specs/                 # spécifications SDD (ce dossier)
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-dev.yml
│   └── deploy-prod.yml
└── package.json           # workspaces racine
```

**Règles impératives** :
- Toutes les dépendances de prod sont pinnées (versions exactes, jamais
  de `^` ou `~`).
- `package-lock.json` est commit.
- Le package `@clos/shared-types` est référencé en workspace local
  (`"@clos/shared-types": "*"` dans les `package.json` consommateurs).

---

## 3.2 — Stacks CDK

L'application CDK (`infra/bin/app.ts`) déploie **5 stacks distincts par
stage**. Chaque stack a un nom préfixé : `ClosBonAccueil-{StackName}-{Stage}`.

### 3.2.1 — Découplage strict entre stacks (anti-cycle)

**Règle absolue** : **les stacks NE partagent PAS de valeurs via des
exports CloudFormation natifs** (`crossStackReferences`). Cela évite les
dépendances figées qui bloquent les redéploiements et les teardowns
partiels.

Chaque stack écrit ses outputs dans **SSM Parameter Store** sous le
préfixe `/clos/{stage}/{stackName}/{key}`. Les stacks consommatrices
lisent ces paramètres via `StringParameter.valueFromLookup(scope, name)`
(résolution au synth) ou `StringParameter.valueForStringParameter(scope,
name)` (résolution au déploiement).

| Paramètre SSM | Émetteur | Consommateurs |
|---|---|---|
| `/clos/{stage}/data/table-name` | DataStack | ApiStack, NotificationsStack |
| `/clos/{stage}/data/table-arn` | DataStack | ApiStack |
| `/clos/{stage}/data/photo-bucket-name` | DataStack | ApiStack |
| `/clos/{stage}/data/photo-cdn-domain` | DataStack | FrontendStack (config.json) |
| `/clos/{stage}/auth/user-pool-id` | AuthStack | ApiStack, FrontendStack |
| `/clos/{stage}/auth/user-pool-arn` | AuthStack | ApiStack |
| `/clos/{stage}/auth/web-client-id` | AuthStack | FrontendStack |
| `/clos/{stage}/notifications/topic-arn` | NotificationsStack | ApiStack |
| `/clos/{stage}/api/url` | ApiStack | FrontendStack (config.json) |
| `/clos/{stage}/admin-email` | (création manuelle § 3.11) | NotificationsStack |

### 3.2.2 — `DataStack`

Ressources :
- Table DynamoDB `clos-bon-accueil-{stage}` (cf. `01-data-model § 1.2`).
  - Billing : `PAY_PER_REQUEST`.
  - Encryption : `AWS_MANAGED`.
  - PITR : activé en prod, désactivé en dev (cf. § 3.3).
  - 3 GSI : `gsi1`, `gsi2`, `gsi3` (projection `ALL`).
  - TTL : attribut `ttl` (pour les `IdempotencyRecord`).
  - `removalPolicy: RETAIN` en prod, `DESTROY` en dev.
- Bucket S3 `clos-photos-{stage}-{accountId}`.
  - Versioning activé.
  - Block public access total (accès via CloudFront uniquement, OAC).
  - CORS pour PUT depuis l'origin frontend (cf. § 3.3 `allowedOrigins`).
  - Lifecycle : transition vers S3 Standard-IA après 90 jours.
  - SSE-S3 (AES-256).
- Distribution CloudFront pour les photos :
  - Origin = bucket S3 via OAC (Origin Access Control), pas OAI.
  - Alias domaine : `cdn.{stage}.clos-bon-accueil.fr` ou
    `cdn.clos-bon-accueil.fr` en prod.
  - Certificat ACM `us-east-1` (cf. § 3.5).
  - HTTPS uniquement, TLSv1.2_2021.

Écrit dans SSM les params listés § 3.2.1.

### 3.2.3 — `AuthStack`

Ressources :
- Cognito User Pool `clos-bon-accueil-{stage}` :
  - `selfSignUpEnabled: false`.
  - `signInAliases: { email: true }`.
  - `autoVerify: { email: true }`.
  - MFA : `OFF` (peut être activé post-MVP).
  - Password policy : 10 caractères min, 1 majuscule, 1 chiffre, 1 symbole.
  - Account recovery : `EMAIL_ONLY`.
  - Custom attributes : aucun (le rôle est dans les groupes).
  - `removalPolicy: RETAIN` en prod, `DESTROY` en dev.
- Deux groupes : `admin` (precedence 1) et `guest` (precedence 10).
- App Client `web-client` (public, pas de secret) :
  - Auth flows : `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`.
  - **Pas de Hosted UI activée**. Pas d'OAuth callback URL configurée.
  - Token validity : access 1h, id 1h, refresh 30 jours.
- Lambda trigger `post-confirmation` (cf. `02-api-contract § 2.3` —
  fonction `auth-post-confirmation.ts`) :
  - Variables d'env : `TABLE_NAME`, `STAGE`, `LOG_LEVEL`.
  - Permissions IAM : `dynamodb:PutItem` sur la table seulement, ressource
    précise via `Fn.GetAtt`.

Écrit dans SSM les params listés § 3.2.1.

### 3.2.4 — `NotificationsStack`

Ressources :
- Topic SNS `clos-notifications-{stage}`.
- Lambda `notification-dispatcher` :
  - Memory 512 MB, timeout 30 s.
  - Subscribed au topic.
  - Variables d'env : `TABLE_NAME`, `STAGE`, `LOG_LEVEL`,
    `SES_FROM_ADDRESS`, `ADMIN_EMAIL_PARAM_NAME`.
  - Permissions IAM : `ses:SendTemplatedEmail`, `dynamodb:GetItem` sur
    la table (pour récupérer user/room), `ssm:GetParameter` sur
    `/clos/{stage}/admin-email`.
- Topic SNS `clos-alarms-{stage}` (séparé) abonné à l'email admin (SSM)
  pour les alarmes CloudWatch (cf. § 3.6.3).
- Identité SES vérifiée pour le domaine `notifications.clos-bon-accueil.fr`
  (création DKIM + DMARC).
- Templates SES dans `infra/lib/ses-templates/` :
  - `booking-created.json`
  - `booking-updated.json`
  - `booking-cancelled.json`
  - `admin-conflict-alert.json`
- Lambda `reconciliation-job` (cf. `01-data-model § 1.4.1`) :
  - Memory 512 MB, timeout 60 s.
  - Triggered par EventBridge rule `rate(1 day)` avec cron `0 1 * * ? *`
    (01:00 UTC ≈ 03:00 Paris en hiver, 02:00 Paris en été — acceptable).
  - Variables d'env : `TABLE_NAME`, `STAGE`, `SNS_TOPIC_ARN`, `LOG_LEVEL`.
  - Permissions : `dynamodb:Query` sur GSI2, `sns:Publish`.

### 3.2.5 — `ApiStack`

Ressources :
- API Gateway **REST** (pas HTTP API : on a besoin du support des
  authorizers Cognito natifs et des request validators).
  - Stage `v1`, déployé sur `api.{stage}.clos-bon-accueil.fr`.
  - Custom domain via certificat ACM régional (eu-west-3).
- Authorizer Cognito User Pools référençant
  `/clos/{stage}/auth/user-pool-arn` (via SSM).
- Une route = une `LambdaIntegration` (cf. `02-api-contract § 2.5`).
- Toutes les Lambdas :
  - Runtime : `nodejs20.x`.
  - Architecture : `arm64` (Graviton).
  - Bundling via `esbuild` (intégré CDK avec
    `NodejsFunction`).
  - Tree-shaking + minification activés.
  - Variables d'env communes : `TABLE_NAME`, `STAGE`, `LOG_LEVEL`,
    `SNS_TOPIC_ARN`, `PHOTO_BUCKET`, `PHOTO_CDN_DOMAIN`, `USER_POOL_ID`.
  - **Permissions IAM strictement minimales** (cf. § 3.7.1) — JAMAIS
    `dynamodb:*`. Chaque Lambda déclare la liste exacte des actions et
    ressources nécessaires.
- Throttling : burst 100, rate 50 req/s par stage.
- WAF v2 attaché à l'API Gateway avec :
  - `AWSManagedRulesCommonRuleSet`
  - `AWSManagedRulesKnownBadInputsRuleSet`
  - Rate-based rule : 2000 req / 5 min par IP.
- Access logs CloudWatch (rétention selon § 3.3).
- X-Ray tracing : activé selon § 3.3.
- CORS configuré sur l'API Gateway selon `02-api-contract § 2.1.6`.

### 3.2.6 — `FrontendStack`

Ressources :
- Bucket S3 `clos-web-{stage}-{accountId}`.
  - Block public access total (OAC).
  - SSE-S3.
- Distribution CloudFront :
  - Origin S3 via OAC.
  - Compression activée.
  - Viewer protocol policy : `redirect-to-https`.
  - Error pages 403 et 404 → `/index.html` (SPA fallback).
  - Alias domaine : `{stage}.clos-bon-accueil.fr` (dev) ou
    `www.clos-bon-accueil.fr` (prod) **+** apex `clos-bon-accueil.fr`
    redirigé en prod.
  - Certificat ACM `us-east-1`.
  - HTTPS uniquement, TLSv1.2_2021.
- `BucketDeployment` :
  - Source : `frontend/dist` (build Vite).
  - Génère `config.json` au moment du déploiement (cf. § 3.4.1) en
    récupérant les valeurs SSM.
  - Invalidation CloudFront `/*` après déploiement.

---

## 3.3 — Configuration par stage

Deux stages : `dev` et `prod`. Définis-les dans `infra/lib/config.ts` :

```typescript
import { Duration } from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';

export type Stage = 'dev' | 'prod';

export interface StageConfig {
  stage: Stage;
  domain: string;             // frontend domain
  apiDomain: string;
  cdnDomain: string;
  rootDomain: string;
  pointInTimeRecovery: boolean;
  seedMockBookings: boolean;
  xrayEnabled: boolean;
  logRetention: number;       // jours
  allowedOrigins: string[];
  removalPolicy: RemovalPolicy;
}

export const stageConfig: Record<Stage, StageConfig> = {
  dev: {
    stage: 'dev',
    domain: 'dev.clos-bon-accueil.fr',
    apiDomain: 'api.dev.clos-bon-accueil.fr',
    cdnDomain: 'cdn.dev.clos-bon-accueil.fr',
    rootDomain: 'clos-bon-accueil.fr',
    pointInTimeRecovery: false,
    seedMockBookings: true,
    xrayEnabled: false,
    logRetention: 7,
    allowedOrigins: [
      'http://localhost:5173',
      'https://dev.clos-bon-accueil.fr',
    ],
    removalPolicy: RemovalPolicy.DESTROY,
  },
  prod: {
    stage: 'prod',
    domain: 'www.clos-bon-accueil.fr',
    apiDomain: 'api.clos-bon-accueil.fr',
    cdnDomain: 'cdn.clos-bon-accueil.fr',
    rootDomain: 'clos-bon-accueil.fr',
    pointInTimeRecovery: true,
    seedMockBookings: false,
    xrayEnabled: true,
    logRetention: 30,
    allowedOrigins: [
      'https://www.clos-bon-accueil.fr',
    ],
    removalPolicy: RemovalPolicy.RETAIN,
  },
};
```

Sélection du stage : contexte CDK `-c stage=prod` (défaut `dev`).

---

## 3.4 — Frontend : intégration avec le backend

### 3.4.1 — Configuration runtime
Le frontend lit sa configuration depuis `/config.json` servi par le bucket
S3. **Ce fichier est généré au moment du `BucketDeployment` CDK** par un
`Source.data` qui interpole les valeurs SSM résolues au déploiement :

```json
{
  "apiBaseUrl": "https://api.{stage}.clos-bon-accueil.fr/v1",
  "userPoolId": "eu-west-3_XXX",
  "userPoolClientId": "XXXXX",
  "region": "eu-west-3",
  "cdnDomain": "cdn.{stage}.clos-bon-accueil.fr",
  "stage": "dev"
}
```

**Implémentation CDK impérative** : dans `FrontendStack`, après le build
Vite (`new BucketDeployment` qui pousse `frontend/dist`), ajoute un
second `BucketDeployment` avec un `Source.data('config.json',
JSON.stringify(config))` où `config` est construit à partir des
`StringParameter.fromStringParameterName(...)` résolus au synth.

### 3.4.2 — Auth côté frontend
Utilise `@aws-amplify/auth@6` (uniquement le package `auth`, pas Amplify
complet). Configure-le au démarrage avec les valeurs de `config.json`.
Token JWT récupéré via `fetchAuthSession()` et attaché à chaque requête
par le wrapper `client.ts` (cf. `02-api-contract § 2.9.1`).

**Pas de Hosted UI, pas de redirect OAuth.** L'authentification se fait
via le flow `USER_PASSWORD_AUTH` (`Auth.signIn({ username: email, password })`).
Un écran de login custom (cf. § 3.4.5) gère la saisie.

### 3.4.3 — Migration du prototype
Le prototype actuel (`data.jsx`, `app.jsx`, `screens-*.jsx`, etc.) est en
React 18 + Babel standalone (sans build). La migration vers Vite suit
ces étapes impératives :

1. **Bootstrap** : `cd frontend && npm create vite@latest -- --template react-ts`
   puis nettoie le boilerplate.
2. **Workspace** : ajoute `frontend/` au champ `workspaces` du
   `package.json` racine. Ajoute `@clos/shared-types: "*"` aux
   dépendances de `frontend/package.json`.
3. **Styles** : recopie `styles.css` à l'identique dans `frontend/src/`.
4. **Conversion** : convertis tous les `.jsx` en `.tsx` en utilisant les
   types de `@clos/shared-types`.
5. **Suppression de `data.jsx`** : supprime entièrement le store mock.
   Remplace toute référence à `ROOMS`, `BOOKINGS`, `MY_BOOKINGS`,
   `HOUSE_CONFIG` par les hooks React Query définis
   `02-api-contract § 2.9.2`.
6. **Suppression de `tweaks-panel.jsx`** : outil de prototypage, hors-MVP.
7. **Suppression du toggle `adminMode` du Tweaks** : remplacé par la
   lecture du groupe Cognito du user (`useMe().data.role === 'admin'`).
8. **Routeur** : conserve le routeur stack maison (push/pop/reset) tel
   quel au MVP. La migration vers React Router est post-MVP. Le flow
   d'auth utilise `USER_PASSWORD_AUTH` qui ne nécessite aucune URL de
   callback — le routeur stack reste donc parfaitement compatible.
9. **Photos** : remplace `image-slot.js` par un composant React
   `<RoomPhoto>` qui consomme `room.photoUrl`. Pour l'admin : drag-and-drop
   déclenche `useUploadRoomPhoto` qui appelle
   `POST /v1/admin/rooms/{roomId}/photo-upload-url`, fait un `PUT` direct
   S3, puis `PATCH` sur la chambre avec le `photoUrl`.

### 3.4.4 — Catalogue des hooks à créer
Voir `02-api-contract § 2.9.2` pour la liste exhaustive et la convention
des query keys.

### 3.4.5 — Écran de login
Crée `frontend/src/auth/LoginScreen.tsx` :
- Formulaire `email` + `password`.
- Appelle `Auth.signIn({ username: email, password })`.
- Au premier login (mot de passe temporaire Cognito), gère le challenge
  `NEW_PASSWORD_REQUIRED` en demandant un nouveau mot de passe à l'user.
- En cas de succès, déclenche un rechargement de l'app (qui fera un
  `useMe()` et un rendu conditionnel selon `role`).
- Affiche les erreurs Cognito de manière user-friendly (codes
  `NotAuthorizedException`, `UserNotFoundException`, etc.).

Le composant `AuthProvider` wrap toute l'app et expose un context avec
`{ user, isLoading, signOut }`. Tant que `isLoading`, affiche un splash
screen ; si `user === null`, affiche `<LoginScreen />` ; sinon, affiche
le routeur.

### 3.4.6 — Configuration Vite
- `vite.config.ts` :
  - Plugin `@vitejs/plugin-react`.
  - `base: '/'`.
  - `build.target: 'es2020'`.
  - `build.sourcemap: false` en prod, `true` en dev.

---

## 3.5 — DNS et certificats

### 3.5.1 — Prérequis manuels (hors CDK)
Avant tout `cdk deploy`, les étapes suivantes doivent être faites
**manuellement** (cf. § 3.11) :

1. Achat du domaine `clos-bon-accueil.fr` chez un registrar (OVH,
   Gandi…).
2. **Création de la hosted zone Route 53** `clos-bon-accueil.fr` dans
   `eu-west-3` (compte AWS cible).
3. Configuration des serveurs NS du registrar pour pointer vers ceux
   fournis par Route 53.
4. **Attente de propagation DNS** (`dig NS clos-bon-accueil.fr` doit
   retourner les NS Route 53) — peut prendre 24h.

### 3.5.2 — Sous-domaines créés par CDK
Tous les enregistrements ci-dessous sont créés automatiquement par CDK
(`ARecord` + `AaaaRecord` pointant vers les distributions CloudFront ou
le custom domain API Gateway) :

- `www.clos-bon-accueil.fr` → CloudFront frontend prod
- `clos-bon-accueil.fr` (apex) → redirect 301 vers `www.` (via CloudFront
  function)
- `dev.clos-bon-accueil.fr` → CloudFront frontend dev
- `api.clos-bon-accueil.fr` → API Gateway prod
- `api.dev.clos-bon-accueil.fr` → API Gateway dev
- `cdn.clos-bon-accueil.fr` → CloudFront photos prod
- `cdn.dev.clos-bon-accueil.fr` → CloudFront photos dev

### 3.5.3 — Certificats ACM
Crée via **CDK** dans `infra/lib/certs-stack.ts` (sous-stack neutre,
pas listée comme stack majeure car partagée par tous les stages) :

- **Certificat 1** (us-east-1, pour CloudFront) :
  `clos-bon-accueil.fr` + SAN `*.clos-bon-accueil.fr` + `*.dev.clos-bon-accueil.fr`.
- **Certificat 2** (eu-west-3, pour API Gateway) :
  `*.clos-bon-accueil.fr` + `*.dev.clos-bon-accueil.fr`.

Validation : `CertificateValidation.fromDns(hostedZone)`.
**N'utilise PAS** `DnsValidatedCertificate` (déprécié dans CDK v2). Utilise
`new Certificate(...)` avec validation DNS.

### 3.5.4 — Région principale
**`eu-west-3`** (Paris) : latence optimale pour l'audience FR + data
residency UE.

Région secondaire **`us-east-1`** uniquement pour les certificats ACM
attachés à CloudFront (contrainte AWS).

---

## 3.6 — Observabilité

### 3.6.1 — Logs structurés
Toutes les Lambdas loggent en **JSON structuré** via
`@aws-lambda-powertools/logger@2`. Niveau par défaut : `INFO`.
En `dev`, niveau `DEBUG` autorisé par variable d'env `LOG_LEVEL=DEBUG`.

Crée `backend/src/api/logger.ts` exportant une instance unique :
```typescript
import { Logger } from '@aws-lambda-powertools/logger';
export const logger = new Logger({ serviceName: 'clos-bon-accueil' });
```

Tous les handlers importent et utilisent cette instance.

Rétention CloudWatch : selon `stageConfig.logRetention` (7j dev, 30j prod).

### 3.6.2 — Métriques custom
Via `@aws-lambda-powertools/metrics@2`. Namespace :
`ClosBonAccueil/{stage}`. Métriques émises :
- `BookingCreated` (count) — par `bookings-create.ts` et
  `admin-bookings-create.ts`.
- `BookingConflict` (count) — sur 409 dans la création.
- `RoomDeleted` (count) — avec dimension `cancelledBookings`.
- `NotificationDispatched` (count) — par `notification-dispatcher.ts`,
  dimension `eventType`.
- `ReconciliationConflictsDetected` (count) — par `reconciliation-job.ts`.

### 3.6.3 — Alarmes CloudWatch
Crée les alarmes suivantes dans `NotificationsStack`, toutes notifient le
topic `clos-alarms-{stage}` (abonné à l'email admin via SSM) :
- Lambda errors > 5 sur 5 min (par fonction).
- API Gateway 5XX > 1 % sur 10 min.
- DynamoDB UserErrors > 10 sur 5 min.
- DynamoDB SystemErrors > 0.
- `BookingConflict` count > 20 sur 1 jour (anomalie business).
- `ReconciliationConflictsDetected` > 0 sur n'importe quelle exécution.

### 3.6.4 — Tracing
X-Ray activé en `prod` sur toutes les Lambdas + API Gateway (sampling
10 %). Désactivé en `dev` pour limiter le bruit et le coût.

---

## 3.7 — Sécurité

### 3.7.1 — IAM least-privilege
**Règle absolue** : aucune Lambda n'a `*` dans son rôle IAM. Chaque
Lambda a un rôle dédié avec les actions et ressources strictement
nécessaires.

Exemples impératifs :

| Lambda | Actions DynamoDB | Ressource |
|---|---|---|
| `rooms-list.ts` | `dynamodb:Query` | `{tableArn}/index/gsi1` |
| `rooms-get.ts` | `dynamodb:GetItem` | `{tableArn}` |
| `bookings-create.ts` | `dynamodb:Query`, `dynamodb:GetItem`, `dynamodb:TransactWriteItems`, `dynamodb:PutItem` | `{tableArn}`, `{tableArn}/index/gsi1`, `{tableArn}/index/gsi2` |
| `admin-rooms-delete.ts` | `dynamodb:Query`, `dynamodb:TransactWriteItems` | `{tableArn}`, `{tableArn}/index/gsi1` |
| `notification-dispatcher.ts` | `dynamodb:GetItem` | `{tableArn}` |

Permissions SNS, SES, S3, Cognito : idem, action par action, ressource
par ressource.

Le rôle de déploiement CDK est un **rôle CI/CD distinct**
(`ClosBonAccueil-GitHubActions`, cf. § 3.8.4) qui n'est jamais utilisé
par une Lambda.

### 3.7.2 — Secrets et paramètres
- **Aucun secret en clair dans le code ni dans Git**.
- Variables sensibles dans **AWS Systems Manager Parameter Store** sous
  `/clos/{stage}/{key}` :
  - `/clos/{stage}/admin-email` (string) — email du propriétaire.
  - `/clos/{stage}/ses-from-address` (string) — adresse FROM des emails.
- Pas d'API key tiers pour le MVP. Si ajout futur : utiliser AWS Secrets
  Manager (pas Parameter Store SecureString).

### 3.7.3 — Chiffrement
- DynamoDB : SSE AWS managed.
- S3 : SSE-S3 (AES-256).
- CloudWatch Logs : chiffrement KMS managed.
- En transit : HTTPS uniquement, TLS 1.2+ sur CloudFront et API Gateway.

### 3.7.4 — Audit
CloudTrail activé au niveau compte (hors scope CDK, action manuelle de
mise en conformité). Bucket de trail dédié et chiffré KMS.

### 3.7.5 — RGPD
Audience UE, données nominatives (email, nom, notes de séjour).
Obligations spécifiées dans `02-api-contract § 2.4` :
- **Droit à l'effacement** : route `DELETE /v1/me`.
- **Droit à la portabilité** : route `GET /v1/me/export`.
- **Politique de rétention** : les bookings passés sont conservés pour
  l'historique du gîte (anonymisés à la suppression du compte). Les
  logs CloudWatch sont conservés selon la durée du stage. Aucune
  donnée personnelle dans les métriques custom.
- **Information** : une page `/legal` côté frontend liste les données
  collectées et les droits de l'utilisateur (hors scope de Claude Code,
  contenu texte fourni séparément).

---

## 3.8 — Pipeline CI/CD

Pipeline GitHub Actions dans `.github/workflows/`.

### 3.8.1 — `ci.yml` (déclenché sur PR)
Étapes :
1. Checkout, setup Node 20, install deps (`npm ci` à la racine).
2. `npm run lint --workspaces` (eslint + prettier check).
3. `npm run typecheck --workspaces`.
4. `npm run test --workspaces` :
   - Tests unitaires vitest sur `backend` et `frontend`.
   - Tests d'intégration sur `backend` via **LocalStack** (DynamoDB local).
5. `npm run build --workspace=infra` puis `cdk synth -c stage=dev`
   (vérifie que le synth passe).

### 3.8.2 — `deploy-dev.yml` (déclenché sur merge `main`)
1. Toutes les étapes de `ci.yml`.
2. Authentification AWS via OIDC GitHub vers le rôle
   `ClosBonAccueil-GitHubActions`.
3. `cdk deploy --all -c stage=dev --require-approval never`.
4. Build du frontend : `cd frontend && npm run build` avec
   `VITE_STAGE=dev`.
5. Le `BucketDeployment` CDK redéploie automatiquement les assets et le
   `config.json` rafraîchi.
6. **Smoke tests post-deploy** :
   - `GET https://api.dev.clos-bon-accueil.fr/v1/health` → 200.
   - `GET https://dev.clos-bon-accueil.fr/` → 200, contient `<div id="root">`.
   - Test E2E Playwright headless : login `dev-admin@example.com` →
     vérifie présence du dashboard.

### 3.8.3 — `deploy-prod.yml` (déclenché sur tag `v*.*.*`)
Identique à dev mais :
- `-c stage=prod`.
- **Approbation manuelle GitHub Environments** avant `cdk deploy`.
- Smoke tests pointent sur `prod`.
- Création automatique d'une GitHub Release avec changelog généré.

### 3.8.4 — Rôle GitHub OIDC
Crée manuellement (one-shot, document de bring-up § 3.11) ou via une
stack CDK séparée `OidcStack` :
- Trust policy : OIDC GitHub limité au repo `{org}/clos-bon-accueil`,
  branche `main` pour dev, tags `v*` pour prod.
- Permissions : `cloudformation:*` sur stacks préfixées
  `ClosBonAccueil-*`, plus les permissions de création des ressources
  des stacks (DynamoDB, Lambda, S3, CloudFront, ACM, Cognito, IAM
  CreateRole/PassRole bornées aux rôles `ClosBonAccueil-*`, SSM,
  Route 53 zones spécifiques, etc.).

### 3.8.5 — Stratégie de tests d'intégration E2E
Tests Playwright dans `frontend/tests/e2e/` :
1. **Scénario guest** : login → home → liste chambres → tunnel
   réservation 4 étapes → confirmation → vérif présence dans "Mes
   séjours" → annulation.
2. **Scénario admin** : login admin → dashboard → création chambre →
   suppression chambre cascade → vérif KPI mis à jour.
3. **Scénario conflit** : créer un booking → tenter un second booking
   chevauchant → vérif erreur 409 affichée.

Exécutés sur `dev` après chaque déploiement. Critère de succès : 100 %
de passes pour bloquer la promotion vers prod.

---

## 3.9 — Coût estimé

Hypothèses : 100 users actifs, 200 bookings/an, 1000 visites/mois,
12 photos × 500 KB.

| Service | Coût mensuel estimé |
|---|---|
| DynamoDB PAY_PER_REQUEST | < 0,10 € |
| Lambda (toutes routes) | < 0,50 € (largement free tier) |
| API Gateway REST | < 1 € (free tier 1M req/mois sur les 12 premiers mois, puis 3,50 $/M) |
| S3 + CloudFront frontend | < 1 € |
| S3 + CloudFront photos | < 0,50 € |
| Cognito (< 50 MAU) | gratuit |
| Route 53 hosted zone | 0,50 € |
| ACM | gratuit |
| CloudWatch logs | < 1 € |
| SES (< 1000 mails/mois) | 0,10 € |
| WAF v2 | ~5 € (coût fixe) |
| **TOTAL** | **~10 €/mois** |

Configurer AWS Budgets :
- Alerte à 15 €/mois (80 % du budget).
- Hard cap (notification + bloquage des creations) à 50 €/mois via
  Service Quotas si possible.

---

## 3.10 — Roadmap post-MVP (hors scope)

Ces éléments **ne sont pas à implémenter** au MVP mais structurent les
décisions actuelles :
- SMS via SNS pour la veille d'arrivée.
- Galerie multi-photos par chambre (extension de `photoUrl` en `photoUrls: string[]`).
- Système de "favoris" côté guest.
- Statistiques d'occupation (Athena sur les exports DynamoDB).
- Migration vers React Router et code splitting.
- Internationalisation (i18next).
- MFA optionnelle Cognito.

Aucune de ces fonctionnalités ne doit influencer l'implémentation MVP au
point d'imposer un surcoût d'architecture.

---

## 3.11 — Checklist de bring-up (1er déploiement)

Étapes à suivre **dans cet ordre strict** :

### Phase 0 — Prérequis manuels (humain)
1. **Achat du domaine** `clos-bon-accueil.fr` chez un registrar.
2. Création du **compte AWS** (idéalement un sous-compte AWS Organizations).
3. Configuration de la facturation AWS et activation **AWS Budgets**.
4. **Création manuelle de la hosted zone Route 53** dans `eu-west-3`.
5. **Mise à jour des NS** chez le registrar pour pointer vers Route 53.
6. **Attente de propagation DNS** (`dig NS clos-bon-accueil.fr` → NS AWS).
   Peut prendre 24h.
7. **Vérification du domaine SES** `notifications.clos-bon-accueil.fr` :
   création des records DKIM dans Route 53, attente de la validation.
   En `us-east-1` ET `eu-west-3` (SES est régional).
8. **Création manuelle dans SSM Parameter Store** (eu-west-3) :
   - `/clos/dev/admin-email` = email réel du propriétaire.
   - `/clos/prod/admin-email` = email réel du propriétaire.
   - `/clos/dev/ses-from-address` = `clos-bon-accueil@notifications.clos-bon-accueil.fr`.
   - `/clos/prod/ses-from-address` = idem.
9. **Création manuelle du rôle GitHub OIDC** `ClosBonAccueil-GitHubActions`
   (ou via une stack CDK dédiée déployée en local par un humain la
   première fois).

### Phase 1 — Bootstrap CDK
10. `cdk bootstrap aws://{accountId}/eu-west-3`.
11. `cdk bootstrap aws://{accountId}/us-east-1`.

### Phase 2 — Déploiement dev (ordre des stacks)
12. `cdk deploy ClosBonAccueil-Certs -c stage=dev`
    (certificats ACM, créés avant tout consommateur).
13. `cdk deploy ClosBonAccueil-Data-dev`.
14. `cdk deploy ClosBonAccueil-Auth-dev`.
15. `cdk deploy ClosBonAccueil-Notifications-dev`.
16. `cdk deploy ClosBonAccueil-Api-dev`.
17. **Build du frontend** : `cd frontend && VITE_STAGE=dev npm run build`.
18. `cdk deploy ClosBonAccueil-Frontend-dev` (qui pousse `dist/` +
    `config.json`).

### Phase 3 — Seed et premier utilisateur
19. `cd backend && npm run seed -- --stage dev` :
    - Crée le `HouseConfig` singleton.
    - Crée les 12 Rooms.
    - Crée les 13 Bookings mock avec dates relatives à `today`.
20. **Création du premier admin** :
    - Console Cognito → `dev` User Pool → "Create user" :
      - Email réel du propriétaire.
      - Cocher "Send invitation".
      - Activer "Mark email as verified".
    - Puis "Add to group" → `admin`.
    - **Création manuelle de l'item User en DynamoDB** (ou login + déclenchement du
      post-confirmation trigger qui le crée automatiquement).
21. Réception de l'email d'invitation Cognito → premier login sur
    `https://dev.clos-bon-accueil.fr/`.

### Phase 4 — Smoke tests
22. Login sur le frontend → vérifier que la home s'affiche.
23. Vérifier que `useRooms()` retourne 12 chambres.
24. Créer un booking de bout en bout (tunnel 4 étapes).
25. Activer le mode admin → vérifier que le dashboard charge.
26. Supprimer une chambre → vérifier que la cascade fonctionne et qu'un
    email est envoyé au propriétaire du booking impacté.

### Phase 5 — Déploiement prod
27. Répéter les étapes 12-18 avec `-c stage=prod`.
28. **Sur prod, exécuter le seed avec `--no-mock-bookings`** :
    `npm run seed -- --stage prod`.
29. Création du premier admin prod (idem étape 20 mais sur prod).
30. Smoke tests prod.

### Phase 6 — Activation CI/CD
31. Pousser le code sur GitHub.
32. Configurer les secrets GitHub Actions (juste le rôle OIDC ARN, pas
    de credentials).
33. Premier merge sur `main` → vérifier que `deploy-dev.yml` se déclenche
    et redéploie correctement.
34. Premier tag `v0.1.0` → vérifier `deploy-prod.yml` (avec approbation
    manuelle).

---

## 3.12 — Récapitulatif des variables d'environnement Lambda

Pour chaque Lambda, les variables d'env disponibles selon son rôle :

| Lambda type | Variables d'env injectées |
|---|---|
| Toutes les Lambdas API | `TABLE_NAME`, `STAGE`, `LOG_LEVEL`, `USER_POOL_ID` |
| Lambdas créant/modifiant des Bookings | + `SNS_TOPIC_ARN` |
| Lambdas manipulant des photos | + `PHOTO_BUCKET`, `PHOTO_CDN_DOMAIN` |
| Lambdas Cognito (invite, post-confirmation) | + `USER_POOL_ID` (déjà), `COGNITO_REGION` |
| `notification-dispatcher` | `TABLE_NAME`, `STAGE`, `LOG_LEVEL`, `SES_FROM_ADDRESS`, `ADMIN_EMAIL_PARAM_NAME` |
| `reconciliation-job` | `TABLE_NAME`, `STAGE`, `LOG_LEVEL`, `SNS_TOPIC_ARN` |
| `auth-post-confirmation` | `TABLE_NAME`, `STAGE`, `LOG_LEVEL` |

Toutes les valeurs sont injectées par CDK depuis `stageConfig` et les
outputs SSM (cf. § 3.2.1). Aucune valeur ne doit être hardcodée dans le
code Lambda.
