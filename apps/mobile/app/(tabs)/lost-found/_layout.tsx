// P2 Vishwa: Lost & Found stack. The tab bar header titles the home screen; inner screens get a
// back button.
import { colors } from '@trojanhub/shared/theme';
import { Stack } from 'expo-router';

export default function LostFoundLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: colors.cardinal, headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="report" options={{ title: 'I found something' }} />
      <Stack.Screen name="[id]" options={{ title: 'Item' }} />
    </Stack>
  );
}
