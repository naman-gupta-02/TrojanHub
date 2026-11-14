// One chat bubble: text with [n] citations, tool status lines, source chips and confirm cards.
import { colors, fontSize, radius, spacing } from '@trojanhub/shared/theme';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { parseAnswer, toolLabel, type ChatMsg } from './chatState';
import { ConfirmCardView } from './ConfirmCard';

type Props = {
  msg: ChatMsg;
  onConfirm: (actionId: string, approved: boolean, edits?: Record<string, unknown>) => void;
};

const open = (url: string) => Linking.openURL(url).catch(() => {});

export function Message({ msg, onConfirm }: Props) {
  if (msg.role === 'user') {
    return (
      <View style={[styles.bubble, styles.user]}>
        {!!msg.imageUri && <Image source={{ uri: msg.imageUri }} style={styles.photo} accessibilityLabel="Photo you attached" />}
        <Text style={styles.userText}>{msg.text}</Text>
      </View>
    );
  }

  const sourceUrl = (n: number) => msg.sources.find((s) => s.n === n)?.url;
  const waiting = msg.streaming && !msg.text && msg.tools.every((t) => t.done);

  return (
    <View style={styles.assistantWrap}>
      {msg.tools.map((t) => (
        <View key={t.id} style={styles.toolRow} accessibilityLiveRegion="polite">
          <Text style={{ color: t.done ? colors.success : colors.cardinal, fontSize: fontSize.xs }}>{t.done ? '✓' : '●'}</Text>
          <Text style={styles.toolText}>{toolLabel(t)}</Text>
        </View>
      ))}

      {(!!msg.text || waiting) && (
        <View style={[styles.bubble, styles.assistant]}>
          {waiting ? (
            <ActivityIndicator color={colors.cardinal} accessibilityLabel="Tommy is thinking" />
          ) : (
            <Text style={styles.assistantText} selectable>
              {parseAnswer(msg.text).map((p, i) => {
                if (p.kind === 'text') return p.text;
                if (p.kind === 'bold') return <Text key={i} style={styles.bold}>{p.text}</Text>;
                if (p.kind === 'link') return <Text key={i} style={styles.link} onPress={() => open(p.url)}>{p.text}</Text>;
                const url = sourceUrl(p.n);
                return (
                  <Text key={i} style={styles.cite} onPress={url ? () => open(url) : undefined} accessibilityLabel={`Source ${p.n}`}>
                    {` ${p.n} `}
                  </Text>
                );
              })}
              {msg.streaming ? ' ▍' : ''}
            </Text>
          )}
        </View>
      )}

      {!!msg.error && <Text style={styles.error}>{msg.error}</Text>}

      {msg.sources.length > 0 && (
        <View style={styles.chips} accessibilityLabel="Sources">
          {msg.sources.map((s) => (
            <Pressable key={s.n} style={styles.chip} onPress={() => open(s.url)} accessibilityRole="link" accessibilityLabel={`Source ${s.n}: ${s.title}`}>
              <Text style={styles.chipNum}>{s.n}</Text>
              <Text style={styles.chipText} numberOfLines={1}>{s.title}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {msg.confirms.map((c) => (
        <ConfirmCardView key={c.action_id} card={c} onAnswer={(approved, edits) => onConfirm(c.action_id, approved, edits)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: '85%' },
  user: { alignSelf: 'flex-end', backgroundColor: colors.cardinal, borderBottomRightRadius: radius.sm, gap: spacing.sm },
  userText: { color: '#fff', fontSize: fontSize.md },
  photo: { width: 180, height: 180, borderRadius: radius.md },
  assistantWrap: { alignSelf: 'flex-start', maxWidth: '92%', gap: spacing.sm },
  assistant: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderBottomLeftRadius: radius.sm, maxWidth: '100%' },
  assistantText: { color: colors.ink, fontSize: fontSize.md, lineHeight: 23 },
  bold: { fontWeight: '700' },
  link: { color: colors.cardinal, textDecorationLine: 'underline' },
  cite: { backgroundColor: colors.gold, color: colors.ink, fontSize: fontSize.xs, fontWeight: '700' },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  toolText: { color: colors.muted, fontSize: fontSize.xs },
  error: { color: colors.danger, fontSize: fontSize.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 36, maxWidth: '100%', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipNum: { backgroundColor: colors.gold, color: colors.ink, fontWeight: '700', fontSize: fontSize.xs, paddingHorizontal: 5, borderRadius: 4, overflow: 'hidden' },
  chipText: { color: colors.ink, fontSize: fontSize.xs, flexShrink: 1 },
});
