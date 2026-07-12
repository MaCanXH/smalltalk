# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Small Talk is a **conversation trainer** built with Expo Router (SDK 54). The user holds a live, real-time voice conversation with an AI partner for ~3 minutes, then gets a scored transcript.

It runs as a **native development build** (`expo-dev-client`), launched on an Android emulator / device — **not Expo Go**. The realtime voice stack (`@vapi-ai/react-native` over `@daily-co/react-native-webrtc`) ships custom native code, so Expo Go cannot load it. A network connection and Vapi credentials are required for a live session.

The AI voice is **real**, via Vapi (a hosted realtime voice-agent service):
- **`lib/ai/vapi.ts`** wraps the `Vapi` client. Per-call config comes from the backend: `fetchVapiSession(topicLabel?, newsContext?)` POSTs to the Edge Function's `/api/vapi/session` route (JWT-authenticated) and gets back `{ publicKey, assistantId, overrides }` — the Vapi credentials and the composed system prompt never ship in the bundle or in client env vars.
- **`supabase/functions/api/vapiSession.ts`** is where the small-talk **persona now lives** (`SMALL_TALK_PERSONA`), composed with optional topic-steering + a `firstMessage` when a headline/news pack is supplied (no headline → generic open small-talk partner). Because Vapi validates the `model` override as a full config, it must include `provider`/`model` (`anthropic` / `claude-haiku-4-5-20251001`) matching the dashboard assistant — a partial `model` 400s. Persona/model changes are a `supabase functions deploy api`, not an app release. The route **requires a signed-in user** (the bare anon key 401s), enforces a **per-user rolling-24h session limit** via the service-role-only `vapi_call_grants` table (default 20, `VAPI_DAILY_SESSION_LIMIT` overrides; fails open if the table is missing), and returns a **short-lived public-scope Vapi JWT** (10 min, HS256-signed with `VAPI_PRIVATE_KEY` + `VAPI_ORG_ID`, valid only on Vapi's `/call/web`) instead of the long-lived public key — falling back to `VAPI_PUBLIC_KEY` until those secrets are set. The WebRTC call itself still runs on-device.
- **`lib/news/hotTopics.ts`** asks the backend's `/api/hot-topics` for beginner-friendly topic packs for the Talk tab (falling back to `FALLBACK_TOPICS` offline). Server-side, the topics come from a **multi-source RSS scrape** (Google Top Stories + BBC + NPR + ESPN + CBS — Google alone got the Edge Function's egress IP 503-blocked) distilled by Groq into packs of 20 (only the first 5 get the enrichment pass — Groq's free tier allows 6k tokens/min and the TPM check counts prompt+max_tokens, so prompt sizes and `max_tokens` in `hotTopics.ts` are budgeted against it), **cached in the `hot_topics_cache` table for ~20 min** (a "refresh" re-rolls from the cached pack; an expired pack is served stale instantly while `EdgeRuntime.waitUntil` rebuilds it in the background — only the very first population blocks; regeneration failures serve the stale pack before canned fallbacks; `?debug=1` echoes per-feed failure statuses).
- **`app/session/active.tsx`** is the live session — see Architecture. It subscribes to Vapi events and drives everything from them.
- **`lib/ai/vapiTranscript.ts`** rebuilds the full dialog from each Vapi `conversation-update` message (`normalizeVapiConversation`) — the message carries the entire conversation, so the session **replaces** (not appends) its transcript with Vapi's canonical, already-deduplicated turns. Prefers the timestamped `messages` array (`secondsFromStart`/`time`), falls back to the OpenAI-format `conversation` array. Also exposes `isVapiEndedMessage`.
- **Scoring** (`lib/ai/scoring.ts`, `buildResult`) is deterministic and explainable — derived from the captured transcript (turn count, word variety, slang markers, time used), never graded by a model. It is the base result and the offline fallback.
- **AI critic** (`lib/ai/critic.ts`, `buildAiResult`) wraps `buildResult`: it POSTs the labelled transcript to the backend Edge Function, which asks **Groq** (`llama-3.1-8b-instant`) for qualitative coaching (richer `suggestions` + `moments`), then **merges that over the deterministic result**. If the backend is unconfigured (no Supabase URL) or the call fails, it silently falls back to local `buildResult`. The numeric **score stays deterministic** — only the qualitative feedback is model-generated. The transcript is sent as numbered, speaker-tagged turns (`[n] USER:` / `[n] AI PARTNER:`) and the server prompt enforces strict role rules so the critic doesn't confuse the user's lines with the AI partner's.
- **`supabase/functions/api/`** — the backend, a **Supabase Edge Function** (Deno) named `api`, deployed with `npx supabase functions deploy api`. One function routes all endpoints internally: `POST .../functions/v1/api/feedback` (the critic), `GET .../functions/v1/api/hot-topics` (the news topic packs consumed by `lib/news/hotTopics.ts`), and `POST .../functions/v1/api/vapi/session` (per-call Vapi config, see above). Reads its secrets from **Supabase secrets** — never shipped to the client. JWT verification is on (`verify_jwt` in `supabase/config.toml`), and **every route additionally requires a signed-in user** (`requireUser` in `auth.ts` — the bare anon key 401s everywhere, since feedback/hot-topics spend Groq tokens); the app authenticates via `getFunctionsAuthHeaders()` in `lib/supabase.ts`. The single-function layout is deliberate — the app builds every route URL from one base (`lib/backend.ts` `getBackendBaseUrl`), so all routes must stay under `/functions/v1/api/`. Local dev: `npx supabase start` then `npx supabase functions serve api --env-file supabase/.env.local --no-verify-jwt` (needs Docker; that git-ignored file carries `GROQ_API_KEY`). The function's Deno code is excluded from `tsc` (tsconfig `exclude`) and ESLint (flat-config `ignores`); keep the response JSON shapes in sync with the client's `normalizeTopic` / `validateAiFeedback`. (The earlier local Express backend, `server.mjs`, has been removed.)
- **`supabase/functions/vapi-webhook/`** — a **second** Edge Function receiving Vapi's server webhooks. Vapi can't send a Supabase JWT, so this one runs with `verify_jwt = false` and authenticates via a shared-secret header instead: `/api/vapi/session` plants `VAPI_WEBHOOK_SECRET` into each call's `server.headers` (plus `metadata.userId` and `serverMessages: ["end-of-call-report"]`), and the webhook rejects anything without it. It stores each `end-of-call-report` (canonical transcript, summary, cost, ended reason) in the `call_reports` table — **upsert by Vapi call id**, so retries are idempotent, and it returns 500 on storage failure so Vapi retries. Users can read their own rows (RLS select policy); writes are service-role only. `SessionResult.vapiCallId` (captured in `active.tsx` from `client.start()`'s resolved call object) joins an app session to its report.

