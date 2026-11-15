// P2 Vishwa: one found item + "This is mine".
import type { Building, DropoffInfo, Item } from '@trojanhub/shared';
import { ApiRequestError } from '@trojanhub/shared/api';
import { colors, spacing } from '@trojanhub/shared/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { api } from '@/lib/api';
import { DPS_DROPOFF, currentUserId, getBuildings, getItem, isMock, markReturned, mockUserId, timeAgo, whereFound } from '@/components/lost-found/data';
import { Button, DropoffCard, ErrorNote, ItemPhoto, SignInNotice, TierBadge, s } from '@/components/lost-found/ui';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'signed-out'>('loading');
  const [item, setItem] = useState<Item | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<Record<string, Building>>({});
  const [pickup, setPickup] = useState<DropoffInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const uid = isMock ? mockUserId : await currentUserId();
      if (!uid) return setState('signed-out');
      setUserId(uid);
      try {
        const [it, bs] = await Promise.all([getItem(id), getBuildings()]);
        setBuildings(bs);
        setItem(it);
        setState(it ? 'ready' : 'missing');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState('missing');
      }
    })();
  }, [id]);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.items.claim(id);
      if ('thread_id' in res) router.push(`/lost-found/chats/${res.thread_id}`);
      else setPickup(res.pickup);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Couldn't claim right now. Is the AI service running?");
    } finally {
      setBusy(false);
    }
  }

  async function returned() {
    if (!item) return;
    setBusy(true);
    try {
      await markReturned(item.id);
      setItem({ ...item, status: 'claimed' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.cardinal} />;
  if (state === 'signed-out') return <View style={s.screen}><SignInNotice what="see this item" /></View>;
  if (state === 'missing' || !item) {
    return <View style={s.screen}>{error ? <ErrorNote message={error} /> : <Text style={s.muted}>This item doesn’t exist or was removed.</Text>}</View>;
  }

  const mine = item.posted_by === userId;
  const open = item.status === 'open';

  return (
    <ScrollView contentContainerStyle={s.screen}>
      <ItemPhoto item={item} size={Math.min(width - spacing.lg * 2, 480)} />
      <TierBadge tier={item.tier} />
      <Text style={s.h1}>{item.title}</Text>
      {item.description ? <Text style={{ color: colors.ink }}>{item.description}</Text> : null}
      <Text style={{ color: colors.ink }}>
        <Text style={{ fontWeight: '700' }}>Found at: </Text>
        {whereFound(item, buildings)}
      </Text>
      <Text style={s.muted}>Posted {timeAgo(item.created_at)}</Text>
      {item.tier === 'everyday' && item.expires_at && open ? (
        <Text style={s.muted}>
          Listed until {new Date(item.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}
        </Text>
      ) : null}

      {error && <ErrorNote message={error} />}

      {!open ? (
        <Text style={{ color: colors.success, fontWeight: '700' }}>This item was returned to its owner.</Text>
      ) : mine ? (
        <View style={s.card}>
          <Text style={s.title}>You posted this item.</Text>
          {item.tier === 'valuable' ? (
            <DropoffCard dropoff={DPS_DROPOFF} title="Please take it to DPS if you haven't yet." />
          ) : (
            <>
              <Text style={s.muted}>When someone claims it, you’ll chat in My handoffs. Mark it returned once they have it.</Text>
              <Button label="Mark as returned" kind="secondary" onPress={returned} busy={busy} />
            </>
          )}
        </View>
      ) : pickup ? (
        <DropoffCard dropoff={pickup} title="Pick it up at DPS Lost & Found">
          <Text style={{ color: colors.ink }}>Valuables are kept at DPS, which checks who really owns them. Contact DPS to claim it.</Text>
        </DropoffCard>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Button label="This is mine" onPress={claim} busy={busy} />
          <Text style={s.small}>
            {item.tier === 'valuable' ? "We'll show you where to pick it up." : 'This opens a private chat with the finder. No phone numbers or emails are shared.'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
