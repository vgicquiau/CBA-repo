# Guide de mise en production — Le Clos Bon Accueil

**Stack** : Azure Functions v4 (Node.js 20) · Cosmos DB · APIM · Azure Front Door Standard · Entra External ID  
**Région** : `francecentral`  
**Stages** : `dev` (merge main) · `prod` (tag `v*.*.*` + approbation manuelle)  
**Dernière mise à jour** : 2026-06-01  
**Shell** : PowerShell 5.1+ (Windows 10/11)

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

```powershell
# Azure CLI — version minimale 2.60
az --version

# Bicep CLI (inclus dans az CLI >= 2.20, vérifier)
az bicep version

# Node.js 20
node --version   # doit afficher v20.x
```

### Installation (Windows)

```powershell
# Azure CLI
winget install Microsoft.AzureCLI
# ou télécharger l'installateur MSI : https://aka.ms/installazurecliwindows

# Bicep (après installation Azure CLI — fermer/rouvrir PowerShell d'abord)
az bicep install

# Node.js 20 LTS
winget install OpenJS.NodeJS.LTS
```

> **Note** : `curl.exe` est disponible nativement sur Windows 10/11. Ne pas utiliser `curl` sans `.exe` dans PowerShell — c'est un alias vers `Invoke-WebRequest` avec une syntaxe différente.

### Connexion Azure

```powershell
# Authentification interactive
az login

# Sélectionner la bonne subscription
az account set --subscription TON_SUBSCRIPTION_ID

# Vérifier
az account show --query "{name:name, id:id, state:state}"
```

### Variables d'environnement de référence

Ces valeurs sont utilisées tout au long du guide. Les définir dans PowerShell avant de commencer. **Toutes les commandes des sections suivantes s'appuient sur ces variables.**

```powershell
# Stage cible : 'dev' ou 'prod' — modifier en premier
$env:STAGE = 'dev'

# Resource group — dérivé de STAGE (à redéfinir si STAGE change)
$env:RG = "rg-clos-bon-accueil-$env:STAGE"

# Entra External ID — à remplir après §3.2
# Pour l'Option C (pas de droits Entra), utiliser des GUIDs neutres :
#   $env:ENTRA_TENANT_ID = '00000000-0000-0000-0000-000000000000'
#   $env:ENTRA_CLIENT_ID = '00000000-0000-0000-0000-000000000000'
$env:ENTRA_TENANT_ID = '<ton-entra-tenant-id>'
$env:ENTRA_CLIENT_ID = '<ton-entra-client-id>'

# Email admin pour alertes ops
$env:ADMIN_EMAIL = 'admin@clos-bon-accueil.fr'
```

> **Important** : `$env:RG` est évalué au moment de l'assignation. Si tu modifies `$env:STAGE`, réexécute immédiatement la ligne `$env:RG = ...` pour garder les deux synchronisés.

---

## 2. Checklist sécurité avant tout déploiement

```powershell
# Vérifier qu'aucun secret n'est dans le code
Get-ChildItem -Recurse -Filter '*.ts' backend/src/ |
  Select-String -Pattern 'AccountKey|password|secret|connectionString' |
  Where-Object { $_.Path -notmatch '\.test\.ts$' }
# Résultat attendu : aucune ligne

# Vérifier que local.settings.json n'est pas commité
git ls-files | Select-String 'local.settings.json'
# Résultat attendu : vide
```

> ✅ `local.settings.json` est dans le `.gitignore` (ligne 16). Ce fichier peut contenir des connection strings — ne jamais le commiter.

```powershell
# Vérifier .gitignore
Select-String 'local.settings.json' .gitignore
# Attendu : local.settings.json

# Vérifier que frontend/dist n'est pas commité
git ls-files frontend/dist/
# Résultat attendu : vide (frontend/dist est dans .gitignore)

# Vérifier que node_modules n'est pas commité
git ls-files --error-unmatch node_modules 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host 'OK — node_modules absent du repo' }
```

---

## 3. Bootstrap — actions manuelles une seule fois

Ces étapes ne sont faites **qu'une fois** par stage, avant tout déploiement Bicep.

### 3.1 Créer les Resource Groups

