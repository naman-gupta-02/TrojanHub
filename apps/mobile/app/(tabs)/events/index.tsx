// P3 Parnavi: Events (calendar + filters), Deals, Rewards in one tab.
import type { Event, EventCategory, RewardProgress } from '@trojanhub/shared/types';
import { colors, fontSize, radius, spacing } from '@trojanhub/shared/theme';
import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import {
  CATEGORIES,
  DealCard,
  Empty,
  ErrorBox,
  EventCard,
  Loading,
  Segmented,
  dateParts,
  dayKey,
  fromLocalInput,
  relativeDay,
  s,
  useApi,
  useDebounced,
} from '@/components/events/kit';
import { api } from '@/lib/api';

type Tab = 'events' | 'deals' | 'rewards';

export default function EventsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'deals' || params.tab === 'rewards' ? params.tab : 'events');
  // this screen stays mounted, so follow later links like /events?tab=rewards too
  useEffect(() => {
    if (params.tab === 'events' || params.tab === 'deals' || params.tab === 'rewards') setTab(params.tab);
  }, [params.tab]);

  return (
    <View style={s.screen}>
      <View style={{ padding: spacing.lg, paddingBottom: 0, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.h1} accessibilityRole="header">
            {tab === 'events' ? 'Events' : tab === 'deals' ? 'Deals & Freebies' : 'Rewards'}
          </Text>
          <Link href="/events/scan" asChild>
            <Pressable style={[s.button, { backgroundColor: colors.cardinal, borderColor: colors.cardinal, paddingHorizontal: spacing.lg }]} accessibilityRole="button">
              <Text style={[s.buttonText, { color: '#fff' }]}>📸 Scan</Text>
            </Pressable>
          </Link>
        </View>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'events', label: 'Events' },
            { value: 'deals', label: 'Deals' },
            { value: 'rewards', label: 'Rewards' },
          ]}
        />
      </View>
      {tab === 'events' && <EventsTab />}
      {tab === 'deals' && <DealsTab />}
      {tab === 'rewards' && <RewardsTab />}
    </View>
  );
}

