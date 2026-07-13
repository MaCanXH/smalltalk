import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
export type OrbVariant = "ai" | "user";

interface OrbProps {
  mode: OrbMode;
  /** Live 0..1 loudness (assistant output or user mic, per turn). */
  amplitude: SharedValue<number>;
  /** "ai" = varying purple face with glowing eyes, "user" = eye-less varying blue orb. */
  variant?: OrbVariant;
  size?: number;
  onPress?: () => void;
  disabled?: boolean;
}

const MODE_VALUE: Record<OrbMode, number> = {
  idle: 0,
  listening: 1,
  speaking: 2,
  thinking: 3,
};

/**
 * Pink (left) → purple (right), cross-faded between two hue pairs on a slow
 * loop so the colour keeps varying, with an orange bloom at the bottom.
 */
const AI_GRADIENT = ["#F9A8D4", "#A855F7"] as const;
const AI_GRADIENT_ALT = ["#F472B6", "#7C3AED"] as const;
const AI_ORANGE = ["rgba(249,115,22,0)", "#FB923C"] as const;

/** Same trick in blue for the user's turn. */
const USER_GRADIENT = ["#BFDBFE", "#3B82F6", "#1E40AF"] as const;
const USER_GRADIENT_ALT = ["#A5F3FC", "#38BDF8", "#2563EB"] as const;
const USER_GLOW = ["#67E8F9", "#3B82F6"] as const;

/** Top-left specular highlight + bottom vignette fake a 3D sphere. */
const HIGHLIGHT = ["rgba(255,255,255,0.6)", "rgba(255,255,255,0)"] as const;
const SHADE = ["rgba(20,8,60,0)", "rgba(20,8,60,0.38)"] as const;

/**
 * The conversation orb — a 3D-shaded gradient sphere wrapped in a thin outer
 * ring. The AI face is a slowly-varying purple with glowing inverse-V smiley
 * eyes; the user's turn cross-fades to an eye-less, varying blue sphere. The
 * whole orb floats with a gentle bounce; the sphere keeps a fixed size while
 * only the outer ring swells and shrinks with the live voice amplitude.
 */
