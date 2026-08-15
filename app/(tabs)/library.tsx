import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "../../context/ThemeContext";
import { useAppData } from "../../context/AppDataContext";
import { getTopic } from "../../lib/ai/banks";
import { cardShadow, spacing, radius, typography } from "../../styles/global";
import type { SavedItem, SessionResult } from "../../types";

type ThemeColors = ReturnType<typeof useTheme>["colors"];
type MainTab = "sessions" | "saved";
type SavedTab = "phrases" | "suggestions";
type PhraseItem = Extract<SavedItem, { type: "phrase" }>;
type SuggestionItem = Extract<SavedItem, { type: "suggestion" }>;

const isPhrase = (i: SavedItem): i is PhraseItem => i.type === "phrase";
const isSuggestion = (i: SavedItem): i is SuggestionItem => i.type === "suggestion";

export default function LibraryScreen() {
  const { colors } = useTheme();
  const { sessions, savedItems, removeSession, removeSavedItem } = useAppData();
  const router = useRouter();

  const [tab, setTab] = useState<MainTab>("sessions");
  const [savedTab, setSavedTab] = useState<SavedTab>("phrases");
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();

  const savedPhrases = useMemo(() => savedItems.filter(isPhrase), [savedItems]);
  const savedSuggestions = useMemo(() => savedItems.filter(isSuggestion), [savedItems]);

  const filteredSessions = useMemo(() => {
    if (!q) return sessions;
    return sessions.filter((s) => s.topicLabel.toLowerCase().includes(q));
  }, [sessions, q]);

  // Collapse re-practice attempts of the same scenario into one card. Sessions
  // arrive newest-first, so each group's first-seen entry is its latest attempt
  // and the map keeps groups ordered by recency.
  const sessionGroups = useMemo(() => {
    const map = new Map<string, SessionResult[]>();
    for (const s of filteredSessions) {
      const key = s.groupId ?? s.id;
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    return [...map.entries()].map(([key, attempts]) => ({ key, attempts }));
  }, [filteredSessions]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredPhrases = useMemo(() => {
    if (!q) return savedPhrases;
    return savedPhrases.filter(
      (i) =>
        i.data.term.toLowerCase().includes(q) ||
        i.data.meaning.toLowerCase().includes(q)
    );
  }, [savedPhrases, q]);

  const filteredSuggestions = useMemo(() => {
    if (!q) return savedSuggestions;
    return savedSuggestions.filter(
      (i) =>
        i.data.title.toLowerCase().includes(q) ||
        i.data.quote.toLowerCase().includes(q) ||
        i.data.suggestion.toLowerCase().includes(q)
    );
  }, [savedSuggestions, q]);

  const switchTab = (next: string) => {
    setTab(next as MainTab);
    setQuery("");
  };

  const rePractice = (s: SessionResult, groupKey: string) => {
    const setup = s.assistantSetup;
    if (!setup) return;
    Alert.alert(
      "Re-practice this scenario?",
      `Start a new attempt with the same setup as "${s.topicLabel}". It joins this card instead of creating a new one.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Re-practice",
          onPress: () => {
            const params: Record<string, string> = {
              title: s.topicLabel,
              assistantSetup: JSON.stringify(setup),
              groupId: groupKey,
            };
            if (s.sceneContext) params.sceneContext = JSON.stringify(s.sceneContext);
            if (s.newsContext) params.newsContext = JSON.stringify(s.newsContext);
            router.push({ pathname: "/session/active", params });
          },
        },
      ]
    );
  };

  const openSuggestionSource = (item: SuggestionItem) => {
    router.push({
      pathname: "/session/[id]",
      params: { id: item.sourceSessionId, focus: item.data.quote },
    });
  };

  const subtitle =
    tab === "sessions"
      ? `${sessions.length} training${sessions.length === 1 ? "" : "s"} saved on this device`
      : `${savedPhrases.length} phrase${savedPhrases.length === 1 ? "" : "s"} · ${savedSuggestions.length} suggestion${savedSuggestions.length === 1 ? "" : "s"}`;

  const placeholder =
    tab === "sessions"
      ? "Search sessions"
      : savedTab === "phrases"
        ? "Search saved vocab"
        : "Search suggestions";

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Text style={[typography.h1, { color: colors.text }]}>Library</Text>
        <Text style={[typography.body, { color: colors.textDim, marginTop: 4 }]}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.controls}>
        <Segmented
          colors={colors}
          value={tab}
          onChange={switchTab}
          options={[
            { key: "sessions", label: "Sessions" },
            { key: "saved", label: "Saved" },
          ]}
        />

        <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            style={[styles.searchInput, { color: colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        {tab === "saved" ? (
          <Segmented
            colors={colors}
            value={savedTab}
            onChange={(k) => setSavedTab(k as SavedTab)}
            options={[
              { key: "phrases", label: "Phrases" },
              { key: "suggestions", label: "Suggestions" },
            ]}
          />
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === "sessions" ? (
          sessions.length === 0 ? (
            <EmptyCard
              colors={colors}
              icon="mic-outline"
              text={"No trainings yet.\nTap the mic on the Talk tab to start your first chat."}
            />
          ) : sessionGroups.length === 0 ? (
            <EmptyCard colors={colors} icon="search-outline" text="No sessions match your search." />
          ) : (
            sessionGroups.map((group) => (
              <SessionGroupCard
                key={group.key}
                attempts={group.attempts}
                colors={colors}
                expanded={expandedGroups.has(group.key)}
                onToggle={() => toggleGroup(group.key)}
                onOpen={(s) => router.push({ pathname: "/session/[id]", params: { id: s.id } })}
                onRePractice={(s) => rePractice(s, group.key)}
                onDelete={(id) => removeSession(id)}
              />
            ))
          )
        ) : savedTab === "phrases" ? (
          savedPhrases.length === 0 ? (
            <EmptyCard
              colors={colors}
              icon="bookmark-outline"
              text={"No saved vocab yet.\nTap the bookmark on a word in your feedback to save it here."}
            />
          ) : filteredPhrases.length === 0 ? (
            <EmptyCard colors={colors} icon="search-outline" text="No vocab matches your search." />
          ) : (
            filteredPhrases.map((item) => (
              <PhraseCard
                key={item.id}
                item={item}
                colors={colors}
                onRemove={() => removeSavedItem(item.id)}
              />
            ))
          )
        ) : savedSuggestions.length === 0 ? (
          <EmptyCard
            colors={colors}
            icon="bookmark-outline"
            text={"No saved suggestions yet.\nTap the bookmark on an AI tip in a transcript to save it here."}
          />
        ) : filteredSuggestions.length === 0 ? (
          <EmptyCard colors={colors} icon="search-outline" text="No suggestions match your search." />
        ) : (
          filteredSuggestions.map((item) => (
            <SuggestionCard
              key={item.id}
              item={item}
              colors={colors}
              onOpen={() => openSuggestionSource(item)}
              onRemove={() => removeSavedItem(item.id)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Segmented({
  options,
  value,
  onChange,
  colors,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={[styles.segTrack, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.segItem, active && { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.segText, { color: active ? "#fff" : colors.textDim }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SessionGroupCard({
  attempts,
  colors,
  expanded,
  onToggle,
  onOpen,
  onRePractice,
  onDelete,
}: {
  attempts: SessionResult[];
  colors: ThemeColors;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (session: SessionResult) => void;
  onRePractice: (session: SessionResult) => void;
  onDelete: (id: string) => void;
}) {
  const repr = attempts[0];
  const topic = getTopic(repr.topic);
  const count = attempts.length;
  return (
    <View style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable onPress={onToggle} style={styles.groupHeader}>
        <View style={[styles.scoreChip, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.scoreNum, { color: colors.accent }]}>{repr.finalScore}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.h3, { color: colors.text }]} numberOfLines={1}>
            {topic.emoji} {repr.topicLabel}
          </Text>
          <Text style={[typography.tiny, { color: colors.textFaint, marginTop: 4 }]}>
            {new Date(repr.date).toLocaleString()} · {Math.round(repr.durationSec)}s
          </Text>
          <View style={styles.chipRow}>
            <View style={[styles.gradeChip, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.gradeChipText, { color: colors.accent }]}>{repr.grade}</Text>
            </View>
            <View style={[styles.countChip, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="repeat" size={12} color={colors.textDim} />
              <Text style={[styles.countChipText, { color: colors.textDim }]}>
                {count} attempt{count === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          {repr.assistantSetup ? (
            <Pressable onPress={() => onRePractice(repr)} hitSlop={8} style={styles.actionBtn}>
              <Ionicons name="refresh" size={20} color={colors.accent} />
            </Pressable>
          ) : null}
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.textFaint}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.attemptList}>
          {attempts.map((s, idx) => (
            <View key={s.id} style={[styles.attemptRow, { borderTopColor: colors.border }]}>
              <Pressable onPress={() => onOpen(s)} hitSlop={4} style={styles.attemptMain}>
                <Text style={[styles.attemptLabel, { color: colors.text }]}>
                  Attempt {count - idx}
                </Text>
                <Text style={[typography.tiny, { color: colors.textFaint, marginTop: 2 }]}>
                  {new Date(s.date).toLocaleString()}
                </Text>
              </Pressable>
              <View style={[styles.attemptScore, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.attemptScoreText, { color: colors.accent }]}>
                  {s.finalScore}
                </Text>
              </View>
              <Pressable onPress={() => onDelete(s.id)} hitSlop={8} style={styles.actionBtn}>
                <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PhraseCard({
  item,
  colors,
  onRemove,
}: {
  item: PhraseItem;
  colors: ThemeColors;
  onRemove: () => void;
}) {
  const { term, meaning, example } = item.data;
  return (
    <View style={[styles.savedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.savedTopRow}>
        <Text style={[styles.savedTitle, { color: colors.text }]}>{term}</Text>
        <Pressable onPress={onRemove} hitSlop={8} style={styles.actionBtn}>
          <Ionicons name="bookmark" size={20} color={colors.accent} />
        </Pressable>
      </View>
      {meaning ? (
        <Text style={[styles.savedBody, { color: colors.textDim }]}>{meaning}</Text>
      ) : null}
      {example ? (
        <Text style={[styles.savedExample, { color: colors.textFaint }]}>Example: {example}</Text>
      ) : null}
    </View>
  );
}

function SuggestionCard({
  item,
  colors,
  onOpen,
  onRemove,
}: {
  item: SuggestionItem;
  colors: ThemeColors;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const moment = item.data;
  return (
    <Pressable
      onPress={onOpen}
      style={[styles.savedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.savedTopRow}>
        <Text style={[styles.savedTitle, { color: colors.text }]}>{moment.suggestion}</Text>
        <Pressable onPress={onRemove} hitSlop={8} style={styles.actionBtn}>
          <Ionicons name="bookmark" size={20} color={colors.accent} />
        </Pressable>
      </View>
      <View style={styles.sourceRow}>
        <Ionicons name="open-outline" size={13} color={colors.textFaint} />
        <Text style={[typography.tiny, { color: colors.textFaint }]}>Open in feedback</Text>
      </View>
    </Pressable>
  );
}

function EmptyCard({
  colors,
  icon,
  text,
}: {
  colors: ThemeColors;
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <Ionicons name={icon} size={40} color={colors.textFaint} />
      <Text
        style={[typography.body, { color: colors.textDim, marginTop: spacing.md, textAlign: "center" }]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  controls: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  segTrack: {
    flexDirection: "row",
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segItem: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  segText: { fontSize: 14, fontWeight: "700" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  content: { padding: spacing.lg, gap: spacing.sm },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  groupCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    ...cardShadow,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  gradeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gradeChipText: { fontSize: 11, fontWeight: "700" },
  countChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countChipText: { fontSize: 11, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtn: { padding: 4 },
  attemptList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  attemptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  attemptMain: { flex: 1 },
  attemptLabel: { fontSize: 14, fontWeight: "700" },
  attemptScore: {
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 36,
    alignItems: "center",
  },
  attemptScoreText: { fontSize: 14, fontWeight: "800" },
  savedCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...cardShadow,
  },
  savedTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  savedTitle: { fontSize: 17, fontWeight: "800", flex: 1 },
  savedBody: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  savedExample: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: spacing.sm,
  },
});
