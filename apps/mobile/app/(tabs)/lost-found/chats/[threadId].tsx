// P2 Vishwa: private handoff chat between an owner and a finder (Supabase Realtime).
// Only the two people in the thread can read or send (RLS). No phone numbers or emails shown.
import type { Message } from '@trojanhub/shared';
import { colors, fontSize, radius, spacing } from '@trojanhub/shared/theme';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  MEETING_SPOTS,
  type ThreadSummary,
  currentUserId,
  getThread,
  isMock,
  listMessages,
  markReturned,
  mockUserId,
  sendMessage,
  subscribeToThread,
} from '@/components/lost-found/data';
import { Button, ErrorNote, SignInNotice, s } from '@/components/lost-found/ui';

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const [thread, setThread] = useState<ThreadSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'signed-out'>('loading');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);

  function add(m: Message) {
    setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
  }

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false; // the screen was left (or re-mounted) before loading finished
    (async () => {
      const uid = isMock ? mockUserId : await currentUserId();
      if (cancelled) return;
      if (!uid) return setState('signed-out');
      setUserId(uid);
      try {
        const [t, msgs] = await Promise.all([getThread(threadId), listMessages(threadId)]);
        if (cancelled) return;
        if (!t) return setState('missing');
        setThread(t);
        setMessages(msgs);
        setState('ready');
        unsubscribe = subscribeToThread(threadId, add);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState('missing');
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [threadId]);

  async function send(text: string) {
    if (!text.trim() || !userId) return;
    setBusy(true);
    setError(null);
    try {
      add(await sendMessage(threadId, userId, text));
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function returned() {
    if (!thread?.item) return;
    try {
      await markReturned(thread.item.id);
      setThread({ ...thread, item: { ...thread.item, status: 'claimed' } });
      await send('Marked as returned. Glad it found its way home!');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (state === 'loading') return <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.cardinal} />;
  if (state === 'signed-out') return <View style={s.screen}><SignInNotice what="see this chat" /></View>;
  if (state === 'missing' || !thread) {
    return <View style={s.screen}>{error ? <ErrorNote message={error} /> : <Text style={s.muted}>This chat doesn’t exist, or you’re not part of it.</Text>}</View>;
  }

  const isFinder = userId === thread.finder_id;
  const done = thread.item?.status === 'claimed';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={{ padding: spacing.lg, paddingBottom: 0, gap: spacing.sm }}>
        <Text style={s.h2}>{thread.item?.title ?? 'Handoff'}</Text>
        <Text style={s.muted}>{isFinder ? 'You found this item.' : "You're picking up this item."}</Text>
        <View style={{ backgroundColor: '#FFF4CC', borderRadius: radius.sm, padding: spacing.sm }}>
          <Text style={{ color: colors.ink, fontSize: fontSize.sm }}>Meet in a busy public place. Don’t share your phone number, address or ID here.</Text>
        </View>
      </View>

      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        renderItem={({ item: m }) => {
          const mine = m.sender_id === userId;
          return (
            <View
              accessibilityLabel={`${mine ? 'You' : 'Them'}: ${m.body}`}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                backgroundColor: mine ? colors.cardinal : colors.surface,
                borderColor: colors.line,
                borderWidth: mine ? 0 : 1,
                borderRadius: radius.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}>
              <Text style={{ color: mine ? '#fff' : colors.ink, fontSize: fontSize.md }}>{m.body}</Text>
            </View>
          );
        }}
      />

      <View style={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, borderTopColor: colors.line, borderTopWidth: 1, backgroundColor: colors.surface }}>
        {error && <ErrorNote message={error} />}
        {done ? (
          <Text style={{ color: colors.success, fontWeight: '700' }}>Returned. This handoff is done.</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} accessibilityLabel="Suggested meeting spots">
              {MEETING_SPOTS.map((spot) => (
                <Pressable
                  key={spot}
                  onPress={() => setDraft(`Can we meet at ${spot}?`)}
                  accessibilityRole="button"
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderColor: colors.line, borderWidth: 1 }}>
                  <Text style={{ color: colors.ink }}>Meet at {spot}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                maxLength={1000}
                placeholder="Write a message"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Message"
                onSubmitEditing={() => send(draft)}
                style={[s.input, { flex: 1 }]}
              />
              <Button label="Send" onPress={() => send(draft)} busy={busy} disabled={!draft.trim()} />
            </View>
            {isFinder && <Button label="They have it: mark as returned" kind="secondary" onPress={returned} />}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
