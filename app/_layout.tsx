import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { SignInScreen } from "../components/SignInScreen";
import { AppDataProvider } from "../context/AppDataContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";

function RootStack() {
  const { colors } = useTheme();
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="session/active"
          options={{ animation: "fade", gestureEnabled: false }}
        />
        <Stack.Screen name="session/[id]" />
      </Stack>
    </>
  );
}

/**
 * Decides between the sign-in gate and the app. Signed-in users (or those who
 * chose "continue offline", or when Supabase isn't configured) go straight to
 * the app; everyone else sees the gate first.
 */
function AuthGate() {
  const { colors } = useTheme();
  const { user, ready: authReady, configured, skipped, continueOffline } =
    useAuth();

  const app = (
    <AppDataProvider>
      <RootStack />
    </AppDataProvider>
  );

  if (!configured) return app;

  // Still resolving the persisted session / skip choice — hold on a blank bg.
  if (!authReady) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  if (user || skipped) return app;

  return <SignInScreen onContinueOffline={continueOffline} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
