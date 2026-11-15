// Confirm card for actions that write data: Edit / Confirm / Cancel (ARCHITECTURE.md §7.1).
import { colors, fontSize, minTapTarget, radius, spacing } from '@trojanhub/shared/theme';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { editableFields, type ConfirmCard } from './chatState';

type Props = {
  card: ConfirmCard;
  onAnswer: (approved: boolean, edits?: Record<string, unknown>) => void;
};

export function ConfirmCardView({ card, onAnswer }: Props) {
  const fields = editableFields(card);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const value = (key: string) => (key in edits ? edits[key] : card.draft[key]);
  const changed = Object.keys(edits).length > 0;

  if (card.status === 'done' || card.status === 'cancelled' || card.status === 'failed') {
    const tone = card.status === 'done' ? colors.success : card.status === 'failed' ? colors.danger : colors.muted;
    return (
      <View style={[styles.result, { borderColor: tone }]} accessibilityRole="summary">
        <Text style={[styles.resultTitle, { color: tone }]}>
          {card.status === 'done' ? '✓ ' : card.status === 'failed' ? '✗ ' : ''}
          {card.title}
        </Text>
        {!!card.message && <Text style={styles.resultBody}>{card.message}</Text>}
      </View>
    );
  }

  const sending = card.status === 'sending';
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>PLEASE CONFIRM</Text>
      <Text style={styles.title}>{card.title}</Text>
      <Text style={styles.summary}>{card.summary}</Text>

      {editing &&
        fields.map((f) =>
          f.kind === 'bool' ? (
            <View key={f.key} style={styles.switchRow}>
              <Text style={styles.label}>{f.label}</Text>
              <Switch
                value={Boolean(value(f.key))}
                onValueChange={(v) => setEdits({ ...edits, [f.key]: v })}
                trackColor={{ true: colors.cardinal }}
                accessibilityLabel={f.label}
              />
            </View>
          ) : (
            <View key={f.key}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={String(value(f.key) ?? '')}
                onChangeText={(t) => setEdits({ ...edits, [f.key]: t })}
                accessibilityLabel={f.label}
              />
            </View>
          ),
        )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.primary, sending && styles.disabled]}
          disabled={sending}
          onPress={() => onAnswer(true, changed ? edits : undefined)}
          accessibilityRole="button">
          <Text style={styles.primaryText}>{sending ? 'Sending…' : 'Confirm'}</Text>
        </Pressable>
        {fields.length > 0 && (
          <Pressable style={styles.secondary} disabled={sending} onPress={() => setEditing(!editing)} accessibilityRole="button">
            <Text style={styles.secondaryText}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        )}
        <Pressable style={styles.ghost} disabled={sending} onPress={() => onAnswer(false)} accessibilityRole="button">
          <Text style={styles.ghostText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.gold, borderWidth: 2, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  kicker: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  summary: { fontSize: fontSize.sm, color: colors.muted },
  label: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm },
  input: { minHeight: minTapTarget, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: spacing.md, fontSize: fontSize.md, color: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: minTapTarget },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  primary: { minHeight: minTapTarget, paddingHorizontal: spacing.lg, borderRadius: radius.sm, backgroundColor: colors.cardinal, justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md },
  secondary: { minHeight: minTapTarget, paddingHorizontal: spacing.lg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  secondaryText: { color: colors.ink, fontWeight: '600', fontSize: fontSize.md },
  ghost: { minHeight: minTapTarget, paddingHorizontal: spacing.md, justifyContent: 'center' },
  ghostText: { color: colors.muted, fontWeight: '600', fontSize: fontSize.md },
  disabled: { opacity: 0.6 },
  result: { backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  resultTitle: { fontWeight: '700', fontSize: fontSize.sm },
  resultBody: { color: colors.ink, fontSize: fontSize.sm },
});
