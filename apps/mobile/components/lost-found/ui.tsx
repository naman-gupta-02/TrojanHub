// P2 Vishwa: small shared pieces for the Lost & Found screens.
import type { Building, DropoffInfo, Item, ItemTier } from '@trojanhub/shared';
import { colors, fontSize, minTapTarget, radius, spacing } from '@trojanhub/shared/theme';
import { Link, router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { matchLabel, placeMapLink, timeAgo, whereFound } from './data';

/** Where the item is now: 'valuable' = taken to DPS, 'everyday' = left where it was found. */
export function TierBadge({ tier }: { tier: ItemTier }) {
  const valuable = tier === 'valuable';
  return (
    <View style={[s.badge, { backgroundColor: valuable ? colors.valuable : colors.everyday }]}>
      <Text style={s.badgeText}>{valuable ? 'At DPS' : 'Left where found'}</Text>
    </View>
  );
}

/** The finder's choice: taken to DPS, or left where found. The AI's suggestion is pre-selected. */
export function WhereNowChoice({ tier, onChange, busy }: { tier: ItemTier; onChange: (t: ItemTier) => void; busy?: boolean }) {
  const options: { value: ItemTier; title: string; hint: string }[] = [
    { value: 'valuable', title: "I'm taking it to DPS Lost & Found", hint: 'Best for phones, wallets, IDs, keys, AirPods. DPS checks who really owns it.' },
    { value: 'everyday', title: 'I left it where I found it', hint: 'Owners will see the place you wrote and go there.' },
  ];
  return (
    <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel="Where is the item now?">
      <Text style={s.title}>Where is the item now?</Text>
      {options.map((o) => {
        const selected = tier === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: !!busy }}
            aria-checked={selected} // the aria-* props also reach screen readers on web (accessibilityState doesn't)
            aria-disabled={!!busy}
            style={[s.card, { borderWidth: 2, borderColor: selected ? colors.cardinal : colors.line, flexDirection: 'row', alignItems: 'flex-start' }]}>
            <View style={[s.radio, selected && { borderColor: colors.cardinal }]}>{selected ? <View style={s.radioDot} /> : null}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.title}>{o.title}</Text>
              <Text style={s.muted}>{o.hint}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** For items the finder left where they found them. */
export function LeftHereCard({ item, buildings, title, children }: { item: Item; buildings: Record<string, Building>; title: string; children?: ReactNode }) {
  return (
    <View style={[s.dropoff, { borderColor: colors.everyday }]}>
      <Text style={[s.title, { color: colors.everyday }]}>{title}</Text>
      <Text style={{ fontWeight: '700', fontSize: fontSize.lg, color: colors.ink }}>{whereFound(item, buildings)}</Text>
      {children}
      <Pressable
        onPress={() => Linking.openURL(placeMapLink(item, buildings))}
        accessibilityRole="link"
        style={({ pressed }) => [s.button, { backgroundColor: colors.everyday }, pressed && { opacity: 0.7 }]}>
        <Text style={[s.buttonText, { color: '#fff' }]}>Open in Maps</Text>
      </Pressable>
    </View>
  );
}

export function ItemPhoto({ item, size }: { item: Pick<Item, 'photo_url' | 'title' | 'tier'>; size: number }) {
  if (!item.photo_url && item.tier === 'valuable') {
    // Items at DPS: the photo is hidden so only the real owner can describe it (see forViewer)
    return (
      <View style={[s.noPhoto, { width: size, height: size, gap: 2 }]} accessibilityLabel="Photo hidden to protect the owner">
        <Text style={{ fontSize: size > 100 ? 28 : 18 }}>🔒</Text>
        <Text style={{ color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' }}>Details hidden</Text>
      </View>
    );
  }
  if (item.photo_url) {
    return <Image source={{ uri: item.photo_url }} style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.line }} accessibilityLabel={item.title} />;
  }
  return (
    <View style={[s.noPhoto, { width: size, height: size }]} accessibilityLabel="No photo">
      <Text style={{ color: colors.muted, fontSize: size > 100 ? fontSize.md : fontSize.xs }}>No photo</Text>
    </View>
  );
}

/** A tappable card. (Not <Link asChild>: it drops a Pressable's style function on web.) */
export function Card({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

export function ItemRow({ item, buildings, score }: { item: Item; buildings: Record<string, Building>; score?: number }) {
  return (
    <Card onPress={() => router.push(`/lost-found/${item.id}`)} label={`${item.title}, ${item.tier === 'valuable' ? 'at DPS' : 'left where found'}`}>
      <ItemPhoto item={item} size={84} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <TierBadge tier={item.tier} />
          {score !== undefined && <Text style={s.score}>{matchLabel(score)}</Text>}
        </View>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        <Text style={s.muted} numberOfLines={1}>{whereFound(item, buildings)}</Text>
        <Text style={s.small}>Found {timeAgo(item.created_at)}</Text>
      </View>
    </Card>
  );
}

export function Button({ label, onPress, kind = 'primary', busy, disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary'; busy?: boolean; disabled?: boolean }) {
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(busy || disabled), busy: !!busy }}
      aria-disabled={!!(busy || disabled)}
      aria-busy={!!busy}
      style={({ pressed }) => [s.button, primary ? s.primary : s.secondary, (pressed || busy || disabled) && { opacity: 0.7 }]}>
      {busy ? <ActivityIndicator color={primary ? '#fff' : colors.cardinal} /> : <Text style={[s.buttonText, { color: primary ? '#fff' : colors.ink }]}>{label}</Text>}
    </Pressable>
  );
}

export function DropoffCard({ dropoff, title, children }: { dropoff: DropoffInfo; title: string; children?: ReactNode }) {
  return (
    <View style={s.dropoff}>
      <Text style={[s.title, { color: colors.cardinal }]}>{title}</Text>
      {children}
      <Text style={{ fontWeight: '600', color: colors.ink }}>{dropoff.name}</Text>
      {dropoff.hours ? <Text style={s.muted}>Hours: {dropoff.hours}</Text> : null}
      <Button label="Open in Maps" onPress={() => Linking.openURL(dropoff.map)} />
      {dropoff.url ? <Button label="DPS Lost & Found page" kind="secondary" onPress={() => Linking.openURL(dropoff.url!)} /> : null}
    </View>
  );
}

export function SignInNotice({ what }: { what: string }) {
  return (
    <View style={s.card}>
      <Text style={{ color: colors.ink }}>Sign in with your USC email to {what}.</Text>
      <Link href="/auth/login" asChild>
        <Pressable accessibilityRole="link" style={{ minHeight: minTapTarget, justifyContent: 'center' }}>
          <Text style={{ color: colors.cardinal, fontWeight: '700' }}>Sign in</Text>
        </Pressable>
      </Link>
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={s.error} accessibilityRole="alert">
      <Text style={{ color: colors.danger }}>{message}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  h1: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.ink },
  h2: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  muted: { color: colors.muted, fontSize: fontSize.sm },
  small: { color: colors.muted, fontSize: fontSize.xs },
  score: { color: colors.success, fontWeight: '700', fontSize: fontSize.xs },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: fontSize.xs },
  noPhoto: { backgroundColor: colors.line, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  input: { minHeight: minTapTarget, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, fontSize: fontSize.md, color: colors.ink },
  button: { minHeight: minTapTarget, borderRadius: radius.sm, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.cardinal },
  secondary: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  buttonText: { fontWeight: '700', fontSize: fontSize.md },
  dropoff: { backgroundColor: colors.surface, borderColor: colors.cardinal, borderWidth: 2, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  error: { backgroundColor: '#FDECEE', borderRadius: radius.sm, padding: spacing.md },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cardinal },
});
