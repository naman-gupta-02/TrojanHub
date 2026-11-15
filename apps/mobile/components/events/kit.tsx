// P3 Parnavi: shared pieces for the Home and Events/Deals/Rewards screens.
import type { Deal, Event, EventCategory } from '@trojanhub/shared/types';
import { colors, fontSize, minTapTarget, radius, spacing } from '@trojanhub/shared/theme';
import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Time: stored UTC, always shown in Los Angeles time
// ---------------------------------------------------------------------------
const TZ = 'America/Los_Angeles';
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const dayKey = (iso: string | Date) => keyFmt.format(typeof iso === 'string' ? new Date(iso) : iso);

export function relativeDay(iso: string): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date())) return 'Today';
  if (key === dayKey(new Date(Date.now() + 86_400_000))) return 'Tomorrow';
  return dayFmt.format(new Date(iso));
}

export const timeRange = (start: string, end: string | null) => (end ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start));

export function untilLabel(start: string, end: string | null = null): string {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : s + 2 * 3_600_000;
  if (now >= s && now <= e) return 'Happening now';
  if (now > e) return 'Ended';
  const min = Math.round((s - now) / 60_000);
  if (min < 60) return `In ${min} min`;
  if (min < 24 * 60) return `In ${Math.round(min / 60)} hr`;
  return relativeDay(start);
}

/** Same window the API allows for "I'm here": 30 min before the start until 30 min after the end */
export function canCheckIn(start: string, end: string | null = null): boolean {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : s + 2 * 3_600_000;
  return now >= s - 30 * 60_000 && now <= e + 30 * 60_000;
}

export function dateParts(iso: string): { weekday: string; day: string; month: string } {
  const p =Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, day: p.day, month: p.month };
}

/** "YYYY-MM-DDTHH:MM" in LA time <-> UTC ISO (for the editable form) */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const guess = new Date(`${value}:00Z`);
  const shown = new Date(`${toLocalInput(guess.toISOString())}:00Z`);
  return new Date(guess.getTime() - (shown.getTime() - guess.getTime())).toISOString();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
export function useApi<T>(load: () => Promise<T>, key = '') {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ stamp: string; data?: T; error?: string }>({ stamp: '' });
  const stamp = `${key}#${nonce}`;
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => !cancelled && setResult({ stamp, data }))
      .catch((e: unknown) => !cancelled && setResult((r) => ({ stamp, data: r.data, error: errorMessage(e) })));
    return () => {
      cancelled = true;
    };
  }, [stamp]);
  const loading = result.stamp !== stamp;
  return {
    data: result.data,
    error: loading ? undefined : result.error,
    loading,
    reload: useCallback(() => setNonce((n) => n + 1), []),
    setData: (data: T) => setResult({ stamp, data }),
  };
}

/** `value`, but only after it stopped changing for `ms` (search boxes: one request per pause, not per key) */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Re-renders every `ms`, for things that change with the clock ("check-in is open") */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const CATEGORIES: { value: EventCategory; label: string; emoji: string }[] = [
  { value: 'free_food', label: 'Free food', emoji: '🍕' },
  { value: 'cultural', label: 'Cultural', emoji: '🪔' },
  { value: 'career', label: 'Career', emoji: '💼' },
  { value: 'social', label: 'Social', emoji: '🎉' },
  { value: 'academic', label: 'Academic', emoji: '📚' },
  { value: 'sports', label: 'Sports', emoji: '🏟️' },
  { value: 'other', label: 'Other', emoji: '✨' },
];
export const categoryInfo = (c: string) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[CATEGORIES.length - 1];

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
type Tone = 'plain' | 'gold' | 'cardinal' | 'green';
const CHIP: Record<Tone, { bg: string; fg: string; border?: string }> = {
  plain: { bg: colors.background, fg: colors.muted, border: colors.line },
  gold: { bg: colors.gold, fg: colors.ink },
  cardinal: { bg: colors.cardinal, fg: '#fff' },
  green: { bg: '#E6F2E9', fg: colors.success },
};

