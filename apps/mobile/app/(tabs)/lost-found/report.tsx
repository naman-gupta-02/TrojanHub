// P2 Vishwa: "I found something". Photo + where it was found -> posted. Then the finder says
// where the item is now: taken to DPS, or left where found (the AI pre-selects one).
import type { Building, CreateItemResponse, Item, ItemTier } from '@trojanhub/shared';
import { ApiRequestError } from '@trojanhub/shared/api';
import { colors, radius, spacing } from '@trojanhub/shared/theme';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DPS_DROPOFF, type PickedPhoto, currentUserId, describePhoto, getBuildings, isMock, pickPhoto, postFoundItem, setTier } from '@/components/lost-found/data';
import { EditItem } from '@/components/lost-found/EditItem';
import { TommyAvatar } from '@/components/tommy/TommyAvatar';
import { Button, DropoffCard, Hero, ErrorNote, ItemPhoto, LeftHereCard, SignInNotice, TierBadge, WhereNowChoice, s } from '@/components/lost-found/ui';

export default function ReportFoundScreen() {
  const [signedIn, setSignedIn] = useState<boolean | null>(isMock ? true : null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [description, setDescription] = useState('');
  const [describing, setDescribing] = useState(false);
  const [aiWrote, setAiWrote] = useState(false); // the box holds Tommy's text (maybe edited)
  const lastAi = useRef<string | null>(null);
  const typed = useRef(''); // what's in the box right now, for the async describe below
  const describeRun = useRef(0); // ignore an answer for a photo that was already replaced
  const pendingDescribe = useRef<Promise<void> | null>(null); // "Post it" waits for this
  const [waiting, setWaiting] = useState(false); // posting, but Tommy is still writing the description
  const [where, setWhere] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<CreateItemResponse | null>(null);

  useEffect(() => {
    if (!isMock) currentUserId().then((uid) => setSignedIn(!!uid));
  }, []);

  async function choose(source: 'camera' | 'library') {
    setError(null);
    try {
      const p = await pickPhoto(source);
      if (p) {
        setPhoto(p);
        void autoDescribe(p);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Tommy writes "What is it?" from the photo. It never overwrites what the finder typed;
   *  if it fails, the box just stays as it was. */
  function autoDescribe(p: PickedPhoto, force = false): Promise<void> {
    const run = ++describeRun.current;
    setDescribing(true);
    const job = (async () => {
      try {
        const res = await describePhoto(p.file);
        if (run !== describeRun.current || !res.description) return;
        const cur = typed.current;
        if (!force && cur.trim() && cur !== lastAi.current) return; // the finder already wrote their own
        lastAi.current = typed.current = res.description;
        setDescription(res.description);
        setAiWrote(true);
      } catch {
        // optional helper: the finder can still type it
      } finally {
        if (run === describeRun.current) {
          setDescribing(false);
          pendingDescribe.current = null;
        }
      }
    })();
    pendingDescribe.current = job;
    return job;
  }

  async function submit() {
    if (!where.trim()) return setError('Where did you find it? For example: Leavey Library, 2nd floor.');
    setError(null);
    // Pressed "Post it" before Tommy finished? Wait for the description instead of posting without one.
    if (!typed.current.trim() && pendingDescribe.current) {
      setWaiting(true);
      await pendingDescribe.current;
      setWaiting(false);
    }
    const text = typed.current.trim();
    if (!photo && !text) return setError('Add a photo or a short description of the item.');
    setBusy(true);
    try {
      setPosted(await postFoundItem({ description: text || undefined, location_text: where.trim() }, photo?.file));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Couldn't post right now. Is the AI service running?");
    } finally {
      setBusy(false);
    }
  }

  if (signedIn === false) {
    return (
      <View style={s.screen}>
        <SignInNotice what="post a found item" />
      </View>
    );
  }
  if (posted) return <Posted initial={posted} photoGiven={!!photo} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
        <Hero eyebrow="Found something?" title="Snap it, post it" subtitle="Snap a photo and say where you found it. Tommy writes the description and sorts it for you." />

        <Step n={1} title="Photo" hint="Don’t include faces or ID card details" />
        {photo ? (
          <View style={[st.photoWrap, describing && { borderColor: colors.gold }]}>
            <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 1 }} resizeMode="cover" accessibilityLabel="Your photo of the item" />
            {describing ? (
              <View style={[st.chip, { backgroundColor: '#fff' }]} accessibilityLiveRegion="polite">
                <TommyAvatar mood="searching" size={26} />
                <Text style={st.chipText}>Tommy is looking…</Text>
              </View>
            ) : aiWrote ? (
              <View style={[st.chip, { backgroundColor: colors.gold }]}>
                <TommyAvatar mood="celebrating" size={26} />
                <Text style={st.chipText}>Described by Tommy</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Pressable onPress={() => choose('library')} accessibilityRole="button" accessibilityLabel="Choose a photo" style={({ pressed }) => [st.drop, pressed && { borderColor: colors.cardinal, transform: [{ scale: 0.99 }] }]}>
            <View style={st.dropIcon}>
              <Text style={{ fontSize: 26 }}>📷</Text>
            </View>
            <Text style={s.title}>Add a photo</Text>
            <Text style={s.small}>Tommy will describe it for you</Text>
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label={photo ? '📸 Retake' : '📸 Take photo'} kind="secondary" onPress={() => choose('camera')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={photo ? '🔄 Change' : '🖼️ Choose'} kind="secondary" onPress={() => choose('library')} />
          </View>
        </View>

        <Step n={2} title="What is it?" hint={photo ? 'Tommy writes this from your photo. Check it.' : 'Optional with a photo'} />
        <TextInput
          value={description}
          onChangeText={(v) => {
            typed.current = v;
            setDescription(v);
          }}
          multiline
          placeholder={describing ? 'Tommy is looking at your photo…' : 'e.g. black Hydro Flask with a Trojans sticker'}
          placeholderTextColor={colors.muted}
          accessibilityLabel="What is it?"
          style={[s.input, { minHeight: 84, paddingTop: spacing.sm, textAlignVertical: 'top' }, describing && !description && { borderColor: colors.gold, backgroundColor: '#FFFBEA' }]}
        />
        {describing ? (
          <Text style={[s.small, { color: '#8A5A00', fontWeight: '700' }]} accessibilityLiveRegion="polite">✨ Tommy is describing your photo…</Text>
        ) : aiWrote && photo && description.trim() ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm }}>
            <Text style={s.small}>✨ Written by Tommy. Fix anything that’s wrong.</Text>
            <Pressable onPress={() => autoDescribe(photo, true)} accessibilityRole="button" hitSlop={10}>
              <Text style={[s.small, { color: colors.cardinal, fontWeight: '800' }]}>↻ Rewrite</Text>
            </Pressable>
          </View>
        ) : null}

        <Step n={3} title="Where did you find it?" hint="Be specific: if you leave it there, owners will go to this spot" />
        <TextInput
          value={where}
          onChangeText={setWhere}
          placeholder="e.g. Leavey Library, 2nd floor"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Where did you find it?"
          style={s.input}
        />

        {error && <ErrorNote message={error} />}
        <Button label={waiting ? '✨ Tommy is finishing the description…' : 'Post it'} onPress={submit} busy={busy} disabled={waiting} />
        <Text style={[s.small, { textAlign: 'center' }]}>🔒 Your name, email and phone number are never shown.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Posted({ initial, photoGiven }: { initial: CreateItemResponse; photoGiven: boolean }) {
  const [item, setItem] = useState<Item>(initial.item);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<Record<string, Building>>({});

  useEffect(() => {
    getBuildings().then(setBuildings);
  }, []);

  /** Show the new choice right away, save in the background, undo if the save fails. */
  async function choose(tier: ItemTier) {
    if (tier === item.tier) return;
    const prev = item;
    setItem({ ...prev, tier });
    setBusy(true);
    setError(null);
    try {
      setItem(await setTier(prev, tier));
    } catch (e) {
      setItem(prev);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.h1}>Posted. Thank you!</Text>
      <View style={[s.row, { alignItems: 'flex-start' }]}>
        <ItemPhoto item={item} size={96} />
        <View style={{ flex: 1, gap: 4 }}>
          <TierBadge tier={item.tier} />
          <Text style={s.title}>{item.title}</Text>
          {item.description ? <Text style={s.muted}>{item.description}</Text> : null}
          <Text style={s.muted}>{item.location_text}</Text>
          {!editing ? (
            <Text accessibilityRole="button" onPress={() => setEditing(true)} style={{ color: colors.cardinal, fontWeight: '700', paddingVertical: spacing.sm }}>
              Edit details
            </Text>
          ) : null}
        </View>
      </View>

      {editing ? (
        <EditItem
          item={item}
          onSaved={(saved) => {
            setItem(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}

      {photoGiven && !item.photo_url ? (
        <View style={[s.card, { backgroundColor: '#FFF4CC' }]}>
          <Text style={{ color: colors.ink }}>We didn’t save your photo: ID and bank cards show private info. The item is still posted.</Text>
        </View>
      ) : null}

      <WhereNowChoice tier={item.tier} onChange={choose} busy={busy} />
      <Text style={s.muted}>
        {initial.ask_tier
          ? "We weren't sure about this one. If it might hold something valuable (like a bag), DPS is safer."
          : "We picked this from your photo. Tap the other option if that's not right."}
      </Text>
      {error && <ErrorNote message={error} />}

      {item.tier === 'valuable' ? (
        <DropoffCard dropoff={initial.dropoff ?? DPS_DROPOFF} title="Please take it to DPS Lost & Found.">
          <Text style={{ color: colors.ink }}>DPS keeps found items for 90 days and checks who really owns them. Owners who search will be sent there.</Text>
        </DropoffCard>
      ) : (
        <LeftHereCard item={item} buildings={buildings} title="Owners who search will be told it's here:">
          <Text style={s.muted}>The post comes down after 14 days. If you move it, open your post and take it down.</Text>
        </LeftHereCard>
      )}

      <Button label="View post" kind="secondary" onPress={() => router.replace(`/lost-found/${item.id}`)} />
      <Button label="Back to Lost & Found" kind="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

/** A numbered step: gold number, bold title, short hint. */
function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.xs }}>
      <View style={st.stepNum}>
        <Text style={{ fontWeight: '900', color: colors.ink }}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { fontSize: 17 }]} accessibilityRole="header">{title}</Text>
        {hint ? <Text style={s.small}>{hint}</Text> : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  photoWrap: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 3, borderColor: colors.line, backgroundColor: colors.surface },
  chip: { position: 'absolute', left: spacing.sm, bottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingVertical: 4, paddingLeft: 4, paddingRight: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  chipText: { fontWeight: '800', color: colors.ink, fontSize: 13 },
  drop: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.xl, borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: '#FFFCF0' },
  dropIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cardinal, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