// ---------------------------------------------------------------------------
function EventsTab() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<EventCategory | undefined>();
  const [freebie, setFreebie] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const query = useDebounced(q.trim());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayKey(new Date(Date.now() + i * 86_400_000))), []);
  // the calendar shows the next 7 days; a search looks at everything coming up
  const weekEnd = useMemo(() => fromLocalInput(`${days[days.length - 1]}T23:59`) ?? undefined, [days]);
  const to = query ? undefined : weekEnd;
  const events = useApi(
    () => api.events.search({ q: query || undefined, category, freebie: freebie || undefined, to }),
    `${query}|${category}|${freebie}|${to}`,
  );

  const groups = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events.data?.events ?? []) {
      const k = dayKey(e.starts_at);
      if (!day || k === day) map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.values()];
  }, [events.data, day]);

  return (
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={events.reload} tintColor={colors.cardinal} />} keyboardShouldPersistTaps="handled">
      <TextInput value={q} onChangeText={setQ} placeholder="Search “pizza”, “career”, “Leavey”…" placeholderTextColor={colors.muted} style={s.input} accessibilityLabel="Search events" returnKeyType="search" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <FilterChip on={freebie} onPress={() => setFreebie(!freebie)} label="🎁 Freebies" />
        {CATEGORIES.filter((c) => c.value !== 'other').map((c) => (
          <FilterChip key={c.value} on={category === c.value} onPress={() => setCategory(category === c.value ? undefined : c.value)} label={`${c.emoji} ${c.label}`} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} accessibilityLabel="Pick a day">
        <DayChip on={!day} onPress={() => setDay(null)} top="All" big={query ? 'All' : '7d'} />
        {days.map((d, i) => {
          const p = dateParts(`${d}T20:00:00Z`);
          return <DayChip key={d} on={day === d} onPress={() => setDay(day === d ? null : d)} top={i === 0 ? 'Today' : p.weekday} big={p.day} />;
        })}
      </ScrollView>

      {events.loading && !events.data && <Loading />}
      {events.error && <ErrorBox message={events.error} onRetry={events.reload} />}
      {events.data && groups.length === 0 && <Empty emoji="🔭" title="No events match" body="Try clearing a filter, or add one from a flyer." />}
      {groups.map((list) => (
        <View key={list[0].id} style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 }} accessibilityRole="header">
            {relativeDay(list[0].starts_at)} · {list.length}
          </Text>
          {list.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function FilterChip({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', borderColor: on ? colors.cardinal : colors.line, backgroundColor: on ? colors.cardinal : colors.surface }}>
      <Text style={{ fontWeight: '700', fontSize: fontSize.sm, color: on ? '#fff' : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

function DayChip({ on, onPress, top, big }: { on: boolean; onPress: () => void; top: string; big: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ width: 56, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', borderColor: on ? colors.cardinal : colors.line, backgroundColor: on ? colors.cardinal : colors.surface }}>
      <Text style={{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: on ? colors.gold : colors.muted }}>{top}</Text>
      <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: on ? '#fff' : colors.ink }}>{big}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
function DealsTab() {
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim());
  const deals = useApi(() => api.deals.search({ q: query || undefined, active: true }), query);
  const oneTime = deals.data?.deals.filter((d) => d.kind === 'one_time') ?? [];
  const ongoing = deals.data?.deals.filter((d) => d.kind === 'ongoing') ?? [];
  return (
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={deals.reload} tintColor={colors.cardinal} />} keyboardShouldPersistTaps="handled">
      <TextInput value={q} onChangeText={setQ} placeholder="Search deals…" placeholderTextColor={colors.muted} style={s.input} accessibilityLabel="Search deals" />
      {deals.loading && !deals.data && <Loading />}
      {deals.error && <ErrorBox message={deals.error} onRetry={deals.reload} />}
      {deals.data?.deals.length === 0 && <Empty emoji="🛍️" title="No deals match" body="Know one? Post it and help a Trojan out." />}
      {oneTime.length > 0 && <Text style={s.section}>🎁 Limited-time freebies</Text>}
      {oneTime.map((d) => (
        <DealCard key={d.id} deal={d} />
      ))}
      {ongoing.length > 0 && <Text style={s.section}>Ongoing student deals</Text>}
      {ongoing.map((d) => (
        <DealCard key={d.id} deal={d} />
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
function RewardsTab() {
  const rewards = useApi(() => api.rewards.progress());
  return (
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={rewards.reload} tintColor={colors.cardinal} />}>
      <Text style={s.sub}>Some offices give perks for showing up. Check in at events and watch your progress fill up.</Text>
      {rewards.loading && !rewards.data && <Loading />}
      {rewards.error && <ErrorBox message={rewards.error} onRetry={rewards.reload} />}
      {rewards.data?.length === 0 && <Empty emoji="🏆" title="No reward programs yet" />}
      {rewards.data?.map((p) => <Program key={p.program.id} p={p} />)}
      <Text style={{ fontSize: fontSize.xs, color: colors.muted }}>Progress is tracked by TrojanHub check-ins. Each office's official page has the real rules and how to claim.</Text>
    </ScrollView>
  );
}

function Program({ p }: { p: RewardProgress }) {
  const done = p.attended >= p.required;
  const left = Math.max(p.required - p.attended, 0);
  return (
    <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      <View style={{ padding: spacing.lg, gap: spacing.xs, backgroundColor: done ? colors.gold : colors.cardinal }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: done ? colors.ink : colors.gold }}>{p.program.office}</Text>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: done ? colors.ink : '#fff' }} accessibilityRole="header">
          {p.program.name}
        </Text>
        {p.program.reward_desc && <Text style={{ color: done ? colors.ink : 'rgba(255,255,255,0.85)', fontSize: fontSize.sm }}>{p.program.reward_desc}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }} accessibilityRole="progressbar" accessibilityValue={{ now: p.attended, max: p.required, min: 0 }}>
          {Array.from({ length: p.required }, (_, i) => (
            <View
              key={i}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: i < p.attended ? (done ? colors.ink : colors.gold) : 'transparent', borderWidth: 2, borderColor: i < p.attended ? 'transparent' : done ? colors.ink : 'rgba(255,255,255,0.5)' }}>
              {i < p.attended && <Text style={{ color: done ? colors.gold : colors.ink, fontWeight: '800' }}>✓</Text>}
            </View>
          ))}
          <Text style={{ color: done ? colors.ink : '#fff', fontWeight: '700', marginLeft: spacing.xs }}>{done ? '🎉 Complete!' : `${p.attended} of ${p.required} · ${left} to go`}</Text>
        </View>
      </View>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        {done ? (
          <Text style={s.sub}>You did it! Head to {p.program.office} to claim your reward.</Text>
        ) : (
          <>
            <Text style={s.cardTitle}>Events that count</Text>
            {p.next_eligible_events.length === 0 && <Text style={s.sub}>Nothing scheduled yet. Check back soon.</Text>}
            {p.next_eligible_events.map((e, i) => (
              <EventCard key={e.id} event={e} reason={i === 0 && left === 1 ? 'This one completes it!' : undefined} />
            ))}
          </>
        )}
      </View>
    </View>
  );
}
