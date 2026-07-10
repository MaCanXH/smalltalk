# Smalltalk

Smalltalk is an Expo app for AI voice conversation practice. It uses the Vapi React Native SDK for live voice calls and runs as a native development build, not in Expo Go.

## Requirements

- Node and npm
- Xcode for iOS builds
- Android Studio for Android builds
- A Supabase project with the `api` Edge Function deployed (`npx supabase functions deploy api`) and the `GROQ_API_KEY`, `VAPI_PUBLIC_KEY`, and `VAPI_ASSISTANT_ID` secrets set (`npx supabase secrets set NAME=value`) — the Vapi credentials are issued to the app per call by the backend, not shipped in env vars

## Environment

Create a local `.env` file:

```sh
EXPO_PUBLIC_FEEDBACK_API_URL=https://your-project-ref.supabase.co/functions/v1/api/feedback
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=replace_with_supabase_anon_key
```

## Install dependencies

Have to use --legacy-peer-deps because VAPI/Daily peer dependency conflict issue

```bash
npm install --legacy-peer-deps
```

## Local development

Build and install a local development client:

```bash
npx expo run:ios
# or
npx expo run:android
```

Start Metro for the dev client:

```bash
npx expo start --dev-client
```

If device discovery is unreliable, use:

```bash
npx expo start --dev-client --tunnel
```

Rebuild the native app after changing native dependencies or `app.json`.

## Physical iPhone testing

For Vapi voice testing, prefer a physical iPhone over the simulator.

Typical flow:

```bash
npx expo run:ios --device
npx expo start --dev-client
```

Requirements:

- iPhone connected to your Mac for the first install
- trusted computer pairing
- Developer Mode enabled on the phone if prompted
- Apple account configured in Xcode for signing

## EAS builds

This repo already includes EAS profiles in `eas.json`.

Development builds:

```bash
npx eas-cli@latest build --platform android --profile development
npx eas-cli@latest build --platform ios --profile development
npx eas-cli@latest build --platform ios --profile development-simulator
```

Preview build for sharing:

```bash
npx eas-cli@latest build --platform ios --profile preview
```

## Sharing with testers

For iOS, the `preview` profile uses internal distribution. That means the tester's iPhone must be registered for ad hoc provisioning before install.

Typical flow:

```bash
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

Then send the EAS build URL to the tester.

## Dependency note: Vapi and Daily peer mismatch

This project intentionally uses a newer Daily native stack than `@vapi-ai/react-native@0.3.0` declares in its peer dependencies:

- installed: `@daily-co/react-native-daily-js@0.86.0`
- installed: `@daily-co/react-native-webrtc@124.0.6-daily.1`
- Vapi peer metadata still points at the older `0.78.0` / `118.0.3-daily.4` line

This is deliberate. The older Daily stack pulls an older `daily-js` version that caused runtime compatibility problems in this app.

Practical impact:

- `npm install <package>` may fail with `ERESOLVE`
- local tool installs inside this repo can fail because npm re-checks the dependency graph

Recommended workflow:

```bash
npx eas-cli@latest <command>
npx expo install <package>
```

If you must install a non-Expo package and npm blocks on peer resolution:

```bash
npm install <package> --legacy-peer-deps
```

Avoid adding `eas-cli` as a local dependency in this repo.
