# Audit de l'empreinte AWS — Le Clos Bon Accueil

**Date** : 2026-05-28  
**Source** : lecture directe des fichiers du repo (aucune hypothèse)  
**Objectif** : cartographier factuellement tout ce qui est lié à AWS avant la migration vers Azure

---

## 1. Services AWS utilisés

### Lambda

- **Nombre** : 32 fonctions au total
  - 29 handlers API (un par route REST)
  - 1 trigger Cognito post-confirmation (`auth-post-confirmation`)
  - 1 abonné SNS (`notification-dispatcher`)
  - 1 scheduled job EventBridge (`reconciliation-job`)
- **Runtime** : Node.js 20.x (toutes)
- **Architecture** : ARM64 (toutes)
- **Mémoire** : 128 MB (health check) à 1024 MB (admin-rooms-delete)
- **Timeouts** : 3 s à 60 s
- **Bundling** : esbuild via CDK `NodejsFunction`, minifié, `@aws-sdk/*` externalisés
- **Logs** : CloudWatch — 7 jours (dev), 30 jours (prod)
- **Tracing** : X-Ray activé en prod uniquement

**Signatures d'event (couplage fort) :**
| Type de handler | Type TypeScript importé |
|---|---|
| API handlers (27) | `APIGatewayProxyHandlerV2WithJWTAuthorizer` |
| SNS subscriber | `SNSHandler` |
| Cognito trigger | `PostConfirmationTriggerHandler` |
| EventBridge schedule | `ScheduledHandler` |

### API Gateway

- **Type** : REST API (pas HTTP API)
- **Endpoint** : Regional (eu-west-3)
- **Domaine custom** : `api.{stage}.clos-bon-accueil.fr` (dev) / `api.clos-bon-accueil.fr` (prod)
- **Authorizer** : Cognito User Pool JWT — claims extraites : `sub` (userId), `cognito:groups` (rôle)
- **Stage** : `v1`
- **Throttling** : 100 burst, 50 req/s
- **CORS** : origines explicites par stage, headers : Content-Type, Authorization, Idempotency-Key
- **Logging** : CloudWatch access logs (format JSON standard) + métriques
- **27 routes** mappées à 27 Lambdas via `LambdaIntegration`

### DynamoDB

