# Graph Report - nighthawk-server-mysql_version  (2026-11-26)

## Corpus Check
- 174 files · ~51,688 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .toml 1, .prisma 1)

## Summary
- 795 nodes · 1948 edges · 44 communities (32 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5422f86b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.mjs
- patreon.controller.mjs
- asset.controller.mjs
- contact.controller.mjs
- package.json
- extension.test.mjs
- members.service.mjs
- polar.test.mjs
- googleIndexer.mjs
- ChunkUploadHelper
- auth.service.mjs
- AssetService
- prisma.mjs
- pro.service.mjs
- AuthError
- ref_node_assert
- assetDownload.test.mjs
- asset.service.mjs
- publicUploads.test.mjs
- auth.controller.mjs
- isArrayElementExist
- session.mjs
- polar.controller.mjs
- members.test.mjs
- server.mjs
- SketchShaper - Backend API Server
- contactMemberPlan.test.mjs
- oldFiles
- compilerOptions
- removeUploads
- cleanupFailedUploads.test.mjs
- corsPolicy.test.mjs
- AdminService
- ExtensionDownloadService
- GalleryService
- InnovativeFurnituresService
- SliderService
- SocialService
- SupportedByService
- softNotFound.test.mjs
- PageService
- setup-patreon.sh

## God Nodes (most connected - your core abstractions)
1. `prisma` - 40 edges
2. `express` - 39 edges
3. `removeUploads()` - 39 edges
4. `isArrayElementExist()` - 35 edges
5. `oldFiles()` - 34 edges
6. `AuthError` - 29 edges
7. `responseHandler()` - 24 edges
8. `catchError()` - 22 edges
9. `AssetService` - 22 edges
10. `sanitizeSlug()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `ok()` --calls--> `responseHandler()`  [EXTRACTED]
  src/modules/auth/auth.controller.mjs → src/utils/responseHandler.mjs
- `approveLogin()` --calls--> `AuthError`  [EXTRACTED]
  src/modules/extension/extension.service.mjs → src/modules/auth/auth.service.mjs
- `startLogin()` --calls--> `AuthError`  [EXTRACTED]
  src/modules/extension/extension.service.mjs → src/modules/auth/auth.service.mjs
- `ok()` --calls--> `responseHandler()`  [EXTRACTED]
  src/modules/extension/extension.controller.mjs → src/utils/responseHandler.mjs
- `run()` --calls--> `revalidateFrontend()`  [EXTRACTED]
  src/utils/revalidate.test.mjs → src/utils/revalidate.mjs

## Import Cycles
- None detected.

## Communities (44 total, 12 thin omitted)

### Community 0 - "index.mjs"
Cohesion: 0.05
Nodes (55): express, app, fakeReq, server, READ_ONLY_METHODS, requireAdminForWrites(), isTrustedSiteOrigin(), requireTrustedOrigin() (+47 more)

### Community 1 - "patreon.controller.mjs"
Cohesion: 0.09
Nodes (32): config, resolveAccount(), SignInError, exchangeCode(), failed(), fetchProfile(), parseProfile(), GoogleController (+24 more)

### Community 2 - "asset.controller.mjs"
Cohesion: 0.12
Nodes (26): catchError(), ACCESS_TYPES, AssetController, BlogsController, CategoryController, CommonController, ExtensionDownloadController, GalleryController (+18 more)

### Community 3 - "contact.controller.mjs"
Cohesion: 0.08
Nodes (21): RFC-5987, ALLOWED_MIME_TYPES, BACKEND_ROOT, __dirname, __filename, handleContactUpload(), PRIVATE_CONTACT_DIR, storage (+13 more)

### Community 4 - "package.json"
Cohesion: 0.06
Nodes (39): author, dependencies, axios@^1.20.0, bcrypt@^6.0.0, cors@^2.8.6, dotenv@^18.0.8, express@^5.3.0, googleapis@^189.0.0 (+31 more)

### Community 5 - "extension.test.mjs"
Cohesion: 0.09
Nodes (23): app, approve(), call(), connect(), cookieFor(), download(), fakeReq, filePath (+15 more)

### Community 6 - "members.service.mjs"
Cohesion: 0.14
Nodes (27): ACCESS, addPayment(), adFreeWhere(), deletePayment(), FILTERS, findMember(), getMember(), listMembers() (+19 more)

### Community 7 - "polar.test.mjs"
Cohesion: 0.08
Nodes (18): startFakeGoogle(), app, browserLogin(), cookie(), fakeReq, mail(), person(), server (+10 more)

### Community 8 - "googleIndexer.mjs"
Cohesion: 0.17
Nodes (20): main(), printUsageAndExit(), sleep(), urls, authCache, buildCanonicalAssetUrl(), __dirname, getCredentials() (+12 more)

### Community 9 - "ChunkUploadHelper"
Cohesion: 0.15
Nodes (7): ChunkUploadHelper, mkdir, readdir, rename, stat, unlink, writeFile

### Community 10 - "auth.service.mjs"
Cohesion: 0.17
Nodes (15): AuthService, consumeToken(), DUMMY_HASH, hashToken(), issueToken(), sendQuietly(), alreadyRegistered(), esc() (+7 more)

### Community 12 - "prisma.mjs"
Cohesion: 0.24
Nodes (5): adapter, databaseUrl, prisma, CommonService, FILE_COLUMNS

### Community 13 - "pro.service.mjs"
Cohesion: 0.19
Nodes (17): approveLogin(), extensionUser(), pollLogin(), startLogin(), accessOf(), isAdFreeTier(), isPro(), manualActive() (+9 more)

### Community 14 - "AuthError"
Cohesion: 0.19
Nodes (14): AuthError, call(), createCheckout(), createCustomerSession(), listProducts(), PolarApiError, PERIOD_OF_INTERVAL, PERIODS (+6 more)

### Community 15 - "ref_node_assert"
Cohesion: 0.14
Nodes (10): app, server, sanitizeFileName(), storage, all, names, stamp, uploads (+2 more)

### Community 16 - "assetDownload.test.mjs"
Cohesion: 0.12
Nodes (7): app, content, dir, png, server, stamp, uploadsRoot

### Community 17 - "asset.service.mjs"
Cohesion: 0.22
Nodes (5): BlogService, filterExistingAssetIds(), LINKED_ASSET_SELECT, MAX_LINKED_ASSETS, parseLinkedIds()

### Community 18 - "publicUploads.test.mjs"
Cohesion: 0.22
Nodes (10): cacheControlFor(), isPrivateUpload(), LONG_CACHE, NO_STORE, publicUploads, refusePrivate(), ours, plainStatic (+2 more)

### Community 19 - "auth.controller.mjs"
Cohesion: 0.20
Nodes (11): AuthController, describe(), ok(), requireEmail(), publicUser(), cleanName(), EMAIL_PATTERN, isValidEmail() (+3 more)

### Community 20 - "isArrayElementExist"
Cohesion: 0.24
Nodes (3): SubCategoryService, isArrayElementExist(), sanitizeSlug()

### Community 21 - "session.mjs"
Cohesion: 0.28
Nodes (11): AdminController, ADMIN_COOKIE, ADMIN_SESSION_MS, clearSessionCookie(), cookieOptions, createSession(), deleteSession(), hashToken() (+3 more)

### Community 22 - "polar.controller.mjs"
Cohesion: 0.27
Nodes (11): requireSession(), ExtensionController, extensionSession(), ok(), PolarController, signedInUser(), assertProDownload(), findSession() (+3 more)

### Community 23 - "members.test.mjs"
Cohesion: 0.21
Nodes (9): app, call(), fakeReq, list(), pay(), server, setAccess(), stamp (+1 more)

### Community 24 - "server.mjs"
Cohesion: 0.24
Nodes (8): loadApp(), keepWebhookBody(), signingKeys(), verifySignature(), WEBHOOK_PATH, indexRouter, app, checkRevalidateConfig()

### Community 25 - "SketchShaper - Backend API Server"
Cohesion: 0.18
Nodes (10): 1. Install Dependencies, 2. Generate Prisma Client, 3. Run Development Server, ⚙️ Environment Configuration, 🚀 Getting Started, 🚢 Production Deployment (PM2), 📁 Project Structure, 🔒 Security Best Practices (+2 more)

### Community 26 - "contactMemberPlan.test.mjs"
Cohesion: 0.22
Nodes (5): globalErrorHandler(), app, fakeReq, server, stamp

### Community 27 - "oldFiles"
Cohesion: 0.25
Nodes (3): CategoryService, assetFiles(), oldFiles()

### Community 28 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, allowJs, checkJs, module, moduleResolution, noEmit, target, exclude (+1 more)

### Community 29 - "removeUploads"
Cohesion: 0.24
Nodes (4): cleanupFailedUploads(), GeneralService, isReferenced(), removeUploads()

### Community 30 - "cleanupFailedUploads.test.mjs"
Cohesion: 0.22
Nodes (4): app, server, stamp, uploads

### Community 31 - "corsPolicy.test.mjs"
Cohesion: 0.32
Nodes (5): corsOptionsFor(), corsPolicy(), SITES, app, server

### Community 39 - "softNotFound.test.mjs"
Cohesion: 0.40
Nodes (3): softNotFound(), app, server

## Knowledge Gaps
- **1 isolated node(s):** `RFC-5987`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 285 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `prisma` connect `prisma.mjs` to `index.mjs`, `patreon.controller.mjs`, `asset.controller.mjs`, `contact.controller.mjs`, `members.service.mjs`, `googleIndexer.mjs`, `auth.service.mjs`, `pro.service.mjs`, `AuthError`, `ref_node_assert`, `assetDownload.test.mjs`, `asset.service.mjs`, `isArrayElementExist`, `session.mjs`, `members.test.mjs`, `contactMemberPlan.test.mjs`, `oldFiles`, `cleanupFailedUploads.test.mjs`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **What connects `RFC-5987` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.05016722408026756 - nodes in this community are weakly interconnected._
- **Why does `express` connect `index.mjs` to `package.json`, `extension.test.mjs`, `softNotFound.test.mjs`, `polar.test.mjs`, `ref_node_assert`, `assetDownload.test.mjs`, `publicUploads.test.mjs`, `members.test.mjs`, `server.mjs`, `contactMemberPlan.test.mjs`, `cleanupFailedUploads.test.mjs`, `corsPolicy.test.mjs`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Should `patreon.controller.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.08705882352941176 - nodes in this community are weakly interconnected._
- **Why does `removeUploads()` connect `removeUploads` to `GalleryService`, `InnovativeFurnituresService`, `SliderService`, `SocialService`, `SupportedByService`, `contact.controller.mjs`, `PageService`, `AssetService`, `prisma.mjs`, `asset.service.mjs`, `isArrayElementExist`, `oldFiles`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `asset.controller.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.12056737588652482 - nodes in this community are weakly interconnected._