**Required env vars** (prefix `EXPO_PUBLIC_` so they reach the client; set before starting Metro):
`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` — auth, cloud sync, and the backend. All backend route URLs derive from the Supabase URL (`lib/backend.ts` `getBackendBaseUrl` → `<project>/functions/v1`, same URL for emulator and physical device): the AI critic, hot topics, **and the live session** (`/api/vapi/session` issues the Vapi config). Without them, results fall back to deterministic scoring, the Talk tab to the offline topic catalog, and the live session shows a "Missing backend configuration" error instead of connecting. Optional: `EXPO_PUBLIC_FEEDBACK_API_URL` overrides the backend location (set it to a backend's `/api/feedback` URL, e.g. a local `supabase functions serve`).

**Server-side secrets** (Supabase secrets, never in the client bundle): `GROQ_API_KEY` (critic + topic packs), `VAPI_ASSISTANT_ID`, `VAPI_PRIVATE_KEY` + `VAPI_ORG_ID` (sign the short-lived per-call Vapi JWTs; both from the Vapi dashboard — required, there is no raw-key fallback), `VAPI_WEBHOOK_SECRET` (random string shared between the session route and the webhook receiver; webhook config is skipped if unset), optional `VAPI_DAILY_SESSION_LIMIT`. Set with `npx supabase secrets set NAME=value`. None of these live in `.env`; for local `supabase functions serve`, pass a separate env file (e.g. a git-ignored `supabase/.env.local` with just `GROQ_API_KEY=...`).

**Sign-in is required.** There is no "continue offline" path — the sign-in gate (`app/_layout.tsx` → `components/SignInScreen.tsx`) blocks the tabs until a Supabase session exists, because `/api/vapi/session` attributes and rate-limits voice sessions per user. The `vapi_call_grants` quota table and `call_reports` webhook table are part of `supabase/schema.sql` (manual dashboard setup, like the other tables).

**`lib/ai/banks.ts`** holds the **topic catalog** (`TOPICS`/`getTopic` — `{ id, label, emoji }`, used only as a **label/emoji lookup**: `scoring.ts`/`critic.ts` labels and the Library emoji; new sessions all hardcode the `weekend` id via `RESULT_TOPIC_ID`, but old persisted sessions may reference other ids, so don't trim the catalog. The Talk tab's offline fallback is `FALLBACK_TOPICS` in `lib/news/hotTopics.ts`, not this catalog) and the **scoring word-banks** (`STALL_PHRASES`, `WORD_UPGRADES`, `SLANG_MARKERS`, consumed only by `scoring.ts`). There is no scripted dialogue — the conversation is live via Vapi. (The earlier offline-mock prototype — `lib/ai/engine.ts` `DialogEngine`, `lib/speech/useVoiceRecorder.ts`, and the `lib/speech/tts.ts` voice preview — has been removed.)

## Commands

```bash
npm start            # expo start — Metro dev server; open in the installed dev build (not Expo Go)
npm run android      # expo run:android — native Gradle build, install + launch on emulator/device
npm run ios          # expo run:ios
npm run web          # expo start --web
npm run lint         # expo lint (ESLint, eslint-config-expo flat config)
npm run test:unit    # node --test via tsx over lib/**/*.test.ts

npx supabase functions deploy api                              # deploy the main backend Edge Function
npx supabase functions deploy vapi-webhook                     # deploy the Vapi webhook receiver
npx supabase functions serve api --env-file supabase/.env.local --no-verify-jwt  # run it locally (needs Docker + npx supabase start)
```

Run a single test file: `node --import tsx --test lib/ai/__tests__/vapiTranscript.test.ts`.
Type-check: `npx tsc --noEmit`.

### Native build notes

- The `android/` and `ios/` folders are **generated and gitignored** (`/android`, `/ios` in `.gitignore`). On a fresh checkout they won't exist — generate with `npx expo prebuild --platform android --clean` before `npm run android`. Native config lives in `app.json` (plugins, permissions, `expo-build-properties` → `minSdkVersion 24`), not in hand-edited native files; re-running prebuild overwrites them.
- The Gradle build needs the Android SDK discoverable via `ANDROID_HOME` (or `android/local.properties` with `sdk.dir=...`). The first build downloads the Gradle distribution + JDK 17 + dependencies (several GB) into `~/.gradle`.
- `.npmrc` sets `legacy-peer-deps=true` — required for installs to resolve the Daily/WebRTC/Vapi peer-dependency graph. Keep it; `npm install` will fail without it.

**Typed routes gotcha:** `experiments.typedRoutes` is on, so `tsc` depends on generated route types in `.expo/types`. After adding/renaming routes (or on a fresh checkout) run `expo start` (or prebuild) once to regenerate them before expecting a clean type-check.

## Architecture

State flows through two React Context providers, nested in `app/_layout.tsx` (`ThemeProvider` → `AppDataProvider`):

- **`context/ThemeContext.tsx`** — light lavender theme by default (the "Mingle" look: white cards on `#F5F3FB`), with a dark variant behind the Settings theme toggle; theme mode, accent color, and haptics are user-configurable and persisted. Consume via `useTheme()` (gives `colors` — including `colors.mode` — and `settings`).
- **`context/AppDataContext.tsx`** — hydrates sessions/profile/saved-phrases once on mount and exposes CRUD that keeps in-memory state and storage in sync. Consume via `useAppData()`.

**All persistence goes through `lib/storage.ts`** — a typed AsyncStorage wrapper. Screens/contexts call the domain helpers (`listSessions`, `saveProfile`, etc.); never call AsyncStorage directly. Keys are namespaced under `@smalltalk/*`.

**Routing** (`expo-router`, file-based, in `app/`):
- `app/(tabs)/` — 3 tabs: `index` (Talk — picks from 3 trending Google News hot-topics, tap-to-toggle select, caption under the orb), `library`, `settings` (the Profile screen lives at `app/profile.tsx`, pushed from Settings → Account → Profile). The layout uses **Material Top Tabs** (`@react-navigation/material-top-tabs` + `react-native-pager-view`) via `withLayoutContext`, with `tabBarPosition="bottom"` — a bottom tab bar that also **swipes** between tabs. Adding/removing native deps like `react-native-pager-view` requires a native rebuild.
- `app/session/active.tsx` — the live conversation screen. It receives the chosen headline as a free-form `title` param (absent → generic chat) and forwards it (plus the `newsContext` param) to `fetchVapiSession`, which returns the backend-composed credentials + steering overrides; the saved result is labelled with the headline (`buildResult`'s `labelOverride`). It is **fully event-driven by the Vapi client**, not by user taps. A single mount effect fetches the session config, creates the client, starts the call, and maps Vapi events to UI: `call-start`/`speech-start`/`speech-end` move the orb mode (`idle → thinking → listening/speaking`); `volume-level` (assistant) and a Daily local audio-level observer (user mic) drive the orb's Reanimated `amplitude` per turn; `message` rebuilds the transcript from each `conversation-update` (replace, via `normalizeVapiConversation`) and detects end. A 180s countdown and the "End conversation" button both `scheduleFinish`, which stops the client, awaits `buildAiResult` (deterministic score + AI critic feedback), persists the session, and routes to results. The mid-call cleanup path stays synchronous (`buildResult`, no AI call) but still saves if the user leaves with any captured user turns. Gestures are disabled so users can't swipe out mid-session.
- `app/session/[id].tsx` — post-session results; renders the score indices, suggestions, and the AI critic's `moments`.

**Shared modules:**
- `components/Orb.tsx` — the central animated orb: a gradient "face" with smiley eyes that floats with a gentle bounce. The face keeps a fixed size; only the outer ring (and glow halo) swells with the Reanimated shared `amplitude` value. In-call it's fed from the assistant `volume-level` while the AI speaks and from a Daily local audio-level observer while the user speaks; `variant="ai"` is the purple/pink face, `variant="user"` cross-fades to a slowly-shifting blue one during the user's turn. `components/SoundBars.tsx` renders the vertical voice-level bars flanking the orb in a live session, driven by the same `amplitude`.
- `styles/global.ts` — design tokens: `makeColors(accent)`, `spacing`, `radius`, `typography`, `layout`, `ACCENT_PRESETS`. Build dynamic styles from these; static layout uses `StyleSheet.create`.
- `types/index.ts` — all shared types (imported as `../../types`). Note `@/*` path alias maps to repo root. Includes `FeedbackMoment` and the optional `SessionResult.moments` consumed by the critic and the results screen.

## Conventions

- Functional components, TypeScript `strict`, explicit prop/type declarations.
- New Architecture (`newArchEnabled`) and React Compiler (`experiments.reactCompiler`) are enabled.
- Keep code free of placeholder comments and TODOs — components must be fully implemented.
