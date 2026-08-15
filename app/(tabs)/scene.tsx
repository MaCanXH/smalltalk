import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSharedValue } from "react-native-reanimated";

import { Orb } from "../../components/Orb";
import { useTheme } from "../../context/ThemeContext";
import { useAppData } from "../../context/AppDataContext";
import { composeSceneFromDescription } from "../../lib/ai/sceneCompose";
import { FALLBACK_TOPICS, fetchHotTopics, type HotTopic } from "../../lib/news/hotTopics";
import {
  DEFAULT_LAST_SCENE,
  fetchDefaultScene,
  SCENARIO_PRESETS,
  sceneStartParams,
  shortenSceneLabel,
  type ScenarioPreset,
} from "../../lib/scenarios";
import { cardShadow, radius, spacing, typography } from "../../styles/global";
import type { SceneContext } from "../../types";

export default function SceneScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { sessions } = useAppData();
  const params = useLocalSearchParams<{ compose?: string }>();

  const [manualMode, setManualMode] = useState(false);
  const [description, setDescription] = useState("");
  const [composing, setComposing] = useState(false);
  const [trending, setTrending] = useState<HotTopic | null>(null);

  const amplitude = useSharedValue(0);

  // Returning from the voice page's "type instead" opens the typed input.
  useEffect(() => {
    if (params.compose === "type") setManualMode(true);
  }, [params.compose]);

  useEffect(() => {
    let active = true;
    fetchHotTopics(1)
      .then((topics) => {
        if (active) setTrending(topics[0] ?? FALLBACK_TOPICS[0]);
      })
      .catch(() => {
        if (active) setTrending(FALLBACK_TOPICS[0]);
      });
    return () => {
      active = false;
    };
  }, []);

  // The user's most recent self-defined scene, if any — its absence means
  // "Last scene" falls back to a random default.
  const userLastScene = useMemo(
    () => sessions.find((s) => s.sceneContext)?.sceneContext,
    [sessions]
  );
  const lastSceneLabel = shortenSceneLabel((userLastScene ?? DEFAULT_LAST_SCENE).scene);
  const startingRef = useRef(false);

  const openSetup = (scene: SceneContext) => {
    router.push({
      pathname: "/scene/setup",
      params: {
        goal: scene.goal,
        role: scene.role,
        scene: scene.scene,
        personality: scene.personality ?? "",
      },
    });
  };

  const startWithScene = (scene: SceneContext) => {
    router.push({
      pathname: "/session/active",
      params: {
        title: shortenSceneLabel(scene.scene),
        sceneContext: JSON.stringify(scene),
      },
    });
  };

  // Quick Talk and the "Last scene" fallback both start a random default scene
  // (a pre-authored preset, or a local scene if the backend is unreachable).
  const startDefaultScene = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      const scene = await fetchDefaultScene();
      router.push({ pathname: "/session/active", params: sceneStartParams(scene) });
    } finally {
      startingRef.current = false;
    }
  };

  const startLastScene = () => {
    if (userLastScene) startWithScene(userLastScene);
    else void startDefaultScene();
  };

  const startTrending = () => {
    if (!trending) return;
    router.push({
      pathname: "/session/active",
      params: { title: trending.full, newsContext: JSON.stringify(trending) },
    });
  };

  const onPreset = (preset: ScenarioPreset) => openSetup(preset);

  const onNext = async () => {
    const text = description.trim();
    if (!text || composing) return;
    setComposing(true);
    try {
      openSetup(await composeSceneFromDescription(text));
    } finally {
      setComposing(false);
    }
  };

  const onOrbPress = () => {
    router.push("/scene/listen");
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[typography.h1, { color: colors.text }]}>
          Just say what you{"\n"}want to practice
        </Text>

        {manualMode ? (
          <>
            <Text style={[styles.chipLabel, { color: colors.textFaint, marginTop: spacing.lg }]}>
              Describe a scene
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="e.g., Networking at a conference, First date, Job interview…"
              placeholderTextColor={colors.textFaint}
              multiline
              autoFocus
              style={[
                styles.input,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
              ]}
            />
            <Pressable
              onPress={() => setManualMode(false)}
              disabled={composing}
              hitSlop={8}
            >
              <Text style={[styles.linkText, { color: colors.accent }]}>Use voice instead</Text>
            </Pressable>
            <Pressable
              onPress={onNext}
              disabled={!description.trim() || composing}
              style={[
                styles.nextBtn,
                {
                  backgroundColor: colors.accent,
                  opacity: description.trim() && !composing ? 1 : 0.4,
                },
              ]}
            >
              <Text style={styles.nextText}>
                {composing ? "Thinking…" : "Next"}
              </Text>
              {!composing && <Ionicons name="arrow-forward" size={16} color="#fff" />}
            </Pressable>
          </>
        ) : (
          <View style={styles.orbWrap}>
            <Orb mode="idle" amplitude={amplitude} onPress={onOrbPress} size={190} />
            <Text style={[typography.h3, { color: colors.text, marginTop: spacing.lg }]}>
              Tap and just say it
            </Text>
            <Text style={[styles.caption, { color: colors.textDim }]}>
              {"We'll turn it into a scene for you"}
            </Text>
            <Text style={[styles.example, { color: colors.textFaint }]}>
              {'e.g. "I’m waiting in line at a coffee shop and want to talk with the person next to me."'}
            </Text>
            <Pressable onPress={() => setManualMode(true)} hitSlop={8}>
              <Text style={[styles.linkText, { color: colors.accent }]}>
                Prefer to type instead?
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.chipLabel, { color: colors.textFaint }]}>
          Or pick a quick scene
        </Text>
        <View style={styles.chipWrap}>
          {SCENARIO_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => onPreset(preset)}
              style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={{ fontSize: 14 }}>{preset.emoji}</Text>
              <Text style={[styles.chipText, { color: colors.text }]}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
        {trending && (
          <Pressable
            onPress={startTrending}
            style={[styles.trendingChip, { backgroundColor: colors.surface, borderColor: colors.accent }]}
          >
            <Ionicons name="flame" size={14} color={colors.accent} />
            <Text style={[styles.trendingText, { color: colors.accent }]} numberOfLines={1}>
              Trending: {trending.short}
            </Text>
          </Pressable>
        )}

        <Text style={[styles.chipLabel, { color: colors.textFaint }]}>Shortcuts</Text>
        <View style={styles.quickRow}>
          <Pressable
            onPress={startDefaultScene}
            style={[styles.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="flash" size={16} color={colors.accent} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.quickTitle, { color: colors.text }]}>Quick Talk</Text>
              <Text style={[styles.quickSub, { color: colors.textFaint }]} numberOfLines={1}>
                Jump right in
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={startLastScene}
            style={[styles.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="play-skip-forward" size={16} color={colors.accent} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.quickTitle, { color: colors.text }]}>Last scene</Text>
              <Text
                style={[styles.quickSub, { color: colors.textFaint }]}
                numberOfLines={1}
              >
                {lastSceneLabel}
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  orbWrap: {
    alignItems: "center",
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  caption: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  example: {
    marginTop: spacing.md,
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  linkText: {
    marginTop: spacing.md,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  chipLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: "top",
    ...cardShadow,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  chipText: { fontSize: 12.5, fontWeight: "600" },
  trendingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  trendingText: { fontSize: 12.5, fontWeight: "700", flexShrink: 1 },
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm + 4,
    ...cardShadow,
  },
  quickTitle: { fontSize: 12.5, fontWeight: "700" },
  quickSub: { fontSize: 10.5, fontWeight: "500", marginTop: 1 },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: 15,
    marginTop: spacing.lg,
  },
  nextText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
