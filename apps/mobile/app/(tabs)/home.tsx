// P3 Parnavi: personalized feed ("3 things for you today" + today's freebies + your next events).
import type { NotifyCategory, NotifyPrefs } from '@trojanhub/shared/types';
import { colors, fontSize, radius, spacing } from '@trojanhub/shared/theme';
import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';

import { CATEGORIES, DealCard, Empty, ErrorBox, EventCard, Loading, SectionTitle, errorMessage, fmtTime, s, untilLabel, useApi } from '@/components/events/kit';
import { api } from '@/lib/api';

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const feed = useApi(() => api.feed());
  const mine = useApi(() => api.events.mine());
  const rewards = useApi(() => api.rewards.progress());
  const refresh = useCallback(() => {
    feed.reload();
    mine.reload();
    rewards.reload();
  }, [feed.reload, mine.reload, rewards.reload]);

  const freeEvents = feed.data?.today_freebies.filter((i) => i.kind === 'event').length ?? 0;
  const freeDeals = feed.data?.today_freebies.filter((i) => i.kind === 'deal').length ?? 0;
  const next = mine.data?.saved.filter((x) => untilLabel(x.event.starts_at, x.event.ends_at) !== 'Ended').slice(0, 3) ?? [];
  const closest = rewards.data?.filter((p) => p.attended < p.required).sort((a, b) => b.attended / b.required - a.attended / a.required)[0];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.cardinal} />}>
      <View style={{ backgroundColor: colors.cardinal, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm }}>
        <Text style={{ color: colors.gold, fontWeight: '700' }}>{greeting()}, Trojan</Text>
        <Text style={{ color: '#fff', fontSize: fontSize.xxl, fontWeight: '800' }} accessibilityRole="header">
          Your day on campus
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
          {feed.data ? `${freeEvents} free event${freeEvents === 1 ? '' : 's'} and ${freeDeals} limited-time deal${freeDeals === 1 ? '' : 's'} today.` : 'Finding the best things near you…'}
        </Text>
        <Link href="/events/scan" asChild>
          <Pressable style={[s.button, { backgroundColor: colors.gold, borderColor: colors.gold, alignSelf: 'flex-start', marginTop: spacing.xs }]} accessibilityRole="button">
            <Text style={[s.buttonText, { color: colors.ink }]}>📸 Scan a flyer</Text>
          </Pressable>
        </Link>
      </View>

      <SectionTitle>3 things for you today</SectionTitle>
      {feed.loading && !feed.data && <Loading />}
      {feed.error && <ErrorBox message={feed.error} onRetry={feed.reload} />}
      {feed.data?.for_you.length === 0 && <Empty emoji="🌤️" title="A quiet day so far" body="Check back later, or post a flyer you saw." />}
      {feed.data?.for_you.map((item) =>
        item.kind === 'event' ? <EventCard key={item.event.id} event={item.event} reason={item.reason} /> : <DealCard key={item.deal.id} deal={item.deal} reason={item.reason} />,
      )}

      <SectionTitle>📅 Your next events</SectionTitle>
      {mine.data && next.length === 0 && <Text style={s.sub}>Save an event and it shows up here, with a reminder 30 minutes before.</Text>}
      {next.map(({ event, registered }) => (
        <Link key={event.id} href={{ pathname: '/events/[id]', params: { id: event.id } }} asChild>
          <Pressable style={[s.card, { alignItems: 'center' }]} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle} numberOfLines={1}>
                {event.title}
              </Text>
              <Text style={s.cardMeta}>
                {untilLabel(event.starts_at, event.ends_at)} · {fmtTime(event.starts_at)}
              </Text>
            </View>
            {registered && <Text style={{ color: colors.success, fontWeight: '700', fontSize: fontSize.xs }}>Registered</Text>}
          </Pressable>
        </Link>
      ))}

      {closest && (
        <Link href="/events?tab=rewards" asChild>
          <Pressable style={[s.card, { flexDirection: 'column' }]} accessibilityRole="button">
            <Text style={s.reason}>REWARDS</Text>
            <Text style={s.cardTitle}>{closest.program.name}</Text>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ now: closest.attended, max: closest.required, min: 0 }}>
              <View style={{ width: `${(closest.attended / closest.required) * 100}%`, height: '100%', backgroundColor: colors.cardinal }} />
            </View>
            <Text style={s.cardMeta}>
              {closest.attended} of {closest.required} · {closest.required - closest.attended} more to go
            </Text>
          </Pressable>
        </Link>
      )}

      <SectionTitle>🎁 Free today</SectionTitle>
      {feed.data?.today_freebies.length === 0 && <Empty emoji="🍃" title="Nothing free yet today" />}
      {feed.data?.today_freebies.map((item) => (item.kind === 'event' ? <EventCard key={item.event.id} event={item.event} /> : <DealCard key={item.deal.id} deal={item.deal} />))}

      <SectionTitle>⚙️ Alert settings</SectionTitle>
      <AlertSettings />
    </ScrollView>
  );
}

const ALERT_CATEGORIES: { value: NotifyCategory; label: string }[] = [
  ...CATEGORIES.filter((c) => c.value !== 'other').map((c) => ({ value: c.value as NotifyCategory, label: `${c.emoji} ${c.label}` })),
  { value: 'deals', label: '🎁 Deals' },
];

/** Morning email digest on/off + which categories. Saves on every change (same API as the website). */
function AlertSettings() {
  const prefs = useApi(() => api.notify.prefs());
  const [status, setStatus] = useState<string | null>(null);
  const p = prefs.data;
  const cats = new Set(p?.notify_categories ?? []);

  async function update(patch: Partial<NotifyPrefs>) {
    if (!p) return;
    prefs.setData({ ...p, ...patch });
    try {
      prefs.setData(await api.notify.updatePrefs(patch));
      setStatus('Saved');
    } catch (e) {
      prefs.setData(p);
      setStatus(errorMessage(e));
    }
  }

  function toggleCat(c: NotifyCategory) {
    const next = new Set(cats);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    update({ notify_categories: [...next] });
  }

  if (prefs.error) return <ErrorBox message={prefs.error} onRetry={prefs.reload} />;
  if (!p) return <Loading />;
  return (
    <View style={[s.card, { flexDirection: 'column', gap: spacing.sm }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Morning freebie email</Text>
          <Text style={s.cardMeta}>8 AM, only on days something is free</Text>
        </View>
        <Switch value={p.notify_email} onValueChange={(v) => update({ notify_email: v })} trackColor={{ true: colors.cardinal }} accessibilityLabel="Morning freebie email" />
      </View>
      <Text style={[s.cardMeta, { fontWeight: '600' }]}>Only tell me about {cats.size === 0 ? '(everything, tap to narrow)' : ''}</Text>
      <View style={s.chips}>
        {ALERT_CATEGORIES.map((c) => {
          const on = cats.has(c.value);
          return (
            <Pressable
              key={c.value}
              onPress={() => toggleCat(c.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', borderColor: on ? colors.cardinal : colors.line, backgroundColor: on ? colors.cardinal : colors.surface }}>
              <Text style={{ fontWeight: '700', fontSize: fontSize.sm, color: on ? '#fff' : colors.ink }}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {status && <Text style={{ fontSize: fontSize.xs, color: status === 'Saved' ? colors.success : colors.danger }}>{status}</Text>}
    </View>
  );
}
