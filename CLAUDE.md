# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Le Clos Bon Accueil** is a vacation rental management system for a family guesthouse (12 rooms). The project evolves from a static React prototype (in root) to a production-grade serverless application with dedicated backend, frontend, and infrastructure.

**Single Source of Truth**: All requirements are in `specs/` (4 markdown files). Never contradict or reinterpret them—the specs are binding.

---

## Monorepo Structure (npm workspaces)

Once P1 (scaffold) is complete, the structure will be:

```
clos-bon-accueil/
├── shared-types/          # @clos/shared-types — types, DTO, dates, events
├── backend/               # Node.js Lambda handlers + repository layer
├── frontend/              # React 18 SPA (Vite)
├── infra/                 # AWS CDK (5 stacks + CertsStack)
├── specs/                 # Spécifications (immutable)
└── package.json           # Workspaces root
```

**Workspace dependencies**:
- `shared-types` → consumed by `backend` and `frontend` (no direct cross-imports)
- `backend` → Lambda handlers, repository, HTTP utils
- `frontend` → React components, API client, React Query hooks
- `infra` → CDK stacks (references backend/ code via Lambda NodejsFunction bundling)

---

## Essential Commands

All commands run from **repository root** (applies to all workspaces via `--workspace=<name>` or `--workspaces`).

### Setup
```bash
npm install                              # Install all workspace deps
```

### Development
```bash
npm run dev --workspace=frontend        # Vite dev server (localhost:5173)
npm run lint --workspaces               # ESLint + Prettier check across all workspaces
npm run typecheck --workspaces          # TypeScript type-check without emit
npm run test --workspace=backend        # Run backend tests (vitest)
npm run test --workspace=frontend       # Run frontend tests
npm run test --workspace=backend -- --watch  # Watch mode
npm run test --workspace=backend -- src/data/repository.test.ts  # Single test file
```

### Building
```bash
npm run build --workspace=shared-types  # Build shared-types package
npm run build --workspace=backend       # Bundle Lambda handlers (esbuild via CDK)
npm run build --workspace=frontend      # Vite build (→ frontend/dist)
npm run build --workspace=infra         # (not directly used; cdk does it)
```

### Infrastructure & Deployment
```bash
cd infra && cdk synth -c stage=dev      # Validate CloudFormation template (dev)
cd infra && cdk deploy --all -c stage=dev --require-approval never  # Deploy all stacks (dev)
cd infra && npm run seed -- --stage dev # Seed initial data (DynamoDB + rooms)
```

### Linting & Formatting
```bash
npm run lint:fix --workspaces           # Auto-fix ESLint + Prettier
npm run typecheck --workspaces          # Full type check
```

---

## Architecture Principles

### 1. Specs Drive Everything
- **Read specs first**: `specs/README.md` → `01-data-model.md` → `02-api-contract.md` → `03-infrastructure.md`
- **Never invent**: If a requirement is not in specs, ask. Don't assume.
- **Strict compliance**: Code must match specs exactly (field names, types, error codes, HTTP mappings).

### 2. DynamoDB Single Table Design
- **One table** `clos-bon-accueil-{stage}` with items discriminated by `entityType`.
- **Three GSI** (gsi1, gsi2, gsi3) for efficient queries.
- **No direct queries except via Repository** — all DynamoDB access is wrapped by `backend/src/data/repository.ts`.

### 3. Repository Layer (Data Access)
- All Lambdas interact with DynamoDB **only via the Repository interface**.
- Repository enforces **business logic**: overlap detection, capacity validation, transactional writes, cascades, idempotence.
- Error classes: `ConflictError`, `NotFoundError`, `ValidationError`, `CapacityReductionError`, `ForbiddenError`.

### 4. Lambda Handlers (One Route = One Lambda)
- **27 dedicated Lambda functions**, one per API route (cf. `02-api-contract § 2.5`).
- **Skeleton pattern** (cf. `02-api-contract § 2.8`):
  ```typescript
  const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
    const userId = getCurrentUserId(event);
    const body = parseBody(event, BodySchema);
    const repo = getRepository();
    const result = await repo.operation(/* ... */);
    return ok(result);
  };
  export const handler = withErrorHandling(rawHandler);
  ```
- **Error handling via `withErrorHandling`** (maps exceptions → HTTP codes).

### 5. Frontend Integration
- **Auth**: Amplify Auth v6 (USER_PASSWORD_AUTH flow, no Hosted UI).
- **Data fetching**: React Query with hooks defined in `frontend/src/api/hooks.ts`.
- **Query keys**: Hierarchical (e.g., `['rooms', roomId, 'bookings', from]`).
- **Configuration**: Loaded from `/config.json` at runtime (SSM params injected by CDK during deployment).

### 6. Dates & Timezone
- **All date logic uses Europe/Paris timezone** (functions in `shared-types/src/dates.ts`).
- **Day-level dates**: `YYYY-MM-DD` (no time).
- **Instant dates**: ISO 8601 UTC.
- **Never use `Date.now()` directly** — use `todayIsoInAppTz()`.

