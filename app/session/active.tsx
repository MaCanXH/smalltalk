import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AudioModule } from "expo-audio";
import { useSharedValue, withTiming } from "react-native-reanimated";

import { Orb, type OrbMode } from "../../components/Orb";
import { SoundBars } from "../../components/SoundBars";
import { useTheme } from "../../context/ThemeContext";
import { useAppData } from "../../context/AppDataContext";
import { buildAiResult } from "../../lib/ai/critic";
import { buildResult } from "../../lib/ai/scoring";
import {
  createVapiClient,
  fetchVapiSession,
  summarizeVapiError,
  type VapiClient,
} from "../../lib/ai/vapi";
import {
  isVapiEndedMessage,
  normalizeVapiConversation,
} from "../../lib/ai/vapiTranscript";
import { cardShadow, spacing, radius, typography } from "../../styles/global";
import type {
  AssistantSetup,
  DialogTurn,
  NewsTopic,
  SceneContext,
  TopicId,
} from "../../types";

const SESSION_SECONDS = 180;

/**
 * Pull the composed prompt out of the per-call Vapi overrides so it can be
 * persisted on the session and replayed later. The system prompt rides in
 * `model.messages`; the opening line in `firstMessage`.
 */
function extractAssistantSetup(
  overrides: Record<string, unknown>
): AssistantSetup | undefined {
  const model = overrides.model as
    | { messages?: { role?: string; content?: unknown }[] }
    | undefined;
  const systemMessage = model?.messages?.find((m) => m?.role === "system");
  const systemPrompt =
    typeof systemMessage?.content === "string" ? systemMessage.content : "";
  if (!systemPrompt) return undefined;

  const firstMessage =
    typeof overrides.firstMessage === "string" ? overrides.firstMessage : undefined;
  return { systemPrompt, firstMessage };
}

/**
 * Splice a previously-captured prompt back into fresh overrides for a
 * re-practice run. The overrides come from a generic (no-Groq) session fetch,
 * so the model provider/model and webhook plumbing stay intact — only the
 * system prompt and opening line are replaced with the saved ones.
 */
function applyAssistantSetup(
  overrides: Record<string, unknown>,
  setup: AssistantSetup
): void {
  const model = (overrides.model as Record<string, unknown>) ?? {};
  model.messages = [{ role: "system", content: setup.systemPrompt }];
  overrides.model = model;
  if (setup.firstMessage) overrides.firstMessage = setup.firstMessage;
  else delete overrides.firstMessage;
}

/** Daily audio level is a small RMS-ish value; scale it up like Vapi does. */
const LOCAL_LEVEL_GAIN = 0.15;

/**
 * Sessions are now driven by a free-form headline, not the topic catalog, but
 * scoring still wants a TopicId. Its only effect is the emoji shown in Library;
 * the displayed topic label comes from the headline via `labelOverride`.
 */
const RESULT_TOPIC_ID: TopicId = "weekend";

