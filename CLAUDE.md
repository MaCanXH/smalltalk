# Small Talk App - Local State Setup

## Architecture Decisions
- Framework: React Native with Expo (Managed Workflow)
- State Management: Local React Context + Local Storage Wrapper
- Local Storage Engine: `@react-native-async-storage/async-storage` (or `react-native-mmkv` if preferred)
- Component Paradigm: Functional Components with TypeScript types explicitly declared

## Formatting Rules
- Create a file `styles` with `global.ts` to store the global styles.
- Use inline styles with `StyleSheet.create` or Tailwind/NativeWind if configured.
- Avoid introducing any external Node.js backend infrastructure (`express`, `axios` for server calls).
- Keep code clean of placeholder comments. Ensure all written components are completely implemented.