### 7. Idempotence
- Optional `Idempotency-Key` header on `POST /v1/bookings` and `POST /v1/admin/bookings`.
- Idempotency records stored in DynamoDB with 24h TTL.

### 8. Events & Notifications
- **SNS topic** `clos-notifications-{stage}` publishes domain events (BOOKING_CREATED, etc.).
- **Lambda `notification-dispatcher`** consumes SNS and sends emails via SES.
- **Event schema** defined in `shared-types/src/events.ts`.

### 9. TypeScript & Validation
- **All inputs validated with Zod** (`backend/src/api/schemas/`).
- **Strict types everywhere**; no `any` except in exceptional cases.
- **DTO pattern**: shared types for requests/responses (`shared-types/src/dto.ts`).

---

## Deployment Strategy

### Three Stages
- **Development** (`dev`): PITR off, mock bookings seeded, X-Ray off, logs 7 days.
- **Production** (`prod`): PITR on, no mock bookings, X-Ray on, logs 30 days.

### Stack Deployment Order (Strict)
1. **CertsStack** — ACM certificates (prerequisite for CloudFront & API Gateway custom domains).
2. **DataStack** — DynamoDB table, S3 photos, CloudFront CDN.
3. **AuthStack** — Cognito User Pool, groups, App Client, post-confirmation Lambda.
4. **NotificationsStack** — SNS, SES templates, notification dispatcher, reconciliation job.
5. **ApiStack** — API Gateway, 27 Lambdas, Cognito authorizer, WAF, X-Ray.
6. **FrontendStack** — S3, CloudFront distribution, `config.json` generation.

### Decoupling via SSM
- **No CloudFormation exports** (prevents circular dependencies and deployment lock).
- All cross-stack outputs stored in **SSM Parameter Store** (`/clos/{stage}/{stackName}/{key}`).
- Example: DataStack writes `/clos/dev/data/table-name`, ApiStack reads it.

---

## Testing Strategy

### Unit Tests
- **Backend**: `backend/src/**/*.test.ts` (vitest + aws-sdk-client-mock).
- **Frontend**: `frontend/src/**/*.test.ts` (vitest + @testing-library/react).
- Run: `npm run test --workspace=backend` / `npm run test --workspace=frontend`.

### Integration Tests (LocalStack)
- Backend tests spin up LocalStack DynamoDB for repo testing.
- Run in CI: `npm run test --workspace=backend`.

### E2E Tests (Playwright)
- `frontend/tests/e2e/` with 3 scenarios:
  1. Guest: login → browse rooms → create booking → verify in "My trips" → cancel.
  2. Admin: login → dashboard → create room → delete room (cascade) → verify KPI.
  3. Conflict: create booking → attempt conflicting booking → verify 409 error.
- Run: `npm run test:e2e --workspace=frontend` (requires deployed backend or LocalStack).

### CI/CD Workflow
- **PR**: lint, typecheck, unit tests, build, `cdk synth`.
- **Merge to main**: deploy to dev + smoke tests.
- **Tag v*.*.***: deploy to prod (requires manual approval).

---

## Important Files & Their Roles

| File / Path | Purpose |
|---|---|
| `specs/01-data-model.md` | Domain entities, DynamoDB schema, Repository interface, seed strategy |
| `specs/02-api-contract.md` | All 27 routes, payloads, error codes, auth/ownership rules |
| `specs/03-infrastructure.md` | CDK stacks, deployment order, config per stage, bring-up checklist |
| `shared-types/src/domain.ts` | TypeScript interfaces (User, Room, Booking, HouseConfig) |
| `shared-types/src/dto.ts` | Request/response DTOs (CreateBookingInput, etc.) |
| `shared-types/src/dates.ts` | Date utilities (todayIsoInAppTz, intervalsOverlap, etc.) |
| `shared-types/src/events.ts` | SNS domain event types |
| `backend/src/data/repository.ts` | Data access layer (all DynamoDB logic) |
| `backend/src/api/http.ts` | Utilities (CORS, auth, error mapping, `withErrorHandling`) |
| `backend/src/api/schemas/` | Zod schemas for every route |
| `backend/src/handlers/` | 27 Lambda handlers (one file per route) |
| `backend/src/api/deps.ts` | Dependency injection (Repository, Logger, SDK clients) |
| `backend/scripts/seed.ts` | Initial data seeding (HouseConfig, Rooms, mock Bookings on dev) |
| `infra/lib/config.ts` | StageConfig (dev vs prod differences) |
| `infra/lib/{data,auth,api,notifications,frontend}-stack.ts` | CDK stack definitions |
| `frontend/src/api/client.ts` | HTTP wrapper (fetch + auth token + error handling) |
| `frontend/src/api/hooks.ts` | React Query hooks (9 queries + 10 mutations) |
| `frontend/src/auth/AuthProvider.tsx` | Amplify Auth context + LoginScreen |

---

## Common Patterns

