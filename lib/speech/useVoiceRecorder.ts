import { useCallback, useEffect, useRef } from "react";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

/**
 * Real microphone capture for the user's turn.
 *
 * We genuinely record + meter the mic so the on-screen orb reacts to the user's
 * voice. We do NOT transcribe here (no offline transcription exists in Expo Go)
 * — the transcript text is supplied separately by the dialog engine. This hook's
 * job is purely "is the user talking, and how loudly" to drive the visuals.
 */

export interface VoiceRecorder {
  /** 0..1 live loudness, smoothed — feed this to the Orb. */
  amplitude: SharedValue<number>;
  isRecording: boolean;
  durationMillis: number;
  requestPermission: () => Promise<boolean>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

function dbToAmplitude(db: number | undefined): number {
  if (db == null || Number.isNaN(db)) return 0;
  // Metering is in dBFS, roughly -60 (quiet) .. 0 (loud).
  const norm = (db + 60) / 60;
  return Math.max(0, Math.min(1, norm));
}

export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, 80);
  const amplitude = useSharedValue(0);
  const startedRef = useRef(false);

  // Map live metering onto the shared amplitude value.
  useEffect(() => {
    if (state.isRecording) {
      amplitude.value = withTiming(dbToAmplitude(state.metering), {
        duration: 90,
      });
    }
  }, [state.isRecording, state.metering, amplitude]);

  const requestPermission = useCallback(async () => {
    const res = await AudioModule.requestRecordingPermissionsAsync();
    return res.granted;
  }, []);

  const start = useCallback(async () => {
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedRef.current = true;
    } catch {
      // If recording can't start (e.g. permission/device quirk) we let the
      // conversation continue silently — the orb just won't react to voice.
      startedRef.current = false;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    amplitude.value = withTiming(0, { duration: 200 });
    if (!startedRef.current) return;
    try {
      await recorder.stop();
    } catch {
      // ignore — already stopped
    }
    startedRef.current = false;
  }, [recorder, amplitude]);

  return {
    amplitude,
    isRecording: state.isRecording,
    durationMillis: state.durationMillis ?? 0,
    requestPermission,
    start,
    stop,
  };
}
