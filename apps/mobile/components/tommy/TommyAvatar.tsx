// P1 Naman: Tommy's face. Four moods: default, searching (working), celebrating (it went through), winking (hello).
import { colors } from "@trojanhub/shared/theme";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  type ImageStyle,
  type StyleProp,
} from "react-native";

import type { TommyMood } from "@/components/chat/chatState";

const FACES: Record<TommyMood, number> = {
  default: require("@/assets/images/tommy/default.png"),
  searching: require("@/assets/images/tommy/searching.png"),
  celebrating: require("@/assets/images/tommy/celebrating.png"),
  winking: require("@/assets/images/tommy/winking.png"),
};

const LABEL: Record<TommyMood, string> = {
  default: "Tommy",
  searching: "Tommy is looking",
  celebrating: "Tommy is celebrating",
  winking: "Tommy says hi",
};

export function TommyAvatar({
  mood = "default",
  size = 40,
  style,
}: {
  mood?: TommyMood;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const wiggle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mood === "searching") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(wiggle, {
            toValue: 1,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(wiggle, {
            toValue: -1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(wiggle, {
            toValue: 0,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    if (mood === "celebrating" || mood === "winking") {
      wiggle.setValue(0);
      Animated.sequence([
        Animated.spring(wiggle, {
          toValue: 1,
          useNativeDriver: true,
          speed: 30,
          bounciness: 14,
        }),
        Animated.spring(wiggle, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 10,
        }),
      ]).start();
    }
    wiggle.setValue(0);
  }, [mood, wiggle]);

  const rotate = wiggle.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-8deg", "8deg"],
  });
  const scale =
    mood === "celebrating"
      ? wiggle.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [1, 1, 1.15],
        })
      : 1;

  return (
    <Animated.Image
      source={FACES[mood]}
      accessibilityLabel={LABEL[mood]}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: colors.gold,
          transform: [{ rotate }, { scale }],
        },
        style,
      ]}
    />
  );
}