export function Orb({
  mode,
  amplitude,
  variant = "ai",
  size = 220,
  onPress,
  disabled,
}: OrbProps) {
  const pulse = useSharedValue(0);
  const float = useSharedValue(0);
  const drift = useSharedValue(0);
  const modeV = useSharedValue(MODE_VALUE[mode]);
  const userV = useSharedValue(variant === "user" ? 1 : 0);

  useEffect(() => {
    modeV.value = MODE_VALUE[mode];
  }, [mode, modeV]);

  useEffect(() => {
    userV.value = withTiming(variant === "user" ? 1 : 0, { duration: 350 });
  }, [variant, userV]);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    float.value = withRepeat(
      withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    drift.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse, float, drift]);

  // The whole orb bobs up and down — a slight floating bounce.
  const floatStyle = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateY: (float.value - 0.5) * size * 0.055 }] };
  });

  // Voice-reactive drive: live amplitude during either speaking turn, a soft
  // breath when idle, a firmer pulse while connecting/thinking.
  const ringStyle = useAnimatedStyle(() => {
    "worklet";
    const talking = modeV.value === 1 || modeV.value === 2;
    const driveV = talking
      ? amplitude.value
      : modeV.value === 0
        ? pulse.value * 0.25
        : pulse.value * 0.45;
    return {
      transform: [{ scale: 1 + driveV * 0.22 }],
      opacity: 0.55 + driveV * 0.45,
    };
  });

  const haloStyle = useAnimatedStyle(() => {
    "worklet";
    const talking = modeV.value === 1 || modeV.value === 2;
    const driveV = talking
      ? amplitude.value
      : modeV.value === 0
        ? pulse.value * 0.25
        : pulse.value * 0.45;
    return {
      transform: [{ scale: 1.04 + driveV * 0.34 }],
      opacity: 0.10 + driveV * 0.25,
    };
  });

  const userFaceStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: userV.value };
  });

  const aiFaceStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: 1 - userV.value };
  });

  // Slow shimmer between the two gradients of each variant.
  const driftStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: drift.value * 0.85 };
  });

  const haloColor = variant === "user" ? "#3B82F6" : "#A855F7";

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
      <Animated.View style={[styles.fill, styles.wrap, floatStyle]}>
        {/* Soft glow halo behind the ring. */}
        <Animated.View
          style={[styles.halo, { backgroundColor: haloColor }, haloStyle]}
          pointerEvents="none"
        />
        {/* The outer ring — the only part that expands with the voice. */}
        <Animated.View style={[styles.ring, ringStyle]} pointerEvents="none" />

        {/* Fixed-size gradient sphere: pink (left) → purple (right). */}
        <View style={styles.core}>
          <LinearGradient
            colors={AI_GRADIENT}
            start={{ x: 0, y: 0.35 }}
            end={{ x: 1, y: 0.65 }}
            style={styles.fill}
          />
          <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
            <LinearGradient
              colors={AI_GRADIENT_ALT}
              start={{ x: 0, y: 0.55 }}
              end={{ x: 1, y: 0.45 }}
              style={styles.fill}
            />
          </Animated.View>
          {/* Orange bloom at the bottom. */}
          <LinearGradient
            colors={AI_ORANGE}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.orangeBloom}
          />

          {/* User-turn sphere cross-fades in over the AI face. */}
          <Animated.View style={[StyleSheet.absoluteFill, userFaceStyle]}>
            <LinearGradient
              colors={USER_GRADIENT}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.fill}
            />
            <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
              <LinearGradient
                colors={USER_GRADIENT_ALT}
                start={{ x: 0.85, y: 0 }}
                end={{ x: 0.15, y: 1 }}
                style={styles.fill}
              />
            </Animated.View>
            <LinearGradient
              colors={USER_GLOW}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.glow}
            />
          </Animated.View>

          {/* 3D shading: bottom vignette + top-left specular highlight. */}
          <LinearGradient
            colors={SHADE}
            start={{ x: 0.5, y: 0.35 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.fill}
            pointerEvents="none"
          />
          <LinearGradient
            colors={HIGHLIGHT}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0.6, y: 1 }}
            style={styles.highlight}
            pointerEvents="none"
          />

          {/* Glowing inverse-V smiley eyes — AI turns only. */}
          <Animated.View style={[styles.face, { gap: size * 0.1 }, aiFaceStyle]} pointerEvents="none">
            <Eye size={size} />
            <Eye size={size} />
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * One inverse-V ("∧") eye: two rounded strokes meeting at an apex. The glow is
 * layered translucent copies behind the crisp stroke (Android has no blur
 * shadows) plus a real white shadow on iOS.
 */
function Eye({ size }: { size: number }) {
  const len = size * 0.105;
  const thick = size * 0.026;
  const offset = len * 0.42;

  const segments = [
    { key: "l", transform: [{ translateX: -offset }, { rotate: "-32deg" }] },
    { key: "r", transform: [{ translateX: offset }, { rotate: "32deg" }] },
  ];

  return (
    <View style={{ width: size * 0.2, height: size * 0.1, alignItems: "center", justifyContent: "center" }}>
      {segments.map((seg) => (
        <React.Fragment key={seg.key}>
          <View
            style={[
              styles.eyeGlowOuter,
              { width: len * 1.55, height: thick * 3.1, transform: seg.transform },
            ]}
          />
          <View
            style={[
              styles.eyeGlowInner,
              { width: len * 1.22, height: thick * 1.9, transform: seg.transform },
            ]}
          />
          <View
            style={[
              styles.eyeStroke,
              { width: len, height: thick, transform: seg.transform },
            ]}
          />
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  halo: {
    position: "absolute",
    width: "88%",
    height: "88%",
    borderRadius: 999,
  },
  ring: {
    position: "absolute",
    width: "86%",
    height: "86%",
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    shadowColor: "#7C5CFF",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
  },
  core: {
    width: "72%",
    height: "72%",
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#5B3DF5",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  glow: {
    position: "absolute",
    left: "16%",
    top: "38%",
    width: "68%",
    height: "58%",
    borderRadius: 999,
    opacity: 0.7,
  },
  orangeBloom: {
    position: "absolute",
    left: "10%",
    bottom: "-10%",
    width: "80%",
    height: "58%",
    borderRadius: 999,
    opacity: 0.85,
  },
  highlight: {
    position: "absolute",
    left: "14%",
    top: "5%",
    width: "52%",
    height: "42%",
    borderRadius: 999,
  },
  face: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  eyeStroke: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  eyeGlowInner: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  eyeGlowOuter: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
});
