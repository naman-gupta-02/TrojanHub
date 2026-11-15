// P3 Parnavi: event detail (Add to calendar, Register, Save, tickets, check-in, rewards it counts toward).
import type { CheckinResponse, EventDetailResponse } from '@trojanhub/shared/types';
import { colors, fontSize, radius, spacing } from '@trojanhub/shared/theme';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Chip, ErrorBox, Loading, canCheckIn, categoryInfo, errorMessage, fmtTime, relativeDay, s, timeRange, untilLabel, useApi, useNow } from '@/components/events/kit';
import { api } from '@/lib/api';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useApi(() => api.events.get(id), id);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: detail.data?.event.title ?? 'Event', headerBackTitle: 'Events' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.content}>
        {detail.error && <ErrorBox message={detail.error} onRetry={detail.reload} />}
        {!detail.data && !detail.error && <Loading />}
        {detail.data && <Detail d={detail.data} onChange={detail.setData} />}
      </ScrollView>
    </>
  );
}

function Detail({ d, onChange }: { d: EventDetailResponse; onChange: (d: EventDetailResponse) => void }) {
  const e = d.event;
  const cat = categoryInfo(e.category);
  const status = untilLabel(e.starts_at, e.ends_at);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setToast(null);
    try {
      await fn();
    } catch (err) {
      setToast({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const toggleSave = () =>
    act('save', async () => {
      if (d.saved) {
        await api.events.unsave(e.id);
        onChange({ ...d, saved: false, registered: false });
      } else {
        await api.events.save(e.id);
        onChange({ ...d, saved: true });
        setToast({ ok: true, text: "Saved. We'll remind you 30 minutes before." });
      }
    });

  const register = () =>
    act('register', async () => {
      await api.events.save(e.id, { register: true });
      onChange({ ...d, saved: true, registered: true });
      if (e.register_url) Linking.openURL(e.register_url);
      else setToast({ ok: true, text: "You're registered! It's on your TrojanHub calendar." });
    });

  return (
    <>
      <View style={s.chips}>
        <Chip>
          {cat.emoji} {cat.label}
        </Chip>
        {status === 'Happening now' && <Chip tone="green">● Happening now</Chip>}
        {e.has_freebie && <Chip tone="gold">🎁 {e.freebie_desc ?? 'Freebie'}</Chip>}
        {e.source === 'community' && <Chip>Community posted</Chip>}
        {e.source === 'flyer' && <Chip>From a flyer</Chip>}
      </View>
      <Text style={s.h1} accessibilityRole="header">
        {e.title}
      </Text>
      {e.org_name && <Text style={{ color: e.org_verified ? colors.cardinal : colors.muted, fontWeight: '600' }}>{e.org_verified ? `✓ ${e.org_name} · Verified org` : `Hosted by ${e.org_name}`}</Text>}

      <View style={[s.card, { flexDirection: 'column', gap: spacing.md }]}>
        <Fact icon="🗓️" label="When" value={`${relativeDay(e.starts_at)}, ${timeRange(e.starts_at, e.ends_at)}`} sub={status} />
        <Fact
          icon="📍"
          label="Where"
          value={e.location_text ?? 'TBA'}
          link={e.location_text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.location_text}, University of Southern California`)}` : undefined}
          linkLabel="Open in Maps"
        />
        <Fact icon="🎟️" label="Cost" value={e.is_free ? 'Free to attend' : 'Ticketed'} />
      </View>

      {e.description && <Text style={{ fontSize: fontSize.md, lineHeight: 24, color: colors.ink }}>{e.description}</Text>}

      {e.tickets_open_at && <Tickets opensAt={e.tickets_open_at} url={e.ticket_url} saved={d.saved} onSave={toggleSave} />}

      {d.counts_toward.length > 0 && (
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gold, backgroundColor: '#FFF8DB', padding: spacing.md, gap: spacing.xs }}>
          <Text style={s.cardTitle}>🏆 Counts toward rewards</Text>
          {d.counts_toward.map((p) => (
            <Text key={p.program_id} style={{ color: colors.ink }}>
              {p.style === 'entries' ? `${p.name}: ${p.attended} entr${p.attended === 1 ? 'y' : 'ies'} so far` : `${p.name}: ${p.attended} of ${p.required}`}
              {p.style === 'entries' && !d.attended ? <Text style={{ color: colors.cardinal, fontWeight: '700' }}> · checking in adds one</Text> : null}
              {p.style !== 'entries' && p.attended + 1 === p.required && !d.attended ? <Text style={{ color: colors.cardinal, fontWeight: '700' }}> · this one completes it!</Text> : null}
            </Text>
          ))}
        </View>
      )}

      <View style={{ gap: spacing.sm }}>
        {e.register_url || !e.ticket_url ? (
          <Button title={d.registered ? '✓ Registered' : e.register_url ? 'Register ↗' : 'Register / RSVP'} onPress={register} busy={busy === 'register'} disabled={busy !== null} />
        ) : (
          <Button title="Get tickets ↗" onPress={() => Linking.openURL(e.ticket_url!)} />
        )}
        <Button title={d.saved ? '★ Saved to my calendar' : '☆ Save'} kind="secondary" onPress={toggleSave} busy={busy === 'save'} disabled={busy !== null} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button title="Google Cal" kind="secondary" style={{ flex: 1, paddingHorizontal: 0 }} onPress={() => Linking.openURL(d.google_calendar_url)} />
          <Button title="Apple / .ics" kind="secondary" style={{ flex: 1, paddingHorizontal: 0 }} onPress={() => Linking.openURL(api.events.icsUrl(e.id))} />
        </View>
        {toast && (
          <Text accessibilityRole="alert" style={{ color: toast.ok ? colors.success : colors.danger, fontSize: fontSize.sm }}>
            {toast.text}
          </Text>
        )}
      </View>

      <CheckIn detail={d} onChange={onChange} />
      <OrganizerCode eventId={e.id} />
    </>
  );
}

