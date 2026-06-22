import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSharedValue, withTiming } from "react-native-reanimated";

import { Orb, type OrbMode } from "../../components/Orb";
import { useTheme } from "../../context/ThemeContext";
import { useAppData } from "../../context/AppDataContext";
import { getTopic } from "../../lib/ai/banks";
import { buildResult } from "../../lib/ai/scoring";
import {
  buildAssistantOverrides,
  createVapiClient,
  readVapiConfig,
  summarizeVapiError,
  type VapiClient,
} from "../../lib/ai/vapi";
import {
  getTranscriptKey,
  getVapiTranscriptIdentityKey,
  isVapiEndedMessage,
  normalizeVapiTranscriptMessage,
} from "../../lib/ai/vapiTranscript";
import { spacing, radius, typography } from "../../styles/global";
import type { DialogTurn, TopicId } from "../../types";

const SESSION_SECONDS = 180;

type SessionMode = OrbMode;
const STATUS: Record<SessionMode, string> = {
  idle: "Connecting to your AI partner...",
  speaking: "AI is talking",
  thinking: "Starting voice call...",
  listening: "You're live - talk naturally",
};

export default function ActiveSession() {
  const { colors, settings } = useTheme();
  const { addSession } = useAppData();
  const router = useRouter();
  const params = useLocalSearchParams<{ topic?: string }>();
  const topicId = (params.topic as TopicId) ?? "weekend";
  const topic = useMemo(() => getTopic(topicId), [topicId]);

  const [mode, setMode] = useState<SessionMode>("idle");
  const [remaining, setRemaining] = useState(SESSION_SECONDS);

  const amplitude = useSharedValue(0);
  const vapiRef = useRef<VapiClient | null>(null);
  const seenTranscriptIdentityKeysRef = useRef(new Set<string>());
  const lastFallbackTranscriptRef = useRef<{ key: string; receivedAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const dialogRef = useRef<DialogTurn[]>([]);
  const finishedRef = useRef(false);
  const finishScheduledRef = useRef(false);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef<(saveResult: boolean) => Promise<void>>(async () => undefined);
  const addSessionRef = useRef(addSession);
  const routerRef = useRef(router);
  const hapticsEnabledRef = useRef(settings.hapticsEnabled);
  const topicIdRef = useRef(topicId);

  const elapsedRef = useRef(0);
  elapsedRef.current = SESSION_SECONDS - remaining;

  useEffect(() => {
    addSessionRef.current = addSession;
  }, [addSession]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    hapticsEnabledRef.current = settings.hapticsEnabled;
  }, [settings.hapticsEnabled]);

  useEffect(() => {
    topicIdRef.current = topicId;
  }, [topicId]);

  const haptic = useCallback(() => {
    if (settings.hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [settings.hapticsEnabled]);

  const appendTranscriptMessage = useCallback((message: unknown) => {
    const turn = normalizeVapiTranscriptMessage(message);
    if (!turn) return;

    const identityKey = getVapiTranscriptIdentityKey(message, turn);
    if (identityKey) {
      if (seenTranscriptIdentityKeysRef.current.has(identityKey)) return;
      seenTranscriptIdentityKeysRef.current.add(identityKey);
    } else {
      const key = getTranscriptKey(turn);
      const receivedAt = Date.now();
      const last = lastFallbackTranscriptRef.current;
      if (last?.key === key && receivedAt - last.receivedAt < 250) return;
      lastFallbackTranscriptRef.current = { key, receivedAt };
    }

    dialogRef.current.push({
      speaker: turn.speaker,
      text: turn.text,
      t: elapsedRef.current,
    });
  }, []);

  const onOrbPress = useCallback(() => {
    haptic();
  }, [haptic]);

  const clearFinishTimer = useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  }, []);

  const stopClient = useCallback((client: VapiClient | null | undefined) => {
    try {
      client?.removeAllListeners();
      client?.stop();
    } catch {
      // Ignore best-effort call shutdown failures.
    }
  }, []);

  const finish = useCallback(async (saveResult: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    finishScheduledRef.current = false;
    clearFinishTimer();
    setEnding(true);
    amplitude.value = withTiming(0, { duration: 120 });

    const client = vapiRef.current;
    vapiRef.current = null;
    stopClient(client);

    const hasUserTranscript = dialogRef.current.some((turn) => turn.speaker === "user");
    if (!saveResult || !hasUserTranscript) {
      setMode("idle");
      setEnding(false);
      setError(
        hasUserTranscript
          ? "The voice call ended before the session could be saved."
          : "No user transcript was captured. Start another voice call and talk before ending."
      );
      return;
    }

    const result = buildResult(
      topicIdRef.current,
      [...dialogRef.current],
      elapsedRef.current
    );

    try {
      await addSessionRef.current(result);
      if (hapticsEnabledRef.current) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      routerRef.current.replace({ pathname: "/session/[id]", params: { id: result.id } });
    } catch (err) {
      setMode("idle");
      setEnding(false);
      setError(
        `The voice call ended, but the transcript could not be saved. ${summarizeVapiError(err)}`
      );
    }
  }, [amplitude, clearFinishTimer, stopClient]);

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const scheduleFinish = useCallback((saveResult: boolean, delayMs = 650) => {
    if (finishedRef.current || finishScheduledRef.current) return;
    finishScheduledRef.current = true;
    setEnding(true);
    clearFinishTimer();
    finishTimerRef.current = setTimeout(() => {
      finishTimerRef.current = null;
      void finishRef.current(saveResult);
    }, delayMs);
  }, [clearFinishTimer]);

  // ----- lifecycle ----------------------------------------------------------

  useEffect(() => {
    let active = true;
    finishedRef.current = false;
    finishScheduledRef.current = false;
    clearFinishTimer();
    dialogRef.current = [];
    seenTranscriptIdentityKeysRef.current = new Set<string>();
    lastFallbackTranscriptRef.current = null;
    elapsedRef.current = 0;
    setMode("idle");
    setRemaining(SESSION_SECONDS);
    setError(null);
    setEnding(false);
    amplitude.value = withTiming(0, { duration: 120 });
    const config = readVapiConfig();

    if (!config) {
      finishedRef.current = true;
      setMode("idle");
      setError(
        "Missing Vapi configuration. Set EXPO_PUBLIC_VAPI_PUBLIC_KEY and EXPO_PUBLIC_VAPI_ASSISTANT_ID, then restart Expo."
      );
      return () => {
        active = false;
        finishedRef.current = true;
        finishScheduledRef.current = false;
        clearFinishTimer();
        amplitude.value = withTiming(0, { duration: 120 });
      };
    }

    const client = createVapiClient(config.publicKey);
    vapiRef.current = client;

    client.on("call-start", () => {
      if (!active || finishedRef.current || finishScheduledRef.current) return;
      setMode("listening");
    });

    client.on("call-end", () => {
      if (!active || finishedRef.current) return;
      scheduleFinish(true);
    });

    client.on("speech-start", () => {
      if (!active || finishedRef.current || finishScheduledRef.current) return;
      setMode("speaking");
    });

    client.on("speech-end", () => {
      if (!active || finishedRef.current || finishScheduledRef.current) return;
      setMode("listening");
      amplitude.value = withTiming(0, { duration: 90 });
    });

    client.on("volume-level", (volume) => {
      if (!active || finishedRef.current || finishScheduledRef.current) return;
      const clamped = Math.max(0, Math.min(1, volume));
      amplitude.value = withTiming(clamped, { duration: 90 });
    });

    client.on("message", (message) => {
      if (!active || finishedRef.current) return;
      appendTranscriptMessage(message);
      if (isVapiEndedMessage(message)) {
        scheduleFinish(true);
      }
    });

    client.on("error", (err) => {
      if (!active || finishedRef.current || finishScheduledRef.current) return;
      if (dialogRef.current.some((turn) => turn.speaker === "user")) {
        scheduleFinish(true, 0);
        return;
      }

      finishedRef.current = true;
      finishScheduledRef.current = false;
      clearFinishTimer();
      setMode("idle");
      setEnding(false);
      setError(summarizeVapiError(err));
      amplitude.value = withTiming(0, { duration: 120 });

      const currentClient = vapiRef.current;
      vapiRef.current = null;
      stopClient(currentClient);
    });

    (async () => {
      if (!active || finishedRef.current) return;
      setMode("thinking");
      try {
        const started = await client.start(
          config.assistantId,
          buildAssistantOverrides(topic)
        );
        if (!active || finishedRef.current || finishScheduledRef.current) return;
        if (!started) {
          throw new Error("The Vapi call could not be started.");
        }
      } catch (err) {
        if (!active || finishedRef.current || finishScheduledRef.current) return;
        finishedRef.current = true;
        finishScheduledRef.current = false;
        clearFinishTimer();
        setMode("idle");
        setEnding(false);
        setError(summarizeVapiError(err));
        amplitude.value = withTiming(0, { duration: 120 });
        vapiRef.current = null;
        stopClient(client);
      }
    })();

    return () => {
      active = false;
      const dialog = [...dialogRef.current];
      const shouldSaveOnLeave =
        !finishedRef.current && dialog.some((turn) => turn.speaker === "user");
      if (shouldSaveOnLeave) {
        const result = buildResult(topicIdRef.current, dialog, elapsedRef.current);
        void addSessionRef.current(result).catch(() => undefined);
      }
      finishedRef.current = true;
      finishScheduledRef.current = false;
      clearFinishTimer();
      amplitude.value = withTiming(0, { duration: 120 });
      vapiRef.current = null;
      stopClient(client);
    };
  }, [
    amplitude,
    appendTranscriptMessage,
    clearFinishTimer,
    scheduleFinish,
    stopClient,
    topic,
  ]);

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
    if (remaining === 0) scheduleFinish(true);
  }, [remaining, scheduleFinish]);

  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const progress = 1 - remaining / SESSION_SECONDS;
  const endDisabled = ending || mode === "thinking" || mode === "idle";

  if (error) {
    return (
      <SafeAreaView style={[styles.screen, styles.errorWrap, { backgroundColor: colors.bg }]}>
        <Text style={[styles.status, { color: colors.text }]}>
          Voice call unavailable
        </Text>
        <Text style={[styles.errorText, { color: colors.textDim }]}>
          {error}
        </Text>
        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={[styles.doneBtn, { backgroundColor: colors.accent }]}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
            Back to Talk
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

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
          amplitude={amplitude}
          color={colors.accent}
          icon={mode === "speaking" ? "volume-high" : "mic"}
          onPress={onOrbPress}
          disabled={mode === "thinking" || mode === "idle" || ending}
        />
        <Text style={[styles.status, { color: colors.textDim }]}>
          {STATUS[mode]}
        </Text>
        <Text style={[typography.tiny, { color: colors.textFaint, marginTop: 6 }]}>
          LIVE VAPI CALL - TRANSCRIPT SAVED AFTER
        </Text>
      </View>

      <Pressable
        onPress={() => scheduleFinish(true, 650)}
        disabled={endDisabled}
        style={[
          styles.endBtn,
          {
            backgroundColor: colors.surface,
            borderColor: colors.danger,
            opacity: endDisabled ? 0.45 : 1,
          },
        ]}
      >
        <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 15 }}>
          {ending ? "Ending..." : "End conversation"}
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
  errorWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    marginTop: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  doneBtn: {
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 14,
    marginTop: spacing.xl,
  },
});
