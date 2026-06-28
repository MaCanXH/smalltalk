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
import { TOPICS } from "../../lib/ai/banks";
import { spacing, radius, typography } from "../../styles/global";
import type { TopicId } from "../../types";

/** Three topics surfaced on the Talk tab (the rest stay in the catalog). */
const HOME_TOPICS = TOPICS.slice(0, 3);

export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const idleAmp = useSharedValue(0);
  const [topic, setTopic] = useState<TopicId>(HOME_TOPICS[0].id);

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
            {"What's in your mind?"}
          </Text>
        </View>

        <View style={styles.topicBlock}>
          {HOME_TOPICS.map((t) => {
            const active = t.id === topic;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTopic(t.id)}
                style={[
                  styles.topicBtn,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 20 }}>{t.emoji}</Text>
                <Text
                  style={{
                    color: active ? "#fff" : colors.text,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.orbWrap}>
          <Orb mode="idle" amplitude={idleAmp} color={colors.accent} onPress={start} />
          <Text style={[styles.hint, { color: colors.textFaint }]}>
            Tap to start · you lead the conversation
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    paddingTop: spacing.lg,
  },
  topicBlock: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  topicBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 18,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  orbWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  hint: {
    marginTop: spacing.lg,
    fontSize: 13,
    fontWeight: "500",
  },
});
