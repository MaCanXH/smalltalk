import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../../context/ThemeContext";
import { useAppData } from "../../context/AppDataContext";
import { speak } from "../../lib/speech/tts";
import { clearAll } from "../../lib/storage";
import { ACCENT_PRESETS, spacing, radius, typography } from "../../styles/global";

export default function SettingsScreen() {
  const { colors, settings, setAccent, updateSettings } = useTheme();
  const { refresh } = useAppData();

  const resetAll = () => {
    Alert.alert(
      "Reset everything?",
      "This deletes all saved trainings, phrases and profile info from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await clearAll();
            await refresh();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[typography.h1, { color: colors.text }]}>Settings</Text>

        {/* Theme colour */}
        <Text style={[styles.section, { color: colors.textFaint }]}>THEME COLOUR</Text>
        <Text style={[typography.small, { color: colors.textDim, marginBottom: spacing.md }]}>
          The app stays dark — pick the accent that drives the orb and highlights.
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

        {/* Voice */}
        <Text style={[styles.section, { color: colors.textFaint }]}>AI VOICE</Text>
        <Stepper
          colors={colors}
          label="Speech speed"
          value={settings.ttsRate}
          onChange={(v) => updateSettings({ ttsRate: clamp(v, 0.5, 1.6) })}
        />
        <Stepper
          colors={colors}
          label="Pitch"
          value={settings.ttsPitch}
          onChange={(v) => updateSettings({ ttsPitch: clamp(v, 0.6, 1.6) })}
        />
        <Pressable
          onPress={() =>
            speak("Hey! This is how I'll sound during our chats.", {
              rate: settings.ttsRate,
              pitch: settings.ttsPitch,
            })
          }
          style={[styles.testBtn, { borderColor: colors.accent }]}
        >
          <Ionicons name="volume-high" size={18} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: "600" }}>Test voice</Text>
        </Pressable>

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

        {/* Data */}
        <Text style={[styles.section, { color: colors.textFaint }]}>DATA</Text>
        <Pressable
          onPress={resetAll}
          style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.danger }]}
        >
          <Text style={[typography.body, { color: colors.danger }]}>Reset all local data</Text>
          <Ionicons name="trash" size={20} color={colors.danger} />
        </Pressable>

        <Text style={[typography.tiny, { color: colors.textFaint, marginTop: spacing.xl, textAlign: "center" }]}>
          Small Talk · 100% on-device · no account, no server
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stepper({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[typography.body, { color: colors.text }]}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => onChange(round(value - 0.1))} hitSlop={8}>
          <Ionicons name="remove-circle" size={26} color={colors.textDim} />
        </Pressable>
        <Text style={[typography.body, { color: colors.text, width: 44, textAlign: "center" }]}>
          {value.toFixed(1)}×
        </Text>
        <Pressable onPress={() => onChange(round(value + 0.1))} hitSlop={8}>
          <Ionicons name="add-circle" size={26} color={colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function round(n: number) {
  return Math.round(n * 10) / 10;
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
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginBottom: spacing.sm,
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
});
