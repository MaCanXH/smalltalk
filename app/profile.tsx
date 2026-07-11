import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "../context/ThemeContext";
import { useAppData } from "../context/AppDataContext";
import { spacing, radius, typography } from "../styles/global";
import type { UserProfile } from "../types";

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, updateProfile, sessions, phrases, removePhrase } = useAppData();
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [dirty, setDirty] = useState(false);

  const set = (patch: Partial<UserProfile>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const save = () => {
    void updateProfile(draft);
    setDirty(false);
  };

  const avg =
    sessions.length > 0
      ? Math.round(sessions.reduce((a, s) => a + s.finalScore, 0) / sessions.length)
      : 0;
  const best = sessions.reduce((m, s) => Math.max(m, s.finalScore), 0);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text style={[typography.h1, { color: colors.text }]}>Profile</Text>
        </View>

        <View style={[styles.avatar, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <Text style={{ fontSize: 34 }}>🗣️</Text>
        </View>

        <View style={styles.statRow}>
          <Stat colors={colors} label="Sessions" value={String(sessions.length)} />
          <Stat colors={colors} label="Avg score" value={String(avg)} />
          <Stat colors={colors} label="Best" value={String(best)} />
        </View>

        <Field colors={colors} label="Name" value={draft.name} onChange={(v) => set({ name: v })} />
        <Field colors={colors} label="Handle" value={draft.handle} onChange={(v) => set({ handle: v })} />
        <Field colors={colors} label="Goal" value={draft.goal} onChange={(v) => set({ goal: v })} multiline />
        <Field colors={colors} label="Native language" value={draft.nativeLanguage} onChange={(v) => set({ nativeLanguage: v })} />
        <Field colors={colors} label="Target language" value={draft.targetLanguage} onChange={(v) => set({ targetLanguage: v })} />

        {dirty && (
          <Pressable onPress={save} style={[styles.saveBtn, { backgroundColor: colors.accent }]}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Save changes</Text>
          </Pressable>
        )}

        <Text style={[typography.tiny, { color: colors.textFaint, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          SAVED PHRASES ({phrases.length})
        </Text>
        {phrases.length === 0 ? (
          <Text style={[typography.small, { color: colors.textFaint }]}>
            Bookmark phrases from your training results and they{"'"}ll show up here.
          </Text>
        ) : (
          phrases.map((p) => (
            <View
              key={p.id}
              style={[styles.phrase, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15 }}>“{p.text}”</Text>
                <Text style={[typography.tiny, { color: colors.textFaint, marginTop: 2 }]}>
                  {p.kind.toUpperCase()}
                </Text>
              </View>
              <Pressable onPress={() => removePhrase(p.id)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.textFaint} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[typography.h2, { color: colors.accent }]}>{value}</Text>
      <Text style={[typography.tiny, { color: colors.textFaint }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  colors,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useTheme>["colors"];
  multiline?: boolean;
}) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[typography.tiny, { color: colors.textFaint, marginBottom: 6 }]}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholderTextColor={colors.textFaint}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            color: colors.text,
            minHeight: multiline ? 64 : undefined,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  statRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  stat: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  saveBtn: {
    marginTop: spacing.lg,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  phrase: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