type LocalAudioEvent = { audioLevel: number };
type DailyAudioCall = {
  startLocalAudioLevelObserver: (interval?: number) => Promise<void> | void;
  stopLocalAudioLevelObserver: () => void;
  on: (event: "local-audio-level", listener: (ev: LocalAudioEvent) => void) => unknown;
  off: (event: "local-audio-level", listener: (ev: LocalAudioEvent) => void) => unknown;
};

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
  const params = useLocalSearchParams<{
    title?: string;
    newsContext?: string;
    sceneContext?: string;
    presetSlug?: string;
    assistantSetup?: string;
    groupId?: string;
  }>();
  const groupId = useMemo(() => {
    const raw = typeof params.groupId === "string" ? params.groupId.trim() : "";
    return raw.length > 0 ? raw : undefined;
  }, [params.groupId]);
  const presetSlug = useMemo(() => {
    const raw = typeof params.presetSlug === "string" ? params.presetSlug.trim() : "";
    return raw.length > 0 ? raw : undefined;
  }, [params.presetSlug]);
  const title = useMemo(() => {
    const raw = typeof params.title === "string" ? params.title.trim() : "";
    return raw.length > 0 ? raw : null;
  }, [params.title]);

  const newsContext = useMemo<NewsTopic | undefined>(() => {
    const raw =
      typeof params.newsContext === "string" ? params.newsContext.trim() : "";

    if (!raw) return undefined;

    try {
      return JSON.parse(raw) as NewsTopic;
    } catch {
      return undefined;
    }
  }, [params.newsContext]);

  const sceneContext = useMemo<SceneContext | undefined>(() => {
    const raw =
      typeof params.sceneContext === "string" ? params.sceneContext.trim() : "";

    if (!raw) return undefined;

    try {
      return JSON.parse(raw) as SceneContext;
    } catch {
      return undefined;
    }
  }, [params.sceneContext]);

  // Re-practice: a previously-captured prompt to replay verbatim (no Groq).
  // When present, the session is started from this instead of composing anew.
  const replaySetup = useMemo<AssistantSetup | undefined>(() => {
    const raw =
      typeof params.assistantSetup === "string" ? params.assistantSetup.trim() : "";

    if (!raw) return undefined;

    try {
      const parsed = JSON.parse(raw) as AssistantSetup;
      return typeof parsed?.systemPrompt === "string" && parsed.systemPrompt
        ? parsed
        : undefined;
    } catch {
      return undefined;
    }
  }, [params.assistantSetup]);

  const headerLabel = newsContext?.short ?? title ?? "Open chat";
  const headerEmoji = sceneContext || presetSlug ? "🎭" : title ? "📰" : "💬";

  const [mode, setMode] = useState<SessionMode>("idle");
  const [remaining, setRemaining] = useState(SESSION_SECONDS);

  const amplitude = useSharedValue(0);
  const vapiRef = useRef<VapiClient | null>(null);
  const modeRef = useRef<SessionMode>("idle");
  const dailyAudioRef = useRef<DailyAudioCall | null>(null);
  const localAudioHandlerRef = useRef<((ev: LocalAudioEvent) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const dialogRef = useRef<DialogTurn[]>([]);
  const finishedRef = useRef(false);
  const finishScheduledRef = useRef(false);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef<(saveResult: boolean) => Promise<void>>(async () => undefined);
  const addSessionRef = useRef(addSession);
  const vapiCallIdRef = useRef<string | undefined>(undefined);
  const routerRef = useRef(router);
  const hapticsEnabledRef = useRef(settings.hapticsEnabled);
  const titleRef = useRef(title);
  const newsContextRef = useRef<NewsTopic | undefined>(newsContext);
  const sceneContextRef = useRef<SceneContext | undefined>(sceneContext);
  // The composed prompt this session ran with — the replay setup up front, then
  // the freshly-captured one once the session config resolves. Persisted on the
  // result so the session can be re-practiced later.
  const assistantSetupRef = useRef<AssistantSetup | undefined>(replaySetup);
  // The practice group this session belongs to — carried on a re-practice so
  // the new attempt joins the originating session's Library card.
  const groupIdRef = useRef<string | undefined>(groupId);

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
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    newsContextRef.current = newsContext;
  }, [newsContext]);

  useEffect(() => {
    sceneContextRef.current = sceneContext;
  }, [sceneContext]);

  useEffect(() => {
    assistantSetupRef.current = replaySetup;
  }, [replaySetup]);

  useEffect(() => {
    groupIdRef.current = groupId;
  }, [groupId]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const stopLocalAudioMeter = useCallback(() => {
    const daily = dailyAudioRef.current;
    const handler = localAudioHandlerRef.current;
    dailyAudioRef.current = null;
    localAudioHandlerRef.current = null;
    if (!daily) return;
    try {
      if (handler) daily.off("local-audio-level", handler);
      daily.stopLocalAudioLevelObserver();
    } catch {
      // Ignore best-effort observer teardown failures.
    }
  }, []);

  const haptic = useCallback(() => {
    if (settings.hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [settings.hapticsEnabled]);

  const syncTranscriptFromMessage = useCallback((message: unknown) => {
    const turns = normalizeVapiConversation(message);
    // Only `conversation-update` messages resolve; everything else is ignored.
    if (!turns) return;
    // The update carries the whole conversation, so we replace (not append)
    // the dialog with Vapi's canonical, de-duplicated turns. The length guard
    // keeps a transient shorter update from truncating a fuller transcript.
    if (turns.length < dialogRef.current.length) return;
    dialogRef.current = turns.map((turn) => ({
      speaker: turn.speaker,
      text: turn.text,
      t: Math.round(turn.t),
    }));
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

    stopLocalAudioMeter();
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

    const result = {
      ...(await buildAiResult(
        RESULT_TOPIC_ID,
        [...dialogRef.current],
        elapsedRef.current,
        titleRef.current ?? undefined,
        newsContextRef.current,
        sceneContextRef.current
      )),
      vapiCallId: vapiCallIdRef.current,
      assistantSetup: assistantSetupRef.current,
      groupId: groupIdRef.current,
    };

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
  }, [amplitude, clearFinishTimer, stopClient, stopLocalAudioMeter]);

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
    vapiCallIdRef.current = undefined;
    elapsedRef.current = 0;
    setMode("idle");
    setRemaining(SESSION_SECONDS);
    setError(null);
    setEnding(false);
    amplitude.value = withTiming(0, { duration: 120 });
    (async () => {
      if (!active || finishedRef.current) return;
      setMode("thinking");
      try {
        // The Vapi credentials and per-call overrides are issued by the
        // backend Edge Function (JWT-gated); nothing Vapi-related ships in
        // the bundle or in client env vars. On a re-practice run we fetch a
        // generic session (no topic/scene/preset — so no Groq) purely for a
        // fresh token + plumbing, then splice the saved prompt back in.
        const session = replaySetup
          ? await fetchVapiSession()
          : await fetchVapiSession(
              title ?? undefined,
              newsContext,
              sceneContext,
              presetSlug,
            );
        if (!active || finishedRef.current || finishScheduledRef.current) return;

        if (replaySetup) {
          applyAssistantSetup(session.overrides, replaySetup);
          assistantSetupRef.current = replaySetup;
        } else {
          assistantSetupRef.current = extractAssistantSetup(session.overrides);
        }

        const client = createVapiClient(session.token);
        vapiRef.current = client;

        const startLocalAudioMeter = () => {
          let daily: DailyAudioCall | null = null;
          try {
            daily = client.getDailyCallObject() as DailyAudioCall | null;
          } catch {
            daily = null;
          }
          if (!daily) return;
          dailyAudioRef.current = daily;
          const onLocal = (ev: LocalAudioEvent) => {
            if (!active || finishedRef.current || finishScheduledRef.current) return;
            // Only drive the orb from the user's mic during their turn; the AI's
            // turn is driven by the assistant `volume-level` event instead.
            if (modeRef.current !== "listening") return;
            const level = Math.max(0, Math.min(1, (ev?.audioLevel ?? 0) / LOCAL_LEVEL_GAIN));
            amplitude.value = withTiming(level, { duration: 90 });
          };
          localAudioHandlerRef.current = onLocal;
          daily.on("local-audio-level", onLocal);
          void Promise.resolve(daily.startLocalAudioLevelObserver(100)).catch(() => undefined);
        };

        client.on("call-start", () => {
          if (!active || finishedRef.current || finishScheduledRef.current) return;
          setMode("listening");
          startLocalAudioMeter();
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
          // Assistant output level — only relevant while the AI is speaking.
          if (modeRef.current !== "speaking") return;
          const clamped = Math.max(0, Math.min(1, volume));
          amplitude.value = withTiming(clamped, { duration: 90 });
        });

        client.on("message", (message) => {
          if (!active || finishedRef.current) return;
          syncTranscriptFromMessage(message);
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

          stopLocalAudioMeter();
          const currentClient = vapiRef.current;
          vapiRef.current = null;
          stopClient(currentClient);
        });

        // RECORD_AUDIO is a runtime permission on Android (and iOS prompts on
        // first use). Without it the WebRTC mic track stays silent: the call
        // connects and the AI talks, but Vapi never receives the user's voice.
        const mic = await AudioModule.requestRecordingPermissionsAsync();
        if (!active || finishedRef.current || finishScheduledRef.current) return;
        if (!mic.granted) {
          throw new Error(
            "Microphone access is off, so Vapi can't hear you. Enable the microphone permission for Small Talk in system settings, then try again."
          );
        }
        const started = await client.start(session.assistantId, session.overrides);
        if (!active || finishedRef.current || finishScheduledRef.current) return;
        if (!started) {
          throw new Error("The Vapi call could not be started.");
        }
        // Vapi's call id links this session to the server-side end-of-call
        // report (`call_reports`) written by the webhook.
        const callId = (started as { id?: unknown }).id;
        vapiCallIdRef.current = typeof callId === "string" ? callId : undefined;
      } catch (err) {
        if (!active || finishedRef.current || finishScheduledRef.current) return;
        finishedRef.current = true;
        finishScheduledRef.current = false;
        clearFinishTimer();
        setMode("idle");
        setEnding(false);
        setError(summarizeVapiError(err));
        amplitude.value = withTiming(0, { duration: 120 });
        stopLocalAudioMeter();
        const currentClient = vapiRef.current;
        vapiRef.current = null;
        stopClient(currentClient);
      }
    })();

    return () => {
      active = false;
      const dialog = [...dialogRef.current];
      const shouldSaveOnLeave =
        !finishedRef.current && dialog.some((turn) => turn.speaker === "user");
      if (shouldSaveOnLeave) {
        const result = {
          ...buildResult(
            RESULT_TOPIC_ID,
            dialog,
            elapsedRef.current,
            titleRef.current ?? undefined
          ),
          newsContext: newsContextRef.current,
          sceneContext: sceneContextRef.current,
          vapiCallId: vapiCallIdRef.current,
          assistantSetup: assistantSetupRef.current,
          groupId: groupIdRef.current,
        };
        void addSessionRef.current(result).catch(() => undefined);
      }
      finishedRef.current = true;
      finishScheduledRef.current = false;
      clearFinishTimer();
      amplitude.value = withTiming(0, { duration: 120 });
      stopLocalAudioMeter();
      const currentClient = vapiRef.current;
      vapiRef.current = null;
      stopClient(currentClient);
    };
  }, [
    amplitude,
    syncTranscriptFromMessage,
    clearFinishTimer,
    scheduleFinish,
    stopClient,
    stopLocalAudioMeter,
    title,
    newsContext,
    sceneContext,
    presetSlug,
    replaySetup,
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
        <View style={styles.brandRow}>
          <Text style={[styles.wordmark, { color: colors.accent }]}>Small Talk</Text>
          <Text style={[typography.small, { color: colors.textFaint }]} numberOfLines={1}>
            · {headerEmoji} {headerLabel}
          </Text>
        </View>
        <View style={styles.timerRow}>
          <Ionicons name="time-outline" size={26} color={colors.text} />
          <Text style={[styles.timer, { color: colors.text }]}>
            {mm}:{ss}
          </Text>
        </View>
        <View style={[styles.progressPill, { backgroundColor: colors.surfaceAlt }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accent, width: `${progress * 100}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.center}>
        <View style={styles.orbRow}>
          <SoundBars
            amplitude={amplitude}
            color={mode === "listening" ? "#3B82F6" : colors.accent}
          />
          <Orb
            mode={mode}
            amplitude={amplitude}
            variant={mode === "listening" ? "user" : "ai"}
            size={200}
            onPress={onOrbPress}
            disabled={mode === "thinking" || mode === "idle" || ending}
          />
          <SoundBars
            amplitude={amplitude}
            color={mode === "listening" ? "#3B82F6" : colors.accent}
          />
        </View>
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
            borderColor: colors.border,
            opacity: endDisabled ? 0.45 : 1,
          },
        ]}
      >
        <View style={[styles.endSquare, { backgroundColor: colors.danger }]} />
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
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: "100%",
    paddingHorizontal: spacing.md,
  },
  wordmark: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  timer: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  progressPill: {
    width: "60%",
    height: 8,
    borderRadius: radius.pill,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: radius.pill },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  orbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  status: {
    marginTop: spacing.xl,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  endBtn: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  endSquare: {
    width: 12,
    height: 12,
    borderRadius: 3,
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
