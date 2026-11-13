# Unseen — System & Feature Design (`Design.md`)

**Unseen** is an AI-powered cross-platform digital safety assistant built for women content creators. It evaluates cumulative privacy exposure across a creator's own content (Instagram, YouTube, Substack, and unpublished drafts) and recommends practical, voice-preserving fixes before publishing.

---

## 1. Architectural Principles (macOS App Now, Mobile-Ready Next)

To ship a native **macOS Desktop Studio App** today while keeping a zero-rewrite path to **iOS and Android** mobile apps later, Unseen is strictly divided into three decoupled layers:

1. **Layer 1 — Platform-Agnostic Core (`src/config/`, `src/logging/`, `src/domain/`, `src/genai/`, `src/features/`):**
   - Pure TypeScript modules with zero DOM or Electron dependencies.
   - Directly reusable inside an Electron main process, a Capacitor mobile bundle, or an Expo / React Native mobile app.
2. **Layer 2 — Platform Bridge (`src/platform/`):**
   - Abstract adapter contract separating media picking, audit execution, and safe-draft export between the macOS Electron shell (`macElectronAdapter.ts`) and mobile targets (`mobileCapacitorStub.ts`).
3. **Layer 3 — Creator Studio UI (`src/ui/`):**
   - Responsive, accessible studio views supporting both full macOS window layouts and a 1-click **Mobile Companion Preview** (`390×844` phone viewport).

---

## 2. Coding, Observability & Configuration Standards

- **Feature-per-File Modularity:** Every distinct capability lives in its own focused module.
- **Comprehensive Header Comments & Function Docstrings:** Every source file begins with a detailed explanation of the feature and its use cases, and every function includes full JSDoc documentation.
- **Centralized Configuration (`src/config/appConfig.ts`):** All Gemini model identifiers, sampling parameters, bounding-box styling defaults, ring-buffer sizes, window presets, and anti-doxxing regex rules are grouped in a single configuration module.
- **Full `INFO` Function & GenAI Call Logging (`src/logging/logger.ts` & `src/logging/payloadSanitizer.ts`):**
  - Every function call logs at `INFO` level with its function name and sanitized input parameters.
  - Every Gemini API call logs at `INFO` level with the **model name, prompt, generation config, duration, and structured output**, automatically stripping raw base64/binary `inlineData` payloads via `payloadSanitizer.ts` so logs remain readable and never leak raw user photos.

---

## 3. Feature Catalog

### 3.1 Centralized Configuration (`src/config/appConfig.ts`) — *Implemented*
- Centralizes Gemini model selection (`gemini-2.5-flash`), per-stage temperatures, redaction blur intensity, macOS/mobile viewport constants, log retention limits, and supported creator platforms.
- Provides typed helper functions to resolve runtime overrides safely.

### 3.2 Inline-Data Payload Sanitizer (`src/logging/payloadSanitizer.ts`) — *Implemented*
- Recursively clones and inspects arbitrary function arguments and `@google/genai` request/response trees.
- Strips `inlineData` image/video base64 strings, data URLs (`data:image/...;base64,...`), and raw binary buffers (`Uint8Array`), replacing them with compact metadata descriptors (`[STRIPPED_INLINE_DATA mimeType=... length=...]`).

### 3.3 Structured Function & GenAI Logger (`src/logging/logger.ts`) — *Implemented*
- Emits structured `[INFO]` entries for `logFunctionCall` and `logGenAiCall`.
- Maintains a bounded in-memory ring buffer with live listener subscriptions so the Creator Studio UI can display a transparent **"Inspect AI Audit Log"** drawer during demos and testing.

### 3.4 Privacy Domain Models (`src/domain/privacyTypes.ts`) — *Implemented*
- Defines strongly typed contracts across the entire audit lifecycle:
  - `CreatorPost`: Multi-platform post or unpublished draft (`instagram`, `youtube`, `substack`, `draft`).
  - `PostDisclosureFinding`: Stage 1 multimodal per-post extractions including normalized `[ymin, xmin, ymax, xmax]` bounding boxes (`0–1000` Gemini coordinate space).
  - `CrossPlatformRisk`: Stage 2 compound exposure findings linking evidence across multiple posts without inferring exact private addresses.
  - `SafePostFixPlan`: Stage 3 voice-preserving caption rewrites, visual redaction regions, and post-timing recommendations.

