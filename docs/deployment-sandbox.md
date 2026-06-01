# Déploiement sandbox — Guide autonome

Cible : compte Azure restreint avec Contributor + Key Vault Administrator + RBAC Administrator
scopés sur `rg-sp4-d-vgi-azu-vgi-sandbox-txt` (subscription `07875763-82ff-4808-a7da-e3d0dccc86fc`).

## Prérequis

```powershell
az login
az account set --subscription 07875763-82ff-4808-a7da-e3d0dccc86fc
az account show  # vérifier que la subscription est correcte
```

Vérifier que Bicep CLI est à jour :
```powershell
az bicep upgrade
az bicep version  # doit être >= 0.25
```

## Étape 1 — Validation

```powershell
az deployment group validate `
  --resource-group rg-sp4-d-vgi-azu-vgi-sandbox-txt `
  --template-file infra/bicep/main.bicep `
  --parameters infra/bicep/parameters/dev.bicepparam
```

En cas d'erreur `BCP`, corriger le template. En cas d'erreur ARM, vérifier les quotas et providers.

## Étape 2 — Déploiement

```powershell
az deployment group create `
  --resource-group rg-sp4-d-vgi-azu-vgi-sandbox-txt `
  --template-file infra/bicep/main.bicep `
  --parameters infra/bicep/parameters/dev.bicepparam `
  --name clos-deploy-$(Get-Date -Format 'yyyyMMdd-HHmm')
```

Durée estimée : 15–25 minutes (APIM Consumption est lent à provisionner).

## Étape 3 — Étapes manuelles post-deploy

### 3a. Poser les secrets dans Key Vault

```powershell
az keyvault secret set `
  --vault-name clos-kv-dev-vgi `
  --name admin-email `
  --value gicquiau.vincent@gmail.com

az keyvault secret set `
  --vault-name clos-kv-dev-vgi `
  --name email-from-address `
  --value noreply@placeholder.fr
```

### 3b. Activer le static website sur le Storage Account

ARM ne peut pas activer cette propriété — à faire en CLI :

```powershell
az storage blob service-properties update `
  --account-name closstoragedevvgi `
  --static-website true `
  --index-document index.html `
  --404-document index.html `
  --auth-mode login
```

### 3c. Récupérer les URLs réelles et mettre à jour dev.bicepparam

```powershell
# APIM gateway URL
az apim show `
  --resource-group rg-sp4-d-vgi-azu-vgi-sandbox-txt `
  --name clos-apim-dev-vgi `
  --query properties.gatewayUrl -o tsv

# Storage web endpoint (SPA)
az storage account show `
  --resource-group rg-sp4-d-vgi-azu-vgi-sandbox-txt `
  --name closstoragedevvgi `
  --query primaryEndpoints.web -o tsv
```

Mettre à jour `infra/bicep/parameters/dev.bicepparam` :
```bicep
param domain = '<storage-web-endpoint>'          // ex: https://closstoragedevvgi.z28.web.core.windows.net/
param apiDomain = '<apim-gateway-url>'           // ex: clos-apim-dev-vgi.azure-api.net
param cdnDomain = '<storage-web-endpoint>'       // même valeur que domain en sandbox
```

Relancer `az deployment group create` pour propager les URLs dans App Configuration.

## Étape 4 — Déployer le code des Function Apps

```powershell
# Build
npm run build --workspace=shared-types

# Déployer clos-api
cd backend
func azure functionapp publish clos-api-dev-vgi --typescript

# Déployer clos-jobs
func azure functionapp publish clos-jobs-dev-vgi --typescript
cd ..
```

Prérequis : Azure Functions Core Tools v4 (`npm install -g azure-functions-core-tools@4`).

## Étape 5 — Déployer le frontend

```powershell
# Build frontend
npm run build --workspace=frontend

# Générer config.json avec les URLs sandbox
$config = @{
  apiBaseUrl = "https://<apim-gateway-url>/v1"
  tenantId   = ""
  clientId   = ""
  cdnDomain  = "<storage-web-endpoint>"
  stage      = "dev"
} | ConvertTo-Json

$config | az storage blob upload `
  --account-name closstoragedevvgi `
  --container-name '$web' `
  --name config.json `
  --data - `
  --content-type application/json `
  --auth-mode login

# Upload le build SPA
az storage blob upload-batch `
  --destination '$web' `
  --account-name closstoragedevvgi `
  --source frontend/dist `
  --auth-mode login
```

## Contraintes connues du sandbox

| Contrainte | Impact | Contournement |
|---|---|---|
| `Microsoft.Communication` non enregistré | Emails désactivés | `enableEmailNotifications = false` |
| Pas d'accès Graph API (guest `#EXT#`) | Entra External ID impossible | `authBypassEnabled = true` → `X-Forwarded-User: bypass-dev-user` |
| DNS non détenu | Pas de domaines custom | URLs Azure natives (`.azure-api.net`, `.web.core.windows.net`) |
| Condition RBAC Administrator | Ne peut pas assigner Owner/UAA/RBAC Admin | Tous les autres rôles OK |

## Ressources créées (avec nameSuffix=vgi)

| Ressource | Nom | Type |
|---|---|---|
| App Configuration | `clos-appconfig-dev-vgi` | Standard |
| Key Vault | `clos-kv-dev-vgi` | Standard |
| Cosmos DB | `clos-cosmos-dev-vgi` | GlobalDocumentDB |
| Storage (data) | `closstoragedevvgi` | StorageV2 LRS |
| Storage (api fn) | `closapifndevvgi` | StorageV2 LRS |
| Storage (jobs fn) | `closjobsfndevvgi` | StorageV2 LRS |
| Service Bus | `clos-servicebus-dev-vgi` | Standard |
| APIM | `clos-apim-dev-vgi` | Consumption |
| Function App API | `clos-api-dev-vgi` | Linux Node 20 Y1 |
| Function App Jobs | `clos-jobs-dev-vgi` | Linux Node 20 Y1 |
| Front Door | `clos-afd-dev-vgi` | Standard_AzureFrontDoor |
| WAF Policy | `closWafdevvgi` | Standard_AzureFrontDoor |
| Log Analytics | `clos-logs-dev-vgi` | PerGB2018 |
| App Insights | `clos-insights-dev-vgi` | web |
