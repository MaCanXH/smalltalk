# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Small Talk is an **offline, client-side-only** conversation trainer built with Expo Router (SDK 54), designed to run inside **Expo Go**. The offline + Expo Go constraints drive every major technical choice — there is no backend, no network, and no real LLM. Do not introduce server infrastructure (`express`, server-side `axios`) or any cloud/on-device LLM: both were deliberately ruled out (cloud needs network, on-device LLM needs a custom dev build).

The "AI" is a local rule-based illusion:
- **AI replies**: `lib/ai/engine.ts` (`DialogEngine`) mixes topic banks, keyword reactions, stall phrases, and follow-up questions from `lib/ai/banks.ts`. No model.
- **User's voice**: the mic is genuinely recorded + metered via `expo-audio` (`lib/speech/useVoiceRecorder.ts`) only to drive the orb's reactive visuals. The transcript **text** is *simulated* from topic banks — there is no offline transcription in Expo Go. This "Wizard of Oz" approach is intentional.
- **AI voice**: real on-device TTS via `expo-speech` (`lib/speech/tts.ts`). No subtitles are shown during a live session by design.
- **Scoring**: `lib/ai/scoring.ts` derives scores deterministically from real transcript signals (turn count, word variety, slang markers, time used) — explainable, not graded by a model.

## Commands

```bash
npm start            # expo start (dev server + QR for Expo Go)
npm run android      # expo start --android
npm run ios          # expo start --ios
npm run web          # expo start --web
npm run lint         # expo lint (ESLint, eslint-config-expo flat config)
npm run reset-project # scripts/reset-project.js — scaffolding reset; not needed for normal dev
```

There is no test runner configured. Type-check with `npx tsc --noEmit`.

**Typed routes gotcha:** `experiments.typedRoutes` is on, so `tsc` depends on generated route types in `.expo/types`. After adding/renaming routes (or on a fresh checkout) run `expo start` once to regenerate them before expecting a clean type-check.

## Architecture

State flows through two React Context providers, nested in `app/_layout.tsx` (`ThemeProvider` → `AppDataProvider`):

- **`context/ThemeContext.tsx`** — theme is always dark; only the accent color + TTS prefs are user-configurable and persisted. Consume via `useTheme()` (gives `colors`, `settings`).
- **`context/AppDataContext.tsx`** — hydrates sessions/profile/saved-phrases once on mount and exposes CRUD that keeps in-memory state and storage in sync. Consume via `useAppData()`.

**All persistence goes through `lib/storage.ts`** — a typed AsyncStorage wrapper. Screens/contexts call the domain helpers (`listSessions`, `saveProfile`, etc.); never call AsyncStorage directly. Keys are namespaced under `@smalltalk/*`.

**Routing** (`expo-router`, file-based, in `app/`):
- `app/(tabs)/` — 4 tabs: `index` (Talk/mic), `library`, `profile`, `settings`. (Spec said 3; Talk needs its own reachable tab.)
- `app/session/active.tsx` — the live conversation screen. It's a small state machine (`idle → speaking → thinking → listening`) orchestrating `DialogEngine`, the recorder, and TTS; tapping the orb advances turns. Gestures disabled so users can't swipe out mid-session.
- `app/session/[id].tsx` — post-session results.

**Shared modules:**
- `components/Orb.tsx` — the central animated reactive orb (the chosen UI direction); driven by a Reanimated shared `amplitude` value from the recorder.
- `styles/global.ts` — design tokens: `makeColors(accent)`, `spacing`, `radius`, `typography`, `layout`, `ACCENT_PRESETS`. Build dynamic styles from these; static layout uses `StyleSheet.create`.
- `types/index.ts` — all shared types (imported as `../../types`). Note `@/*` path alias maps to repo root.

## Conventions

- Functional components, TypeScript `strict`, explicit prop/type declarations.
- New Architecture (`newArchEnabled`) and React Compiler (`experiments.reactCompiler`) are enabled.
- Keep code free of placeholder comments and TODOs — components must be fully implemented.
