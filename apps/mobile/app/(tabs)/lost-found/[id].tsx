// P2 Vishwa: one found item. Owners see right away where to get it: DPS, or the spot the finder
// left it. The finder can switch that, or take the post down.
import type { Building, Item, ItemTier } from '@trojanhub/shared';
import { colors, spacing } from '@trojanhub/shared/theme';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { DPS_DROPOFF, currentUserId, getBuildings, getItem, isMock, mockUserId, removePost, setTier, timeAgo } from '@/components/lost-found/data';
import { Button, DropoffCard, ErrorNote, ItemPhoto, LeftHereCard, SignInNotice, TierBadge, WhereNowChoice, s } from '@/components/lost-found/ui';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'signed-out'>('loading');
  const [item, setItem] = useState<Item | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<Record<string, Building>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = isMock ? mockUserId : await currentUserId();
      if (cancelled) return;
      if (!uid) return setState('signed-out');
      setUserId(uid);
      try {
        const [it, bs] = await Promise.all([getItem(id), getBuildings()]);
        if (cancelled) return;
        setBuildings(bs);
        setItem(it);
        setState(it ? 'ready' : 'missing');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState('missing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Show the new choice right away, save in the background, undo if the save fails. */
  function changeTier(prev: Item, tier: ItemTier) {
    if (tier === prev.tier) return;
    setItem({ ...prev, tier });
    run(async () => {
      try {
        setItem(await setTier(prev, tier));
      } catch (e) {
        setItem(prev);
        throw e;
      }
    });
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
      <Text style={s.muted}>Posted {timeAgo(item.created_at)}</Text>

      {error && <ErrorNote message={error} />}

      {!open ? (
        <Text style={{ color: colors.success, fontWeight: '700' }}>This post was taken down: the item was picked up or moved.</Text>
      ) : mine ? (
        <View style={s.card}>
          <Text style={s.title}>You posted this item.</Text>
          <WhereNowChoice tier={item.tier} busy={busy} onChange={(t: ItemTier) => changeTier(item, t)} />
          <Button
            label="Take this post down"
            kind="secondary"
            busy={busy}
            onPress={() => run(async () => { await removePost(item.id); setItem({ ...item, status: 'claimed' }); })}
          />
          <Text style={s.small}>Do this once it’s been picked up, or if you moved it somewhere else.</Text>
        </View>
      ) : item.tier === 'valuable' ? (
        <DropoffCard dropoff={DPS_DROPOFF} title="The finder took this to DPS Lost & Found">
          <Text style={{ color: colors.ink }}>If it’s yours, go to DPS. It should be there: DPS keeps found items for 90 days and checks who really owns them.</Text>
          <Text style={s.muted}>To protect the owner, the photo and details are hidden. Be ready to describe it (color, case, stickers, what’s inside) to prove it’s yours.</Text>
        </DropoffCard>
      ) : (
        <LeftHereCard item={item} buildings={buildings} title="The finder left it here:">
          <Text style={s.muted}>Go soon, since someone may move it. If it’s not there, ask the building’s front desk or DPS Lost & Found.</Text>
        </LeftHereCard>
      )}
    </ScrollView>
  );
}
