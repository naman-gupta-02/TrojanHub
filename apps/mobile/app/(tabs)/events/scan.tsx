// P3 Parnavi: flyer scanner. Camera/photo -> upload -> AI reads it -> editable form (confidence + missing) -> event or deal.
import { ApiRequestError } from '@trojanhub/shared/api';
import type { EventCategory, FlyerFields, FlyerScanResponse } from '@trojanhub/shared/types';
import { colors, fontSize, radius, spacing } from '@trojanhub/shared/theme';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Button, CATEGORIES, Segmented, errorMessage, fromLocalInput, s, toLocalInput } from '@/components/events/kit';
import { api } from '@/lib/api';

type Stage = 'pick' | 'reading' | 'form';
type Kind = 'event' | 'deal';

interface Form {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location_text: string;
  category: EventCategory;
  is_free: boolean;
  has_freebie: boolean;
  freebie_desc: string;
  register_url: string;
  ticket_url: string;
  tickets_open_at: string;
  org_name: string;
  how_to_claim: string;
}

const EMPTY: Form = {
  title: '', description: '', starts_at: '', ends_at: '', location_text: '', category: 'other', is_free: true,
  has_freebie: false, freebie_desc: '', register_url: '', ticket_url: '', tickets_open_at: '', org_name: '', how_to_claim: '',
};
const STEPS = ['Uploading photo', 'Reading the flyer', 'Checking for duplicates'];
const LOW = 0.7;