function OrganizerCode({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setError(null);
    try {
      setCode((await api.events.checkinCode(eventId)).code);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <View style={[s.card, { flexDirection: 'column', gap: spacing.sm }]}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>{open ? '▾' : '▸'} For organizers: show check-in code</Text>
      </Pressable>
      {open && (
        <>
          {code ? (
            <Text style={{ backgroundColor: colors.ink, color: colors.gold, borderRadius: radius.md, paddingVertical: spacing.lg, textAlign: 'center', fontSize: 30, fontWeight: '800', letterSpacing: 8 }}>{code}</Text>
          ) : (
            <Button title="Show code" kind="secondary" onPress={show} />
          )}
          <Text style={s.cardMeta}>Put it on a slide at the door. Attendees enter it to check in and earn reward credit.</Text>
          {error && <Text style={{ color: colors.danger, fontSize: fontSize.sm }}>{error}</Text>}
        </>
      )}
    </View>
  );
}

function Fact({ icon, label, value, sub, link, linkLabel }: { icon: string; label: string; value: string; sub?: string; link?: string; linkLabel?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
        <Text style={{ color: colors.ink, fontSize: fontSize.md }}>{value}</Text>
        {sub && <Text style={s.cardMeta}>{sub}</Text>}
        {link && (
          <Text onPress={() => Linking.openURL(link)} accessibilityRole="link" style={{ color: colors.cardinal, fontWeight: '700', fontSize: fontSize.sm, paddingVertical: spacing.xs }}>
            {linkLabel}
          </Text>
        )}
      </View>
    </View>
  );
}

function Tickets({ opensAt, url, saved, onSave }: { opensAt: string; url: string | null; saved: boolean; onSave: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(opensAt).getTime() - now;
  const open = ms <= 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return (
    <View style={{ borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: open ? '#E6F2E9' : colors.cardinal }}>
      <Text style={{ fontWeight: '700', color: open ? colors.success : colors.gold }}>{open ? 'Tickets are on sale' : 'Tickets open soon'}</Text>
      <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: open ? colors.ink : '#fff', fontVariant: ['tabular-nums'] }}>
        {open ? 'Go go go!' : h >= 24 ? `${relativeDay(opensAt)} at ${fmtTime(opensAt)}` : `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`}
      </Text>
      {!open && <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm }}>Save this event and we'll alert you 30 minutes before tickets drop.</Text>}
      {open && url ? <Button title="Buy tickets ↗" onPress={() => Linking.openURL(url)} /> : !saved && <Button title="🔔 Alert me" kind="gold" onPress={onSave} />}
    </View>
  );
}

function CheckIn({ detail, onChange }: { detail: EventDetailResponse; onChange: (d: EventDetailResponse) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useNow(); // re-check every 30 s, so "I'm here!" appears without leaving the screen
  const live = canCheckIn(detail.event.starts_at, detail.event.ends_at);

  async function checkIn(withCode?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.events.checkin(detail.event.id, withCode ? { code: withCode } : {});
      setResult(res);
      onChange({
        ...detail,
        attended: true,
        counts_toward: detail.counts_toward.map((p) => {
          const r = res.rewards.find((x) => x.program.id === p.program_id);
          return r ? { ...p, attended: r.attended } : p;
        }),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (detail.attended) {
    return (
      <View style={{ borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs, backgroundColor: '#E6F2E9' }}>
        <Text style={{ color: colors.success, fontWeight: '700' }}>✓ You checked in</Text>
        {result?.rewards.map((r) => (
          <Text key={r.program.id} style={{ color: colors.ink }}>
            {r.style === 'entries'
              ? `🎟️ ${r.program.name}: ${r.attended} entr${r.attended === 1 ? 'y' : 'ies'}`
              : r.attended >= r.required ? `🎉 ${r.program.name} complete! Claim your reward from ${r.program.office}.` : `${r.program.name}: ${r.attended} of ${r.required}, ${r.required - r.attended} to go`}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View style={[s.card, { flexDirection: 'column', gap: spacing.sm }]}>
      <Text style={s.cardTitle}>📍 Check in</Text>
      {live ? <Button title="I'm here!" onPress={() => checkIn()} busy={busy} /> : <Text style={s.cardMeta}>Check-in opens 30 minutes before it starts, or enter the organizer's code.</Text>}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase())} maxLength={8} autoCapitalize="characters" placeholder="Event code" placeholderTextColor={colors.muted} accessibilityLabel="Organizer's check-in code" style={[s.input, { flex: 1, letterSpacing: 3 }]} />
        <Button title="Go" kind="secondary" onPress={() => code.trim() && checkIn(code.trim())} disabled={!code.trim()} busy={busy} />
      </View>
      {error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: fontSize.sm }}>
          {error}
        </Text>
      )}
    </View>
  );
}
