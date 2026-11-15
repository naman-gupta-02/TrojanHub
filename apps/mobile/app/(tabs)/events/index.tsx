// P3 Parnavi: Events (calendar + filters), Deals, Rewards in one tab.
import type { Event, EventCategory, Perk, PerkWay, RewardProgress } from '@trojanhub/shared/types';
import { colors, fontSize, radius, spacing } from '@trojanhub/shared/theme';
import * as Linking from 'expo-linking';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  CATEGORIES,
  Chip,
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
import { getAccessToken } from '@/lib/supabase';

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
            <Pressable style={StyleSheet.flatten([s.button, { backgroundColor: colors.cardinal, borderColor: colors.cardinal, paddingHorizontal: spacing.lg }])} accessibilityRole="button">
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
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' }).format(new Date(iso));

function RewardsTab() {
  const signedIn = useApi(() => getAccessToken().then(Boolean));
  const rewards = useApi(() => api.rewards.progress());
  const checkins = useApi(() => api.rewards.checkins());
  const refresh = () => {
    rewards.reload();
    checkins.reload();
  };
  const programs = rewards.data ?? [];
  const earned = programs.filter((p) => (p.style ?? 'goal') === 'goal' && p.attended >= p.required).length;
  const entries = programs.filter((p) => p.style === 'entries').reduce((n, p) => n + p.attended, 0);
  const recent = checkins.data?.checkins ?? [];

  return (
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.cardinal} />}>
      {signedIn.data === false && (
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gold, backgroundColor: '#FFF8DB', padding: spacing.md, gap: spacing.sm }} accessibilityRole="alert">
          <Text style={{ color: colors.ink }}>
            <Text style={{ fontWeight: '700' }}>You&apos;re seeing a demo student&apos;s rewards. </Text>
            Sign in with your @usc.edu email to track your own check-ins.
          </Text>
          <Link href="/auth/login" asChild>
            <Pressable style={StyleSheet.flatten([s.button, { backgroundColor: colors.cardinal, borderColor: colors.cardinal, alignSelf: 'flex-start' }])} accessibilityRole="button">
              <Text style={[s.buttonText, { color: '#fff' }]}>Sign in</Text>
            </Pressable>
          </Link>
        </View>
      )}

      <Text style={s.section} accessibilityRole="header">
        🏆 My rewards
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Stat label="Check-ins" value={checkins.data ? recent.length : '–'} />
        <Stat label="Earned" value={rewards.data ? earned : '–'} />
        <Stat label="Entries" value={rewards.data ? entries : '–'} />
      </View>
      {rewards.loading && !rewards.data && <Loading />}
      {rewards.error && <ErrorBox message={rewards.error} onRetry={rewards.reload} />}
      {rewards.data?.length === 0 && <Empty emoji="🏆" title="No reward programs yet" />}
      {programs.map((p) => (
        <Program key={p.program.id} p={p} />
      ))}

      {recent.length > 0 && (
        <View style={[s.card, { flexDirection: 'column', gap: spacing.xs }]}>
          <Text style={s.cardTitle}>📍 My recent check-ins</Text>
          {recent.slice(0, 6).map(({ event, checked_in_at }) => (
            <Link key={event.id} href={{ pathname: '/events/[id]', params: { id: event.id } }} asChild>
              <Pressable style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, minHeight: 36, alignItems: 'center' }} accessibilityRole="link">
                <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {event.title}
                </Text>
                <Text style={s.cardMeta}>{shortDate(checked_in_at ?? event.starts_at)}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
      <Text style={{ fontSize: fontSize.xs, color: colors.muted }}>
        TrojanHub keeps your own count from event check-ins. Each office&apos;s official check-in or form is what earns the reward.
      </Text>

      <Perks />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={[s.card, { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 2, paddingVertical: spacing.md }]}>
      <Text style={{ fontSize: fontSize.xxl, fontWeight: '800', color: colors.cardinal }}>{value}</Text>
      <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: colors.muted }}>{label}</Text>
    </View>
  );
}

