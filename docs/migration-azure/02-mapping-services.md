# Mapping AWS → Azure — Le Clos Bon Accueil

**Date** : 2026-05-28  
**Basé sur** : `01-audit-aws.md` (lecture réelle du code)

---

## Tableau de mapping

| Brique AWS | Service Azure retenu | Alternative écartée | Justification |
|---|---|---|---|
| **Lambda** (32 fonctions) | **Azure Functions v4** — isolated worker model | Container Apps | Isolated worker est le modèle courant recommandé pour Node.js 20 (in-process est déprécié). Même granularité par fonction, même modèle de déclenchement HTTP/Timer/ServiceBus. |
| **API Gateway REST** | **Azure API Management (Consumption tier)** | Functions HTTP triggers natifs | APIM reproduit fidèlement : auth JWT, throttling (100 burst/50 RPS), custom domain, WAF (via Azure WAF policy), logging structuré. Le tier Consumption est serverless (pay-per-call, pas de VNet obligatoire). Les triggers HTTP natifs seuls manquent de WAF et d'auth centralisée. |
| **WAF v2 (API Gateway)** | **Azure WAF policy sur APIM** | Front Door WAF | Les règles managed (OWASP, Known Bad Inputs) + rate-limit existent dans Azure WAF. L'association à APIM reproduit exactement le pattern actuel. |
| **DynamoDB** (single table, 3 GSIs, TTL) | **Azure Cosmos DB for NoSQL** | Azure Table Storage | Cosmos DB supporte le même modèle partition key, indexation automatique de toutes les propriétés (les 3 GSIs disparaissent — plus besoin de les déclarer), TTL natif. La couche Repository (interface TypeScript) absorbe le changement de SDK ; les handlers ne sont pas touchés. Table Storage est trop limité (pas d'indexes secondaires, pas de transactions cross-partition). |
| **Cognito** (User Pool + groupes + trigger) | **Microsoft Entra External ID** | Azure AD B2C (legacy) | Entra External ID est la cible Microsoft actuelle pour les apps customers-facing (invitation-only, groupes/rôles, OIDC conforme). Remplace B2C sans la complexité des user flows XML. Impact fort : claims JWT changent (`oid` au lieu de `sub`, rôles via App Roles au lieu de `cognito:groups`) — voir PM3. |
| **S3 photos** | **Azure Blob Storage** (container privé) | — | Équivalent direct. OAI CloudFront → Managed Identity Azure CDN. Pré-signed URLs → SAS tokens (même concept, API différente). CORS et lifecycle policies disponibles. |
| **S3 web bucket** (SPA hosting) | **Azure Blob Storage** (container `$web`) + **Azure CDN** | Azure Static Web Apps | Static Web Apps simplifie mais contraint la configuration du config.json injecté à deploy-time. Blob + Azure CDN reproduit exactement le pattern actuel (BucketDeployment CDK → `az storage blob upload-batch`). |
| **CloudFront photo CDN** | **Azure CDN** (Microsoft Standard tier) | Azure Front Door | Azure CDN Standard Microsoft est suffisant pour la distribution de photos (cache optimisé, HTTPS, domaine custom, TLS 1.2). Front Door ajouterait du coût sans valeur ajoutée pour un CDN de photos statiques. |
| **CloudFront web CDN** | **Azure CDN** (Microsoft Standard tier) | Azure Front Door | Même raisonnement — SPA statique, pas besoin du global load balancing de Front Door. Les error responses 403/404 → /index.html sont reproduites par les règles de réponse CDN. |
| **SES** (emails transactionnels, templates) | **Azure Communication Services Email** | SendGrid | ACS Email est natif Azure, intégré avec RBAC/Key Vault, supporte les templates. SendGrid est plus mature mais externe (compte supplémentaire, facturation séparée). ACS Email est la cible cohérente dans l'écosystème Azure. ⚠️ **À confirmer** : vérifier que ACS Email est disponible en eu-west (France Central) pour la conformité RGPD. |
| **SNS topic** (événements métier) | **Azure Service Bus** (topic + subscriptions) | Event Grid | Service Bus Topics reproduit exactement SNS : message avec attributs, abonnés multiples (Functions triggers), at-least-once delivery. Event Grid est plus adapté aux événements d'infrastructure qu'aux événements métier applicatifs. |
| **SNS alarms topic** (alertes ops) | **Azure Monitor Alerts** → **Action Group email** | Service Bus | Les alertes CloudWatch → SNS email sont remplacées par Azure Monitor Alerts avec Action Group de type email. Plus simple et natif, pas besoin d'un topic dédié. |
| **EventBridge** (cron 01:00 UTC) | **Azure Functions Timer Trigger** | Logic Apps | Le Timer Trigger NCRONTAB est natif aux Azure Functions — aucune ressource supplémentaire à provisionner. Expression : `0 0 1 * * *` (hh:mm:ss → 01:00:00 UTC). |
| **SSM Parameter Store** | **Azure App Configuration** (configs non-sensitives) + **Azure Key Vault** (secrets) | App Config seul | Les paramètres non-sensibles (table name, topic name, CDN domain, etc.) → App Configuration. Les secrets (SES from address, admin email) → Key Vault Secrets. Azure Functions supportent les références Key Vault nativement dans les app settings. |
| **IAM roles** (1 par Lambda, least-privilege) | **Azure Managed Identity** (System-Assigned, 1 par Function App) | Service Principal avec secret | Managed Identity est le pattern recommandé Azure — pas de credentials à gérer. Les Function Apps auront des assignments RBAC précis (ex. Cosmos DB Data Contributor sur un scope limité). ⚠️ **Granularité** : en AWS, 1 rôle par Lambda. En Azure, 1 Managed Identity par Function App (groupe de fonctions). Voir PM1 pour la décision de regroupement. |
| **ACM + Route 53** | **Azure DNS** + **Azure-managed certificates** | Cert Manager / LetsEncrypt | Azure CDN et APIM gèrent les certificats TLS automatiquement (Let's Encrypt sous le capot). Azure DNS reproduit Route 53 (zones, enregistrements A/AAAA alias). La contrainte us-east-1 pour CloudFront disparaît — aucune région spéciale requise. |
| **CloudWatch Logs + Métriques** | **Azure Monitor Logs** (Log Analytics workspace) + **Application Insights** | — | Log Analytics = CloudWatch Logs. Application Insights = CloudWatch Metrics + X-Ray distributed tracing. Le workspace Log Analytics est la cible unique pour tous les logs (Functions, APIM, CDN). |
| **X-Ray** (tracing, prod) | **Application Insights** (distributed tracing) | OpenTelemetry auto-instrumenté | Application Insights SDK pour Node.js donne traces distribuées, corrélation de logs, performance insights. Remplace à la fois X-Ray et Lambda Powertools. |
| **CDK v2** (IaC, 6 stacks TypeScript) | **Bicep** (modules par stack équivalente) | Pulumi TypeScript | Voir § "Décision IaC" ci-dessous. |
| **GitHub Actions** (CI/CD, P12) | **GitHub Actions** (inchangé) — OIDC → Entra | Azure Pipelines | L'outillage CI/CD reste GitHub Actions. Seul le provider OIDC change : `azure/login@v2` avec Federated Credential (Entra Workload Identity Federation). `aws-actions/configure-aws-credentials` est supprimé. |

---

## Décision IaC — CDK → Bicep

**Recommandation : Bicep**

**Pourquoi pas Pulumi (TypeScript) ?**  
Pulumi avec `@pulumi/azure-native` permettrait de rester en TypeScript — plus proche du paradigme CDK. Cependant :
- La stack CDK entière est à réécrire de toute façon (aucun construct ne se porte)
- Bicep est le standard Microsoft, mieux supporté dans l'outillage Azure (portail, `az deployment`, VS Code extension, IntelliSense)
- Bicep est déclaratif et donne une vue directe des ressources — plus lisible pour un audit ou une rotation d'équipe
- Les modules Bicep (`module` keyword) reproduisent le découpage par stack CDK

**⚠️ DÉCISION À CONFIRMER** : Si l'équipe préfère rester en TypeScript pour l'IaC (cohérence du monorepo), Pulumi est une alternative viable. Trancher avant PM1.

**Structure Bicep cible** (équivalent des 6 stacks CDK) :
```
infra/
  bicep/
    main.bicep          ← orchestrateur (equiv. bin/app.ts)
    modules/
      data.bicep        ← equiv. DataStack (Cosmos DB, Blob, CDN)
      auth.bicep        ← equiv. AuthStack (Entra External ID, Function post-confirm)
      notifications.bicep ← equiv. NotificationsStack (Service Bus, ACS, Functions)
      api.bicep         ← equiv. ApiStack (APIM, 29 Function Apps, WAF)
      frontend.bicep    ← equiv. FrontendStack (Blob $web, CDN SPA)
    parameters/
      dev.bicepparam
      prod.bicepparam
```

**Convention de nommage Azure** :
- Ressources : `clos-{ressource}-{stage}` (ex. `clos-cosmos-dev`)
- Resource group : `rg-clos-bon-accueil-{stage}`
- Région principale : `francecentral` (Paris) — équivalent direct de eu-west-3

---

## Décision granularité Function Apps

En AWS, chaque Lambda est isolée. En Azure Functions, on peut :
1. **1 Function App par fonction** (32 Function Apps) — isolation maximale, costly en gestion
2. **1 Function App par groupe logique** — compromise (ex. `clos-api-dev` pour les 29 routes, `clos-jobs-dev` pour reconciliation + dispatcher)

**Recommandation : 2 Function Apps** :
- `clos-api-{stage}` : 29 fonctions HTTP (routes API)
- `clos-jobs-{stage}` : reconciliation-job + notification-dispatcher + auth-trigger
- **Managed Identity distincte** par Function App → assignments RBAC séparés

**⚠️ DÉCISION À CONFIRMER** : la granularité des Managed Identities (et donc des RBAC assignments) découle directement de ce choix. Valider avant PM1.

---

## Points à confirmer

| # | Décision | Options | Impact |
|---|---|---|---|
| D1 | IaC : Bicep ou Pulumi TypeScript ? | Bicep (recommandé) vs Pulumi | Choix structurant pour PM1 et toute la suite |
| D2 | Granularité Function Apps (2 vs N) | 2 apps recommandées | Détermine la structure des Managed Identities et des RBAC |
| D3 | ACS Email disponible en France Central ? | Vérifier disponibilité région | Si non, considérer Sweden Central + data residency RGPD |
| D4 | Entra External ID : App Roles ou groupes ? | App Roles (recommandé) ou Security Groups | Impact sur les claims JWT et le middleware d'auth backend |
| D5 | APIM tier : Consumption ou Developer ? | Consumption (serverless, pay-per-call) recommandé | Consumption n'a pas de VNet — cohérent avec le pattern actuel (pas de VPC) |
| D6 | Azure CDN Standard ou Front Door Standard ? | CDN Standard Microsoft (recommandé, moins cher) | Si la latence globale devient un critère, Front Door offre POP mondiaux |

---

## Vue synthétique par phase de migration

| Phase | Briques AWS à supprimer | Briques Azure à créer |
|---|---|---|
| PM1 — IaC Bicep | CDK 6 stacks (infra/) | Bicep modules + parameter files |
| PM2 — Data (Cosmos DB) | DynamoDB SDK + repository impl | Cosmos DB SDK, repository impl Azure |
| PM3 — Auth (Entra) | Cognito + `@aws-amplify/auth` | Entra External ID + MSAL.js frontend |
| PM4 — Compute (Functions) | Lambda signatures, `deps.ts` SDK clients | Azure Functions handlers, `deps.ts` Azure SDK |
| PM5 — Events/Notifs | SNS + SES + `@aws-sdk/client-s*` | Service Bus + ACS Email + Azure SDKs |
| PM6 — CDN + Hosting | CloudFront + S3 web + BucketDeployment | Azure CDN + Blob `$web` + `az storage upload` |
| PM7 — Monitoring | CloudWatch + X-Ray + Lambda Powertools | Azure Monitor + Application Insights |
| PM8 — CI/CD | `aws-actions/configure-aws-credentials` | `azure/login@v2` + OIDC Workload Identity |
