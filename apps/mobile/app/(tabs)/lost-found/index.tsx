// P2 Vishwa: Lost & Found home. Browse recently found items, search by words or by photo.
import type { Building, Item } from '@trojanhub/shared';
import { ApiRequestError } from '@trojanhub/shared/api';
import { colors, spacing } from '@trojanhub/shared/theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { currentUserId, getBuildings, isMock, listRecent, pickPhoto, searchByPhoto } from '@/components/lost-found/data';
import { Button, ErrorNote, ItemRow, SignInNotice, s } from '@/components/lost-found/ui';

type Results = { label: string; items: { item: Item; score?: number }[] };

export default function LostFoundHome() {
  const [signedIn, setSignedIn] = useState<boolean | null>(isMock ? true : null);
  const [buildings, setBuildings] = useState<Record<string, Building>>({});
  const [results, setResults] = useState<Results | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showingSearch = useRef(false); // keep search results when coming back to the tab

  const showRecent = useCallback(async () => {
    showingSearch.current = false;
    setError(null);
    try {
      const items = await listRecent();
      setResults({ label: 'Recently found', items: items.map((item) => ({ item })) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Refresh when coming back to this tab (e.g. after posting an item or signing in)
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!isMock) {
          const uid = await currentUserId();
          setSignedIn(!!uid);
          if (!uid) return;
        }
        getBuildings().then(setBuildings);
        if (!showingSearch.current) showRecent();
      })();
    }, [showRecent]),
  );

  async function run(label: string, call: () => Promise<{ results: { item: Item; score: number }[] }>) {
    setBusy(true);
    setError(null);
    try {
      const { results } = await call();
      showingSearch.current = true;
      setResults({ label, items: results.slice(0, 10) });
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Search isn't working right now. Is the AI service running?");
    } finally {
      setBusy(false);
    }
  }

  function searchWords() {
    const q = query.trim();
    if (!q) return showRecent();
    run(`Matches for “${q}”`, () => api.items.search({ q }));
  }

  async function searchPhoto() {
    try {
      const photo = await pickPhoto('library');
      if (photo) await run('Matches for your photo', () => searchByPhoto(photo.file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const header = (
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <Text style={s.muted}>Lost something on campus? Search here. Found something? Post it in one step.</Text>
      <Button label="I found something" onPress={() => router.push('/lost-found/report')} />
      {signedIn === false ? (
        <SignInNotice what="search and post lost items" />
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={searchWords}
            returnKeyType="search"
            placeholder="What did you lose? e.g. black Hydro Flask"
            placeholderTextColor={colors.muted}
            accessibilityLabel="What did you lose?"
            style={s.input}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Search" onPress={searchWords} busy={busy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Search by photo" kind="secondary" onPress={searchPhoto} disabled={busy} />
            </View>
          </View>
          <Text style={s.small}>Valuables (phones, wallets, IDs, keys, AirPods…) are kept at DPS Lost & Found, which checks who really owns them.</Text>
          {error && <ErrorNote message={error} />}
          {results && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.h2}>{results.label}</Text>
              {results.label !== 'Recently found' && (
                <Text
                  accessibilityRole="button"
                  onPress={() => {
                    setQuery('');
                    showRecent();
                  }}
                  style={{ color: colors.cardinal, fontWeight: '700', padding: spacing.sm }}>
                  Show all
                </Text>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <FlatList
      data={signedIn === false ? [] : results?.items ?? []}
      keyExtractor={(r) => r.item.id}
      renderItem={({ item: r }) => <ItemRow item={r.item} buildings={buildings} score={r.score} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        results && signedIn !== false ? (
          <View style={s.card}>
            <Text style={s.muted}>
              {results.label === 'Recently found'
                ? 'Nothing has been posted yet.'
                : 'No matches yet. New items get posted all the time, so check back later, or ask DPS Lost & Found.'}
            </Text>
          </View>
        ) : undefined
      }
      contentContainerStyle={s.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.cardinal}
          onRefresh={async () => {
            setRefreshing(true);
            setQuery('');
            await showRecent();
            setRefreshing(false);
          }}
        />
      }
    />
  );
}
