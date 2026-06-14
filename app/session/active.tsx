import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { Orb, type OrbMode } from "../../components/Orb";
import { useTheme } from "../../context/ThemeContext";
import { useAppData } from "../../context/AppDataContext";
import { DialogEngine, makeTurn } from "../../lib/ai/engine";
import { getTopic } from "../../lib/ai/banks";
import { buildResult } from "../../lib/ai/scoring";
import { speak, stopSpeaking } from "../../lib/speech/tts";
import { useVoiceRecorder } from "../../lib/speech/useVoiceRecorder";
import { spacing, radius, typography } from "../../styles/global";
import type { DialogTurn, TopicId } from "../../types";

const SESSION_SECONDS = 180;

const STATUS: Record<OrbMode, string> = {
  idle: "Getting ready…",
  speaking: "AI is talking — tap to jump in",
  thinking: "Thinking…",
  listening: "Your turn — tap the orb when you're done",
};

export default function ActiveSession() {
  const { colors, settings } = useTheme();
  const { addSession } = useAppData();
  const router = useRouter();
  const params = useLocalSearchParams<{ topic?: string }>();
  const topicId = (params.topic as TopicId) ?? "weekend";
  const topic = getTopic(topicId);

  const recorder = useVoiceRecorder();
  const [mode, setMode] = useState<OrbMode>("idle");
  const [remaining, setRemaining] = useState(SESSION_SECONDS);

  const engineRef = useRef(new DialogEngine(topicId));
  const dialogRef = useRef<DialogTurn[]>([]);
  const userTurnsRef = useRef(0);
  const lastUserLineRef = useRef("");
  const thinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const elapsedRef = useRef(0);
  elapsedRef.current = SESSION_SECONDS - remaining;

  const haptic = useCallback(() => {
    if (settings.hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [settings.hapticsEnabled]);

  // ----- conversation state machine ----------------------------------------

  const startListening = useCallback(() => {
    if (finishedRef.current) return;
    setMode("listening");
    void recorder.start();
  }, [recorder]);

  const aiRespond = useCallback(() => {
    if (finishedRef.current) return;
    const reply = engineRef.current.replyTo(lastUserLineRef.current);
    dialogRef.current.push(makeTurn("ai", reply, elapsedRef.current));
    setMode("speaking");
    speak(reply, {
      rate: settings.ttsRate,
      pitch: settings.ttsPitch,
      onDone: () => startListening(),
    });
  }, [settings.ttsRate, settings.ttsPitch, startListening]);

  const endUserTurn = useCallback(() => {
    void recorder.stop();
    const line = engineRef.current.nextUserLine(userTurnsRef.current);
    userTurnsRef.current += 1;
    lastUserLineRef.current = line;
    dialogRef.current.push(makeTurn("user", line, elapsedRef.current));
    setMode("thinking");
    thinkTimer.current = setTimeout(aiRespond, 500 + Math.random() * 600);
  }, [recorder, aiRespond]);

  const interrupt = useCallback(() => {
    stopSpeaking();
    startListening();
  }, [startListening]);

  const onOrbPress = useCallback(() => {
    haptic();
    if (mode === "speaking") interrupt();
    else if (mode === "listening") endUserTurn();
  }, [mode, interrupt, endUserTurn, haptic]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (thinkTimer.current) clearTimeout(thinkTimer.current);
    stopSpeaking();
    void recorder.stop();

    const result = buildResult(topicId, dialogRef.current, elapsedRef.current);
    void addSession(result);
    if (settings.hapticsEnabled) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    router.replace({ pathname: "/session/[id]", params: { id: result.id } });
  }, [recorder, topicId, addSession, router, settings.hapticsEnabled]);

  // ----- lifecycle ----------------------------------------------------------

  useEffect(() => {
    let active = true;
    (async () => {
      await recorder.requestPermission();
      if (!active || finishedRef.current) return;
      const greeting = engineRef.current.greeting();
      dialogRef.current.push(makeTurn("ai", greeting, 0));
      setMode("speaking");
      speak(greeting, {
        rate: settings.ttsRate,
        pitch: settings.ttsPitch,
        onDone: () => startListening(),
      });
    })();
    return () => {
      active = false;
      finishedRef.current = true;
      if (thinkTimer.current) clearTimeout(thinkTimer.current);
      stopSpeaking();
      void recorder.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // countdown
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (remaining === 0) finish();
  }, [remaining, finish]);

  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const progress = 1 - remaining / SESSION_SECONDS;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.top}>
        <Text style={[typography.tiny, { color: colors.textFaint }]}>
          {topic.emoji}  {topic.label.toUpperCase()}
        </Text>
        <Text style={[styles.timer, { color: colors.text }]}>
          {mm}:{ss}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accent, width: `${progress * 100}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.center}>
        <Orb
          mode={mode}
          amplitude={recorder.amplitude}
          color={colors.accent}
          icon={mode === "speaking" ? "volume-high" : "mic"}
          onPress={onOrbPress}
          disabled={mode === "thinking" || mode === "idle"}
        />
        <Text style={[styles.status, { color: colors.textDim }]}>
          {STATUS[mode]}
        </Text>
        <Text style={[typography.tiny, { color: colors.textFaint, marginTop: 6 }]}>
          NO SUBTITLES · SPEAK NATURALLY
        </Text>
      </View>

      <Pressable
        onPress={finish}
        style={[styles.endBtn, { backgroundColor: colors.surface, borderColor: colors.danger }]}
      >
        <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 15 }}>
          End conversation
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  top: { alignItems: "center", paddingTop: spacing.md },
  timer: {
    fontSize: 52,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    width: "60%",
    height: 5,
    borderRadius: radius.pill,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: radius.pill },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  status: {
    marginTop: spacing.xl,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  endBtn: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
});
