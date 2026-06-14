import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "../../context/ThemeContext";
import { useAppData } from "../../context/AppDataContext";
import { getTopic } from "../../lib/ai/banks";
import { spacing, radius, typography } from "../../styles/global";

export default function LibraryScreen() {
  const { colors } = useTheme();
  const { sessions, removeSession } = useAppData();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Text style={[typography.h1, { color: colors.text }]}>Library</Text>
        <Text style={[typography.body, { color: colors.textDim, marginTop: 4 }]}>
          {sessions.length} training{sessions.length === 1 ? "" : "s"} saved on this device
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {sessions.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Ionicons name="mic-outline" size={40} color={colors.textFaint} />
            <Text style={[typography.body, { color: colors.textDim, marginTop: spacing.md, textAlign: "center" }]}>
              No trainings yet.{"\n"}Tap the mic on the Talk tab to start your first chat.
            </Text>
          </View>
        ) : (
          sessions.map((s) => {
            const topic = getTopic(s.topic);
            return (
              <Pressable
                key={s.id}
                onPress={() =>
                  router.push({ pathname: "/session/[id]", params: { id: s.id } })
                }
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.scoreChip, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[styles.scoreNum, { color: colors.accent }]}>{s.finalScore}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.h3, { color: colors.text }]}>
                    {topic.emoji} {s.topicLabel}
                  </Text>
                  <Text style={[typography.small, { color: colors.textDim, marginTop: 2 }]}>
                    {s.grade}
                  </Text>
                  <Text style={[typography.tiny, { color: colors.textFaint, marginTop: 4 }]}>
                    {new Date(s.date).toLocaleString()} · {Math.round(s.durationSec)}s
                  </Text>
                </View>
                <Pressable onPress={() => removeSession(s.id)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.sm },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  scoreChip: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNum: { fontSize: 20, fontWeight: "900" },
});
