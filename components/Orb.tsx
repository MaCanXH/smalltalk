import React, { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

export type OrbMode = "idle" | "listening" | "speaking" | "thinking";

interface OrbProps {
  mode: OrbMode;
  /** Live 0..1 loudness (used in "listening" mode). */
  amplitude: SharedValue<number>;
  color: string;
  size?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  disabled?: boolean;
}

const MODE_VALUE: Record<OrbMode, number> = {
  idle: 0,
  listening: 1,
  speaking: 2,
  thinking: 3,
};

const AGradient = Animated.createAnimatedComponent(LinearGradient);

/**
 * The reactive "conversation orb" — a glowing core wrapped in pulsing halo
 * rings. It breathes when idle, swells with the user's voice when listening,
 * and pulses steadily while the AI speaks or thinks.
 */
export function Orb({
  mode,
  amplitude,
  color,
  size = 220,
  icon = "mic",
  onPress,
  disabled,
}: OrbProps) {
  const pulse = useSharedValue(0);
  const modeV = useSharedValue(MODE_VALUE[mode]);

  useEffect(() => {
    modeV.value = MODE_VALUE[mode];
  }, [mode, modeV]);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  const coreStyle = useAnimatedStyle(() => {
    "worklet";
    let scale = 1 + pulse.value * 0.04; // idle breathing
    if (modeV.value === 1) scale = 1 + amplitude.value * 0.4;
    else if (modeV.value === 2) scale = 1 + pulse.value * 0.13;
    else if (modeV.value === 3) scale = 1 + pulse.value * 0.07;
    return { transform: [{ scale }] };
  });

  const outer = useAnimatedStyle(() => {
    "worklet";
    const drive =
      modeV.value === 1 ? amplitude.value : modeV.value === 0 ? pulse.value * 0.5 : pulse.value;
    return { transform: [{ scale: 1.05 + drive * 0.55 }], opacity: 0.05 + drive * 0.28 };
  });

  const mid = useAnimatedStyle(() => {
    "worklet";
    const drive =
      modeV.value === 1 ? amplitude.value : modeV.value === 0 ? pulse.value * 0.5 : pulse.value;
    return { transform: [{ scale: 1.0 + drive * 0.4 }], opacity: 0.05 + drive * 0.28 };
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={20}
      style={({ pressed }) => [
        styles.wrap,
        { width: size, height: size, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <Animated.View
        style={[styles.ring, { backgroundColor: color }, outer]}
        pointerEvents="none"
      />
      <Animated.View
        style={[styles.ring, { backgroundColor: color }, mid]}
        pointerEvents="none"
      />
      <AGradient
        colors={[color, shade(color, -0.35)]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.core, coreStyle]}
      >
        <Ionicons name={icon} size={size * 0.26} color="#fff" />
      </AGradient>
    </Pressable>
  );
}

/** Darken/lighten a #rrggbb colour by a ratio (-1..1). */
function shade(hex: string, ratio: number): string {
  const h = hex.replace("#", "");
  const num = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const t = ratio < 0 ? 0 : 255;
  const p = Math.abs(ratio);
  r = Math.round((t - r) * p) + r;
  g = Math.round((t - g) * p) + g;
  b = Math.round((t - b) * p) + b;
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: "78%",
    height: "78%",
    borderRadius: 999,
  },
  core: {
    width: "62%",
    height: "62%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});
