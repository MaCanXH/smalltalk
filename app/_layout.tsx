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
      <StatusBar style={colors.mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="scene/setup"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="session/active"
          options={{ animation: "fade", gestureEnabled: false }}
        />
        <Stack.Screen name="session/[id]" />
        <Stack.Screen name="profile" />
      </Stack>
    </>
  );
}

/**
 * Decides between the sign-in gate and the app. Signed-in users (or when
 * Supabase isn't configured at all) go straight to the app; everyone else must
 * sign in — the backend attributes sessions per user, so there is no
 * skip-sign-in path.
 */
function AuthGate() {
  const { colors } = useTheme();
  const { user, ready: authReady, configured } = useAuth();

  const app = (
    <AppDataProvider>
      <RootStack />
    </AppDataProvider>
  );

  if (!configured) return app;

  // Still resolving the persisted session — hold on a blank bg.
  if (!authReady) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  if (user) return app;

  return <SignInScreen />;
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
