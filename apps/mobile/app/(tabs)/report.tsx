// P4 Jaymin: Report a problem. Describe it -> the AI drafts the office and urgency -> check and
// send. Same report as Tommy's file_complaint, from a form (source "form"). Below: My reports.
import type {
  ComplaintConfirmResponse,
  ComplaintDraftResponse,
  ComplaintRequest,
  Department,
  MyComplaintsResponse,
  TicketStatus,
  Urgency,
} from '@trojanhub/shared/types';
import { ApiRequestError } from '@trojanhub/shared/api';
import { colors, fontSize, minTapTarget, radius, spacing } from '@trojanhub/shared/theme';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const DEPARTMENT_LABEL: Record<Department, string> = {
  Facilities: 'Facilities (FPM)',
  Housing: 'Housing',
  ITS: 'IT Services (ITS)',
  Transportation: 'Transportation',
  DPS: 'Public Safety (DPS)',
};
const URGENCY_COLOR: Record<Urgency, string> = { safety: colors.danger, high: colors.cardinal, medium: colors.warning, low: colors.muted };
const STATUS_LABEL: Record<TicketStatus, string> = { reported: 'Reported', sent: 'Sent to the office', resolved: 'Resolved' };
const MAX_CHARS = 2000; // services/ai/app/complaints/routes.py MAX_TEXT_CHARS
const MAX_PHOTO_CHARS = 6_500_000; // ~5 MB once decoded, the API's limit

type Mine = MyComplaintsResponse['complaints'];

