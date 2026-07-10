# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Small Talk is a **conversation trainer** built with Expo Router (SDK 54). The user holds a live, real-time voice conversation with an AI partner for ~3 minutes, then gets a scored transcript.

It runs as a **native development build** (`expo-dev-client`), launched on an Android emulator / device — **not Expo Go**. The realtime voice stack (`@vapi-ai/react-native` over `@daily-co/react-native-webrtc`) ships custom native code, so Expo Go cannot load it. A network connection and Vapi credentials are required for a live session.

The AI voice is **real**, via Vapi (a hosted realtime voice-agent service):
- **`lib/ai/vapi.ts`** wraps the `Vapi` client. Per-call config comes from the backend: `fetchVapiSession(topicLabel?, newsContext?)` POSTs to the Edge Function's `/api/vapi/session` route (JWT-authenticated) and gets back `{ publicKey, assistantId, overrides }` — the Vapi credentials and the composed system prompt never ship in the bundle or in client env vars.
- **`supabase/functions/api/vapiSession.ts`** is where the small-talk **persona now lives** (`SMALL_TALK_PERSONA`), composed with optional topic-steering + a `firstMessage` when a headline/news pack is supplied (no headline → generic open small-talk partner). Because Vapi validates the `model` override as a full config, it must include `provider`/`model` (`anthropic` / `claude-haiku-4-5-20251001`) matching the dashboard assistant — a partial `model` 400s. Persona/model changes are a `supabase functions deploy api`, not an app release. The WebRTC call itself still runs on-device.
- **`lib/news/hotTopics.ts`** fetches the Google News RSS feed, picks 3 random top stories, and shortens each headline (strip `- Publisher` and any trailing clause, cap at 8 words + `…`) for the Talk tab. Keeps `short` (display) + `full` (steering).
- **`app/session/active.tsx`** is the live session — see Architecture. It subscribes to Vapi events and drives everything from them.
- **`lib/ai/vapiTranscript.ts`** rebuilds the full dialog from each Vapi `conversation-update` message (`normalizeVapiConversation`) — the message carries the entire conversation, so the session **replaces** (not appends) its transcript with Vapi's canonical, already-deduplicated turns. Prefers the timestamped `messages` array (`secondsFromStart`/`time`), falls back to the OpenAI-format `conversation` array. Also exposes `isVapiEndedMessage`.
- **Scoring** (`lib/ai/scoring.ts`, `buildResult`) is deterministic and explainable — derived from the captured transcript (turn count, word variety, slang markers, time used), never graded by a model. It is the base result and the offline fallback.
- **AI critic** (`lib/ai/critic.ts`, `buildAiResult`) wraps `buildResult`: it POSTs the labelled transcript to the backend Edge Function, which asks **Groq** (`llama-3.1-8b-instant`) for qualitative coaching (richer `suggestions` + `moments`), then **merges that over the deterministic result**. If `EXPO_PUBLIC_FEEDBACK_API_URL` is unset or the call fails, it silently falls back to local `buildResult`. The numeric **score stays deterministic** — only the qualitative feedback is model-generated. The transcript is sent as numbered, speaker-tagged turns (`[n] USER:` / `[n] AI PARTNER:`) and the server prompt enforces strict role rules so the critic doesn't confuse the user's lines with the AI partner's.
- **`supabase/functions/api/`** — the backend, a **Supabase Edge Function** (Deno) named `api`, deployed with `npx supabase functions deploy api`. One function routes all endpoints internally: `POST .../functions/v1/api/feedback` (the critic), `GET .../functions/v1/api/hot-topics` (the news topic packs consumed by `lib/news/hotTopics.ts`), and `POST .../functions/v1/api/vapi/session` (per-call Vapi config, see above). Reads `GROQ_API_KEY`, `VAPI_PUBLIC_KEY`, and `VAPI_ASSISTANT_ID` from **Supabase secrets** — never shipped to the client. JWT verification is on (`verify_jwt` in `supabase/config.toml`): requests must carry a Supabase JWT, which the app adds via `getFunctionsAuthHeaders()` in `lib/supabase.ts` (signed-in user's access token, anon-key fallback for skipped/offline users). The single-function layout is deliberate — the app derives the hot-topics URL from `EXPO_PUBLIC_FEEDBACK_API_URL` by stripping `/api/feedback`, and both routes living under `/functions/v1/api/` keeps that working. Local dev: `npx supabase start` then `npx supabase functions serve api --env-file .env --no-verify-jwt` (needs Docker). The function's Deno code is excluded from `tsc` (tsconfig `exclude`) and ESLint (flat-config `ignores`); keep the response JSON shapes in sync with the client's `normalizeTopic` / `validateAiFeedback`. (The earlier local Express backend, `server.mjs`, has been removed.)

**Required env vars** (prefix `EXPO_PUBLIC_` so they reach the client; set before starting Metro):
`EXPO_PUBLIC_FEEDBACK_API_URL` — the deployed Edge Function's feedback route (`https://<project-ref>.supabase.co/functions/v1/api/feedback`, same URL for emulator and physical device). All backend routes derive from it (`lib/backend.ts` `getBackendBaseUrl` strips `/api/feedback`): the AI critic, hot topics, **and the live session** (`/api/vapi/session` issues the Vapi config). Without it, results fall back to deterministic scoring, the Talk tab to the offline topic catalog, and the live session shows a "Missing backend configuration" error instead of connecting. `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` are also needed for backend calls (they authenticate the JWT-verified function).

**Server-side secrets** (Supabase secrets, never in the client bundle): `GROQ_API_KEY` (critic + topic packs), `VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID` (issued per-call by `/api/vapi/session`). Set with `npx supabase secrets set NAME=value`. `GROQ_API_KEY` also sits in local `.env` solely for `supabase functions serve`.

**`lib/ai/banks.ts`** holds the **topic catalog** (`TOPICS`/`getTopic` — `{ id, label, emoji }`, now used as the **offline fallback** for the Talk tab when Google News is unreachable, and for the Library emoji) and the **scoring word-banks** (`STALL_PHRASES`, `WORD_UPGRADES`, `SLANG_MARKERS`, consumed only by `scoring.ts`). There is no scripted dialogue — the conversation is live via Vapi. `lib/speech/tts.ts` (`speak`) is still live, used only for the voice preview in Settings. (The earlier offline-mock prototype — `lib/ai/engine.ts` `DialogEngine` and `lib/speech/useVoiceRecorder.ts` — has been removed.)

## Commands

```bash
npm start            # expo start — Metro dev server; open in the installed dev build (not Expo Go)
npm run android      # expo run:android — native Gradle build, install + launch on emulator/device
npm run ios          # expo run:ios
npm run web          # expo start --web
npm run lint         # expo lint (ESLint, eslint-config-expo flat config)
npm run test:unit    # node --test via tsx over lib/**/*.test.ts

npx supabase functions deploy api                              # deploy the Groq backend Edge Function
npx supabase functions serve api --env-file .env --no-verify-jwt  # run it locally (needs Docker + npx supabase start)
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

- **`context/ThemeContext.tsx`** — theme is always dark; only the accent color + TTS prefs are user-configurable and persisted. Consume via `useTheme()` (gives `colors`, `settings`).
- **`context/AppDataContext.tsx`** — hydrates sessions/profile/saved-phrases once on mount and exposes CRUD that keeps in-memory state and storage in sync. Consume via `useAppData()`.

**All persistence goes through `lib/storage.ts`** — a typed AsyncStorage wrapper. Screens/contexts call the domain helpers (`listSessions`, `saveProfile`, etc.); never call AsyncStorage directly. Keys are namespaced under `@smalltalk/*`.

**Routing** (`expo-router`, file-based, in `app/`):
- `app/(tabs)/` — 4 tabs: `index` (Talk — picks from 3 trending Google News hot-topics, tap-to-toggle select, caption under the orb), `library`, `profile`, `settings`. The layout uses **Material Top Tabs** (`@react-navigation/material-top-tabs` + `react-native-pager-view`) via `withLayoutContext`, with `tabBarPosition="bottom"` — a bottom tab bar that also **swipes** between tabs. Adding/removing native deps like `react-native-pager-view` requires a native rebuild.
- `app/session/active.tsx` — the live conversation screen. It receives the chosen headline as a free-form `title` param (absent → generic chat) and forwards it (plus the `newsContext` param) to `fetchVapiSession`, which returns the backend-composed credentials + steering overrides; the saved result is labelled with the headline (`buildResult`'s `labelOverride`). It is **fully event-driven by the Vapi client**, not by user taps. A single mount effect fetches the session config, creates the client, starts the call, and maps Vapi events to UI: `call-start`/`speech-start`/`speech-end` move the orb mode (`idle → thinking → listening/speaking`); `volume-level` (assistant) and a Daily local audio-level observer (user mic) drive the orb's Reanimated `amplitude` per turn; `message` rebuilds the transcript from each `conversation-update` (replace, via `normalizeVapiConversation`) and detects end. A 180s countdown and the "End conversation" button both `scheduleFinish`, which stops the client, awaits `buildAiResult` (deterministic score + AI critic feedback), persists the session, and routes to results. The mid-call cleanup path stays synchronous (`buildResult`, no AI call) but still saves if the user leaves with any captured user turns. Gestures are disabled so users can't swipe out mid-session.
- `app/session/[id].tsx` — post-session results; renders the score indices, suggestions, and the AI critic's `moments`.

**Shared modules:**
- `components/Orb.tsx` — the central animated reactive orb; driven by a Reanimated shared `amplitude` value. In-call it's fed from the assistant `volume-level` while the AI speaks and from a Daily local audio-level observer while the user speaks (the user-turn orb is red and icon-less). Supports `icon={null}` for a clean orb.
- `styles/global.ts` — design tokens: `makeColors(accent)`, `spacing`, `radius`, `typography`, `layout`, `ACCENT_PRESETS`. Build dynamic styles from these; static layout uses `StyleSheet.create`.
- `types/index.ts` — all shared types (imported as `../../types`). Note `@/*` path alias maps to repo root. Includes `FeedbackMoment` and the optional `SessionResult.moments` consumed by the critic and the results screen.

## Conventions

- Functional components, TypeScript `strict`, explicit prop/type declarations.
- New Architecture (`newArchEnabled`) and React Compiler (`experiments.reactCompiler`) are enabled.
- Keep code free of placeholder comments and TODOs — components must be fully implemented.
