// P2 Vishwa: "I found something". Photo + where it was found -> posted. Then the finder says
// where the item is now: taken to DPS, or left where found (the AI pre-selects one).
import type { Building, CreateItemResponse, Item, ItemTier } from '@trojanhub/shared';
import { ApiRequestError } from '@trojanhub/shared/api';
import { colors, radius, spacing } from '@trojanhub/shared/theme';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';

import { DPS_DROPOFF, type PickedPhoto, currentUserId, getBuildings, isMock, pickPhoto, postFoundItem, setTier } from '@/components/lost-found/data';
import { EditItem } from '@/components/lost-found/EditItem';
import { Button, DropoffCard, ErrorNote, ItemPhoto, LeftHereCard, SignInNotice, TierBadge, WhereNowChoice, s } from '@/components/lost-found/ui';

export default function ReportFoundScreen() {
  const [signedIn, setSignedIn] = useState<boolean | null>(isMock ? true : null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [description, setDescription] = useState('');
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
      if (p) setPhoto(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submit() {
    if (!photo && !description.trim()) return setError('Add a photo or a short description of the item.');
    if (!where.trim()) return setError('Where did you find it? For example: Leavey Library, 2nd floor.');
    setBusy(true);
    setError(null);
    try {
      setPosted(await postFoundItem({ description: description.trim() || undefined, location_text: where.trim() }, photo?.file));
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
        <Text style={s.muted}>Snap a photo and say where you found it. Our AI sorts it for you.</Text>

        {photo ? (
          <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md }} accessibilityLabel="Your photo of the item" />
        ) : (
          <View style={[s.card, { alignItems: 'center', paddingVertical: spacing.xl }]}>
            <Text style={s.title}>Add a photo</Text>
            <Text style={s.small}>Don’t include faces or ID card details</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label={photo ? 'Retake' : 'Take photo'} kind="secondary" onPress={() => choose('camera')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Choose photo" kind="secondary" onPress={() => choose('library')} />
          </View>
        </View>

        <Text style={s.title}>
          What is it? <Text style={s.small}>(optional with a photo)</Text>
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. black Hydro Flask with a Trojans sticker"
          placeholderTextColor={colors.muted}
          accessibilityLabel="What is it?"
          style={s.input}
        />
        <Text style={s.title}>
          Where did you find it? <Text style={s.small}>(be specific: if you leave it there, owners will go to this spot)</Text>
        </Text>
        <TextInput
          value={where}
          onChangeText={setWhere}
          placeholder="e.g. Leavey Library, 2nd floor"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Where did you find it?"
          style={s.input}
        />

        {error && <ErrorNote message={error} />}
        <Button label={busy ? 'Looking at your photo…' : 'Post it'} onPress={submit} busy={busy} />
        <Text style={s.small}>Your name, email and phone number are never shown.</Text>
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