const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiRequestError && e.status === 401
    ? 'Sign in with your @usc.edu email to report a problem.'
    : e instanceof ApiRequestError
      ? e.message
      : fallback;

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Camera or library, as a data: URL (the API stores it privately). null if cancelled. */
async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera' && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access is off. Turn it on in Settings, or choose a photo instead.');
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (asset.uri.startsWith('data:')) return asset.uri; // web returns a data: URL already
  if (!asset.base64) throw new Error("We couldn't read that photo. Try another one.");
  const url = `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
  if (url.length > MAX_PHOTO_CHARS) throw new Error('That photo is too large. Try a smaller one.');
  return url;
}

export default function ReportScreen() {
  const [signedIn, setSignedIn] = useState<boolean | null>(supabase ? null : true);
  const [text, setText] = useState('');
  const [building, setBuilding] = useState('');
  const [room, setRoom] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComplaintDraftResponse | null>(null);
  const [sent, setSent] = useState<ComplaintConfirmResponse | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);

  const loadMine = useCallback(() => {
    api.complaints
      .mine()
      .then((r) => setMine(r.complaints))
      .catch(() => setMine([]));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);

  // Re-check on every visit: the student may have just signed in on the account screen.
  useFocusEffect(
    useCallback(() => {
      if (!supabase) return loadMine();
      supabase.auth.getSession().then(({ data }) => {
        setSignedIn(!!data.session);
        if (data.session) loadMine();
      });
    }, [loadMine]),
  );

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setDraft(null);
  };

  const request = (): ComplaintRequest => ({
    text: text.trim(),
    building: building.trim() || undefined,
    room: room.trim() || undefined,
    anonymous,
    source: 'form',
    photo: photo ?? undefined,
  });

  async function addPhoto(source: 'camera' | 'library') {
    setError(null);
    try {
      const url = await pickPhoto(source);
      if (url) {
        setPhoto(url);
        setDraft(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function check() {
    if (!text.trim()) return setError('Describe the problem in a sentence.');
    setBusy(true);
    setError(null);
    try {
      setDraft(await api.complaints.draft(request()));
    } catch (e) {
      setError(errorText(e, "Couldn't check your report right now. Is the AI service running?"));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setSent(await api.complaints.confirm(request()));
      loadMine();
    } catch (e) {
      setError(errorText(e, "Couldn't send your report right now. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setText('');
    setBuilding('');
    setRoom('');
    setAnonymous(false);
    setPhoto(null);
    setDraft(null);
    setSent(null);
    setError(null);
  }

  if (signedIn === null) return <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.cardinal} />;

  if (signedIn === false) {
    return (
      <View style={s.screen}>
        <Text style={s.h1}>Report a problem</Text>
        <View style={s.card}>
          <Text style={s.body}>Sign in with your @usc.edu email to report a problem on campus.</Text>
          <Button label="Sign in" onPress={() => router.push('/auth/login')} />
          <Text style={s.muted}>
            Emergency? Call DPS at{' '}
            <Text style={s.link} onPress={() => Linking.openURL('tel:+12137404321')}>
              (213) 740-4321
            </Text>
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <View style={{ gap: spacing.xs }}>
        <Text style={s.h1}>Report a problem</Text>
        <Text style={s.muted}>Broken AC, a leak, Wi-Fi down… Say what&apos;s wrong and where. Our AI picks the right USC office.</Text>
      </View>

      {sent ? (
        <SentCard sent={sent} onAgain={startOver} />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Field label="What's wrong?">
            <TextInput
              value={text}
              onChangeText={edit(setText)}
              multiline
              maxLength={MAX_CHARS}
              placeholder="e.g. It's really hot in GFS 213, the AC isn't working"
              placeholderTextColor={colors.muted}
              style={[s.input, { minHeight: 100, textAlignVertical: 'top' }]}
              accessibilityLabel="What's wrong?"
            />
          </Field>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 2 }}>
              <Field label="Building (optional)">
                <TextInput value={building} onChangeText={edit(setBuilding)} placeholder="e.g. GFS" placeholderTextColor={colors.muted} style={s.input} accessibilityLabel="Building" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Room (optional)">
                <TextInput value={room} onChangeText={edit(setRoom)} placeholder="e.g. 213" placeholderTextColor={colors.muted} style={s.input} accessibilityLabel="Room" />
              </Field>
            </View>
          </View>

          <Field label="Photo (optional; only the office and admins see it)">
            {photo && <Image source={{ uri: photo }} style={s.photo} accessibilityLabel="Your photo of the problem" />}
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {Platform.OS !== 'web' && <Button label="Take photo" kind="secondary" onPress={() => addPhoto('camera')} />}
              <Button label={photo ? 'Choose another' : 'Choose photo'} kind="secondary" onPress={() => addPhoto('library')} />
              {photo && <Button label="Remove" kind="secondary" onPress={() => setPhoto(null)} />}
            </View>
          </Field>

          <View style={s.switchRow}>
            <Switch value={anonymous} onValueChange={setAnonymous} trackColor={{ true: colors.cardinal }} accessibilityLabel="Report anonymously" />
            <Text style={[s.body, { flex: 1 }]}>
              Report anonymously <Text style={s.muted}>(it won&apos;t show in My reports)</Text>
            </Text>
          </View>

          {!!error && <Text style={s.error}>{error}</Text>}

          {draft ? (
            <DraftCard draft={draft} busy={busy} onSend={send} />
          ) : (
            <Button label={busy ? 'Reading your report…' : 'Check my report'} onPress={check} disabled={busy} />
          )}
        </View>
      )}

      <View style={{ gap: spacing.sm }}>
        <Text style={s.h2}>My reports</Text>
        {mine === null ? (
          <ActivityIndicator color={colors.cardinal} />
        ) : mine.length === 0 ? (
          <Text style={s.muted}>Nothing yet. Reports you send (here or through Tommy) show up here with their status.</Text>
        ) : (
          mine.map(({ complaint: c, ticket: t }) => {
            const office = c.corrected_department ?? c.ai_department ?? t?.department;
            return (
              <View key={c.id} style={[s.card, { gap: spacing.xs }]}>
                <Text style={s.title}>{t?.summary ?? c.raw_text}</Text>
                {t && <Text style={[s.badge, t.status === 'resolved' && { backgroundColor: colors.success, color: '#fff' }]}>{STATUS_LABEL[t.status]}</Text>}
                <Text style={s.muted}>
                  {when(c.created_at)}
                  {office ? ` · ${DEPARTMENT_LABEL[office]}` : ''}
                  {t && t.report_count > 1 ? ` · ${t.report_count} reports` : ''}
                  {c.source === 'chat' ? ' · via Tommy' : ''}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function DraftCard({ draft: res, busy, onSend }: { draft: ComplaintDraftResponse; busy: boolean; onSend: () => void }) {
  if (res.safety) {
    const phone = res.safety.dps_phone;
    return (
      <View style={[s.card, { borderColor: colors.danger, borderWidth: 2 }]} accessibilityRole="alert">
        <Text style={[s.title, { color: colors.danger }]}>This sounds like a safety issue.</Text>
        <Text style={s.body}>{res.safety.message}</Text>
        <Button label={`Call DPS ${phone}`} danger onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} />
        <Text style={s.muted}>We don&apos;t file safety issues as tickets: a ticket is too slow. In an emergency call 911.</Text>
      </View>
    );
  }
  const d = res.draft;
  const where = [d.building, d.room].filter(Boolean).join(' ');
  return (
    <View style={s.card}>
      <Text style={s.label}>CHECK BEFORE SENDING</Text>
      <Text style={s.title}>{DEPARTMENT_LABEL[d.department]}</Text>
      <Text style={{ color: URGENCY_COLOR[d.urgency], fontWeight: '700', fontSize: fontSize.sm }}>{d.urgency} urgency</Text>
      <Text style={s.body}>{d.summary}</Text>
      {!!where && <Text style={s.muted}>Where: {where}</Text>}
      <Text style={s.muted}>Why this office: {d.reason}</Text>
      {res.duplicate_ticket && (
        <Text style={s.note}>
          {res.duplicate_ticket.report_count === 1 ? '1 student has' : `${res.duplicate_ticket.report_count} students have`} already reported this.
          Sending adds your report to the same ticket.
        </Text>
      )}
      <Button
        label={busy ? 'Sending…' : res.duplicate_ticket ? 'Add my report' : `Send to ${DEPARTMENT_LABEL[d.department]}`}
        onPress={onSend}
        disabled={busy}
      />
      <Text style={s.muted}>Not right? Change your description above and check again.</Text>
    </View>
  );
}

function SentCard({ sent, onAgain }: { sent: ComplaintConfirmResponse; onAgain: () => void }) {
  const t = sent.ticket;
  return (
    <View style={[s.card, { borderColor: colors.success }]} accessibilityLiveRegion="polite">
      <Text style={s.title}>Sent. Thank you!</Text>
      <Text style={s.body}>
        Your report is with <Text style={{ fontWeight: '700' }}>{DEPARTMENT_LABEL[t.department]}</Text>: {t.summary}
      </Text>
      <Text style={s.muted}>
        {t.report_count > 1 ? `${t.report_count} reports on this ticket. ` : ''}Status: {STATUS_LABEL[t.status]}.
        {sent.photo_saved ? ' Your photo was attached.' : ''}
      </Text>
      {!!sent.route_url && (
        <Text style={s.link} onPress={() => Linking.openURL(sent.route_url!)}>
          Open the office&apos;s own request page
        </Text>
      )}
      <Button label="Report something else" kind="secondary" onPress={onAgain} />
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Button({ label, onPress, disabled, kind = 'primary', danger }: { label: string; onPress: () => void; disabled?: boolean; kind?: 'primary' | 'secondary'; danger?: boolean }) {
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.button,
        primary ? { backgroundColor: danger ? colors.danger : pressed ? colors.cardinalDark : colors.cardinal } : s.buttonSecondary,
        disabled && { opacity: 0.6 },
      ]}>
      <Text style={{ color: primary ? '#fff' : colors.ink, fontWeight: '700', fontSize: fontSize.md }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.xl, backgroundColor: colors.background, flexGrow: 1 },
  h1: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.ink },
  h2: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  label: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },
  fieldLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  link: { color: colors.cardinal, textDecorationLine: 'underline', fontSize: fontSize.md },
  error: { color: colors.danger, fontSize: fontSize.sm },
  note: { backgroundColor: '#FFF3BF', padding: spacing.md, borderRadius: radius.sm, color: colors.ink, fontSize: fontSize.sm },
  input: { minHeight: minTapTarget, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.md, color: colors.ink },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  photo: { width: 140, height: 140, borderRadius: radius.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: minTapTarget },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.line, color: colors.ink, fontSize: fontSize.xs, fontWeight: '700', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  button: { minHeight: minTapTarget, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
});