```powershell
# Les deux resource groups sont créés une seule fois — commandes explicites intentionnelles
az group create `
  --name rg-clos-bon-accueil-dev `
  --location francecentral `
  --tags project=clos-bon-accueil stage=dev

az group create `
  --name rg-clos-bon-accueil-prod `
  --location francecentral `
  --tags project=clos-bon-accueil stage=prod
```

### 3.2 Créer l'App Registration Entra External ID

> ⚠️ **ATTENTION** : Cette étape nécessite un tenant Entra External ID. Créer le tenant via le portail Azure si ce n'est pas déjà fait : **Azure Active Directory External Identities → Create external tenant**.

```powershell
# Récupérer le tenant ID Entra External ID
az account tenant list

# Créer l'app registration
az ad app create `
  --display-name 'Le Clos Bon Accueil' `
  --sign-in-audience AzureADMyOrg `
  --web-redirect-uris `
    'http://localhost:5173' `
    'https://dev.clos-bon-accueil.fr' `
    'https://www.clos-bon-accueil.fr'

# Récupérer le client ID et le stocker dans les variables de session
$env:ENTRA_CLIENT_ID = (az ad app list --display-name 'Le Clos Bon Accueil' --query '[0].appId' -o tsv)
$env:ENTRA_TENANT_ID = '<tenant-id-entra>'

# Créer les App Roles (admin / guest)
# Via le portail : App Registration → App Roles → Create App Role
# Role 'admin': allowedMemberTypes = User, value = admin
# Role 'guest': allowedMemberTypes = User, value = guest
```

> ⚠️ **ATTENTION** : Les App Roles (`admin`, `guest`) doivent être créés dans l'App Registration Entra. Sans App Roles configurés, les routes admin renverront 403.

### 3.3 Créer le Service Principal pour GitHub Actions (OIDC)

```powershell
az ad sp create-for-rbac `
  --name 'sp-clos-bon-accueil-cicd' `
  --role Contributor `
  --scopes `
    /subscriptions/TON_SUBSCRIPTION_ID/resourceGroups/rg-clos-bon-accueil-dev `
    /subscriptions/TON_SUBSCRIPTION_ID/resourceGroups/rg-clos-bon-accueil-prod

# Sauvegarder la sortie — elle contient clientId, clientSecret, tenantId
# clientId → secret GitHub AZURE_CLIENT_ID
# tenantId → secret GitHub AZURE_TENANT_ID
# subscriptionId → secret GitHub AZURE_SUBSCRIPTION_ID
```

### 3.4 Configurer le Federated Credential (OIDC — pas de secret rotatif)

```powershell
$SP_OBJECT_ID = (az ad sp list --display-name 'sp-clos-bon-accueil-cicd' --query '[0].id' -o tsv)

az ad app federated-credential create `
  --id $SP_OBJECT_ID `
  --parameters @'
{
  "name": "github-deploy-dev",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:TON_ORG/TON_REPO:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}
'@

az ad app federated-credential create `
  --id $SP_OBJECT_ID `
  --parameters @'
{
  "name": "github-deploy-prod",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:TON_ORG/TON_REPO:ref:refs/tags/v*",
  "audiences": ["api://AzureADTokenExchange"]
}
'@

az ad app federated-credential create `
  --id $SP_OBJECT_ID `
  --parameters @'
{
  "name": "github-pr",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:TON_ORG/TON_REPO:pull_request",
  "audiences": ["api://AzureADTokenExchange"]
}
'@
```

### 3.5 Configurer les secrets GitHub

Dans le repo GitHub → Settings → Secrets and variables → Actions :

```
AZURE_CLIENT_ID          → clientId du service principal (§3.3)
AZURE_TENANT_ID          → tenantId Azure
AZURE_SUBSCRIPTION_ID    → ID de la subscription Azure
ENTRA_TENANT_ID          → $env:ENTRA_TENANT_ID (§3.2)
ENTRA_CLIENT_ID          → $env:ENTRA_CLIENT_ID (§3.2)
ADMIN_EMAIL_DEV          → email pour alertes ops dev
ADMIN_EMAIL_PROD         → email pour alertes ops prod
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

