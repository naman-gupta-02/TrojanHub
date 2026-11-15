// P1 Naman: floating "Chat with Tommy" button over every tab, with a phrase suggestion for that page.
// It shows the full label for the first few seconds, then shrinks to a round Tommy face so it
// covers less of the page.
import { colors, fontSize, radius, spacing } from "@trojanhub/shared/theme";
import { router, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";

import { promptsFor } from "@/components/chat/chatState";

import { TommyAvatar } from "./TommyAvatar";

const EXPANDED_MS = 5000;

export function TommyFab() {
  const path = usePathname();
  const [nudge, setNudge] = useState<{ path: string; text: string } | null>(
    null,
  );
  const teaser = nudge && nudge.path === path ? nudge.text : null;
  const pulse = useRef(new Animated.Value(1)).current;
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCompact(true);
    }, EXPANDED_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.06,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const show = setTimeout(
      () => setNudge({ path, text: promptsFor(path)[0] }),
      1800,
    );
    const hide = setTimeout(() => setNudge(null), 10000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [path]);

  const openTommy = (ask?: string) => {
    setNudge(null);
    router.push({
      pathname: "/tommy",
      params: { from: path, ...(ask ? { ask } : {}) },
    });
  };

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      {!!teaser && (
        <Pressable
          onPress={() => openTommy(teaser)}
          style={styles.teaser}
          accessibilityRole="button"
          accessibilityLabel={`Ask Tommy: ${teaser}`}
        >
          <Text style={styles.teaserLabel}>Try asking Tommy</Text>
          <Text style={styles.teaserText}>“{teaser}”</Text>
        </Pressable>
      )}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Pressable
          onPress={() => openTommy()}
          style={({ pressed }) => [
            styles.fab,
            compact && styles.fabCompact,
            pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Chat with Tommy, our AI"
        >
          <TommyAvatar size={compact ? 44 : 40} />
          {!compact && (
            <Text style={styles.fabText}>
              Chat with <Text style={{ color: colors.gold }}>Tommy</Text>
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: spacing.lg,
    bottom: 96,
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  teaser: {
    maxWidth: 240,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderBottomRightRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  teaserLabel: {
    color: colors.cardinal,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  teaserText: { color: colors.ink, fontSize: fontSize.sm },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.cardinal,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: spacing.lg,
    borderWidth: 2,
    borderColor: colors.gold,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabCompact: { gap: 0, paddingVertical: 4, paddingLeft: 4, paddingRight: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: fontSize.sm },
});