### Adding a New API Route
1. **Spec it** in `specs/02-api-contract.md` § 2.2 or 2.3.
2. **Define DTO** in `shared-types/src/dto.ts`.
3. **Create Zod schema** in `backend/src/api/schemas/{route-name}.ts`.
4. **Write handler** in `backend/src/handlers/{route-name}.ts` (follow skeleton, use `withErrorHandling`).
5. **Add tests** in `backend/src/handlers/{route-name}.test.ts`.
6. **Wire in CDK** (`infra/lib/api-stack.ts`) as `new LambdaIntegration(...)`.
7. **Add React Query hook** in `frontend/src/api/hooks.ts`.

### Handling DynamoDB Errors
- **ConditionalCheckFailedException** on Booking Put → 409 `BOOKING_CONFLICT`.
- **TransactionCanceledException** → inspect `CancellationReasons` and map appropriately.
- All other DynamoDB errors → 500 `INTERNAL_ERROR` (never expose raw error messages).

### Adding a New SNS Event
1. Add type to `shared-types/src/events.ts`.
2. Publish from handler via `SNSClient.publish()` (read ARN from env `SNS_TOPIC_ARN`).
3. Subscribe Lambda handler to topic (wired in `NotificationsStack`).
4. SES template in `infra/lib/ses-templates/` and mapped in `notification-dispatcher.ts`.

---

## Prototype Migration (P10)

The root directory contains a static React prototype (`app.jsx`, `screens-*.jsx`, etc.) that will be archived once frontend is fully migrated to Vite. During migration:

- **Extract UI primitives** → `frontend/src/ui/` (buttons, cards, modals, etc.).
- **Extract styles** → copy `styles.css` verbatim to `frontend/src/styles.css`.
- **Replace mock data** — remove `data.jsx` imports, use React Query hooks instead.
- **Replace `AdminMode` toggle** — read from `useMe().data.role === 'admin'`.
- **Image uploads** → implement drag-drop via `useUploadRoomPhoto` mutation + direct S3 PUT + `PATCH` room with photoUrl.

---

## Key Constraints & Non-Negotiables

1. **Stack is fixed** (cf. `specs/README.md`): React 18 + TypeScript + Vite, Node.js 20 + Lambda arm64, DynamoDB single table, API Gateway REST, Cognito, CDK v2, GitHub Actions + OIDC.
2. **Region** is eu-west-3 (Paris). Certificates for CloudFront must be in us-east-1.
3. **No breaking changes to specs** — if you detect a contradiction, flag it **before coding**.
4. **Least-privilege IAM** — every Lambda has a dedicated role with exact permissions (never `*`).
5. **No secrets in code** — sensitive values (admin email, SES domain) in SSM Parameter Store.
6. **CORS always explicit** — origins list in `StageConfig`, never `*`.
7. **Error codes are canonical** — map from Zod/repository exceptions to HTTP codes exactly as spec table.
8. **Timezone is Europe/Paris everywhere** — no exceptions, no UTC shortcuts.

---

## Troubleshooting

### `npm install` fails in a workspace
- Run `npm ci` at root (respects `package-lock.json`).
- Delete `node_modules` in affected workspace and retry.

### TypeScript errors across workspaces
- Run `npm run typecheck --workspaces` (reports all errors).
- Ensure `@clos/shared-types` is built first: `npm run build --workspace=shared-types`.

### Lambda handler tests fail
- Check that `TABLE_NAME` env var is set in test setup.
- Use `aws-sdk-client-mock` to mock DynamoDB client.
- Ensure repository.ts is tested separately (unit tests with mocked client).

### CDK deploy fails
- Run `cdk synth -c stage=dev` to see CloudFormation errors.
- Ensure all SSM parameters exist (`/clos/{stage}/...`).
- Check IAM role has cloudformation:* permissions.

### LocalStack issues
- Ensure LocalStack is running and DynamoDB endpoint is accessible.
- Check `TABLE_NAME` env var points to localstack table name.
- Use `aws dynamodb list-tables --endpoint-url http://localhost:8000` to verify.

---

## Next Steps (Post-Scaffold)

Once P1 is complete, clone this file to track implementation:

1. **P1–P12** phases execute in strict order (see implementation plan).
2. **After each phase**, mark as complete in the phase tracking document.
3. **For each handler/component**, ensure:
   - TypeScript compiles without errors.
   - Unit tests pass.
   - Specs compliance is verified.
4. **Pre-deployment checklist** (P11):
   - `npm run typecheck --workspaces` passes.
   - `npm run test --workspaces` passes.
   - `cdk synth -c stage=prod` succeeds.
   - E2E tests pass against dev.

---

## Contact & References

- **Specs location**: `specs/` (README.md + 3 detailed docs — immutable source of truth).
- **Project overview**: `README.md` (user-facing features, prototype design tokens).
- **Architecture diagram**: Implied by `03-infrastructure.md` § 3.2 (5 stacks + decoupling via SSM).

**All future Claude Code instances should read `specs/README.md` first, then reference specs as needed.**