```powershell
az deployment group validate `
  --resource-group $env:RG `
  --template-file infra/bicep/main.bicep `
  --parameters "infra/bicep/parameters/$env:STAGE.bicepparam" `
  --parameters tenantId="$env:ENTRA_TENANT_ID" clientId="$env:ENTRA_CLIENT_ID"
```

### 4.2 Déployer

```powershell
az deployment group create `
  --resource-group $env:RG `
  --template-file infra/bicep/main.bicep `
  --parameters "infra/bicep/parameters/$env:STAGE.bicepparam" `
  --parameters `
    tenantId="$env:ENTRA_TENANT_ID" `
    clientId="$env:ENTRA_CLIENT_ID" `
    adminEmail="$env:ADMIN_EMAIL" `
  --name "deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
```

> Pour déployer sur prod : changer `$env:STAGE = 'prod'` et `$env:RG = "rg-clos-bon-accueil-prod"` (§1), puis relancer.

**Ordre de déploiement interne (géré par Bicep `dependsOn`) :**

```
App Configuration + Key Vault (main.bicep)
  ├── data.bicep         → Cosmos DB, Blob Storage
  ├── auth.bicep         → App Configuration entries (tenantId, clientId)
  ├── monitoring.bicep   → Log Analytics, App Insights, Alertes
  ├── notifications.bicep→ Service Bus, ACS Email, clos-jobs Function App
  ├── api.bicep          → clos-api Function App, APIM
  ├── waf.bicep          → Azure Front Door Standard, WAF Policy
  └── frontend.bicep     → App Configuration (frontend config)
```

### 4.3 Vérifier les ressources créées

```powershell
az resource list `
  --resource-group $env:RG `
  --query '[].{name:name, type:type, location:location}' `
  --output table
```

Résultat attendu (≈20 ressources) :

```
clos-appconfig-{stage}      Microsoft.AppConfiguration/configurationStores
clos-kv-{stage}             Microsoft.KeyVault/vaults
clos-cosmos-{stage}         Microsoft.DocumentDB/databaseAccounts
closstorage{stage}          Microsoft.Storage/storageAccounts
closapifn{stage}            Microsoft.Storage/storageAccounts     (Function App storage)
clos-api-plan-{stage}       Microsoft.Web/serverfarms
clos-api-{stage}            Microsoft.Web/sites
clos-jobs-plan-{stage}      Microsoft.Web/serverfarms
clos-jobs-{stage}           Microsoft.Web/sites
clos-apim-{stage}           Microsoft.ApiManagement/service
clos-servicebus-{stage}     Microsoft.ServiceBus/namespaces
clos-afd-{stage}            Microsoft.Cdn/profiles               (Front Door Standard)
closWaf{stage}              Microsoft.Network/frontDoorWebApplicationFirewallPolicies
clos-logs-{stage}           Microsoft.OperationalInsights/workspaces
clos-insights-{stage}       Microsoft.Insights/components
```

---

## 5. Secrets post-déploiement (Key Vault)

> Ces secrets doivent être posés **après** le premier déploiement Bicep (Key Vault existant), **avant** le déploiement des Function Apps.

```powershell
# Email expéditeur ACS (doit correspondre au domaine vérifié dans ACS)
az keyvault secret set `
  --vault-name "clos-kv-$env:STAGE" `
  --name email-from-address `
  --value 'noreply@clos-bon-accueil.fr'

# Email admin pour les notifications métier
az keyvault secret set `
  --vault-name "clos-kv-$env:STAGE" `
  --name admin-email `
  --value $env:ADMIN_EMAIL
```

> ⚠️ **ATTENTION** : Les Function Apps `clos-api` et `clos-jobs` lisent ces secrets via Key Vault references dans leurs app settings. Si les secrets sont absents, les apps démarrent mais les features email échouent silencieusement. Vérifier dans App Insights.

### Configurer Azure Communication Services (ACS)

```powershell
# Créer la ressource ACS (si non créée par Bicep)
az communication create `
  --name "clos-acs-$env:STAGE" `
  --resource-group $env:RG `
  --location global `
  --data-location europe