export function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: Tone }) {
  const t = CHIP[tone];
  return (
    <View style={[s.chip, { backgroundColor: t.bg, borderColor: t.border ?? t.bg }]}>
      <Text style={[s.chipText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'gold';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? colors.cardinal : kind === 'gold' ? colors.gold : colors.surface;
  const fg = kind === 'primary' ? '#fff' : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: kind === 'secondary' ? colors.line : bg, opacity: disabled ? 0.6 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function DateBlock({ iso }: { iso: string }) {
  const { weekday, day, month } = dateParts(iso);
  return (
    <View style={s.dateBlock} accessibilityElementsHidden>
      <Text style={s.dateWeekday}>{weekday.toUpperCase()}</Text>
      <Text style={s.dateDay}>{day}</Text>
      <Text style={s.dateMonth}>{month}</Text>
    </View>
  );
}

export function EventCard({ event, reason }: { event: Event; reason?: string }) {
  const cat = categoryInfo(event.category);
  const live = untilLabel(event.starts_at, event.ends_at) === 'Happening now';
  return (
    <Link href={{ pathname: '/events/[id]', params: { id: event.id } }} asChild>
      <Pressable style={({ pressed }) => [s.card, pressed && s.cardPressed]} accessibilityRole="button" accessibilityLabel={`${event.title}, ${relativeDay(event.starts_at)} ${fmtTime(event.starts_at)}`}>
        <DateBlock iso={event.starts_at} />
        <View style={s.cardBody}>
          {reason && <Text style={s.reason}>{reason}</Text>}
          <Text style={s.cardTitle} numberOfLines={2}>
            {cat.emoji} {event.title}
          </Text>
          <Text style={s.cardMeta} numberOfLines={1}>
            {timeRange(event.starts_at, event.ends_at)}
            {event.location_text ? ` · ${event.location_text}` : ''}
          </Text>
          <View style={s.chips}>
            {live && <Chip tone="green">● Now</Chip>}
            {event.has_freebie && <Chip tone="gold">🎁 {event.freebie_desc ?? 'Freebie'}</Chip>}
            {!event.is_free && <Chip>Ticketed</Chip>}
            {event.org_verified && <Chip tone="cardinal">✓ {event.org_name}</Chip>}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

export function DealCard({ deal, reason }: { deal: Deal; reason?: string }) {
  const [votes, setVotes] = useState(deal.still_active_votes);
  const [voted, setVoted] = useState<boolean | null>(null);

  async function vote(stillActive: boolean) {
    const before = voted;
    const next = voted === stillActive ? null : stillActive; // tap the same thumb again to take it back
    setVoted(next);
    try {
      setVotes((await api.deals.vote(deal.id, next)).still_active_votes);
    } catch {
      setVoted(before);
    }
  }

  return (
    <View style={[s.card, { flexDirection: 'column' }]}>
      {reason && <Text style={s.reason}>{reason}</Text>}
      <Text style={s.cardTitle}>🎁 {deal.title}</Text>
      {deal.how_to_claim && (
        <Text style={s.cardMeta}>
          <Text style={{ fontWeight: '600', color: colors.ink }}>How to claim: </Text>
          {deal.how_to_claim}
        </Text>
      )}
      <View style={[s.chips, { alignItems: 'center' }]}>
        {deal.kind === 'one_time' ? <Chip tone="gold">Limited time</Chip> : <Chip>Ongoing</Chip>}
        {deal.expires_at && <Chip>Ends {relativeDay(deal.expires_at).toLowerCase()} {fmtTime(deal.expires_at)}</Chip>}
        <View style={{ flex: 1 }} />
        <Text style={s.votes}>{votes} say it works</Text>
        <Pressable onPress={() => vote(true)} accessibilityLabel="Still works" accessibilityState={{ selected: voted === true }} style={[s.voteBtn, voted === true && { borderColor: colors.success }]}>
          <Text>👍</Text>
        </Pressable>
        <Pressable onPress={() => vote(false)} accessibilityLabel="Doesn't work anymore" accessibilityState={{ selected: voted === false }} style={[s.voteBtn, voted === false && { borderColor: colors.danger }]}>
          <Text>👎</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: spacing.xl, alignItems: 'center' }} accessibilityLabel="Loading">
      <ActivityIndicator color={colors.cardinal} />
    </View>
  );
}

export function Empty({ emoji, title, body }: { emoji: string; title: string; body?: string }) {
  return (
    <View style={s.empty}>
      <Text style={{ fontSize: 36 }}>{emoji}</Text>
      <Text style={s.emptyTitle}>{title}</Text>
      {body && <Text style={s.cardMeta}>{body}</Text>}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.errorBox} accessibilityRole="alert">
      <Text style={{ color: colors.danger, fontWeight: '700' }}>Something went wrong</Text>
      <Text style={s.cardMeta}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={{ minHeight: minTapTarget, justifyContent: 'center' }}>
          <Text style={{ color: colors.cardinal, fontWeight: '700' }}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text style={s.section} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <View style={s.segmented} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === o.value }}
          style={[s.segment, value === o.value && s.segmentOn]}>
          <Text style={[s.segmentText, value === o.value && { color: '#fff' }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  h1: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.ink },
  sub: { fontSize: fontSize.md, color: colors.muted },
  section: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, marginTop: spacing.sm },
  card: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  cardPressed: { opacity: 0.85 },
  cardBody: { flex: 1, gap: spacing.xs },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  cardMeta: { fontSize: fontSize.sm, color: colors.muted },
  reason: { fontSize: fontSize.xs, fontWeight: '700', color: colors.cardinal },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, borderWidth: 1 },
  chipText: { fontSize: fontSize.xs, fontWeight: '600' },
  button: { minHeight: minTapTarget, borderRadius: radius.pill, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexDirection: 'row', gap: spacing.sm },
  buttonText: { fontWeight: '700', fontSize: fontSize.md },
  dateBlock: { width: 56, borderRadius: radius.md, backgroundColor: '#F5E6E6', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  dateWeekday: { fontSize: 10, fontWeight: '700', color: colors.cardinal, letterSpacing: 1 },
  dateDay: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, lineHeight: 26 },
  dateMonth: { fontSize: 10, color: colors.muted },
  votes: { fontSize: fontSize.xs, color: colors.muted, marginRight: spacing.xs },
  voteBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: spacing.xs, padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface },
  emptyTitle: { fontWeight: '700', color: colors.ink },
  errorBox: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#FBECEE', gap: spacing.xs },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.pill, padding: 3 },
  segment: { flex: 1, minHeight: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.cardinal },
  segmentText: { fontWeight: '700', color: colors.muted, fontSize: fontSize.sm },
  input: { minHeight: minTapTarget, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: fontSize.md, backgroundColor: colors.surface, color: colors.ink },
  label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
});
