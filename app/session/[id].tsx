import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppData } from "../../context/AppDataContext";
import { useTheme } from "../../context/ThemeContext";
import { getSession } from "../../lib/storage";
import { radius, spacing, typography } from "../../styles/global";
import type { DialogTurn, FeedbackMoment, SessionResult } from "../../types";

const CHIP_ICONS = ["airplane", "color-palette", "calendar", "chatbubble-ellipses"] as const;

export default function ResultScreen() {
  const { colors } = useTheme();
  const { sessions } = useAppData();
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

  const hero = buildHero(result.finalScore);
  const keywords = result.keywords?.length ? result.keywords : [result.topicLabel];
  const highlights = result.highlights?.slice(0, 2) ?? [];

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      edges={["top"]}
    >
      <View style={styles.navBar}>
        <Pressable onPress={() => router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>

        <Text style={[typography.h3, { color: colors.text }]}>Feedback</Text>

        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, { borderColor: colors.accent }]}>
          <View style={[styles.emojiGlow, { borderColor: colors.accent }]}> 
            <Text style={styles.heroEmoji}>{hero.emoji}</Text>
          </View>
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle}>{hero.title}</Text>
            <Text style={styles.heroSpark}>⌁</Text>
          </View>
          <Text style={styles.heroSubtitle}>{hero.subtitle}</Text>
        </View>

        <Panel title="Keywords" icon="search" iconColor={colors.accent}>
          <View style={styles.keywordWrap}>
            {keywords.slice(0, 4).map((keyword, i) => (
              <View key={`${keyword}_${i}`} style={[styles.keywordChip, { borderColor: colors.accent }]}> 
                <Ionicons
                  name={CHIP_ICONS[i] ?? "pricetag"}
                  size={17}
                  color={colors.accent}
                />
                <Text style={[styles.keywordText, { color: "#7DB1FF" }]}>
                  {keyword}
                </Text>
              </View>
            ))}
          </View>
        </Panel>

        {highlights.length > 0 ? (
          <Panel title="Highlights" icon="star-outline" iconColor="#FACC15">
            <View style={styles.highlightGrid}>
              {highlights.map((highlight, i) => (
                <View key={`${highlight.quote}_${i}`} style={styles.highlightCard}>
                  <Text style={styles.quoteMark}>“</Text>
                  <Text style={styles.highlightQuote}>“{highlight.quote}”</Text>
                  <View style={styles.highlightDivider} />
                  <View style={styles.highlightNoteRow}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#1DE9C3" />
                    <Text style={styles.highlightNote}>{highlight.note}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Panel>
        ) : null}

        <Panel title="Breakdown" icon="bar-chart" iconColor={colors.accent}>
          <View style={styles.breakdownList}>
            {result.indices.map((idx) => (
              <View key={idx.key} style={styles.indexRow}>
                <Text style={styles.indexLabel}>{idx.label}</Text>
                <View style={styles.indexMiddle}>
                  <View style={styles.barTrack}>
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
                  <Text style={styles.indexBlurb}>{idx.blurb}</Text>
                </View>
                <Text style={[styles.indexValue, { color: colors.accent }]}>
                  {idx.value}
                </Text>
              </View>
            ))}
          </View>
        </Panel>

        <Panel title="Transcript" icon="chatbubble-ellipses" iconColor={colors.accent}>
          <View style={styles.dialogList}>
            {result.dialog.map((turn, i) => {
              const isUser = turn.speaker === "user";
              const attachedMoments = getMomentsForTurn(turn, result.moments ?? []);

              return (
                <View
                  key={`${turn.t}_${i}`}
                  style={[
                    styles.turnGroup,
                    { alignSelf: isUser ? "flex-end" : "flex-start" },
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      isUser ? styles.userBubble : styles.aiBubble,
                      {
                        backgroundColor: isUser ? colors.accent : "#111827",
                        borderColor: isUser ? colors.accent : "#2B3545",
                      },
                    ]}
                  >
                    <Text style={isUser ? styles.userMeta : styles.aiMeta}>
                      {isUser ? "YOU" : "AI"} · {fmt(turn.t)}
                    </Text>
                    <Text style={isUser ? styles.userBubbleText : styles.aiBubbleText}>
                      {turn.text}
                    </Text>
                  </View>

                  {attachedMoments.map((moment, momentIndex) => (
                    <InlineMomentCard
                      key={`${moment.type}_${momentIndex}`}
                      moment={moment}
                      accent={colors.accent}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

function buildHero(score: number): { emoji: string; title: string; subtitle: string } {
  if (score >= 85) {
    return {
      emoji: "😎",
      title: "Great vibe!",
      subtitle: "You sounded confident and easy to talk to.",
    };
  }
  if (score >= 70) {
    return {
      emoji: "😊",
      title: "Good vibe!",
      subtitle: "You kept the conversation warm and easy to follow.",
    };
  }
  if (score >= 55) {
    return {
      emoji: "🙂",
      title: "Nice start!",
      subtitle: "You started clearly. Now try adding more follow-up questions.",
    };
  }
  return {
    emoji: "💪",
    title: "Keep going!",
    subtitle: "You showed up and practiced. Next time, stretch each answer a little.",
  };
}

function getMomentsForTurn(turn: DialogTurn, moments: FeedbackMoment[]): FeedbackMoment[] {
  const text = normalize(turn.text);

  return moments.filter((moment) => {
    const quote = normalize(moment.quote);
    if (!quote || !text) return false;

    const speakerMatches =
      moment.type === "ai_phrase" ? turn.speaker === "ai" : turn.speaker === "user";

    return speakerMatches && (quote === text || text.includes(quote) || quote.includes(text));
  });
}

function normalize(value: string): string {
  return value.trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").toLowerCase();
}

function InlineMomentCard({
  moment,
  accent,
}: {
  moment: FeedbackMoment;
  accent: string;
}) {
  const meta = getMomentMeta(moment.type, accent);

  return (
    <View style={[styles.inlineMoment, { borderColor: meta.border, backgroundColor: meta.bg }]}> 
      <View style={styles.inlineTopRow}>
        <Text style={[styles.inlineLabel, { color: meta.border }]}>
          {meta.emoji} {meta.label}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={meta.border} />
      </View>
      <Text style={styles.inlineTitle}>{moment.title}</Text>
      <Text style={styles.inlineBody}>{moment.explanation}</Text>
      <Text style={[styles.inlineSuggestion, { color: meta.text }]}>{moment.suggestion}</Text>
    </View>
  );
}

function getMomentMeta(type: FeedbackMoment["type"], accent: string) {
  if (type === "ai_phrase") {
    return {
      emoji: "🤖",
      label: "AI PHRASE",
      bg: "#21123C",
      border: "#A66CFF",
      text: "#E8D8FF",
    };
  }

  if (type === "topic_opener") {
    return {
      emoji: "💬",
      label: "TOPIC OPENER",
      bg: "#1F163E",
      border: "#8B5CF6",
      text: "#E9DDFF",
    };
  }

  return {
    emoji: "🙋",
    label: "YOUR RESPONSE",
    bg: "#3A2107",
    border: "#F59E0B",
    text: "#FFE1A6",
  };
}

function Panel({
  title,
  icon,
  iconColor,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Ionicons name={icon} size={25} color={iconColor} />
        <Text style={styles.panelTitle}>{title}</Text>
      </View>
      {children}
    </View>
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

  heroCard: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 28,
    paddingTop: 22,
    paddingBottom: 24,
    marginBottom: spacing.md,
    backgroundColor: "#0B1220",
    shadowColor: "#2F80FF",
    shadowOpacity: 0.3,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },

  emojiGlow: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#102A5A",
    marginBottom: 4,
  },

  heroEmoji: {
    fontSize: 48,
  },

  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },

  heroTitle: {
    color: "#F6F8FF",
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  heroSpark: {
    color: "#2F80FF",
    fontSize: 28,
    fontWeight: "900",
    transform: [{ rotate: "18deg" }],
  },

  heroSubtitle: {
    color: "#B5BED0",
    fontSize: 17,
    fontWeight: "500",
    marginTop: 4,
    textAlign: "center",
  },

  panel: {
    borderWidth: 1,
    borderColor: "#2B3545",
    borderRadius: 24,
    backgroundColor: "#0D1320",
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: spacing.md,
  },

  panelTitle: {
    color: "#F5F7FB",
    fontSize: 22,
    fontWeight: "800",
  },

  keywordWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  keywordChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.pill,
    backgroundColor: "#102A5A88",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },

  keywordText: {
    fontSize: 16,
    fontWeight: "800",
  },

  highlightGrid: {
    flexDirection: "row",
    gap: 12,
  },

  highlightCard: {
    flex: 1,
    minHeight: 132,
    borderWidth: 1,
    borderColor: "#2B3545",
    borderRadius: 16,
    backgroundColor: "#131B2A",
    padding: spacing.md,
  },

  quoteMark: {
    color: "#2F80FF",
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 34,
  },

  highlightQuote: {
    color: "#F5F7FB",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: -6,
  },

  highlightDivider: {
    height: 1,
    backgroundColor: "#344055",
    marginVertical: spacing.md,
  },

  highlightNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  highlightNote: {
    color: "#B7C1D4",
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },

  breakdownList: {
    gap: spacing.md,
  },

  indexRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },

  indexLabel: {
    color: "#F5F7FB",
    width: 78,
    fontSize: 18,
    fontWeight: "700",
  },

  indexMiddle: {
    flex: 1,
    paddingTop: 4,
  },

  barTrack: {
    height: 10,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: "#182130",
  },

  barFill: {
    height: "100%",
    borderRadius: radius.pill,
  },

  indexBlurb: {
    color: "#9BA7BA",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 7,
  },

  indexValue: {
    width: 42,
    textAlign: "right",
    fontSize: 22,
    fontWeight: "900",
  },

  dialogList: {
    gap: 8,
    paddingBottom: 4,
  },

  turnGroup: {
    maxWidth: "92%",
    gap: 6,
  },

  bubble: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },

  userBubble: {
    borderRadius: 15,
    borderTopRightRadius: 15,
    minWidth: 170,
  },

  aiBubble: {
    borderRadius: 14,
    minWidth: 120,
  },

  userMeta: {
    color: "#CFE1FF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },

  aiMeta: {
    color: "#667185",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },

  userBubbleText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 21,
    marginTop: 3,
  },

  aiBubbleText: {
    color: "#F2F5FA",
    fontSize: 16,
    lineHeight: 21,
    marginTop: 3,
  },

  inlineMoment: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 260,
  },

  inlineTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  inlineLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  inlineTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 5,
  },

  inlineBody: {
    color: "#D6DEEB",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },

  inlineSuggestion: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 3,
  },
});
