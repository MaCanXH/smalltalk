import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import {
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Orb, type OrbMode } from "../../components/Orb";
import { useTheme } from "../../context/ThemeContext";
import { composeSceneFromDescription } from "../../lib/ai/sceneCompose";
import { spacing, typography } from "../../styles/global";

type Phase = "listening" | "processing" | "error";

/** Map the -2..10 `volumechange` value onto the orb's 0..1 amplitude. */
function levelToAmplitude(value: number): number {
  return Math.max(0, Math.min(1, (value + 2) / 12));
}

export default function SceneListenScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [transcript, setTranscript] = useState("");
  const [phase, setPhase] = useState<Phase>("listening");
  const [error, setError] = useState<string | null>(null);

  const amplitude = useSharedValue(0);
  // Text finalized across pauses; the current interim result is appended live.
  const finalizedRef = useRef("");
  // Latest displayed text — read synchronously when the user taps "done".
  const fullTextRef = useRef("");
  // True once we've asked to stop, so an incoming `end` doesn't restart.
  const finishingRef = useRef(false);
  const restartsRef = useRef(0);

  const beginListening = useCallback(() => {
    finishingRef.current = false;
    setError(null);
    setTranscript("");
    finalizedRef.current = "";
    fullTextRef.current = "";
    setPhase("listening");
    amplitude.value = withRepeat(withTiming(0.4, { duration: 700 }), -1, true);
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 200 },
    });
  }, [amplitude]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (cancelled) return;
      if (!perm.granted) {
        setError(
          "Microphone and speech access are off. Enable them for Small Talk in system settings, or type your scene instead."
        );
        setPhase("error");
        return;
      }
      beginListening();
    })();

    return () => {
      cancelled = true;
      finishingRef.current = true;
      ExpoSpeechRecognitionModule.abort();
    };
  }, [beginListening]);

  useSpeechRecognitionEvent("result", (event) => {
    if (finishingRef.current) return;
    const latest = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      finalizedRef.current = `${finalizedRef.current} ${latest}`.trim();
      fullTextRef.current = finalizedRef.current;
    } else {
      fullTextRef.current = `${finalizedRef.current} ${latest}`.trim();
    }
    setTranscript(fullTextRef.current);
  });

  useSpeechRecognitionEvent("volumechange", (event) => {
    if (finishingRef.current || phase !== "listening") return;
    amplitude.value = withTiming(levelToAmplitude(event.value), { duration: 180 });
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (finishingRef.current) return;
    // A "no-speech" timeout isn't fatal — just keep the session going.
    if (event.error === "no-speech") return;
    finishingRef.current = true;
    setError("Didn't catch that clearly. Tap the orb to try again, or type instead.");
    setPhase("error");
  });

  useSpeechRecognitionEvent("end", () => {
    // Android can end on a silence gap; keep listening until the user is done.
    if (finishingRef.current || phase !== "listening") return;
    if (restartsRef.current >= 20) return;
    restartsRef.current += 1;
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 200 },
    });
  });

  const finish = useCallback(async () => {
    if (phase === "processing") return;
    const text = fullTextRef.current.trim();
    finishingRef.current = true;
    ExpoSpeechRecognitionModule.abort();
    amplitude.value = withTiming(0, { duration: 200 });

    if (!text) {
      setError("I didn't catch anything yet. Tap the orb to try again, or type instead.");
      setPhase("error");
      return;
    }

    setPhase("processing");
    try {
      const scene = await composeSceneFromDescription(text);
      router.replace({
        pathname: "/scene/setup",
        params: {
          goal: scene.goal,
          role: scene.role,
          scene: scene.scene,
          personality: scene.personality ?? "",
        },
      });
    } catch {
      setError("Something went wrong turning that into a scene. Tap the orb to retry, or type instead.");
      setPhase("error");
    }
  }, [phase, amplitude, router]);

  const onOrbPress = () => {
    if (phase === "listening") {
      finish();
    } else if (phase === "error") {
      restartsRef.current = 0;
      beginListening();
    }
  };

  const goType = () => {
    finishingRef.current = true;
    ExpoSpeechRecognitionModule.abort();
    router.replace({ pathname: "/(tabs)/scene", params: { compose: "type" } });
  };

  const close = () => {
    finishingRef.current = true;
    ExpoSpeechRecognitionModule.abort();
    router.back();
  };

  const orbMode: OrbMode =
    phase === "processing" ? "thinking" : phase === "listening" ? "listening" : "idle";

  const caption =
    phase === "processing"
      ? "Turning that into a scene…"
      : phase === "error"
        ? "Let's try that again"
        : "Listening…";
  const hint =
    phase === "processing"
      ? undefined
      : phase === "error"
        ? undefined
        : "Tap the orb when you're done";

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Pressable
        onPress={close}
        style={[styles.closeBtn, { backgroundColor: colors.surfaceAlt }]}
        hitSlop={8}
      >
        <Ionicons name="close" size={18} color={colors.textDim} />
      </Pressable>

      <View style={styles.transcriptArea}>
        {phase === "error" ? (
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        ) : transcript ? (
          <Text style={[styles.transcript, { color: colors.text }]}>{transcript}</Text>
        ) : (
          <Text style={[styles.placeholder, { color: colors.textFaint }]}>
            {phase === "listening" ? "Start describing your scene…" : ""}
          </Text>
        )}
      </View>

      <View style={styles.orbWrap}>
        <Orb
          mode={orbMode}
          amplitude={amplitude}
          variant="user"
          onPress={onOrbPress}
          disabled={phase === "processing"}
          size={190}
        />
        <Text style={[typography.h3, { color: colors.text, marginTop: spacing.lg }]}>
          {caption}
        </Text>
        {hint && <Text style={[styles.hint, { color: colors.textDim }]}>{hint}</Text>}
      </View>

      <View style={styles.footer}>
        <Pressable onPress={goType} hitSlop={8} disabled={phase === "processing"}>
          <Text
            style={[
              styles.linkText,
              { color: colors.accent, opacity: phase === "processing" ? 0.4 : 1 },
            ]}
          >
            Prefer to type instead?
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  transcriptArea: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  transcript: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "600",
    textAlign: "center",
  },
  placeholder: {
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
  orbWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  footer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: spacing.xl,
  },
  linkText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
});
