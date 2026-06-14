import * as Speech from "expo-speech";

/**
 * Thin wrapper over the device's on-device text-to-speech. This is how the AI
 * "speaks" its replies aloud — fully offline, works in Expo Go, no subtitles.
 */

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  onDone?: () => void;
  onStopped?: () => void;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  Speech.stop();
  Speech.speak(text, {
    rate: opts.rate ?? 1.0,
    pitch: opts.pitch ?? 1.0,
    onDone: opts.onDone,
    onStopped: opts.onStopped,
    // If TTS errors on a device, treat it like a normal finish so the
    // conversation never stalls waiting for a callback.
    onError: opts.onDone,
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}

export async function isSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch {
    return false;
  }
}
