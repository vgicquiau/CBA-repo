# Guide de mise en production — Le Clos Bon Accueil

**Stack** : Azure Functions v4 (Node.js 20) · Cosmos DB · APIM · Azure CDN · Entra External ID  
**Région** : `francecentral`  
**Stages** : `dev` (merge main) · `prod` (tag `v*.*.*` + approbation manuelle)  
**Dernière mise à jour** : 2026-05-29

> Ce guide couvre le chemin complet depuis une subscription Azure vierge jusqu'à une application fonctionnelle en production, accessible via HTTPS sur domaine custom.

---

## Table des matières

1. [Pré-requis et outils](#1-pré-requis-et-outils)
2. [Checklist sécurité avant tout déploiement](#2-checklist-sécurité-avant-tout-déploiement)
3. [Bootstrap — actions manuelles une seule fois](#3-bootstrap--actions-manuelles-une-seule-fois)
4. [Provisionner l'infrastructure Bicep](#4-provisionner-linfrastructure-bicep)
5. [Secrets post-déploiement (Key Vault)](#5-secrets-post-déploiement-key-vault)
6. [Build de production](#6-build-de-production)
7. [Tests avant mise en production](#7-tests-avant-mise-en-production)
8. [Déploiement sur Azure](#8-déploiement-sur-azure)
9. [Configuration DNS et HTTPS](#9-configuration-dns-et-https)
10. [Seed des données initiales](#10-seed-des-données-initiales)
11. [Vérifications post-déploiement](#11-vérifications-post-déploiement)
12. [Monitoring et alertes](#12-monitoring-et-alertes)
13. [CI/CD GitHub Actions (déploiements automatisés)](#13-cicd-github-actions-déploiements-automatisés)
14. [Runbook incidents](#14-runbook-incidents)

---

## 1. Pré-requis et outils

### Outils requis

```bash
# Azure CLI — version minimale 2.60
az --version

# Bicep CLI (inclus dans az CLI >= 2.20, vérifier)
az bicep version

# Node.js 20
node --version   # doit afficher v20.x

# jq (injection config.json)
jq --version
```

Installation si manquant :

```bash
# Azure CLI (Debian/Ubuntu)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Bicep via az
az bicep install

# jq
sudo apt-get install jq   # Linux
brew install jq           # macOS
```

### Connexion Azure

```bash
# Authentification interactive
az login

# Sélectionner la bonne subscription
az account set --subscription TON_SUBSCRIPTION_ID

# Vérifier
az account show --query "{name:name, id:id, state:state}"
```

### Variables d'environnement de référence

Ces valeurs sont utilisées tout au long du guide. Exporte-les dans ton shell avant de commencer.

```bash
# Stage cible : 'dev' ou 'prod'
export STAGE=dev

# Resource group
export RG=rg-clos-bon-accueil-${STAGE}

# Entra External ID — à remplir après §3
export ENTRA_TENANT_ID=<ton-entra-tenant-id>
export ENTRA_CLIENT_ID=<ton-entra-client-id>

# Email admin pour alertes ops
export ADMIN_EMAIL=admin@clos-bon-accueil.fr
```

---

## 2. Checklist sécurité avant tout déploiement

```bash
# Vérifier qu'aucun secret n'est dans le code
grep -r "AccountKey\|password\|secret\|connectionString" backend/src/ --include="*.ts" | grep -v ".test.ts"
# Résultat attendu : aucune ligne

# Vérifier que local.settings.json n'est pas commité
git ls-files | grep "local.settings.json"
# Résultat attendu : vide
```

> ⚠️ **ATTENTION** : `local.settings.json` n'est PAS dans le `.gitignore` actuel. Avant tout développement local de la Function App, ajouter cette ligne au `.gitignore` :
> ```
> local.settings.json
> ```
> Ce fichier peut contenir des connection strings et des clés de stockage.

```bash
# Vérifier .gitignore
grep "local.settings.json" .gitignore || echo "MANQUANT — ajouter local.settings.json au .gitignore"

# Vérifier que frontend/dist n'est pas commité (sauf build initial de shared-types)
git ls-files frontend/dist/
# Résultat attendu : vide (frontend/dist est dans .gitignore)

# Vérifier que node_modules n'est pas commité
git ls-files --error-unmatch node_modules 2>&1 | grep "did not match"
```

**Correction immédiate — ajouter au `.gitignore` :**

```bash
echo "local.settings.json" >> .gitignore
git add .gitignore && git commit -m "fix: add local.settings.json to .gitignore"
```

---

## 3. Bootstrap — actions manuelles une seule fois

Ces étapes ne sont faites **qu'une fois** par stage, avant tout déploiement Bicep.

### 3.1 Créer les Resource Groups

```bash
# Dev
az group create \
  --name rg-clos-bon-accueil-dev \
  --location francecentral \
  --tags project=clos-bon-accueil stage=dev

# Prod
az group create \
  --name rg-clos-bon-accueil-prod \
  --location francecentral \
  --tags project=clos-bon-accueil stage=prod
```

### 3.2 Créer l'App Registration Entra External ID

> ⚠️ **ATTENTION** : Cette étape nécessite un tenant Entra External ID (anciennement Azure AD B2C External). Créer le tenant via le portail Azure si ce n'est pas déjà fait : **Azure Active Directory External Identities → Create external tenant**.

```bash
# Récupérer le tenant ID Entra External ID
# (différent du tenant Azure principal si tu utilises un tenant B2C dédié)
az account tenant list

# Créer l'app registration dans le tenant Entra External ID
az ad app create \
  --display-name "Le Clos Bon Accueil" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris \
    "http://localhost:5173" \
    "https://dev.clos-bon-accueil.fr" \
    "https://www.clos-bon-accueil.fr"

# Récupérer le client ID
az ad app list --display-name "Le Clos Bon Accueil" --query "[0].appId" -o tsv
# → noter la valeur : c'est ENTRA_CLIENT_ID

# Créer les App Roles (admin / guest)
# Via le portail : App Registration → App Roles → Create App Role
# Role 'admin': allowedMemberTypes = User, value = admin
# Role 'guest': allowedMemberTypes = User, value = guest
```

> ⚠️ **ATTENTION** : Les App Roles (`admin`, `guest`) doivent être créés dans l'App Registration Entra. La validation JWT dans APIM vérifie le claim `oid`. Les handlers vérifient le rôle via le header `X-Forwarded-User` décodé. Sans App Roles configurés, les routes admin renverront 403.

### 3.3 Créer le Service Principal pour GitHub Actions (OIDC)

```bash
# Créer un service principal dédié CI/CD
az ad sp create-for-rbac \
  --name "sp-clos-bon-accueil-cicd" \
  --role Contributor \
  --scopes \
    /subscriptions/TON_SUBSCRIPTION_ID/resourceGroups/rg-clos-bon-accueil-dev \
    /subscriptions/TON_SUBSCRIPTION_ID/resourceGroups/rg-clos-bon-accueil-prod

# Sauvegarder la sortie — elle contient clientId, clientSecret, tenantId
# clientId → secret GitHub AZURE_CLIENT_ID
# tenantId → secret GitHub AZURE_TENANT_ID
# subscriptionId → secret GitHub AZURE_SUBSCRIPTION_ID
```

### 3.4 Configurer le Federated Credential (OIDC — pas de secret rotatif)

```bash
# Récupérer l'object ID du service principal
SP_OBJECT_ID=$(az ad sp list --display-name "sp-clos-bon-accueil-cicd" --query "[0].id" -o tsv)

# Federated credential pour deploy-dev (branch main)
az ad app federated-credential create \
  --id $SP_OBJECT_ID \
  --parameters '{
    "name": "github-deploy-dev",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:TON_ORG/TON_REPO:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Federated credential pour deploy-prod (tags v*.*.*)
az ad app federated-credential create \
  --id $SP_OBJECT_ID \
  --parameters '{
    "name": "github-deploy-prod",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:TON_ORG/TON_REPO:ref:refs/tags/v*",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Federated credential pour PR (validate-bicep)
az ad app federated-credential create \
  --id $SP_OBJECT_ID \
  --parameters '{
    "name": "github-pr",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:TON_ORG/TON_REPO:pull_request",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

### 3.5 Configurer les secrets GitHub

Dans le repo GitHub → Settings → Secrets and variables → Actions :

```
AZURE_CLIENT_ID          → clientId du service principal (§3.3)
AZURE_TENANT_ID          → tenantId Azure
AZURE_SUBSCRIPTION_ID    → ID de la subscription Azure
ENTRA_TENANT_ID          → tenant ID Entra External ID (§3.2)
ENTRA_CLIENT_ID          → app registration client ID (§3.2)
ADMIN_EMAIL_DEV          → email pour alertes ops dev (ex: ops-dev@clos-bon-accueil.fr)
ADMIN_EMAIL_PROD         → email pour alertes ops prod (ex: ops@clos-bon-accueil.fr)
E2E_GUEST_EMAIL          → email compte guest pour tests Playwright
E2E_GUEST_PASSWORD       → mot de passe compte guest E2E
E2E_ADMIN_EMAIL          → email compte admin pour tests Playwright
E2E_ADMIN_PASSWORD       → mot de passe compte admin E2E
```

Créer aussi l'environnement GitHub `production` (Settings → Environments) avec une règle **Required reviewers** pour l'approbation manuelle du déploiement prod.

---

## 4. Provisionner l'infrastructure Bicep

> ⚠️ **ATTENTION** : Le déploiement Bicep crée ~20 ressources Azure. La première exécution prend 10–15 minutes (APIM Consumption peut prendre jusqu'à 5 min seul).

### 4.1 Valider le template (dry-run)

```bash
# Dev
az deployment group validate \
  --resource-group rg-clos-bon-accueil-dev \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/parameters/dev.bicepparam \
  --parameters tenantId="${ENTRA_TENANT_ID}" clientId="${ENTRA_CLIENT_ID}"

# Prod
az deployment group validate \
  --resource-group rg-clos-bon-accueil-prod \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/parameters/prod.bicepparam \
  --parameters tenantId="${ENTRA_TENANT_ID}" clientId="${ENTRA_CLIENT_ID}"
```

### 4.2 Déployer

```bash
# Dev — déploiement complet
az deployment group create \
  --resource-group rg-clos-bon-accueil-dev \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/parameters/dev.bicepparam \
  --parameters \
    tenantId="${ENTRA_TENANT_ID}" \
    clientId="${ENTRA_CLIENT_ID}" \
    adminEmail="${ADMIN_EMAIL}" \
  --name "deploy-$(date +%Y%m%d-%H%M%S)"

# Prod — même commande, resource group + param file différents
az deployment group create \
  --resource-group rg-clos-bon-accueil-prod \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/parameters/prod.bicepparam \
  --parameters \
    tenantId="${ENTRA_TENANT_ID}" \
    clientId="${ENTRA_CLIENT_ID}" \
    adminEmail="${ADMIN_EMAIL}"
```

**Ordre de déploiement interne (géré par Bicep `dependsOn`) :**

```
App Configuration + Key Vault (main.bicep)
  ├── data.bicep    → Cosmos DB, Blob Storage, CDN
  ├── auth.bicep    → App Configuration entries (tenantId, clientId)
  ├── monitoring.bicep → Log Analytics, App Insights, Alertes
  ├── notifications.bicep → Service Bus, ACS Email, clos-jobs Function App
  ├── api.bicep     → clos-api Function App, APIM
  └── frontend.bicep → App Configuration (frontend config)
```

### 4.3 Vérifier les ressources créées

```bash
az resource list \
  --resource-group rg-clos-bon-accueil-dev \
  --query "[].{name:name, type:type, location:location}" \
  --output table
```

Résultat attendu (≈20 ressources) :

```
clos-appconfig-dev      Microsoft.AppConfiguration/configurationStores
clos-kv-dev             Microsoft.KeyVault/vaults
clos-cosmos-dev         Microsoft.DocumentDB/databaseAccounts
closstoragedev          Microsoft.Storage/storageAccounts
closapifndev            Microsoft.Storage/storageAccounts     (Function App storage)
clos-api-plan-dev       Microsoft.Web/serverfarms
clos-api-dev            Microsoft.Web/sites
clos-jobs-plan-dev      Microsoft.Web/serverfarms
clos-jobs-dev           Microsoft.Web/sites
clos-apim-dev           Microsoft.ApiManagement/service
clos-servicebus-dev     Microsoft.ServiceBus/namespaces
clos-cdn-dev            Microsoft.Cdn/profiles
clos-logs-dev           Microsoft.OperationalInsights/workspaces
clos-insights-dev       Microsoft.Insights/components
```

---

## 5. Secrets post-déploiement (Key Vault)

> Ces secrets doivent être posés **après** le premier déploiement Bicep (Key Vault existant), **avant** le déploiement des Function Apps.

```bash
# Email expéditeur ACS (doit correspondre au domaine vérifié dans ACS)
az keyvault secret set \
  --vault-name clos-kv-dev \
  --name email-from-address \
  --value "noreply@clos-bon-accueil.fr"

# Email admin pour les notifications métier
az keyvault secret set \
  --vault-name clos-kv-dev \
  --name admin-email \
  --value "${ADMIN_EMAIL}"

# Même chose pour prod
az keyvault secret set --vault-name clos-kv-prod --name email-from-address --value "noreply@clos-bon-accueil.fr"
az keyvault secret set --vault-name clos-kv-prod --name admin-email --value "${ADMIN_EMAIL}"
```

> ⚠️ **ATTENTION** : Les Function Apps `clos-api` et `clos-jobs` lisent ces secrets via Key Vault references dans leurs app settings. Si les secrets sont absents, les apps démarrent mais les features email échouent silencieusement. Vérifier dans App Insights.

### Configurer Azure Communication Services (ACS)

```bash
# Créer la ressource ACS (si non créée par Bicep)
az communication create \
  --name clos-acs-dev \
  --resource-group rg-clos-bon-accueil-dev \
  --location global \
  --data-location europe

# Récupérer la connection string ACS
az communication list-key \
  --name clos-acs-dev \
  --resource-group rg-clos-bon-accueil-dev \
  --query primaryConnectionString -o tsv

# Stocker dans Key Vault
az keyvault secret set \
  --vault-name clos-kv-dev \
  --name acs-connection-string \
  --value "<connection-string-ci-dessus>"
```

---

## 6. Build de production

```bash
# Depuis la racine du monorepo
npm ci

# 1. Build shared-types EN PREMIER (dépendance de backend et frontend)
npm run build --workspace=shared-types

# 2. Vérification TypeScript complète
npm run typecheck --workspaces
# Critère : 0 erreur

# 3. Lint
npm run lint
# Critère : 0 warning, 0 error

# 4. Build backend (TypeScript → dist/)
npm run build --workspace=backend
# Artefact : backend/dist/ (tous les handlers compilés)

# 5. Build frontend (Vite → dist/)
npm run build --workspace=frontend
# Artefact : frontend/dist/ (SPA, ~2 MB gzippé)

# 6. Vérifier les artefacts
ls backend/dist/src/handlers/*.js | wc -l
# Attendu : ~32 fichiers (un par handler)

ls frontend/dist/
# Attendu : index.html, assets/

# 7. Packager le backend pour deployment zip
cd backend
zip -r $PWD/../backend-deploy.zip dist/ node_modules/ host.json package.json
cd ..

ls -lh backend-deploy.zip
# Taille attendue : 20–60 MB selon les dépendances
```

---

## 7. Tests avant mise en production

### Tests unitaires backend

```bash
npm run test --workspace=backend
# Attendu : ~132 tests passés, 0 failed
# Couverture : handlers, repository Cosmos DB (mocks vi.mock()), http utils
```

### Tests unitaires frontend

```bash
npm run test --workspace=frontend
# Attendu : ~134 tests passés, 0 failed
# Couverture : auth (MSAL), hooks React Query, composants UI
```

### Critères d'acceptation avant déploiement

| Critère | Commande | Résultat requis |
|---|---|---|
| TypeScript | `npm run typecheck --workspaces` | 0 erreur |
| Lint | `npm run lint` | 0 erreur |
| Tests backend | `npm run test --workspace=backend` | 0 failed |
| Tests frontend | `npm run test --workspace=frontend` | 0 failed |
| Build backend | `npm run build --workspace=backend` | `exit 0` |
| Build frontend | `npm run build --workspace=frontend` | `exit 0` |
| Validate Bicep | `az deployment group validate ...` | `"provisioningState": "Succeeded"` |

> ⚠️ **ATTENTION** : Les tests E2E Playwright (`npm run test:e2e --workspace=frontend`) nécessitent un backend déployé et des comptes Entra créés. Ils ne peuvent pas passer localement contre un backend non déployé. Les lancer uniquement **après** déploiement sur dev.

---

## 8. Déploiement sur Azure

### 8.1 Déployer les Function Apps

```bash
# clos-api (29 handlers HTTP)
az functionapp deployment source config-zip \
  --resource-group rg-clos-bon-accueil-dev \
  --name clos-api-dev \
  --src backend-deploy.zip

# clos-jobs (notification-dispatcher, reconciliation-job, auth-post-confirmation)
az functionapp deployment source config-zip \
  --resource-group rg-clos-bon-accueil-dev \
  --name clos-jobs-dev \
  --src backend-deploy.zip

# Vérifier que les apps sont Running
az functionapp show \
  --resource-group rg-clos-bon-accueil-dev \
  --name clos-api-dev \
  --query "{state:state, defaultHostName:defaultHostName}" \
  --output table
```

### 8.2 Déployer le frontend (SPA → Blob $web)

```bash
# Upload de tous les fichiers statiques
az storage blob upload-batch \
  --destination '$web' \
  --account-name closstoragedev \
  --source frontend/dist \
  --overwrite \
  --auth-mode login

# Vérifier
az storage blob list \
  --container-name '$web' \
  --account-name closstoragedev \
  --auth-mode login \
  --query "[].name" \
  --output tsv | head -10
```

### 8.3 Injecter config.json

Le frontend charge `/config.json` au démarrage pour récupérer `apiBaseUrl`, `tenantId`, `clientId`, `cdnDomain`, `stage`.

```bash
jq -n \
  --arg apiBaseUrl "https://api.dev.clos-bon-accueil.fr/v1" \
  --arg tenantId "${ENTRA_TENANT_ID}" \
  --arg clientId "${ENTRA_CLIENT_ID}" \
  --arg cdnDomain "cdn.dev.clos-bon-accueil.fr" \
  --arg stage "dev" \
  '{apiBaseUrl: $apiBaseUrl, tenantId: $tenantId, clientId: $clientId, cdnDomain: $cdnDomain, stage: $stage}' \
  > /tmp/config.json

cat /tmp/config.json  # Vérifier le contenu avant upload

az storage blob upload \
  --container-name '$web' \
  --account-name closstoragedev \
  --name config.json \
  --file /tmp/config.json \
  --overwrite \
  --auth-mode login
```

### 8.4 Purger le cache CDN

```bash
az cdn endpoint purge \
  --resource-group rg-clos-bon-accueil-dev \
  --profile-name clos-cdn-dev \
  --name clos-cdn-web-dev \
  --content-paths '/*'

# Vérifier l'état du CDN endpoint
az cdn endpoint show \
  --resource-group rg-clos-bon-accueil-dev \
  --profile-name clos-cdn-dev \
  --name clos-cdn-web-dev \
  --query "{hostName:hostName, resourceState:resourceState}" \
  --output table
```

---

## 9. Configuration DNS et HTTPS

### 9.1 Récupérer les hostnames Azure

```bash
# CDN SPA (frontend)
az cdn endpoint show \
  --resource-group rg-clos-bon-accueil-dev \
  --profile-name clos-cdn-dev \
  --name clos-cdn-web-dev \
  --query "hostName" -o tsv
# Ex: clos-cdn-web-dev.azureedge.net

# APIM gateway
az apim show \
  --resource-group rg-clos-bon-accueil-dev \
  --name clos-apim-dev \
  --query "gatewayUrl" -o tsv
# Ex: clos-apim-dev.azure-api.net

# CDN Photos
az cdn endpoint show \
  --resource-group rg-clos-bon-accueil-dev \
  --profile-name clos-cdn-dev \
  --name clos-cdn-photos-dev \
  --query "hostName" -o tsv
```

### 9.2 Configurer les enregistrements DNS

Chez ton registrar DNS, créer ces enregistrements CNAME :

| Sous-domaine | Type | Valeur |
|---|---|---|
| `dev.clos-bon-accueil.fr` | CNAME | `clos-cdn-web-dev.azureedge.net` |
| `api.dev.clos-bon-accueil.fr` | CNAME | `clos-apim-dev.azure-api.net` |
| `cdn.dev.clos-bon-accueil.fr` | CNAME | `clos-cdn-photos-dev.azureedge.net` |

Pour prod :

| Sous-domaine | Type | Valeur |
|---|---|---|
| `www.clos-bon-accueil.fr` | CNAME | `clos-cdn-web-prod.azureedge.net` |
| `api.clos-bon-accueil.fr` | CNAME | `clos-apim-prod.azure-api.net` |
| `cdn.clos-bon-accueil.fr` | CNAME | `clos-cdn-photos-prod.azureedge.net` |

### 9.3 Activer les domaines custom et TLS sur CDN

```bash
# SPA frontend dev
az cdn custom-domain create \
  --resource-group rg-clos-bon-accueil-dev \
  --profile-name clos-cdn-dev \
  --endpoint-name clos-cdn-web-dev \
  --name clos-web-custom-dev \
  --hostname dev.clos-bon-accueil.fr

# Activer HTTPS managé par Azure (certificat Let's Encrypt automatique)
az cdn custom-domain enable-https \
  --resource-group rg-clos-bon-accueil-dev \
  --profile-name clos-cdn-dev \
  --endpoint-name clos-cdn-web-dev \
  --name clos-web-custom-dev

# Photos CDN dev
az cdn custom-domain create \
  --resource-group rg-clos-bon-accueil-dev \
  --profile-name clos-cdn-dev \
  --endpoint-name clos-cdn-photos-dev \
  --name clos-photos-custom-dev \
  --hostname cdn.dev.clos-bon-accueil.fr

az cdn custom-domain enable-https \
  --resource-group rg-clos-bon-accueil-dev \
  --profile-name clos-cdn-dev \
  --endpoint-name clos-cdn-photos-dev \
  --name clos-photos-custom-dev
```

> ⚠️ **ATTENTION** : La propagation du certificat TLS CDN prend **jusqu'à 8 heures**. L'application sera accessible en HTTP puis HTTPS sans interruption. Ne pas impatient — c'est normal.

### 9.4 Configurer le domaine custom APIM

```bash
# APIM Consumption avec domaine custom (nécessite un certificat)
# Option 1 : Certificat managé via Key Vault (recommandé)
az apim hostname configuration create \
  --resource-group rg-clos-bon-accueil-dev \
  --service-name clos-apim-dev \
  --hostname-configurations '[{
    "type": "Proxy",
    "hostName": "api.dev.clos-bon-accueil.fr",
    "certificateSource": "Managed"
  }]'
```

### 9.5 Vérifier TLS

```bash
# Après propagation DNS + certificat (~8h pour CDN, ~30min pour APIM)
curl -I https://dev.clos-bon-accueil.fr
# Attendu : HTTP/2 200, header strict-transport-security

curl -I https://api.dev.clos-bon-accueil.fr/v1/health
# Attendu : HTTP/2 200, {"status":"ok",...}
```

---

## 10. Seed des données initiales

```bash
# Seed sur dev (HouseConfig + Rooms + mock Bookings)
# Pré-requis : COSMOS_ENDPOINT et DefaultAzureCredential valides
export COSMOS_ENDPOINT=$(az cosmosdb show \
  --resource-group rg-clos-bon-accueil-dev \
  --name clos-cosmos-dev \
  --query documentEndpoint -o tsv)

export COSMOS_DATABASE=clos-bon-accueil
export COSMOS_CONTAINER=main
export STAGE=dev

npm run seed --workspace=backend -- --stage dev

# Sur prod : ne seed que HouseConfig (pas de mock bookings)
npm run seed --workspace=backend -- --stage prod
```

---

## 11. Vérifications post-déploiement

### 11.1 Health check

```bash
# Via APIM (route publique — no JWT requis en théorie)
curl https://api.dev.clos-bon-accueil.fr/v1/health
# Attendu : {"status":"ok","timestamp":"2026-05-29T...Z"}

# Directement sur la Function App (bypass APIM)
FUNC_HOST=$(az functionapp show \
  --resource-group rg-clos-bon-accueil-dev \
  --name clos-api-dev \
  --query defaultHostName -o tsv)

curl "https://${FUNC_HOST}/api/health"
# Attendu : même réponse
```

> ⚠️ **BUG CONNU** : La policy APIM de l'opération `health-get` appelle `<base />` en premier, ce qui exécute la validation JWT API-level. Le endpoint `/v1/health` peut donc retourner **401** si aucun token n'est fourni, contrairement à l'intention du handler. Tester directement sur la Function App (`/api/health`) comme smoke test fiable en attendant le correctif.

**Correctif recommandé** dans `infra/bicep/modules/api.bicep`, policy `apimHealthPolicy` :

```xml
<policies>
  <inbound>
    <!-- Ne pas appeler <base /> pour ne pas hériter de validate-jwt -->
    <rate-limit-by-key calls="100" renewal-period="1"
      counter-key="@(context.Request.IpAddress)"
      increment-condition="@(context.Response.StatusCode &lt; 500)" />
    <cors allow-credentials="false">
      <allowed-origins>...</allowed-origins>
    </cors>
  </inbound>
  <backend><base /></backend>
  <outbound><base /></outbound>
  <on-error><base /></on-error>
</policies>
```

### 11.2 Vérifier les routes essentielles (avec token)

```bash
# Obtenir un token via MSAL CLI (ou depuis le frontend en dev tools)
TOKEN="<bearer-token-depuis-le-navigateur>"

# Liste des chambres
curl -H "Authorization: Bearer ${TOKEN}" \
  https://api.dev.clos-bon-accueil.fr/v1/rooms
# Attendu : {"rooms":[...]}

# Config maison
curl -H "Authorization: Bearer ${TOKEN}" \
  https://api.dev.clos-bon-accueil.fr/v1/house
# Attendu : {"name":"Le Clos Bon Accueil",...}
```

### 11.3 Logs en temps réel

```bash
# Logs clos-api
az functionapp logs tail \
  --resource-group rg-clos-bon-accueil-dev \
  --name clos-api-dev

# Logs clos-jobs
az functionapp logs tail \
  --resource-group rg-clos-bon-accueil-dev \
  --name clos-jobs-dev
```

### 11.4 Vérifier Application Insights

```bash
# Récupérer l'ID de l'App Insights
APPINSIGHTS_ID=$(az monitor app-insights component show \
  --resource-group rg-clos-bon-accueil-dev \
  --app clos-insights-dev \
  --query id -o tsv)

# Dernières traces (nécessite az extension add --name application-insights)
az monitor app-insights query \
  --analytics-query "requests | order by timestamp desc | take 10 | project timestamp, name, resultCode, duration" \
  --ids $APPINSIGHTS_ID \
  --output table
```

### 11.5 Vérifier la Function App est bien peuplée

```bash
# Lister les fonctions déployées dans clos-api
az functionapp function list \
  --resource-group rg-clos-bon-accueil-dev \
  --name clos-api-dev \
  --query "[].name" \
  --output tsv | sort

# Attendu : ~29 fonctions (health, me-get, rooms-list, bookings-create, admin-*, ...)
```

---

## 12. Monitoring et alertes

### 12.1 Ressources de monitoring (créées par Bicep)

```bash
# Log Analytics Workspace
az monitor log-analytics workspace show \
  --resource-group rg-clos-bon-accueil-dev \
  --workspace-name clos-logs-dev \
  --query "{id:customerId, retentionDays:retentionInDays}" \
  --output table

# Application Insights
az monitor app-insights component show \
  --resource-group rg-clos-bon-accueil-dev \
  --app clos-insights-dev \
  --query "{connectionString:connectionString, instrumentationKey:instrumentationKey}" \
  --output table
```

### 12.2 Alertes Azure Monitor (créées par monitoring.bicep)

5 alertes sont préconfigurées :

| Alerte | Seuil | Fenêtre |
|---|---|---|
| Function errors | > 5 erreurs | 5 min |
| APIM 5XX | > 1% des requêtes | 10 min |
| Cosmos DB errors | > 0 | 5 min |
| BookingConflict | > 20 | 1 jour |
| ReconciliationConflicts | > 0 | 5 min |

Vérifier les alertes :

```bash
az monitor metrics alert list \
  --resource-group rg-clos-bon-accueil-dev \
  --query "[].{name:name, severity:severity, enabled:enabled}" \
  --output table
```

### 12.3 Requêtes KQL essentielles (Log Analytics)

```kusto
-- Erreurs des 24 dernières heures
traces
| where timestamp > ago(24h)
| where severityLevel >= 3
| summarize count() by bin(timestamp, 1h), message
| order by timestamp desc

-- Latence P95 par route
requests
| where timestamp > ago(1h)
| summarize p95=percentile(duration, 95) by name
| order by p95 desc

-- Conflits de réservation
customEvents
| where name == "BookingConflict"
| summarize count() by bin(timestamp, 1h)
```

Accès : Portail Azure → Log Analytics workspace `clos-logs-dev` → Logs.

---

## 13. CI/CD GitHub Actions (déploiements automatisés)

Une fois les secrets GitHub configurés (§3.5), les workflows tournent automatiquement.

### Workflow `pr.yml` — sur chaque Pull Request vers `main`

- Lint + TypeScript + tests unitaires
- `az deployment group validate` (Bicep dev)
- **Bloque le merge si l'un des checks échoue**

### Workflow `deploy-dev.yml` — sur merge dans `main`

```
build → deploy Bicep → deploy clos-api → deploy clos-jobs → upload SPA → config.json → purge CDN → E2E
```

URL de déploiement : `https://dev.clos-bon-accueil.fr`

### Workflow `deploy-prod.yml` — sur tag `v*.*.*`

```bash
# Déclencher un déploiement prod
git tag v1.0.0
git push origin v1.0.0
# → workflow démarre, attend approbation manuelle dans GitHub environment "production"
```

URL de déploiement : `https://www.clos-bon-accueil.fr`

### Workflow `e2e.yml` — appelé après deploy-dev et deploy-prod

Playwright teste 3 scénarios :
1. Guest : login → browse → create booking → my trips → cancel
2. Admin : login → dashboard → create room → delete room → KPIs
3. Conflict : create booking → booking conflit → vérify 409

Les rapports Playwright sont uploadés comme artefacts si les tests échouent.

---

## 14. Runbook incidents

### Redémarrer une Function App

```bash
az functionapp restart \
  --resource-group rg-clos-bon-accueil-prod \
  --name clos-api-prod

# Attendre ~30s puis vérifier
az functionapp show \
  --resource-group rg-clos-bon-accueil-prod \
  --name clos-api-prod \
  --query "state" -o tsv
# Attendu : Running
```

### Rollback vers le déploiement précédent

```bash
# Lister les déploiements disponibles
az functionapp deployment list \
  --resource-group rg-clos-bon-accueil-prod \
  --name clos-api-prod \
  --query "[0:5].{id:id, status:status, timestamp:lastSuccessEndTime}" \
  --output table

# Re-déployer un zip précédent (si conservé) ou re-tagger un commit précédent
# Option la plus sûre : re-pousser le tag sur le commit précédent
git tag -d v1.0.0
git tag v1.0.0 <hash-du-bon-commit>
git push --force origin v1.0.0
# → déclenche deploy-prod.yml
```

### Rollback Cosmos DB (PITR — prod uniquement)

```bash
# Identifier le point de restauration (prod uniquement — PITR activé)
az cosmosdb restorable-database-account list \
  --account-name clos-cosmos-prod \
  --query "[0].restoreParameters"

# Restaurer vers un nouveau compte Cosmos (le compte original reste actif)
az cosmosdb restore \
  --target-database-account-name clos-cosmos-prod-restored \
  --account-name clos-cosmos-prod \
  --resource-group rg-clos-bon-accueil-prod \
  --restore-timestamp "2026-05-29T12:00:00Z" \
  --location francecentral
```

> ⚠️ **ATTENTION** : La restauration PITR crée un **nouveau compte Cosmos**. Les Function Apps pointent toujours vers l'original. Pour basculer, mettre à jour `COSMOS_ENDPOINT` dans les app settings des deux Function Apps et les redémarrer.

### Cosmos DB inaccessible

```bash
# Vérifier le statut du compte
az cosmosdb show \
  --resource-group rg-clos-bon-accueil-prod \
  --name clos-cosmos-prod \
  --query "{state:publicNetworkAccess, status:provisioningState}" \
  --output table

# Vérifier les métriques d'erreurs Cosmos
az monitor metrics list \
  --resource /subscriptions/TON_SUBSCRIPTION_ID/resourceGroups/rg-clos-bon-accueil-prod/providers/Microsoft.DocumentDB/databaseAccounts/clos-cosmos-prod \
  --metric "TotalRequests" \
  --filter "StatusCode eq 503" \
  --interval PT5M \
  --output table

# Statut Azure : https://status.azure.com
```

### Purger le cache CDN manuellement

```bash
# Si le frontend affiche une version obsolète
az cdn endpoint purge \
  --resource-group rg-clos-bon-accueil-prod \
  --profile-name clos-cdn-prod \
  --name clos-cdn-web-prod \
  --content-paths '/*'
```

### Voir les logs d'erreur récents

```bash
# Logs Function App en temps réel
az functionapp logs tail \
  --resource-group rg-clos-bon-accueil-prod \
  --name clos-api-prod

# Erreurs dans App Insights (dernière heure)
az monitor app-insights query \
  --analytics-query "exceptions | where timestamp > ago(1h) | project timestamp, type, outerMessage, details | take 20" \
  --app clos-insights-prod \
  --resource-group rg-clos-bon-accueil-prod \
  --output table
```

### Liens utiles

| Ressource | URL |
|---|---|
| Statut Azure | https://status.azure.com |
| Portail Azure | https://portal.azure.com |
| App Insights (dev) | Portal → `clos-insights-dev` → Logs |
| APIM (dev) | Portal → `clos-apim-dev` → APIs |
| Cosmos DB (dev) | Portal → `clos-cosmos-dev` → Data Explorer |

---

## Récapitulatif — ordre de démarrage complet (première fois)

```
1. az group create × 2 (dev + prod)
2. Créer App Registration Entra External ID + App Roles
3. Créer Service Principal + Federated Credentials OIDC
4. Configurer 11 secrets GitHub
5. az deployment group create (Bicep dev)
6. az keyvault secret set × 3 (admin-email, email-from-address, acs-connection-string)
7. npm ci && npm run build --workspaces
8. Package backend-deploy.zip
9. az functionapp deployment source config-zip × 2 (clos-api-dev, clos-jobs-dev)
10. az storage blob upload-batch (frontend/dist → $web)
11. Upload config.json
12. az cdn endpoint purge
13. Configurer DNS CNAME × 3
14. az cdn custom-domain create + enable-https × 2
15. npm run seed -- --stage dev
16. Vérifications post-déploiement (§11)
17. Tests E2E Playwright
18. Répéter 5–17 pour prod
```
