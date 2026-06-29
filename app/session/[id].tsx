import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppData } from "../../context/AppDataContext";
import { useTheme } from "../../context/ThemeContext";
import { getSession } from "../../lib/storage";
import { radius, spacing, typography } from "../../styles/global";
import type { SavedPhrase, SessionResult } from "../../types";

export default function ResultScreen() {
  const { colors } = useTheme();
  const { sessions, addPhrase, phrases } = useAppData();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const fromState = useMemo(
    () => sessions.find((s) => s.id === id) ?? null,
    [sessions, id]
  );

  const [result, setResult] = useState<SessionResult | null>(fromState);

  useEffect(() => {
    if (!fromState && id) getSession(id).then(setResult);
    else setResult(fromState);
  }, [fromState, id]);

  if (!result) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.textDim, padding: spacing.lg }}>
          Loading result…
        </Text>
      </SafeAreaView>
    );
  }

  const date = new Date(result.date);
  const savedTexts = new Set(phrases.map((p) => p.text));

  const onSavePhrase = (text: string, kind: SavedPhrase["kind"]) => {
    void addPhrase({
      id: `p_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      text,
      kind,
      createdDate: new Date().toISOString(),
    });
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      edges={["top"]}
    >
      <View style={styles.navBar}>
        <Pressable onPress={() => router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>

        <Text style={[typography.h3, { color: colors.text }]}>
          Training Result
        </Text>

        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Score hero */}
        <View
          style={[
            styles.hero,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={{ fontSize: 46 }}>{result.vibeEmoji}</Text>

          <Text style={[styles.bigScore, { color: colors.accent }]}>
            {result.finalScore}
          </Text>

          <Text style={[typography.h3, { color: colors.text }]}>
            {result.grade}
          </Text>

          <Text
            style={[
              typography.small,
              { color: colors.textDim, marginTop: 4 },
            ]}
          >
            {result.topicLabel} · {Math.round(result.durationSec)}s ·{" "}
            {date.toLocaleDateString()}{" "}
            {date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {/* Indices */}
        <SectionTitle colors={colors}>Breakdown</SectionTitle>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {result.indices.map((idx) => (
            <View key={idx.key} style={styles.indexRow}>
              <View style={styles.indexHead}>
                <Text style={[typography.body, { color: colors.text }]}>
                  {idx.label}
                </Text>

                <Text
                  style={[
                    typography.body,
                    {
                      color: colors.accent,
                      fontWeight: "800",
                    },
                  ]}
                >
                  {idx.value}
                </Text>
              </View>

              <View
                style={[
                  styles.barTrack,
                  { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: colors.accent,
                      width: `${idx.value}%`,
                    },
                  ]}
                />
              </View>

              <Text
                style={[
                  typography.small,
                  { color: colors.textFaint, marginTop: 4 },
                ]}
              >
                {idx.blurb}
              </Text>
            </View>
          ))}
        </View>

        {/* Suggestions: words */}
        <SectionTitle colors={colors}>Word upgrades</SectionTitle>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {result.suggestions.words.map((w, i) => (
            <Text
              key={i}
              style={[
                typography.small,
                {
                  color: colors.textDim,
                  marginBottom: 8,
                },
              ]}
            >
              • {w}
            </Text>
          ))}
        </View>

        {/* Suggestions: stalling phrases */}
        <SectionTitle colors={colors}>Stalling phrases to steal</SectionTitle>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {result.suggestions.stalls.map((s, i) => {
            const saved = savedTexts.has(s);

            return (
              <View key={i} style={styles.phraseRow}>
                <Text
                  style={[
                    typography.body,
                    {
                      color: colors.text,
                      flex: 1,
                    },
                  ]}
                >
                  “{s}”
                </Text>

                <Pressable
                  onPress={() => onSavePhrase(s, "stall")}
                  disabled={saved}
                  hitSlop={8}
                >
                  <Ionicons
                    name={saved ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color={saved ? colors.accent : colors.textFaint}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Tips */}
        <SectionTitle colors={colors}>Coach tips</SectionTitle>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.accentSoft,
              borderColor: colors.accent,
            },
          ]}
        >
          {result.suggestions.tips.map((t, i) => (
            <Text
              key={i}
              style={[
                typography.small,
                {
                  color: colors.text,
                  marginBottom: 8,
                },
              ]}
            >
              💡 {t}
            </Text>
          ))}
        </View>

       {/* Conversation highlights */}
        {result.moments && result.moments.length > 0 ? (
          <>
            <SectionTitle colors={colors}>Conversation highlights</SectionTitle>

            <View style={styles.momentsList}>
              {result.moments.map((moment, i) => {
                const isAiPhrase = moment.type === "ai_phrase";
                const isUserUpgrade = moment.type === "user_upgrade";

                const badgeText = isAiPhrase
                  ? "AI PHRASE"
                  : isUserUpgrade
                    ? "YOUR RESPONSE"
                    : "TOPIC OPENER";

                const badgeEmoji = isAiPhrase
                  ? "🤖"
                  : isUserUpgrade
                    ? "🙋"
                    : "💬";

                const cardBg = isAiPhrase
                  ? colors.accentSoft
                  : isUserUpgrade
                    ? "#231A10"
                    : "#1B1630";

                const cardBorder = isAiPhrase
                  ? colors.accent
                  : isUserUpgrade
                    ? "#F59E0B"
                    : "#8B5CF6";

                const badgeBg = isAiPhrase
                  ? colors.accent
                  : isUserUpgrade
                    ? "#F59E0B"
                    : "#8B5CF6";

                return (
                  <View
                    key={i}
                    style={[
                      styles.momentCard,
                      {
                        backgroundColor: cardBg,
                        borderColor: cardBorder,
                      },
                    ]}
                  >
                    <View style={styles.momentHeader}>
                      <View style={[styles.momentBadge, { backgroundColor: badgeBg }]}>
                        <Text style={styles.momentBadgeText}>
                          {badgeEmoji} {badgeText}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[
                        typography.body,
                        {
                          color: colors.text,
                          fontWeight: "800",
                          marginTop: 12,
                        },
                      ]}
                    >
                      {moment.title}
                    </Text>

                    <Text
                      style={[
                        typography.tiny,
                        {
                          color: colors.textFaint,
                          marginTop: 10,
                        },
                      ]}
                    >
                      {isAiPhrase
                        ? "AI said"
                        : isUserUpgrade
                          ? "You said"
                          : "Conversation moment"}
                    </Text>

                    <Text style={[styles.quoteText, { color: colors.text }]}>
                      “{moment.quote}”
                    </Text>

                    <Text
                      style={[
                        typography.tiny,
                        {
                          color: colors.textFaint,
                          marginTop: 12,
                        },
                      ]}
                    >
                      {isAiPhrase
                        ? "Why this sounds natural"
                        : isUserUpgrade
                          ? "How to make it more natural"
                          : "Why this was a good opening"}
                    </Text>

                    <Text
                      style={[
                        typography.small,
                        {
                          color: colors.textDim,
                          marginTop: 4,
                        },
                      ]}
                    >
                      {moment.explanation}
                    </Text>

                    <Text
                      style={[
                        typography.tiny,
                        {
                          color: colors.textFaint,
                          marginTop: 12,
                        },
                      ]}
                    >
                      {isAiPhrase
                        ? "Steal this pattern"
                        : isUserUpgrade
                          ? "Try saying"
                          : "Try asking"}
                    </Text>

                    <Text style={[styles.tryText, { color: colors.text }]}>
                      {moment.suggestion}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Full dialog */}
        <SectionTitle colors={colors}>Full transcript</SectionTitle>

        <View style={styles.dialog}>
          {result.dialog.map((turn, i) => {
            const isUser = turn.speaker === "user";

            return (
              <View
                key={i}
                style={[
                  styles.bubble,
                  {
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    backgroundColor: isUser ? colors.accent : colors.surface,
                    borderColor: isUser ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.tiny,
                    {
                      color: isUser ? "#ffffffaa" : colors.textFaint,
                    },
                  ]}
                >
                  {isUser ? "YOU" : "AI"} · {fmt(turn.t)}
                </Text>

                <Text
                  style={{
                    color: isUser ? "#fff" : colors.text,
                    fontSize: 15,
                    marginTop: 3,
                  }}
                >
                  {turn.text}
                </Text>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={[styles.doneBtn, { backgroundColor: colors.accent }]}
        >
          <Text
            style={{
              color: "#fff",
              fontWeight: "700",
              fontSize: 16,
            }}
          >
            Done
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({
  children,
  colors,
}: {
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <Text
      style={[
        typography.tiny,
        {
          color: colors.textFaint,
          marginTop: spacing.lg,
          marginBottom: spacing.sm,
        },
      ]}
    >
      {String(children).toUpperCase()}
    </Text>
  );
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  hero: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
  },

  bigScore: {
    fontSize: 64,
    fontWeight: "900",
    marginTop: 4,
    letterSpacing: -2,
  },

  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },

  indexRow: {
    marginBottom: spacing.md,
  },

  indexHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  barTrack: {
    height: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
  },

  barFill: {
    height: "100%",
    borderRadius: radius.pill,
  },

  phraseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: spacing.sm,
  },

  momentsList: {
    gap: spacing.md,
  },

  momentCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },

  quoteText: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 25,
    marginTop: 4,
  },

  tryText: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
    marginTop: 4,
  },

  dialog: {
    gap: spacing.sm,
  },

  bubble: {
    maxWidth: "84%",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },

  doneBtn: {
    marginTop: spacing.xl,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
  },

  momentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  momentBadge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  momentBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
});