// P4 Jaymin: sign in with a 6-digit code emailed to an @usc.edu address.
// (A code works on phones without deep-link setup. The Supabase email template must include {{ .Token }}.)
import { colors, fontSize, minTapTarget, radius, spacing } from '@trojanhub/shared/theme';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setSignedInAs(data.session?.user.email ?? null));
  }, []);

  if (!supabase) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Mock mode</Text>
        <Text style={styles.body}>
          Supabase isn't configured yet, so you're using the app as the demo user. Set EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env to turn on login.
        </Text>
      </View>
    );
  }
  const client = supabase;

  async function sendCode() {
    const clean = email.trim().toLowerCase();
    if (!clean.endsWith('@usc.edu')) return setMessage('TrojanHub is for Trojans: use your @usc.edu email.');
    setBusy(true);
    const { error } = await client.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage(`We emailed a 6-digit code to ${clean}.`);
    setStep('code');
  }

  async function verify() {
    setBusy(true);
    const { error } = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) return setMessage(error.message);
    router.replace('/home');
  }

  async function signOut() {
    await client.auth.signOut();
    setSignedInAs(null);
  }

  if (signedInAs) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Signed in</Text>
        <Text style={styles.body}>{signedInAs}</Text>
        <Pressable style={styles.button} onPress={signOut} accessibilityRole="button">
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Sign in to TrojanHub</Text>
      {step === 'email' ? (
        <TextInput
          style={styles.input}
          placeholder="ttrojan@usc.edu"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="USC email"
        />
      ) : (
        <TextInput
          style={styles.input}
          placeholder="6-digit code"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          accessibilityLabel="Code from email"
        />
      )}
      <Pressable style={styles.button} onPress={step === 'email' ? sendCode : verify} disabled={busy} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{step === 'email' ? 'Email me a code' : 'Sign in'}</Text>}
      </Pressable>
      {message && <Text style={styles.body}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.xl, gap: spacing.md, justifyContent: 'center', backgroundColor: colors.background },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.muted },
  input: { minHeight: minTapTarget, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: fontSize.md, backgroundColor: colors.surface },
  button: { minHeight: minTapTarget, backgroundColor: colors.cardinal, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: fontSize.md },
});
