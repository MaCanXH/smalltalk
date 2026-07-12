import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

interface SoundBarsProps {
  /** Live 0..1 loudness driving the bars. */
  amplitude: SharedValue<number>;
  color: string;
  /** Per-bar height multipliers, outermost first — gives the organic profile. */
  profile?: number[];
  maxHeight?: number;
}

const DEFAULT_PROFILE = [0.45, 0.7, 1, 0.7, 0.45];
const MIN_HEIGHT = 7;

/**
 * The vertical voice-level bars flanking the orb during a live session. Each
 * bar stretches with the shared amplitude, scaled by its slot in the profile
 * so the group reads as a waveform rather than a solid block.
 */
export function SoundBars({
  amplitude,
  color,
  profile = DEFAULT_PROFILE,
  maxHeight = 46,
}: SoundBarsProps) {
  return (
    <View style={styles.row}>
      {profile.map((factor, i) => (
        <Bar
          key={i}
          amplitude={amplitude}
          color={color}
          factor={factor}
          maxHeight={maxHeight}
        />
      ))}
    </View>
  );
}

function Bar({
  amplitude,
  color,
  factor,
  maxHeight,
}: {
  amplitude: SharedValue<number>;
  color: string;
  factor: number;
  maxHeight: number;
}) {
  const style = useAnimatedStyle(() => {
    "worklet";
    const level = Math.max(0, Math.min(1, amplitude.value));
    return {
      height: MIN_HEIGHT + level * (maxHeight - MIN_HEIGHT) * factor,
      opacity: 0.45 + level * 0.55,
    };
  });

  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
});
