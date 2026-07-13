import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import {
  ACCENT_PRESETS,
  cardShadow,
  spacing,
  radius,
  typography,
} from "../../styles/global";

export default function SettingsScreen() {
  const { colors, settings, setAccent, updateSettings } = useTheme();
  const { user, configured, signOut } = useAuth();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[typography.h1, { color: colors.text }]}>Settings</Text>

        {/* Theme mode */}
        <Text style={[styles.section, { color: colors.textFaint }]}>THEME</Text>
        <View style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.rowLabel}>
            <Ionicons
              name={settings.theme === "dark" ? "moon" : "sunny"}
              size={20}
              color={colors.accent}
            />
            <Text style={[typography.body, { color: colors.text }]}>Dark theme</Text>
          </View>
          <Switch
            value={settings.theme === "dark"}
            onValueChange={(v) => updateSettings({ theme: v ? "dark" : "light" })}
            trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
            thumbColor="#fff"
          />
        </View>

        {/* Theme colour */}
        <Text style={[styles.section, { color: colors.textFaint }]}>THEME COLOUR</Text>
        <Text style={[typography.small, { color: colors.textDim, marginBottom: spacing.md }]}>
          Pick the accent that drives the highlights.
        </Text>
        <View style={styles.swatches}>
          {ACCENT_PRESETS.map((preset) => {
            const active = settings.accent === preset.value;
            return (
              <Pressable
                key={preset.value}
                onPress={() => setAccent(preset.value)}
                style={styles.swatchWrap}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: preset.value,
                      borderColor: active ? colors.text : "transparent",
                    },
                  ]}
                >
                  {active && <Ionicons name="checkmark" size={22} color="#fff" />}
                </View>
                <Text style={[typography.tiny, { color: colors.textDim, marginTop: 4 }]}>
                  {preset.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Haptics */}
        <Text style={[styles.section, { color: colors.textFaint }]}>FEEDBACK</Text>
        <View style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[typography.body, { color: colors.text }]}>Haptic feedback</Text>
          <Switch
            value={settings.hapticsEnabled}
            onValueChange={(v) => updateSettings({ hapticsEnabled: v })}
            trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
            thumbColor="#fff"
          />
        </View>

        {/* Account — signed-out users never reach the tabs (the sign-in gate
            blocks them), so only the signed-in rows exist. */}
        <Text style={[styles.section, { color: colors.textFaint }]}>ACCOUNT</Text>
        {configured && user && (
          <View
            style={[
              styles.toggleRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={[typography.body, { color: colors.text }]}>
                Signed in
              </Text>
              <Text
                style={[typography.small, { color: colors.textDim }]}
                numberOfLines={1}
              >
                {user.email ?? "Synced across devices"}
              </Text>
            </View>
            <Ionicons name="cloud-done" size={20} color={colors.success} />
          </View>
        )}
        <Pressable
          onPress={() => router.push("/profile")}
          style={[
            styles.toggleRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.rowLabel}>
            <Ionicons name="person" size={20} color={colors.accent} />
            <Text style={[typography.body, { color: colors.text }]}>Profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
        </Pressable>
        {configured && user && (
          <Pressable
            onPress={signOut}
            style={[
              styles.toggleRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[typography.body, { color: colors.text }]}>Sign out</Text>
            <Ionicons name="log-out-outline" size={20} color={colors.textDim} />
          </Pressable>
        )}

        <Text style={[typography.tiny, { color: colors.textFaint, marginTop: spacing.xl, textAlign: "center" }]}>
          Small Talk · local-first · optional cloud sync
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  section: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  swatchWrap: { alignItems: "center", width: 64 },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginBottom: spacing.sm,
    ...cardShadow,
  },
  rowLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