### 3.5 Responsible AI Guardrails (`src/features/guardrails/`) — *Implemented*
- **Ownership Self-Attestation (`ownershipConsent.ts`):** Requires explicit creator confirmation (`assertOwnershipAttestation`) before any scan or rewrite executes, preventing third-party surveillance use.
- **Anti-Doxxing Output Sanitizer (`antiDoxxingGuardrail.ts`):** Deterministically scrubs exact street addresses, apartment/room identifiers, and raw GPS coordinates across Stage 1 clues, Stage 2 cross-platform risks, and Stage 3 fix plans, and clamps normalized bounding boxes to `0..1000`.

### 3.6 Fictional Cross-Platform Creator Dataset (`src/features/demo-dataset/`) — *Implemented*
- **Maya Lin Feed (`mayaCreatorFeed.ts`):** Platform-agnostic 6-post synthetic dataset spanning `instagram`, `youtube`, `substack`, and `draft` (`maya-post-1` through `maya-post-6`) paired with `1000×1000` `image/png` sample assets in `public/demo-media/`.
- **Node/Electron Media Hydrator (`nodeDemoMediaHydrator.ts`):** Resolves `/demo-media/*.png` files from `public/` into base64 `imageDataUrl` payloads for multimodal `@google/genai` `inlineData` analysis without polluting platform-agnostic modules with Node `fs` imports.

### 3.7 Blog & Substack Article Importer (`src/features/article-import/articleExtractor.ts`) — *Implemented*
- Validates public `http`/`https` article links while blocking loopback and private network SSRF targets (`localhost`, `127.*`, `10.*`, `192.168.*`, `169.254.*`).
- Strips scripts, styles, and navigation chrome from HTML to extract clean titles and prose, packaging newsletters/blogs into `CreatorPost` items for cross-platform routine detection alongside camera-roll photos.

### 3.8 3-Stage Gemini Multimodal Engine & Deterministic Scorer (`src/genai/` & `src/features/`) — *Implemented*
- **Gemini Client (`src/genai/geminiClient.ts`):** Wraps `@google/genai` structured JSON generation, converts base64 data URLs to `inlineData` parts, and automatically logs every call via `logGenAiCall` with `inlineData` stripped.
- **Stage 1 (`postScanner.ts`):** Multimodal vision + caption/article text + timestamp scan returning structured clues and `0..1000` `[ymin, xmin, ymax, xmax]` bounding boxes for sensitive visual objects.
- **Stage 2 (`riskConnector.ts`) & Deterministic Scorer (`riskScoringEngine.ts`):** Connects clues across photos and articles into `CrossPlatformRisk` items with privacy-preserving `"With X% confidence..."` abstract statements, deterministic `low`/`medium`/`high` priority & `0–100` exposure scoring, and scan-triggered **Personalized Best Practices**.
- **Stage 3 (`captionRewriter.ts`):** Produces 3 creator-voice caption rewrites, carries forward visual redaction boxes, and recommends publish timing (`SafePostFixPlan`).
- **Audit Orchestrator (`privacyAuditOrchestrator.ts`):** Coordinates consent verification, Stage 1, Stage 2, deterministic scoring, and anti-doxxing output scrubbing.

### 3.9 Unified Single-Port API Server, Feedback Store & Android PWA Shell (`src/server/`, `src/platform/`, `public/`) — *Implemented*
- **Anonymous Accuracy Feedback (`src/features/feedback/accuracyFeedbackStore.ts`):** Records privacy-safe `thumbs_up` / `thumbs_down` ratings and sanitized notes with zero PII.
- **Unified HTTP Server (`src/server/`):** Serves `/api/health`, `/api/demo-feed`, `/api/import-article`, `/api/audit`, `/api/fix-post`, `/api/feedback`, `/api/logs`, and static/SPA assets on a single port (`3001`) with path-traversal protection (`resolveSafeStaticFile`) and `35MB` JSON body cap for high-res camera-roll batches.
- **Platform Bridge (`src/platform/platformBridge.ts` & `httpPlatformAdapter.ts`):** Decouples React screens from transport details so the UI stays portable across Android PWA, Mac browsers, and future native shells.
- **Installable Android & iOS PWA (`public/manifest.webmanifest`, `public/sw.js`, `public/icons/`):** Enables native "Install App" on Android Chrome with custom `192×192` and `512×512` icons while intentionally never caching sensitive `/api/*` payloads.

### 3.10 Retro + Robinhood Creator Studio & Mobile UI (`src/ui/`) — *Planned (Chunks 5–6)*
- Consent Gate, Camera Roll uploader, Blog/Substack URL importer, `0–100` Exposure Gauge, `"With X% confidence..."` cross-platform cards, interactive Smart Blur/Crop canvas, Voice-Preserving Caption Studio, Before/After preview, downloadable Best Practices checklist, and live `INFO` Audit Log inspector.
