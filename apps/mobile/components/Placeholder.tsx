// Temporary screen body: shows who owns the screen and proves the API call works.
// Owners: replace <Placeholder> with your real screen.
import { colors, fontSize, radius, spacing } from '@trojanhub/shared/theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { API_URL } from '@/lib/api';

type Props = {
  title: string;
  owner: string;
  files: string;
  endpoint?: string;
  load?: () => Promise<unknown>;
};

export function Placeholder({ title, owner, files, endpoint, load }: Props) {
  const [state, setState] = useState<{ loading: boolean; data?: unknown; error?: string }>({ loading: !!load });

  useEffect(() => {
    if (!load) return;
    load()
      .then((data) => setState({ loading: false, data }))
      .catch((e: unknown) => setState({ loading: false, error: e instanceof Error ? e.message : String(e) }));
  }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <View style={styles.badge}><Text style={styles.badgeText}>{owner}</Text></View>
      <Text style={styles.meta}>Build this screen in {files}</Text>
      {endpoint && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{endpoint}</Text>
          {state.loading && <ActivityIndicator color={colors.cardinal} />}
          {state.error && (
            <Text style={styles.error}>
              Couldn't reach the AI service at {API_URL}: {state.error}
              {'\n'}Is `uvicorn app.main:app --host 0.0.0.0 --port 8000` running?
            </Text>
          )}
          {state.data !== undefined && (
            <Text style={styles.json} selectable>{JSON.stringify(state.data, null, 2).slice(0, 1500)}</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.ink },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  badgeText: { color: colors.ink, fontWeight: '600', fontSize: fontSize.sm },
  meta: { color: colors.muted, fontSize: fontSize.sm },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontWeight: '600', color: colors.ink },
  error: { color: colors.danger },
  json: { fontFamily: 'SpaceMono', fontSize: fontSize.xs, color: colors.ink },
});
