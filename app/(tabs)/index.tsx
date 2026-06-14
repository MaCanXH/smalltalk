import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSharedValue } from "react-native-reanimated";

import { Orb } from "../../components/Orb";
import { useTheme } from "../../context/ThemeContext";
import { useAppData } from "../../context/AppDataContext";
import { TOPICS } from "../../lib/ai/banks";
import { spacing, radius, typography } from "../../styles/global";
import type { TopicId } from "../../types";

export default function HomeScreen() {
  const { colors } = useTheme();
  const { sessions } = useAppData();
  const router = useRouter();
  const idleAmp = useSharedValue(0);
  const [topic, setTopic] = useState<TopicId>(TOPICS[0].id);

  const best = sessions.reduce((m, s) => Math.max(m, s.finalScore), 0);

  const start = () => {
    router.push({ pathname: "/session/active", params: { topic } });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[typography.tiny, { color: colors.accent }]}>SMALL TALK</Text>
          <Text style={[typography.h1, { color: colors.text, marginTop: 4 }]}>
            Ready to talk?
          </Text>
          <Text style={[typography.body, { color: colors.textDim, marginTop: 6 }]}>
            Tap the orb and just start chatting. Three minutes, no script.
          </Text>
        </View>

        <View style={styles.orbWrap}>
          <Orb mode="idle" amplitude={idleAmp} color={colors.accent} onPress={start} />
          <Text style={[styles.hint, { color: colors.textFaint }]}>
            Tap to start · you lead the conversation
          </Text>
        </View>

        <View style={styles.topicBlock}>
          <Text style={[typography.small, { color: colors.textDim, marginBottom: spacing.sm }]}>
            What do you want to talk about?
          </Text>
          <View style={styles.chips}>
            {TOPICS.map((t) => {
              const active = t.id === topic;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTopic(t.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.accent : colors.surface,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 15 }}>{t.emoji}</Text>
                  <Text
                    style={{
                      color: active ? "#fff" : colors.textDim,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {sessions.length > 0 && (
          <View style={[styles.statRow]}>
            <Stat label="Sessions" value={String(sessions.length)} colors={colors} />
            <Stat label="Best score" value={String(best)} colors={colors} />
            <Stat
              label="Last vibe"
              value={sessions[0].vibeEmoji}
              colors={colors}
            />
          </View>
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
      <Text style={[typography.h3, { color: colors.text }]}>{value}</Text>
      <Text style={[typography.tiny, { color: colors.textFaint, marginTop: 2 }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    paddingTop: spacing.lg,
  },
  orbWrap: {
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  hint: {
    marginTop: spacing.lg,
    fontSize: 13,
    fontWeight: "500",
  },
  topicBlock: {
    marginTop: spacing.md,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  stat: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
});
