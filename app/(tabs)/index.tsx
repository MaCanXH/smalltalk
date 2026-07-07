import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { FALLBACK_TOPICS, fetchHotTopics, type HotTopic } from "../../lib/news/hotTopics";
import { spacing, radius, typography } from "../../styles/global";

export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const idleAmp = useSharedValue(0);

  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadTopics = useCallback((refresh = false) => {
    let active = true;
    setLoading(true);
    if (refresh) setSelectedId(null);

    fetchHotTopics(3, { refresh })
      .then((hot) => {
        if (active) setTopics(hot);
      })
      .catch(() => {
        if (active) setTopics(FALLBACK_TOPICS);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => loadTopics(false), [loadTopics]);

  const selected = useMemo(
    () => topics.find((t) => t.id === selectedId) ?? null,
    [topics, selectedId]
  );

  const toggle = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const start = () => {
    router.push({
      pathname: "/session/active",
      params: selected
        ? {
            title: selected.full,
            newsContext: JSON.stringify(selected),
          }
        : {},
    });
  };

  const caption = selected
    ? `Let's talk about: ${selected.short}`
    : "Let's talk about anything";

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[typography.tiny, { color: colors.accent }]}>SMALL TALK</Text>
          <Text style={[typography.h1, { color: colors.text, marginTop: 4 }]}>
            {"What's trending now"}
          </Text>
        </View>

        <View style={styles.topicHeader}>
          <Text style={[styles.topicHint, { color: colors.textDim }]}>
            Pick one topic, or refresh for a new set.
          </Text>
          <Pressable
            onPress={() => loadTopics(true)}
            disabled={loading}
            style={[styles.refreshBtn, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
              Refresh
            </Text>
          </Pressable>
        </View>

        <View style={styles.topicBlock}>
          {loading ? (
            <View style={[styles.topicBtn, styles.loadingBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.accent} />
              <Text style={{ color: colors.textDim, fontWeight: "600", fontSize: 15 }}>
                Loading AI topics…
              </Text>
            </View>
          ) : (
            topics.map((t) => {
              const active = t.id === selectedId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => toggle(t.id)}
                  style={[
                    styles.topicBtn,
                    {
                      backgroundColor: active ? colors.accent : colors.surface,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 20 }}>📰</Text>
                  <Text
                    style={{
                      color: active ? "#fff" : colors.text,
                      fontWeight: "700",
                      fontSize: 16,
                      flex: 1,
                    }}
                  >
                    {t.short}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.orbWrap}>
          <Orb mode="idle" amplitude={idleAmp} color={colors.accent} onPress={start} />
          <Text style={[styles.caption, { color: colors.textFaint }]} numberOfLines={1}>
            {caption}
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
  topicHeader: {
    marginTop: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  topicHint: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  refreshBtn: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  topicBlock: {
    marginTop: spacing.sm,
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
  loadingBtn: {
    justifyContent: "center",
  },
  orbWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  caption: {
    marginTop: spacing.lg,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
});
