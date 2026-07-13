import { useEffect, useMemo, useState } from "react";
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
import { useRouter } from "expo-router";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { Orb, type OrbMode } from "../../components/Orb";
import { useTheme } from "../../context/ThemeContext";
import { useAppData } from "../../context/AppDataContext";
import { composeSceneFromDescription } from "../../lib/ai/sceneCompose";
import { transcribeAudio } from "../../lib/ai/transcribe";
import { FALLBACK_TOPICS, fetchHotTopics, type HotTopic } from "../../lib/news/hotTopics";
import {
  DEFAULT_LAST_SCENE,
  SCENARIO_PRESETS,
  shortenSceneLabel,
  type ScenarioPreset,
} from "../../lib/scenarios";
import { cardShadow, radius, spacing, typography } from "../../styles/global";
import type { SceneContext } from "../../types";

type VoiceMode = "idle" | "listening" | "thinking";

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Something went wrong. Try again, or type your scene instead.";
}

export default function SceneScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { sessions } = useAppData();

  const [manualMode, setManualMode] = useState(false);
  const [description, setDescription] = useState("");
  const [composing, setComposing] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [trending, setTrending] = useState<HotTopic | null>(null);

  const amplitude = useSharedValue(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    amplitude.value =
      voiceMode === "listening"
        ? withRepeat(withTiming(1, { duration: 550 }), -1, true)
        : withTiming(0, { duration: 200 });
  }, [voiceMode, amplitude]);

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

  const lastScene = useMemo(
    () => sessions.find((s) => s.sceneContext)?.sceneContext ?? DEFAULT_LAST_SCENE,
    [sessions]
  );

  const openSetup = (scene: SceneContext) => {
    router.push({
      pathname: "/scene/setup",
      params: { goal: scene.goal, role: scene.role, scene: scene.scene },
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

  const startQuickTalk = () => {
    router.push({ pathname: "/session/active", params: {} });
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

  const onOrbPress = async () => {
    if (voiceMode === "thinking") return;

    if (voiceMode === "listening") {
      setVoiceMode("thinking");
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error("No recording captured. Try again.");
        const text = await transcribeAudio(uri);
        if (!text.trim()) {
          throw new Error("Didn't catch that — try again, or type instead.");
        }
        openSetup(await composeSceneFromDescription(text));
        setVoiceMode("idle");
      } catch (err) {
        setVoiceError(describeError(err));
        setVoiceMode("idle");
      }
      return;
    }

    setVoiceError(null);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setVoiceError(
          "Microphone access is off. Enable it for Small Talk in system settings."
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoiceMode("listening");
    } catch (err) {
      setVoiceError(describeError(err));
      setVoiceMode("idle");
    }
  };

  const orbMode: OrbMode = voiceMode;
  const captionTitle =
    voiceMode === "listening"
      ? "Listening…"
      : voiceMode === "thinking"
        ? "Turning that into a scene…"
        : "Tap and just say it";
  const captionSub =
    voiceMode === "listening"
      ? "Tap again when you're done"
      : voiceMode === "thinking"
        ? undefined
        : "We'll turn it into a scene for you";

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>Set the scene</Text>
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
            <Orb mode={orbMode} amplitude={amplitude} onPress={onOrbPress} size={190} />
            <Text style={[typography.h3, { color: colors.text, marginTop: spacing.lg }]}>
              {captionTitle}
            </Text>
            {captionSub && (
              <Text style={[styles.caption, { color: colors.textDim }]}>{captionSub}</Text>
            )}
            {voiceMode === "idle" && (
              <>
                <Text style={[styles.example, { color: colors.textFaint }]}>
                  {'e.g. "I’m waiting in line at a coffee shop and want to talk with the person next to me."'}
                </Text>
                <Pressable onPress={() => setManualMode(true)} hitSlop={8}>
                  <Text style={[styles.linkText, { color: colors.accent }]}>
                    Prefer to type instead?
                  </Text>
                </Pressable>
              </>
            )}
            {voiceError && (
              <Text style={[styles.errorText, { color: colors.danger }]}>{voiceError}</Text>
            )}
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
            onPress={startQuickTalk}
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
            onPress={() => startWithScene(lastScene)}
            style={[styles.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="play-skip-forward" size={16} color={colors.accent} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.quickTitle, { color: colors.text }]}>Last scene</Text>
              <Text
                style={[styles.quickSub, { color: colors.textFaint }]}
                numberOfLines={1}
              >
                {shortenSceneLabel(lastScene.scene)}
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
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
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
  errorText: {
    marginTop: spacing.md,
    fontSize: 12.5,
    fontWeight: "600",
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
