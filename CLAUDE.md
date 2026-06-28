# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Small Talk is a **conversation trainer** built with Expo Router (SDK 54). The user holds a live, real-time voice conversation with an AI partner for ~3 minutes, then gets a scored transcript.

It runs as a **native development build** (`expo-dev-client`), launched on an Android emulator / device — **not Expo Go**. The realtime voice stack (`@vapi-ai/react-native` over `@daily-co/react-native-webrtc`) ships custom native code, so Expo Go cannot load it. A network connection and Vapi credentials are required for a live session.

The AI voice is **real**, via Vapi (a hosted realtime voice-agent service):
- **`lib/ai/vapi.ts`** wraps the `Vapi` client and builds per-call assistant overrides. The small-talk **persona lives here** (`SMALL_TALK_PERSONA`) and is sent as a system-prompt override via `model.messages`. Because Vapi validates the `model` override as a full config, it must include `provider`/`model` (`anthropic` / `claude-haiku-4-5-20251001`) matching the dashboard assistant — a partial `model` 400s. `buildAssistantOverrides(topicLabel?)`: with a headline it appends topic-steering + a `firstMessage`; with none it's a generic open small-talk partner.
- **`lib/news/hotTopics.ts`** fetches the Google News RSS feed, picks 3 random top stories, and shortens each headline (strip `- Publisher` and any trailing clause, cap at 8 words + `…`) for the Talk tab. Keeps `short` (display) + `full` (steering).
- **`app/session/active.tsx`** is the live session — see Architecture. It subscribes to Vapi events and drives everything from them.
- **`lib/ai/vapiTranscript.ts`** rebuilds the full dialog from each Vapi `conversation-update` message (`normalizeVapiConversation`) — the message carries the entire conversation, so the session **replaces** (not appends) its transcript with Vapi's canonical, already-deduplicated turns. Prefers the timestamped `messages` array (`secondsFromStart`/`time`), falls back to the OpenAI-format `conversation` array. Also exposes `isVapiEndedMessage`.
- **Scoring** (`lib/ai/scoring.ts`, `buildResult`) is still deterministic and explainable — derived from the captured transcript (turn count, word variety, slang markers, time used), never graded by a model.

**Required env vars** (prefix `EXPO_PUBLIC_` so they reach the client; set before starting Metro):
`EXPO_PUBLIC_VAPI_PUBLIC_KEY`, `EXPO_PUBLIC_VAPI_ASSISTANT_ID`. Without both, the live session shows a "Missing Vapi configuration" error instead of connecting.

**`lib/ai/banks.ts`** holds the **topic catalog** (`TOPICS`/`getTopic` — `{ id, label, emoji }`, now used as the **offline fallback** for the Talk tab when Google News is unreachable, and for the Library emoji) and the **scoring word-banks** (`STALL_PHRASES`, `WORD_UPGRADES`, `SLANG_MARKERS`, consumed only by `scoring.ts`). There is no scripted dialogue — the conversation is live via Vapi. `lib/speech/tts.ts` (`speak`) is still live, used only for the voice preview in Settings. (The earlier offline-mock prototype — `lib/ai/engine.ts` `DialogEngine` and `lib/speech/useVoiceRecorder.ts` — has been removed.)

## Commands

```bash
npm start            # expo start — Metro dev server; open in the installed dev build (not Expo Go)
npm run android      # expo run:android — native Gradle build, install + launch on emulator/device
npm run ios          # expo run:ios
npm run web          # expo start --web
npm run lint         # expo lint (ESLint, eslint-config-expo flat config)
npm run test:unit    # node --test via tsx over lib/**/*.test.ts
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
- `app/session/active.tsx` — the live conversation screen. It receives the chosen headline as a free-form `title` param (absent → generic chat) and steers the call via `buildAssistantOverrides(title)`; the saved result is labelled with the headline (`buildResult`'s `labelOverride`). It is **fully event-driven by the Vapi client**, not by user taps. A single mount effect creates the client, starts the call, and maps Vapi events to UI: `call-start`/`speech-start`/`speech-end` move the orb mode (`idle → thinking → listening/speaking`); `volume-level` (assistant) and a Daily local audio-level observer (user mic) drive the orb's Reanimated `amplitude` per turn; `message` rebuilds the transcript from each `conversation-update` (replace, via `normalizeVapiConversation`) and detects end. A 180s countdown and the "End conversation" button both `scheduleFinish`, which stops the client, runs `buildResult`, persists the session, and routes to results. The cleanup path also saves if the user leaves mid-call with any captured user turns. Gestures are disabled so users can't swipe out mid-session.
- `app/session/[id].tsx` — post-session results.

**Shared modules:**
- `components/Orb.tsx` — the central animated reactive orb; driven by a Reanimated shared `amplitude` value. In-call it's fed from the assistant `volume-level` while the AI speaks and from a Daily local audio-level observer while the user speaks (the user-turn orb is red and icon-less). Supports `icon={null}` for a clean orb.
- `styles/global.ts` — design tokens: `makeColors(accent)`, `spacing`, `radius`, `typography`, `layout`, `ACCENT_PRESETS`. Build dynamic styles from these; static layout uses `StyleSheet.create`.
- `types/index.ts` — all shared types (imported as `../../types`). Note `@/*` path alias maps to repo root.

## Conventions

- Functional components, TypeScript `strict`, explicit prop/type declarations.
- New Architecture (`newArchEnabled`) and React Compiler (`experiments.reactCompiler`) are enabled.
- Keep code free of placeholder comments and TODOs — components must be fully implemented.
