// P2 Vishwa: "I found something". Photo + where it was found -> AI sorts it -> posted.
// Valuables get the DPS drop-off card; when the AI isn't sure, the finder answers one question.
import type { CreateItemResponse, Item, ItemTier } from '@trojanhub/shared';
import { ApiRequestError } from '@trojanhub/shared/api';
import { colors, radius, spacing } from '@trojanhub/shared/theme';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';

import { DPS_DROPOFF, type PickedPhoto, currentUserId, isMock, pickPhoto, postFoundItem, setTier } from '@/components/lost-found/data';
import { Button, DropoffCard, ErrorNote, ItemPhoto, SignInNotice, TierBadge, s } from '@/components/lost-found/ui';

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
  if (posted) return <Posted initial={posted} />;

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
        <Text style={s.title}>Where did you find it?</Text>
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
        <Text style={s.small}>Your name, email and phone number are never shown. Owners contact you through in-app messages.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Posted({ initial }: { initial: CreateItemResponse }) {
  const [item, setItem] = useState<Item>(initial.item);
  const [asking, setAsking] = useState(!!initial.ask_tier);
  const [error, setError] = useState<string | null>(null);
  const dropoff = item.tier === 'valuable' ? initial.dropoff ?? DPS_DROPOFF : null;

  async function answer(tier: ItemTier) {
    setError(null);
    try {
      if (tier !== item.tier) setItem(await setTier(item, tier));
      setAsking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        </View>
      </View>

      {asking && (
        <View style={[s.card, { borderColor: colors.gold, borderWidth: 2 }]}>
          <Text style={s.title}>Quick check: is this a valuable?</Text>
          <Text style={s.muted}>For example a phone, laptop, wallet, ID, keys, AirPods, or a bag that might have those inside.</Text>
          <Button label="Yes, it's valuable" onPress={() => answer('valuable')} />
          <Button label="No, it's an everyday item" kind="secondary" onPress={() => answer('everyday')} />
        </View>
      )}
      {error && <ErrorNote message={error} />}

      {!asking &&
        (dropoff ? (
          <DropoffCard dropoff={dropoff} title="This looks valuable. Please take it to DPS.">
            <Text style={{ color: colors.ink }}>DPS keeps valuables safe and checks who really owns them. Owners who search will be told to pick it up there.</Text>
          </DropoffCard>
        ) : (
          <View style={s.card}>
            <Text style={s.title}>You can hold on to it.</Text>
            <Text style={s.muted}>
              Owners who search will find it. When someone taps “This is mine”, you’ll see a message in My handoffs. The post comes down after 14 days.
            </Text>
          </View>
        ))}

      <Button label="View post" kind="secondary" onPress={() => router.replace(`/lost-found/${item.id}`)} />
      <Button label="Back to Lost & Found" kind="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}