- **Design** : Single Table Design — une seule table
- **Nom** : `clos-bon-accueil-{stage}`
- **Partition key** : `pk` (STRING)
- **Sort key** : `sk` (STRING)
- **Billing** : PAY_PER_REQUEST (on-demand)
- **Chiffrement** : AWS managed
- **PITR** : prod uniquement
- **TTL** : attribut `ttl` (enregistrements d'idempotence, expiry 24h)
- **3 GSIs** :
  - `gsi1` (gsi1pk/gsi1sk) → listRooms, listMyBookings, listUsers
  - `gsi2` (gsi2pk/gsi2sk) → listAllBookings, reconciliation-job
  - `gsi3` (gsi3pk/gsi3sk) → findBookingById
- **Accès** : exclusivement via `backend/src/data/repository.ts` (interface abstraite)
- **Transactions** : `TransactWriteItems` pour createBooking, updateBooking, deleteRoom (cascade)

### Cognito

- **User Pool** : `clos-bon-accueil-{stage}`
- **Self sign-up** : désactivé (invitation uniquement)
- **Alias** : email
- **MFA** : désactivé
- **Politique de mot de passe** : min 10 chars, majuscule + chiffre + symbole
- **Groupes** : `admin`, `guest` — source de vérité du rôle dans les JWT claims
- **App client** : `web-client`, public (pas de secret), AUTH_FLOW : `USER_PASSWORD_AUTH` uniquement
- **Tokens** : access/id 1h, refresh 30j
- **Trigger** : post-confirmation → `auth-post-confirmation` Lambda (crée l'utilisateur en DynamoDB)
- **Admin ops utilisées par les handlers** : `AdminCreateUser`, `AdminAddUserToGroup`, `AdminDeleteUser`

### S3

**2 buckets :**

1. **Photo bucket** (`clos-photos-{stage}-{account}`)
   - Versionné, accès public bloqué, chiffrement S3-managed
   - CORS : PUT autorisé depuis origines du frontend
   - Lifecycle : transition vers INFREQUENT_ACCESS après 90 jours
   - Accès : OAI CloudFront + pré-signed URLs (5 min) générées par Lambda

2. **Web bucket** (`clos-web-{stage}-{account}`)
   - Hébergement SPA (Vite build dist/)
   - Accès public bloqué, OAI CloudFront uniquement
   - Déployé via `BucketDeployment` CDK (assets + `config.json` séparé)

### CloudFront

**2 distributions :**

1. **Photo CDN** — domaine : `cdn.{stage}.clos-bon-accueil.fr`
   - Origine : photo bucket via OAI
   - Cache : CACHING_OPTIMIZED, GET/HEAD uniquement, HTTPS only

2. **Web CDN** — domaine : `dev.clos-bon-accueil.fr` (dev) / `www.clos-bon-accueil.fr` + apex (prod)
   - Origine : web bucket via OAI
   - Cache : CACHING_DISABLED (SPA index.html)
   - Error responses : 403/404 → /index.html (SPA routing)
   - REDIRECT_TO_HTTPS, TLS 1.2+, HTTP2+3

### SES (Simple Email Service)

- **Usage** : envoi d'emails transactionnels via `SendTemplatedEmailCommand`
- **Templates** : référencés par nom (ex. `booking-created`, `booking-updated`)
- **Expéditeur** : adresse stockée dans SSM (`/clos/{stage}/ses-from-address`)
- **Utilisé par** : `notification-dispatcher` Lambda (abonné SNS)

### SNS (Simple Notification Service)

**2 topics :**
1. **`clos-notifications-{stage}`** — événements métier (BOOKING_CREATED, etc.), abonné : notification-dispatcher
2. **`clos-alarms-{stage}`** — alertes CloudWatch, abonné : email admin

### SSM Parameter Store

**Convention de nommage** : `/clos/{stage}/{catégorie}/{clé}`

| Paramètre | Écrit par | Consommé par |
|---|---|---|
| `/clos/{stage}/data/table-name` | DataStack | ApiStack, NotificationsStack, AuthStack |
| `/clos/{stage}/data/table-arn` | DataStack | ApiStack, NotificationsStack, AuthStack |
| `/clos/{stage}/data/photo-bucket-name` | DataStack | ApiStack |
| `/clos/{stage}/data/photo-cdn-domain` | DataStack | ApiStack, FrontendStack |
| `/clos/{stage}/auth/user-pool-id` | AuthStack | ApiStack, FrontendStack |
| `/clos/{stage}/auth/user-pool-arn` | AuthStack | ApiStack |
| `/clos/{stage}/auth/web-client-id` | AuthStack | FrontendStack |
| `/clos/{stage}/api/url` | ApiStack | FrontendStack |
| `/clos/{stage}/notifications/topic-arn` | NotificationsStack | ApiStack |
| `/clos/{stage}/admin-email` | Manuel | NotificationsStack, notification-dispatcher |
| `/clos/{stage}/ses-from-address` | Manuel | NotificationsStack, notification-dispatcher |
| `/clos/certs/cloudfront-cert-arn` | CertsStack (us-east-1 → eu-west-3) | DataStack, FrontendStack |

### WAF v2

- **Scope** : REGIONAL (API Gateway)
- **Web ACL** : `ClosBonAccueil-{stage}`
- **Règles managed** :
  - AWS Managed Rules Common Rule Set (priorité 1)
  - AWS Managed Rules Known Bad Inputs Rule Set (priorité 2)
- **Règle custom** : rate-based 2000 req/5min par IP (priorité 3, action BLOCK)

### EventBridge

- **1 règle** : `ReconciliationSchedule` — cron `0 1 * * ? *` (01:00 UTC = 03:00 Paris)
- **Cible** : `reconciliation-job` Lambda

### IAM

- **Pattern** : 1 rôle dédié par Lambda, least-privilege strict
- **Permissions** : actions DynamoDB précises + ressources explicites (table ARN + GSI ARNs)
- **Pas de wildcard** sur actions ni ressources (sauf `ses:SendTemplatedEmail` sur `*`)

### ACM / Certificats TLS

- **Cert CloudFront** (CertsStack, us-east-1) : wildcard `*.clos-bon-accueil.fr` + `*.dev.clos-bon-accueil.fr`
  - Cross-region : ARN écrit en SSM eu-west-3 via Custom Resource
- **Cert API** (ApiStack, eu-west-3) : per stage, domaine API

### Route 53

- **Hosted zone** : `clos-bon-accueil.fr` (lookup, non créée par CDK)
- **Enregistrements** : paires A + AAAA alias pour frontend CDN, photo CDN, API Gateway

### CloudWatch

- **Log groups** : API Gateway access logs + Lambda logs
- **Alarms** (prod) : Lambda errors, DynamoDB user/system errors, API 5xx, conflicts reconciliation
- **Actions** : SNS publish vers alarms topic

### X-Ray

- **Activé** : prod uniquement (`cfg.xrayEnabled`)
- **Tracing** : `Lambda.Tracing.ACTIVE` sur les 29 handlers API
- **IAM** : `AWSXRayDaemonWriteAccess` (prod)

---

## 2. Stacks CDK (6 stacks, infra/lib/)

| Stack | Région | Provisionne |
|---|---|---|
| **CertsStack** | us-east-1 | Certificat wildcard ACM pour CloudFront, Custom Resource cross-region vers SSM eu-west-3 |
| **DataStack** | eu-west-3 | DynamoDB table + 3 GSIs, S3 photo bucket, CloudFront photo CDN, Route 53, SSM outputs |
| **AuthStack** | eu-west-3 | Cognito User Pool + groupes + app client, Lambda post-confirmation, SSM outputs |
| **NotificationsStack** | eu-west-3 | SNS topics (notif + alarms), Lambda dispatcher, Lambda reconciliation, EventBridge cron, CloudWatch alarms, SSM output |
| **ApiStack** | eu-west-3 | API Gateway REST + 29 Lambdas + rôles IAM, Cognito authorizer, WAF, ACM cert API, Route 53, CloudWatch, SSM output |
| **FrontendStack** | eu-west-3 | S3 web bucket, CloudFront SPA, Route 53, BucketDeployment Vite dist, BucketDeployment config.json (SSM → JSON à deploy-time) |

**Découpling inter-stacks** : aucun CloudFormation Export — tout passe par SSM Parameter Store.

---

## 3. Couplage AWS dans le code applicatif

### backend/src/api/deps.ts

SDK AWS v3 initialisés :
- `DynamoDBDocumentClient` (from `@aws-sdk/lib-dynamodb`)
- `CognitoIdentityProviderClient` (`@aws-sdk/client-cognito-identity-provider`)
- `S3Client` (`@aws-sdk/client-s3`)
- `SESClient` (`@aws-sdk/client-ses`)
- `SNSClient` (`@aws-sdk/client-sns`) + `PublishCommand`
- `SSMClient` (`@aws-sdk/client-ssm`)
- `getSignedUrl` + `PutObjectCommand` (`@aws-sdk/s3-request-presigner`)
- `@aws-lambda-powertools/logger` (logger structuré AWS)

### backend/src/api/http.ts

- Importe `APIGatewayProxyHandlerV2WithJWTAuthorizer` depuis `aws-lambda`
- `getCurrentUserId()` : extrait `sub` depuis `event.requestContext.authorizer.jwt.claims`
- `requireRole()` : extrait `cognito:groups` depuis les claims JWT
- `withErrorHandling()` : wrapper retournant `{ statusCode, headers, body }` format API Gateway
- Mappe les erreurs DynamoDB par nom (`ConditionalCheckFailedException`, `TransactionCanceledException`)

### backend/src/data/repository.ts

- Interface `Repository` : **aucun couplage AWS** (abstraction pure TypeScript)
- Erreurs métier : `ConflictError`, `NotFoundError`, `ValidationError`, `CapacityReductionError`, `ForbiddenError`
- **L'implémentation concrète** (dans un sous-fichier non encore écrit au moment de P3) sera la pièce à migrer

### backend/src/handlers/*

- Signature : `APIGatewayProxyHandlerV2WithJWTAuthorizer` (toutes les routes)
- Logique métier pure, appels via `repo.*()` et `deps.*()` — **découplée d'AWS**
- Pas d'imports directs `@aws-sdk` dans les handlers

### frontend (P8-P9)

- **Auth** : `@aws-amplify/auth` (v6.20.0) — `Amplify.configure()` avec `userPoolId` + `userPoolClientId`
- **Tokens** : `fetchAuthSession()` → id token envoyé en `Authorization: Bearer`
- **Config** : chargée depuis `/config.json` au runtime (champs : `apiBaseUrl`, `userPoolId`, `userPoolClientId`, `region`, `cdnDomain`, `stage`)
- **Upload S3** : `putExternal()` dans client.ts — PUT direct vers pré-signed URL S3

---

## 4. Variables d'environnement (runtime backend)

| Variable | Source | Utilisé par |
|---|---|---|
| `AWS_REGION` | Runtime AWS | Tous les SDK clients (défaut eu-west-3) |
| `TABLE_NAME` | CDK env Lambda | `deps.ts`, tous les handlers |
| `SNS_TOPIC_ARN` | CDK env Lambda | `deps.ts publishEvent()` |
| `USER_POOL_ID` | CDK env Lambda | admin-users-invite, admin-users-delete |
| `PHOTOS_BUCKET` | CDK env Lambda | admin-rooms-photo-url |
| `CDN_DOMAIN` | CDK env Lambda | admin-rooms-photo-url (URL publique photo) |
| `SES_FROM_ADDRESS` | CDK env Lambda | notification-dispatcher |
| `ADMIN_EMAIL_PARAM_NAME` | CDK env Lambda | notification-dispatcher (lookup SSM runtime) |
| `CORS_ORIGIN` | CDK env Lambda | `http.ts` headers CORS |
| `STAGE` | CDK env Lambda | Logger, contexte |
| `LOG_LEVEL` | CDK env Lambda | Init logger |

---

## 5. Code agnostique du fournisseur cloud

| Fichier / module | Couplage AWS | Notes |
|---|---|---|
| `shared-types/src/*.ts` | **Aucun** | Types, DTOs, dates, événements — pure TypeScript |
| `backend/src/data/repository.ts` (interface) | **Aucun** | Interface + classes d'erreurs — abstraction pure |
| `backend/src/shared/identifiers.ts` | **Aucun** | `generateBookingReference()` — fonction pure |
| `backend/src/handlers/*.ts` (logique métier) | **Minimal** | Signature Lambda (changeable mécaniquement) |
| `backend/src/api/schemas/*.ts` | **Aucun** | Schémas Zod — validation pure |
| `frontend/src/api/client.ts` | **Amplify** | Seule dépendance AWS : `fetchAuthSession()` pour le token |
| `frontend/src/config.ts` | **Aucun** | Shape de config agnostique |

---

## 6. Inventaire des dépendances AWS par workspace

**backend/package.json** :
```
@aws-sdk/client-dynamodb           3.651.1
@aws-sdk/client-cognito-identity-provider  3.651.1
@aws-sdk/client-s3                 3.651.1
@aws-sdk/client-ses                3.651.1
@aws-sdk/client-sns                3.651.1
@aws-sdk/client-ssm                3.651.1
@aws-sdk/lib-dynamodb              3.651.1
@aws-sdk/s3-request-presigner      3.651.1
@aws-lambda-powertools/logger      2.33.0
@types/aws-lambda                  8.10.145 (dev)
aws-sdk-client-mock                4.1.0 (dev)
```

**frontend/package.json** :
```
@aws-amplify/auth                  6.20.0
```

**infra/package.json** :
```
aws-cdk                            2.147.3
aws-cdk-lib                        2.147.3
constructs                         10.3.0
esbuild                            0.21.5
```

**shared-types/package.json** :
```
(aucune dépendance AWS)
```

---

## 7. Points de couplage fort — résumé pour la migration

| Composant | Couplage | Impact migration |
|---|---|---|
| Signatures des handlers (aws-lambda types) | Fort | Mécanique — swap de type de handler |
| `deps.ts` — SDK clients | Fort | Réécriture complète (8 SDK → équivalents Azure) |
| `http.ts` — extraction claims JWT | Moyen | Noms de claims Cognito spécifiques (`cognito:groups`, `sub`) |
| `http.ts` — format réponse APIGateway | Fort | Changer la signature de retour `{ statusCode, headers, body }` |
| Repository implementation (DynamoDB) | Fort | Réécriture du layer data (Cosmos DB ou autre) |
| `notification-dispatcher` — SES | Fort | Swap SDK SES → Azure Communication Services |
| `notification-dispatcher` — SNS event | Moyen | Shape du message SNS → Service Bus |
| `auth-post-confirmation` — trigger Cognito | Fort | Trigger spécifique Cognito — remplacer par équivalent Entra |
| `reconciliation-job` — EventBridge schedule | Faible | Timer trigger Azure Functions direct |
| Frontend — Amplify Auth | Fort | Swap Amplify → MSAL.js (Microsoft) |
| Frontend — pré-signed URLs S3 | Moyen | Swap vers SAS tokens Azure Blob |
| Infra — CDK 6 stacks | Fort | Réécriture complète en IaC Azure |
| SSM Parameter Store | Fort | Remplacer par Azure App Configuration / Key Vault |