# Récupérer la connection string ACS
az communication list-key `
  --name "clos-acs-$env:STAGE" `
  --resource-group $env:RG `
  --query primaryConnectionString -o tsv

# Stocker dans Key Vault
az keyvault secret set `
  --vault-name "clos-kv-$env:STAGE" `
  --name acs-connection-string `
  --value '<connection-string-ci-dessus>'
```

---

## 6. Build de production

```powershell
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
(Get-ChildItem backend/dist/src/handlers/*.js).Count
# Attendu : ~32 fichiers (un par handler)

Get-ChildItem frontend/dist/
# Attendu : index.html, assets/

# 7. Packager le backend pour deployment zip
Push-Location backend
Compress-Archive `
  -Path dist, node_modules, host.json, package.json `
  -DestinationPath ..\backend-deploy.zip `
  -Force
Pop-Location

Get-Item backend-deploy.zip | Select-Object Name, @{N='Taille';E={'{0:N1} MB' -f ($_.Length / 1MB)}}
# Taille attendue : 20–60 MB selon les dépendances
```

---

## 7. Tests avant mise en production

### Tests unitaires backend

```powershell
npm run test --workspace=backend
# Attendu : ~132 tests passés, 0 failed
```

### Tests unitaires frontend

```powershell
npm run test --workspace=frontend
# Attendu : ~134 tests passés, 0 failed
```

### Critères d'acceptation avant déploiement

| Critère | Commande | Résultat requis |
|---|---|---|
| TypeScript | `npm run typecheck --workspaces` | 0 erreur |
| Lint | `npm run lint` | 0 erreur |
| Tests backend | `npm run test --workspace=backend` | 0 failed |
| Tests frontend | `npm run test --workspace=frontend` | 0 failed |
| Build backend | `npm run build --workspace=backend` | exit 0 |
| Build frontend | `npm run build --workspace=frontend` | exit 0 |
| Validate Bicep | `az deployment group validate ...` | `"provisioningState": "Succeeded"` |

> ⚠️ **ATTENTION** : Les tests E2E Playwright (`npm run test:e2e --workspace=frontend`) nécessitent un backend déployé et des comptes Entra créés. Les lancer uniquement **après** déploiement sur dev.

---

## 8. Déploiement sur Azure

### 8.1 Déployer les Function Apps

```powershell
az functionapp deployment source config-zip `
  --resource-group $env:RG `
  --name "clos-api-$env:STAGE" `
  --src backend-deploy.zip

az functionapp deployment source config-zip `
  --resource-group $env:RG `
  --name "clos-jobs-$env:STAGE" `
  --src backend-deploy.zip

# Vérifier que les apps sont Running
az functionapp show `
  --resource-group $env:RG `
  --name "clos-api-$env:STAGE" `
  --query '{state:state, defaultHostName:defaultHostName}' `
  --output table
```

### 8.2 Déployer le frontend (SPA → Blob $web)

```powershell
# Upload de tous les fichiers statiques
az storage blob upload-batch `
  --destination '$web' `
  --account-name "closstorage$env:STAGE" `
  --source frontend/dist `
  --overwrite `
  --auth-mode login

# Activer le static website hosting (requis pour servir index.html sur toutes les routes)
az storage blob service-properties update `
  --account-name "closstorage$env:STAGE" `
  --static-website true `
  --index-document index.html `
  --404-document index.html `
  --auth-mode login

# Vérifier
az storage blob list `
  --container-name '$web' `
  --account-name "closstorage$env:STAGE" `
  --auth-mode login `
  --query '[].name' `
  --output tsv | Select-Object -First 10
```

### 8.3 Injecter config.json

Le frontend charge `/config.json` au démarrage pour récupérer `apiBaseUrl`, `tenantId`, `clientId`, `cdnDomain`, `stage`.

```powershell
$config = [ordered]@{
    apiBaseUrl = "https://api.$env:STAGE.clos-bon-accueil.fr/v1"
    tenantId   = $env:ENTRA_TENANT_ID
    clientId   = $env:ENTRA_CLIENT_ID
    cdnDomain  = "cdn.$env:STAGE.clos-bon-accueil.fr"
    stage      = $env:STAGE
} | ConvertTo-Json
$configPath = "$env:TEMP\config.json"
$config | Out-File -FilePath $configPath -Encoding utf8

Get-Content $configPath  # Vérifier le contenu avant upload

az storage blob upload `
  --container-name '$web' `
  --account-name "closstorage$env:STAGE" `
  --name config.json `
  --file $configPath `
  --overwrite `
  --auth-mode login
```

> **Note prod** : Pour prod `apiBaseUrl` = `https://api.clos-bon-accueil.fr/v1` et `cdnDomain` = `cdn.clos-bon-accueil.fr`. Ajuster le bloc `$config` si les sous-domaines ne suivent pas le pattern `{service}.{stage}.clos-bon-accueil.fr`.

---

## 9. Configuration DNS et HTTPS

### 9.1 Récupérer les hostnames Azure

```powershell
# Front Door endpoint (APIM + WAF)
az afd endpoint show `
  --resource-group $env:RG `
  --profile-name "clos-afd-$env:STAGE" `
  --endpoint-name "clos-api-$env:STAGE" `
  --query 'hostName' -o tsv
# Ex: clos-api-dev.z01.azurefd.net

# APIM gateway (accès direct sans Front Door)
az apim show `
  --resource-group $env:RG `
  --name "clos-apim-$env:STAGE" `
  --query 'gatewayUrl' -o tsv
# Ex: clos-apim-dev.azure-api.net

# Blob web endpoint (SPA — actif après §8.2 static website)
az storage account show `
  --resource-group $env:RG `
  --name "closstorage$env:STAGE" `
  --query 'primaryEndpoints.web' -o tsv
# Ex: https://closstoragedev.z28.web.core.windows.net/
```

### 9.2 Configurer les enregistrements DNS

Chez ton registrar DNS, créer ces enregistrements CNAME :

| Sous-domaine | Type | Valeur |
|---|---|---|
| `{stage}.clos-bon-accueil.fr` | CNAME | hostname blob web (§9.1) |
| `api.{stage}.clos-bon-accueil.fr` | CNAME | `clos-apim-{stage}.azure-api.net` |

Pour prod (`{stage}` = `www`) :

| Sous-domaine | Type | Valeur |
|---|---|---|
| `www.clos-bon-accueil.fr` | CNAME | hostname blob web prod (§9.1) |
| `api.clos-bon-accueil.fr` | CNAME | `clos-apim-prod.azure-api.net` |

### 9.3 Configurer le domaine custom APIM

```powershell
az apim hostname configuration create `
  --resource-group $env:RG `
  --service-name "clos-apim-$env:STAGE" `
  --hostname-configurations '[{
    "type": "Proxy",
    "hostName": "api.'$env:STAGE'.clos-bon-accueil.fr",
    "certificateSource": "Managed"
  }]'
```

### 9.4 Vérifier TLS

```powershell
# Après propagation DNS + certificat (~30 min pour APIM)
curl.exe -I "https://api.$env:STAGE.clos-bon-accueil.fr/v1/health"
# Attendu : HTTP/2 200, {"status":"ok",...}
```

---

## 10. Seed des données initiales

```powershell
# Pré-requis : DefaultAzureCredential valide (az login effectué)
$env:COSMOS_ENDPOINT = (az cosmosdb show `
  --resource-group $env:RG `
  --name "clos-cosmos-$env:STAGE" `
  --query documentEndpoint -o tsv)

$env:COSMOS_DATABASE = 'clos-bon-accueil'
$env:COSMOS_CONTAINER = 'main'

npm run seed --workspace=backend -- --stage $env:STAGE
# Sur prod : seed HouseConfig uniquement (pas de mock bookings)
```

---

## 11. Vérifications post-déploiement

### 11.1 Health check

```powershell
# Directement sur la Function App (bypass APIM — aucun token requis)
$FUNC_HOST = (az functionapp show `
  --resource-group $env:RG `
  --name "clos-api-$env:STAGE" `
  --query defaultHostName -o tsv)

curl.exe "https://$FUNC_HOST/api/health"
# Attendu : {"status":"ok","timestamp":"...Z"}

# Via APIM (nécessite que le DNS soit configuré — §9)
curl.exe "https://api.$env:STAGE.clos-bon-accueil.fr/v1/health"
```

> ✅ **Corrigé (SEV-004)** : La policy `health-get` n'hérite plus de `validate-jwt`. `GET /v1/health` est anonyme, aucun token requis.

### 11.2 Vérifier les routes essentielles (avec token)

```powershell
# Obtenir un token depuis le frontend (F12 → Network tab)
$env:TOKEN = '<bearer-token-depuis-le-navigateur>'

# Liste des chambres
curl.exe -H "Authorization: Bearer $env:TOKEN" `
  "https://api.$env:STAGE.clos-bon-accueil.fr/v1/rooms"
# Attendu : {"rooms":[...]}

# Config maison
curl.exe -H "Authorization: Bearer $env:TOKEN" `
  "https://api.$env:STAGE.clos-bon-accueil.fr/v1/house"
# Attendu : {"name":"Le Clos Bon Accueil",...}
```

### 11.3 Logs en temps réel

```powershell
az functionapp logs tail `
  --resource-group $env:RG `
  --name "clos-api-$env:STAGE"

az functionapp logs tail `
  --resource-group $env:RG `
  --name "clos-jobs-$env:STAGE"
```

### 11.4 Vérifier Application Insights

```powershell
$APPINSIGHTS_ID = (az monitor app-insights component show `
  --resource-group $env:RG `
  --app "clos-insights-$env:STAGE" `
  --query id -o tsv)

# Dernières traces (nécessite az extension add --name application-insights)
az monitor app-insights query `
  --analytics-query 'requests | order by timestamp desc | take 10 | project timestamp, name, resultCode, duration' `
  --ids $APPINSIGHTS_ID `
  --output table
```

### 11.5 Vérifier la Function App est bien peuplée

```powershell
az functionapp function list `
  --resource-group $env:RG `
  --name "clos-api-$env:STAGE" `
  --query '[].name' `
  --output tsv | Sort-Object
# Attendu : ~29 fonctions (health, me-get, rooms-list, bookings-create, admin-*, ...)
```

---

## 12. Monitoring et alertes

### 12.1 Ressources de monitoring (créées par Bicep)

```powershell
az monitor log-analytics workspace show `
  --resource-group $env:RG `
  --workspace-name "clos-logs-$env:STAGE" `
  --query '{id:customerId, retentionDays:retentionInDays}' `
  --output table

az monitor app-insights component show `
  --resource-group $env:RG `
  --app "clos-insights-$env:STAGE" `
  --query '{connectionString:connectionString, instrumentationKey:instrumentationKey}' `
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

```powershell
az monitor metrics alert list `
  --resource-group $env:RG `
  --query '[].{name:name, severity:severity, enabled:enabled}' `
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

Accès : Portail Azure → Log Analytics workspace `clos-logs-{stage}` → Logs.

---

## 13. CI/CD GitHub Actions (déploiements automatisés)

Une fois les secrets GitHub configurés (§3.5), les workflows tournent automatiquement.

### Workflow `pr.yml` — sur chaque Pull Request vers `main`

- Lint + TypeScript + tests unitaires + CodeQL + `npm audit`
- `az deployment group validate` (Bicep dev)
- **Bloque le merge si l'un des checks échoue**

### Workflow `deploy-dev.yml` — sur merge dans `main`

```
build → deploy Bicep → deploy clos-api → deploy clos-jobs → upload SPA → config.json → E2E
```

URL de déploiement : `https://dev.clos-bon-accueil.fr`

### Workflow `deploy-prod.yml` — sur tag `v*.*.*`

```powershell
git tag v1.0.0
git push origin v1.0.0
# → workflow démarre, attend approbation manuelle dans GitHub environment "production"
```

URL de déploiement : `https://www.clos-bon-accueil.fr`

### Workflow `e2e.yml` — appelé après deploy-dev et deploy-prod

Playwright teste 3 scénarios :
1. Guest : login → browse → create booking → my trips → cancel
2. Admin : login → dashboard → create room → delete room → KPIs
3. Conflict : create booking → booking conflit → vérifier 409

Les rapports Playwright sont uploadés comme artefacts si les tests échouent.

---

## 14. Runbook incidents

> Ces commandes ciblent généralement prod. Configurer les variables avant d'exécuter :
> ```powershell
> $env:STAGE = 'prod'
> $env:RG = "rg-clos-bon-accueil-$env:STAGE"
> ```

### Redémarrer une Function App

```powershell
az functionapp restart `
  --resource-group $env:RG `
  --name "clos-api-$env:STAGE"

# Attendre ~30s puis vérifier
az functionapp show `
  --resource-group $env:RG `
  --name "clos-api-$env:STAGE" `
  --query 'state' -o tsv
# Attendu : Running
```

### Rollback vers le déploiement précédent

```powershell
az functionapp deployment list `
  --resource-group $env:RG `
  --name "clos-api-$env:STAGE" `
  --query '[0:5].{id:id, status:status, timestamp:lastSuccessEndTime}' `
  --output table

# Option la plus sûre : re-pousser le tag sur le commit précédent
git tag -d v1.0.0
git tag v1.0.0 <hash-du-bon-commit>
git push --force origin v1.0.0
# → déclenche deploy-prod.yml
```

### Rollback Cosmos DB (PITR — prod uniquement)

```powershell
az cosmosdb restorable-database-account list `
  --account-name "clos-cosmos-$env:STAGE" `
  --query '[0].restoreParameters'

az cosmosdb restore `
  --target-database-account-name "clos-cosmos-$env:STAGE-restored" `
  --account-name "clos-cosmos-$env:STAGE" `
  --resource-group $env:RG `
  --restore-timestamp '2026-06-01T12:00:00Z' `
  --location francecentral
```

> ⚠️ **ATTENTION** : La restauration PITR crée un **nouveau compte Cosmos**. Pour basculer, mettre à jour `COSMOS_ENDPOINT` dans les app settings des deux Function Apps et les redémarrer.

### Cosmos DB inaccessible

```powershell
az cosmosdb show `
  --resource-group $env:RG `
  --name "clos-cosmos-$env:STAGE" `
  --query '{state:publicNetworkAccess, status:provisioningState}' `
  --output table

$COSMOS_ID = (az cosmosdb show `
  --resource-group $env:RG `
  --name "clos-cosmos-$env:STAGE" `
  --query id -o tsv)

az monitor metrics list `
  --resource $COSMOS_ID `
  --metric 'TotalRequests' `
  --filter 'StatusCode eq 503' `
  --interval PT5M `
  --output table
```

### Voir les logs d'erreur récents

```powershell
az functionapp logs tail `
  --resource-group $env:RG `
  --name "clos-api-$env:STAGE"

az monitor app-insights query `
  --analytics-query 'exceptions | where timestamp > ago(1h) | project timestamp, type, outerMessage, details | take 20' `
  --app "clos-insights-$env:STAGE" `
  --resource-group $env:RG `
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

```powershell
# 0. Définir les variables (§1)
$env:STAGE = 'dev'
$env:RG = "rg-clos-bon-accueil-$env:STAGE"
$env:ENTRA_TENANT_ID = '<valeur>'
$env:ENTRA_CLIENT_ID = '<valeur>'
$env:ADMIN_EMAIL = 'admin@clos-bon-accueil.fr'
```

```
1.  az group create × 2 (dev + prod — §3.1)
2.  Créer App Registration Entra + App Roles → $env:ENTRA_* (§3.2)
3.  Créer Service Principal + Federated Credentials OIDC (§3.3–3.4)
4.  Configurer 11 secrets GitHub (§3.5)
5.  az deployment group create ($env:RG, $env:STAGE — §4.2)
6.  az keyvault secret set × 3 (§5)
7.  npm ci && npm run build --workspaces (§6)
8.  Compress-Archive → backend-deploy.zip (§6)
9.  az functionapp deployment source config-zip × 2 (§8.1)
10. az storage blob upload-batch + --static-website true (§8.2)
11. ConvertTo-Json + az storage blob upload config.json (§8.3)
12. Configurer DNS CNAME (§9.2)
13. npm run seed -- --stage $env:STAGE (§10)
14. Vérifications post-déploiement (§11)
15. Tests E2E Playwright
16. Répéter 5–15 pour prod ($env:STAGE = 'prod', $env:RG = ...)
```