export default function ScanScreen() {
  const [stage, setStage] = useState<Stage>('pick');
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [flyerUrl, setFlyerUrl] = useState<string | null>(null);
  const [scan, setScan] = useState<FlyerScanResponse | null>(null);
  const [kind, setKind] = useState<Kind>('event');
  const [form, setForm] = useState<Form>(EMPTY);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function pick(fromCamera: boolean) {
    setError(null);
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(fromCamera ? 'Camera access is needed to snap the flyer.' : 'Photo access is needed to pick a flyer.');
    // base64: the photo goes to the scanner inline as a data: URL (expo/fetch can't upload {uri} files)
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setPreview(asset.uri);
    setStage('reading');
    setStep(0);
    try {
      if (!asset.base64) throw new Error("Couldn't read that photo. Try another one.");
      const image_url = `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
      setFlyerUrl(image_url); // the API stores it in the flyers bucket when the event is posted
      setStep(1);
      const result = await api.flyers.scan({ image_url });
      setStep(2);
      await new Promise((r) => setTimeout(r, 350));
      applyScan(result);
    } catch (e) {
      setError(errorMessage(e));
      setStage('pick');
    }
  }

  function applyScan(res: FlyerScanResponse) {
    const f = res.fields;
    setScan(res);
    setKind(res.type);
    setBuildingId(f.building_id);
    setDuplicate(res.duplicate ?? (res.duplicate_of ? { id: res.duplicate_of, title: 'an existing event' } : null));
    setForm({
      title: f.title ?? '',
      description: res.extra?.description ?? '',
      starts_at: toLocalInput(f.starts_at),
      ends_at: toLocalInput(f.ends_at),
      location_text: f.location_text ?? '',
      category: f.category ?? 'other',
      is_free: f.is_free ?? true,
      has_freebie: f.has_freebie ?? false,
      freebie_desc: f.freebie_desc ?? '',
      register_url: f.register_url ?? '',
      ticket_url: res.extra?.ticket_url ?? '',
      tickets_open_at: toLocalInput(res.extra?.tickets_open_at),
      org_name: f.org_name ?? '',
      how_to_claim: res.extra?.how_to_claim ?? '',
    });
    setStage('form');
  }

  async function submit(force = false) {
    setError(null);
    if (form.title.trim().length < 3) return setError('Add a title (at least 3 characters).');
    const starts = fromLocalInput(form.starts_at.trim());
    const ends = fromLocalInput(form.ends_at.trim());
    if (kind === 'event' && !starts) return setError('When does it start? Use YYYY-MM-DD HH:MM.');
    if (form.ends_at.trim() && !ends) return setError('End time should look like YYYY-MM-DD HH:MM.');
    setSaving(true);
    try {
      if (kind === 'event') {
        const { event } = await api.events.create({
          title: form.title.trim(),
          description: form.description || null,
          starts_at: starts!,
          ends_at: ends,
          location_text: form.location_text || null,
          building_id: buildingId,
          category: form.category,
          is_free: form.is_free,
          has_freebie: form.has_freebie,
          freebie_desc: form.has_freebie ? form.freebie_desc || null : null,
          register_url: form.register_url || null,
          ticket_url: form.ticket_url || null,
          tickets_open_at: fromLocalInput(form.tickets_open_at.trim()),
          org_name: form.org_name || null,
          flyer_url: flyerUrl,
          force,
        });
        router.replace({ pathname: '/events/[id]', params: { id: event.id } });
      } else {
        await api.deals.create({
          title: form.title.trim(),
          description: form.description || null,
          kind: ends ? 'one_time' : 'ongoing',
          how_to_claim: form.how_to_claim || null,
          link: form.register_url || null,
          starts_at: starts,
          expires_at: ends,
        });
        router.replace('/events?tab=deals');
      }
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'duplicate') {
        setDuplicate({ id: String(e.details.duplicate_of), title: e.message.replace(/^Looks like "|" is already posted$/g, '') });
      } else {
        setError(errorMessage(e));
      }
      setSaving(false);
    }
  }

  const conf = scan?.confidence ?? {};
  const missing = new Set<string>(scan?.missing ?? []);
  const flag = (key: string) => ({
    ai: !!scan && key in conf,
    low: !!scan && key in conf && (conf[key as keyof FlyerFields] ?? 1) < LOW,
    missing: !!scan && missing.has(key),
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Scan a flyer', presentation: 'modal' }} />
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {stage === 'pick' && (
            <>
              <View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface }}>
                <Text style={{ fontSize: 48 }}>📸</Text>
                <Text style={s.cardTitle}>Saw a flyer? Post it in 10 seconds.</Text>
                <Text style={[s.cardMeta, { textAlign: 'center' }]}>AI fills in the details. You check them before anything is posted.</Text>
                <Button title="Take a photo" onPress={() => pick(true)} style={{ alignSelf: 'stretch', marginTop: spacing.sm }} />
                <Button title="Choose from library" kind="secondary" onPress={() => pick(false)} style={{ alignSelf: 'stretch' }} />
              </View>
              <Pressable onPress={() => setStage('form')} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }} accessibilityRole="button">
                <Text style={{ color: colors.cardinal, fontWeight: '700' }}>No flyer? Enter the details yourself</Text>
              </Pressable>
            </>
          )}

          {stage === 'reading' && (
            <View style={{ gap: spacing.lg, alignItems: 'center' }}>
              {preview && <Image source={{ uri: preview }} style={{ width: '100%', height: 320, borderRadius: radius.lg }} resizeMode="contain" accessibilityLabel="Your flyer" />}
              <Text style={s.h1}>Reading your flyer…</Text>
              {STEPS.map((label, i) => (
                <View key={label} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', alignSelf: 'stretch' }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: i < step ? colors.success : i === step ? colors.gold : colors.line }}>
                    <Text style={{ fontWeight: '700', color: i < step ? '#fff' : colors.ink }}>{i < step ? '✓' : i + 1}</Text>
                  </View>
                  <Text style={{ color: i <= step ? colors.ink : colors.muted, fontWeight: i <= step ? '700' : '400' }}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          {stage === 'form' && (
            <>
              {preview && <Image source={{ uri: preview }} style={{ width: '100%', height: 180, borderRadius: radius.lg }} resizeMode="cover" accessibilityLabel="Your flyer" />}
              {scan && (
                <View style={[s.card, { flexDirection: 'column' }]}>
                  <Text style={s.cardTitle}>✨ AI filled {Object.keys(conf).length} fields</Text>
                  <Text style={s.cardMeta}>
                    {Object.values(conf).some((v) => (v ?? 1) < LOW) ? 'Highlighted fields look uncertain. Give them a quick check.' : 'Everything read clearly. Still, take a look before posting.'}
                  </Text>
                </View>
              )}
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'event', label: '📅 Event' },
                  { value: 'deal', label: '🎁 Deal' },
                ]}
              />

              {duplicate && (
                <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gold, backgroundColor: '#FFF8DB', padding: spacing.md, gap: spacing.sm }} accessibilityRole="alert">
                  <Text style={s.cardTitle}>👀 This might already be posted</Text>
                  <Text style={{ color: colors.ink }}>
                    We found <Text style={{ fontWeight: '700' }}>{duplicate.title}</Text>. Posting it twice splits the RSVPs.
                  </Text>
                  <Button title="View existing event" onPress={() => router.replace({ pathname: '/events/[id]', params: { id: duplicate.id } })} />
                  <Button title="It's different, post anyway" kind="secondary" onPress={() => submit(true)} busy={saving} />
                </View>
              )}

              <Field label="Title" {...flag('title')}>
                <TextInput value={form.title} onChangeText={(v) => set('title', v)} style={s.input} />
              </Field>
              <Field label={kind === 'event' ? 'Starts (YYYY-MM-DD HH:MM)' : 'Starts (optional)'} {...flag('starts_at')}>
                <TextInput value={form.starts_at.replace('T', ' ')} onChangeText={(v) => set('starts_at', v.replace(' ', 'T'))} placeholder="2026-11-20 19:00" placeholderTextColor={colors.muted} style={s.input} />
              </Field>
              <Field label={kind === 'event' ? 'Ends' : 'Expires'} {...flag('ends_at')}>
                <TextInput value={form.ends_at.replace('T', ' ')} onChangeText={(v) => set('ends_at', v.replace(' ', 'T'))} placeholder="2026-11-20 21:00" placeholderTextColor={colors.muted} style={s.input} />
              </Field>

              {kind === 'event' ? (
                <>
                  <Field label="Where" {...flag('location_text')}>
                    <TextInput value={form.location_text} onChangeText={(v) => set('location_text', v)} placeholder="e.g. TCC 450" placeholderTextColor={colors.muted} style={s.input} />
                  </Field>
                  <Field label="Hosted by" {...flag('org_name')}>
                    <TextInput value={form.org_name} onChangeText={(v) => set('org_name', v)} placeholder="Org or office" placeholderTextColor={colors.muted} style={s.input} />
                  </Field>
                  <Field label="Category" {...flag('category')}>
                    <View style={s.chips}>
                      {CATEGORIES.map((c) => (
                        <Pressable
                          key={c.value}
                          onPress={() => set('category', c.value)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: form.category === c.value }}
                          style={{ minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', borderColor: form.category === c.value ? colors.cardinal : colors.line, backgroundColor: form.category === c.value ? colors.cardinal : colors.surface }}>
                          <Text style={{ fontWeight: '700', fontSize: fontSize.sm, color: form.category === c.value ? '#fff' : colors.ink }}>
                            {c.emoji} {c.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </Field>
                  <Toggle label="Free to attend" value={form.is_free} onChange={(v) => set('is_free', v)} {...flag('is_free')} />
                  <Toggle label="They give stuff away 🎁" value={form.has_freebie} onChange={(v) => set('has_freebie', v)} {...flag('has_freebie')} />
                  {form.has_freebie && (
                    <Field label="What's free?" {...flag('freebie_desc')}>
                      <TextInput value={form.freebie_desc} onChangeText={(v) => set('freebie_desc', v)} placeholder="Free pizza and boba" placeholderTextColor={colors.muted} style={s.input} />
                    </Field>
                  )}
                  <Field label="RSVP / register link" {...flag('register_url')}>
                    <TextInput value={form.register_url} onChangeText={(v) => set('register_url', v)} placeholder="https://…" autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={s.input} />
                  </Field>
                  <Field label="Ticket link" {...flag('ticket_url')}>
                    <TextInput value={form.ticket_url} onChangeText={(v) => set('ticket_url', v)} placeholder="https://…" autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={s.input} />
                  </Field>
                  {(form.ticket_url || form.tickets_open_at) && (
                    <Field label="Tickets go on sale (YYYY-MM-DD HH:MM)" {...flag('tickets_open_at')}>
                      <TextInput value={form.tickets_open_at.replace('T', ' ')} onChangeText={(v) => set('tickets_open_at', v.replace(' ', 'T'))} placeholderTextColor={colors.muted} style={s.input} />
                    </Field>
                  )}
                </>
              ) : (
                <>
                  <Field label="How to claim" {...flag('how_to_claim')}>
                    <TextInput value={form.how_to_claim} onChangeText={(v) => set('how_to_claim', v)} placeholder="Show your USCard" placeholderTextColor={colors.muted} style={s.input} />
                  </Field>
                  <Field label="Link" {...flag('register_url')}>
                    <TextInput value={form.register_url} onChangeText={(v) => set('register_url', v)} placeholder="https://…" autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={s.input} />
                  </Field>
                </>
              )}
              <Field label="Description" {...flag('description')}>
                <TextInput value={form.description} onChangeText={(v) => set('description', v)} multiline style={[s.input, { minHeight: 88, paddingTop: spacing.sm }]} />
              </Field>

              {error && (
                <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                  {error}
                </Text>
              )}
              <Button title={kind === 'event' ? 'Post event' : 'Post deal'} onPress={() => submit()} busy={saving} />
              <Button title="Cancel" kind="secondary" onPress={() => router.back()} />
            </>
          )}
          {stage === 'pick' && error && (
            <Text accessibilityRole="alert" style={{ color: colors.danger }}>
              {error}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Field({ label, ai, low, missing, children }: { label: string; ai?: boolean; low?: boolean; missing?: boolean; children: React.ReactNode }) {
  return (
    <View style={[{ gap: spacing.xs }, low && { backgroundColor: '#FFF3CD', padding: spacing.sm, borderRadius: radius.md, borderWidth: 2, borderColor: '#F0B429' }]}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        <Text style={s.label}>{label}</Text>
        {ai && !low && <Text style={{ fontSize: fontSize.xs, color: colors.cardinal, fontWeight: '700' }}>✨ from flyer</Text>}
        {low && <Text style={{ fontSize: fontSize.xs, color: '#8A5A00', fontWeight: '700' }}>⚠ Double-check</Text>}
        {missing && <Text style={{ fontSize: fontSize.xs, color: colors.muted }}>Not on the flyer</Text>}
      </View>
      {children}
    </View>
  );
}

function Toggle({ label, value, onChange, ai, low }: { label: string; value: boolean; onChange: (v: boolean) => void; ai?: boolean; low?: boolean; missing?: boolean }) {
  return (
    <View style={[s.card, { alignItems: 'center', justifyContent: 'space-between' }, low && { borderColor: '#F0B429', borderWidth: 2, backgroundColor: '#FFF3CD' }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{label}</Text>
        {ai && <Text style={{ fontSize: fontSize.xs, color: low ? '#8A5A00' : colors.cardinal, fontWeight: '700' }}>{low ? '⚠ Double-check' : '✨ from flyer'}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.cardinal }} accessibilityLabel={label} />
    </View>
  );
}
