// P2 Vishwa: My handoffs. Every Lost & Found chat you're in, as owner or finder.
import { colors, spacing } from '@trojanhub/shared/theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { type ThreadSummary, currentUserId, isMock, listThreads, mockUserId, timeAgo } from '@/components/lost-found/data';
import { Card, ErrorNote, ItemPhoto, SignInNotice, s } from '@/components/lost-found/ui';

export default function HandoffsScreen() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const uid = isMock ? mockUserId : await currentUserId();
        if (!uid) return setSignedOut(true);
        setUserId(uid);
        listThreads()
          .then(setThreads)
          .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      })();
    }, []),
  );

  if (signedOut) return <View style={s.screen}><SignInNotice what="see your handoffs" /></View>;

  return (
    <FlatList
      data={threads ?? []}
      keyExtractor={(t) => t.id}
      contentContainerStyle={s.screen}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={s.muted}>Chats with people returning or picking up everyday items.</Text>
          {error && <ErrorNote message={error} />}
        </View>
      }
      ListEmptyComponent={
        threads ? (
          <View style={s.card}>
            <Text style={s.muted}>No handoffs yet. When you claim an item, or someone claims one you found, the chat shows up here.</Text>
          </View>
        ) : undefined
      }
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      renderItem={({ item: t }) => {
        const role = t.finder_id === userId ? 'finder' : 'owner';
        const status = t.item?.status === 'claimed' ? 'Returned' : role === 'finder' ? 'Someone thinks this is theirs' : "You're picking this up";
        return (
          <Card onPress={() => router.push(`/lost-found/chats/${t.id}`)} label={`${t.item?.title ?? 'Item'}. ${status}`}>
            <ItemPhoto item={{ title: t.item?.title ?? 'Item', photo_url: t.item?.photo_url ?? null }} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{t.item?.title ?? 'Item'}</Text>
              <Text style={[s.muted, t.item?.status === 'claimed' && { color: colors.success }]}>{status}</Text>
            </View>
            <Text style={s.small}>{timeAgo(t.created_at)}</Text>
          </Card>
        );
      }}
    />
  );
}