function Program({ p }: { p: RewardProgress }) {
  const entries = p.style === 'entries';
  const done = !entries && p.attended >= p.required;
  const left = Math.max(p.required - p.attended, 0);
  const counted = p.attended_events ?? [];
  const rules = p.program.rules_url;
  return (
    <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      <View style={{ padding: spacing.lg, gap: spacing.xs, backgroundColor: done ? colors.gold : colors.cardinal }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: done ? colors.ink : colors.gold }}>
          {p.program.office}
          {entries ? ' · Prize drawing' : ''}
        </Text>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: done ? colors.ink : '#fff' }} accessibilityRole="header">
          {p.program.name}
        </Text>
        {p.program.reward_desc && <Text style={{ color: done ? colors.ink : 'rgba(255,255,255,0.85)', fontSize: fontSize.sm }}>{p.program.reward_desc}</Text>}
        {entries ? (
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.lg, marginTop: spacing.sm }}>
            🎟️ {p.attended} entr{p.attended === 1 ? 'y' : 'ies'} · each check-in adds one
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' }} accessibilityRole="progressbar" accessibilityValue={{ now: p.attended, max: p.required, min: 0 }}>
            {Array.from({ length: p.required }, (_, i) => (
              <View
                key={i}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: i < p.attended ? (done ? colors.ink : colors.gold) : 'transparent', borderWidth: 2, borderColor: i < p.attended ? 'transparent' : done ? colors.ink : 'rgba(255,255,255,0.5)' }}>
                {i < p.attended && <Text style={{ color: done ? colors.gold : colors.ink, fontWeight: '800' }}>✓</Text>}
              </View>
            ))}
            <Text style={{ color: done ? colors.ink : '#fff', fontWeight: '700', marginLeft: spacing.xs }}>
              {done ? `🎉 Earned${p.completed_at ? ` ${shortDate(p.completed_at)}` : ''}` : `${p.attended} of ${p.required} · ${left} to go`}
            </Text>
          </View>
        )}
      </View>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text style={s.cardTitle}>What counted</Text>
        {counted.length === 0 && <Text style={s.cardMeta}>Nothing yet. Check in at one of the events below.</Text>}
        {counted.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }} numberOfLines={1}>
              ✓ {c.title}
            </Text>
            <Text style={s.cardMeta}>{shortDate(c.checked_in_at ?? c.starts_at)}</Text>
          </View>
        ))}
        {done && rules && (
          <Text onPress={() => Linking.openURL(rules)} accessibilityRole="link" style={{ color: colors.cardinal, fontWeight: '700', paddingVertical: spacing.xs }}>
            How to claim with {p.program.office} ↗
          </Text>
        )}
        <Text style={[s.cardTitle, { marginTop: spacing.sm }]}>{entries ? 'Next chances for an entry' : done ? 'More events' : 'Events that count'}</Text>
        {p.next_eligible_events.length === 0 && <Text style={s.cardMeta}>Nothing scheduled yet. Check back soon.</Text>}
        {p.next_eligible_events.map((e, i) => (
          <EventCard key={e.id} event={e} reason={!entries && i === 0 && left === 1 ? 'This one completes it!' : undefined} />
        ))}
        {!done && rules && (
          <Text onPress={() => Linking.openURL(rules)} accessibilityRole="link" style={{ color: colors.cardinal, fontWeight: '700', paddingVertical: spacing.xs }}>
            Official rules ↗
          </Text>
        )}
      </View>
    </View>
  );
}

const WAYS: { value: PerkWay; label: string }[] = [
  { value: 'attend', label: '📍 Show up' },
  { value: 'task', label: '✅ Small tasks' },
  { value: 'apply', label: '📝 Apply' },
  { value: 'compete', label: '🏅 Compete' },
];
type PerkKind = 'all' | 'redeemable' | 'recognition';

function Perks() {
  const perks = useApi(() => api.rewards.perks());
  const [kind, setKind] = useState<PerkKind>('all');
  const [way, setWay] = useState<PerkWay | null>(null);
  const list = (perks.data?.perks ?? []).filter((p) => (kind === 'all' || (kind === 'redeemable') === p.redeemable) && (!way || p.way === way));

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={s.section} accessibilityRole="header">
        🎁 Ways to earn around USC
      </Text>
      <Text style={s.cardMeta}>Redeemable = money, gift cards, prizes or food. Recognition = honor cords, trophies, priority access.</Text>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'all', label: 'All' },
          { value: 'redeemable', label: '💵 Redeemable' },
          { value: 'recognition', label: '🎖️ Recognition' },
        ]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {WAYS.map((w) => (
          <FilterChip key={w.value} on={way === w.value} onPress={() => setWay(way === w.value ? null : w.value)} label={w.label} />
        ))}
      </ScrollView>
      {perks.loading && !perks.data && <Loading />}
      {perks.error && <ErrorBox message={perks.error} onRetry={perks.reload} />}
      {perks.data && list.length === 0 && <Empty emoji="🔎" title="Nothing matches those filters" />}
      {list.map((p) => (
        <PerkCard key={p.id} perk={p} />
      ))}
      {perks.data && (
        <Text style={{ fontSize: fontSize.xs, color: colors.muted }}>
          Checked against each office&apos;s official page on {shortDate(`${perks.data.checked_on}T20:00:00Z`)}. Rules change, so confirm on the official page.
        </Text>
      )}
    </View>
  );
}

function PerkCard({ perk }: { perk: Perk }) {
  const way = WAYS.find((w) => w.value === perk.way);
  const internal = perk.url.startsWith('/');
  const open = () => (internal ? router.push(perk.url as never) : Linking.openURL(perk.url));
  return (
    <View style={[s.card, { flexDirection: 'column', gap: spacing.xs }]}>
      <View style={s.chips}>
        <Chip>{way?.label}</Chip>
        <Chip tone={perk.redeemable ? 'gold' : 'plain'}>{perk.redeemable ? '💵 Redeemable' : '🎖️ Recognition'}</Chip>
        {perk.tracked_program_id && <Chip tone="cardinal">Tracked in TrojanHub</Chip>}
        {perk.deadline && new Date(perk.deadline) > new Date() && <Chip tone="green">Apply by {shortDate(perk.deadline)}</Chip>}
      </View>
      <Text style={s.cardTitle}>{perk.name}</Text>
      <Text style={[s.cardMeta, { fontWeight: '600' }]}>{perk.office}</Text>
      <Text style={{ color: colors.ink }}>
        <Text style={{ fontWeight: '700' }}>You get: </Text>
        {perk.reward}
      </Text>
      <Text style={{ color: colors.ink }}>
        <Text style={{ fontWeight: '700' }}>How: </Text>
        {perk.how_to_earn}
      </Text>
      <Text style={s.cardMeta}>
        {perk.who} · {perk.when}
      </Text>
      <Text onPress={open} accessibilityRole="link" style={{ color: colors.cardinal, fontWeight: '700', paddingVertical: spacing.sm }}>
        {internal ? 'Open in TrojanHub →' : 'Official page ↗'}
      </Text>
    </View>
  );
}
