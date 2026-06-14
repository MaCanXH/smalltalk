import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppDataProvider } from "../context/AppDataContext";
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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AppDataProvider>
          <RootStack />
        </AppDataProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
