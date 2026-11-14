// Tab bar (P4 owns the shell; each tab's screen belongs to its feature owner).
import { Link, Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable } from 'react-native';

import Colors from '@/constants/Colors';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';

type Icon = SymbolViewProps['name'];

const TABS: { name: string; title: string; icon: Icon }[] = [
  { name: 'home', title: 'Home', icon: { ios: 'house.fill', android: 'home', web: 'home' } },
  { name: 'chat', title: 'Tommy', icon: { ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' } },
  { name: 'lost-found', title: 'Lost & Found', icon: { ios: 'magnifyingglass', android: 'search', web: 'search' } },
  { name: 'events', title: 'Events', icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' } },
  { name: 'report', title: 'Report', icon: { ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' } },
];

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.tint,
        // Disable the static render of the header on web to prevent a hydration error.
        headerShown: useClientOnlyValue(false, true),
        headerRight: () => (
          <Link href="/auth/login" asChild>
            <Pressable accessibilityLabel="Account" hitSlop={12} style={{ marginRight: 16 }}>
              <SymbolView name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }} size={26} tintColor={palette.text} />
            </Pressable>
          </Link>
        ),
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ color }) => <SymbolView name={t.icon} tintColor={color} size={26} />,
          }}
        />
      ))}
    </Tabs>
  );
}
