---
name: run-app
description: Start the Small Talk app end-to-end - boot the Android emulator and launch the Expo dev build with Metro. Use when asked to run, start, or launch the app or the emulator.
---

# Run the Small Talk app

Launch order: emulator → Metro/app. All commands below are PowerShell (Windows). Paths assume the default Android SDK location `$env:LOCALAPPDATA\Android\Sdk`.

The Groq feedback/hot-topics backend is a **deployed Supabase Edge Function** (`supabase/functions/api/`) — there is no local server to start. `EXPO_PUBLIC_FEEDBACK_API_URL` points at it and the same URL works for the emulator and physical devices.

## 0. Preconditions

- `.env` at the repo root must contain `EXPO_PUBLIC_VAPI_PUBLIC_KEY`, `EXPO_PUBLIC_VAPI_ASSISTANT_ID`, and `EXPO_PUBLIC_FEEDBACK_API_URL` (already present in this repo). Expo CLI auto-loads `.env`. Do not print the values.
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` enable auth + cloud sync, and are also used to authenticate calls to the Edge Function. Without them the app still runs, but sign-in is skipped, everything stays on-device, and the backend (which requires a Supabase JWT) is unreachable — topics and feedback fall back to their offline paths.
- `GROQ_API_KEY` in `.env` is only needed when serving the Edge Function locally (`npx supabase functions serve api --env-file .env --no-verify-jwt`); the deployed function reads it from Supabase secrets.
- This app runs as a **native dev build**, not Expo Go.

## 1. Boot the emulator (skip if a device is already attached)

Check for a running device:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

If no device is listed, boot the AVD **Pixel_10** in the background (run_in_background — it never exits):

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_10
```

Then wait for boot to complete (polls until `sys.boot_completed` is `1`, typically 30–90 s):

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" wait-for-device shell "while [ \"$(getprop sys.boot_completed)\" != \"1\" ]; do sleep 2; done"
```

## 2. Start Metro and launch the app

First check whether the dev build is already installed:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell pm list packages com.macanxhs.smalltalk
```

**If installed** (output contains `com.macanxhs.smalltalk`) — just start Metro and open the app on the emulator (no Gradle build needed):

```powershell
npx expo start --android
```

Run in the background. `--android` auto-launches the installed dev build pointed at Metro.

**If NOT installed** — do a full native build + install + launch (also starts Metro). This takes several minutes:

```powershell
npm run android
```

If the `android/` folder is missing (fresh checkout), regenerate it first:

```powershell
npx expo prebuild --platform android --clean
```

## 3. Verify

- Metro logs show `Android Bundled` after the app connects.
- `adb shell pidof com.macanxhs.smalltalk` returns a PID once the app is running.
- When Supabase env vars are set, the app opens on a **sign-in gate** (Google / magic link / "Continue offline"); tap "Continue offline" to reach the tabs without an account.
- The Talk tab loads hot topics from the Edge Function; starting a session requires the Vapi env vars (a "Missing Vapi configuration" error means Metro was started without `.env` loaded).

## Troubleshooting

- **Emulator won't boot / disk full**: native builds fill the C: drive — clear old Gradle caches, keep Android Studio/SDK/emulator (see storage-cleanup notes).
- **Stale Metro or port 8081 busy**: kill the old process, then restart with `npx expo start --android --clear` to reset the bundler cache.
- **App installed but shows old JS**: the dev build only needs reinstalling (`npm run android`) when native deps or `app.json` plugins change; JS-only changes just need Metro. Note: adding Supabase brought in `expo-auth-session` (a native module), so the first run after that change needs one `npm run android` rebuild; afterwards Metro-only again.
- **OAuth/magic link doesn't return to the app**: the redirect uses the `smalltalk://` scheme — confirm it's in `app.json` and in Supabase → Authentication → URL Configuration (Redirect URLs). Cloud sync failing silently usually means the SQL schema (`supabase/schema.sql`) wasn't run or RLS has no policies; the app falls back to local-only.
- **AI critic falls back to deterministic scoring / Talk tab shows fallback topics**: the Edge Function isn't reachable or rejected the request — confirm `EXPO_PUBLIC_FEEDBACK_API_URL` points at `https://<project-ref>.supabase.co/functions/v1/api/feedback`, the Supabase env vars are set (the request needs a JWT), then restart Metro (env vars are read at Metro start). Function logs: Supabase dashboard → Edge Functions → api → Logs.
