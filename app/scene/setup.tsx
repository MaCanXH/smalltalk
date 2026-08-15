import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";
import { shortenSceneLabel } from "../../lib/scenarios";
import { cardShadow, radius, spacing, typography } from "../../styles/global";

interface SetupCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  onChange: (next: string) => void;
  lines?: number;
}

function SetupCard({ icon, title, value, onChange, lines = 2 }: SetupCardProps) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => {
    onChange(draft.trim());
    setEditing(false);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.cardIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        {editing ? (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              numberOfLines={lines}
              style={[styles.editArea, { borderColor: colors.border, color: colors.text }]}
            />
            <Pressable onPress={save} hitSlop={8}>
              <Text style={[styles.saveText, { color: colors.accent }]}>Save</Text>
            </Pressable>
          </>
        ) : (
          <Text style={[styles.cardDesc, { color: colors.textDim }]}>{value}</Text>
        )}
      </View>
      {!editing && (
        <Pressable
          onPress={() => {
            setDraft(value);
            setEditing(true);
          }}
          hitSlop={8}
        >
          <Ionicons name="pencil" size={16} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

export default function SceneSetupScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    goal?: string;
    role?: string;
    scene?: string;
    personality?: string;
  }>();

  const [goal, setGoal] = useState(params.goal ?? "");
  const [role, setRole] = useState(params.role ?? "");
  const [scene, setScene] = useState(params.scene ?? "");
  // Carried through from the composer but not shown as an editable card;
  // defaults to friendly/supportive when the scene didn't specify one.
  const personality = params.personality?.trim() || "Friendly and supportive.";

  const startPractice = () => {
    router.push({
      pathname: "/session/active",
      params: {
        title: shortenSceneLabel(scene),
        sceneContext: JSON.stringify({ goal, role, scene, personality }),
      },
    });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.closeBtn, { backgroundColor: colors.surfaceAlt }]}
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color={colors.textDim} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.text }]}>Practice Setup</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SetupCard icon="flag" title="Your Goal" value={goal} onChange={setGoal} />
        <SetupCard icon="person" title="AI Role" value={role} onChange={setRole} />
        <SetupCard
          icon="map"
          title="Scene / Context"
          value={scene}
          onChange={setScene}
          lines={3}
        />
      </ScrollView>

      <View style={styles.sticky}>
        <Pressable
          onPress={startPractice}
          disabled={!goal.trim() || !role.trim() || !scene.trim()}
          style={[
            styles.startBtn,
            {
              backgroundColor: colors.accent,
              opacity: goal.trim() && role.trim() && scene.trim() ? 1 : 0.4,
            },
          ]}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.startText}>Start Practice</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  card: {
    flexDirection: "row",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...cardShadow,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 13.5, fontWeight: "700", marginBottom: 3 },
  cardDesc: { fontSize: 12.5, lineHeight: 17 },
  editArea: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 12.5,
    marginBottom: spacing.sm,
    textAlignVertical: "top",
  },
  saveText: { fontSize: 12, fontWeight: "700" },
  sticky: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: 15,
    ...cardShadow,
  },
  startText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
