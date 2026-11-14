# apps/mobile: Expo app

Expo SDK 58 + Expo Router (tabs). Shell owner: **Jaymin (P4)**. Each tab belongs to its feature owner.

```bash
npm install                      # once, from the repo root
cp apps/mobile/.env.example apps/mobile/.env
npm run mobile                   # from the repo root, then scan the QR with Expo Go
```

The app finds the AI service on its own: it uses the laptop running `expo start`, port 8000.
Run the AI service with `--host 0.0.0.0` so your phone can reach it over the same Wi-Fi.
Set `EXPO_PUBLIC_API_URL` to override that.

| Tab | File | Owner |
|---|---|---|
| Home | `app/(tabs)/home.tsx` | P3 Parnavi (feed) |
| Tommy | `app/(tabs)/chat.tsx` | P1 Naman |
| Lost & Found | `app/(tabs)/lost-found/` (stack: add `[id].tsx`, `report.tsx`…) | P2 Vishwa |
| Events | `app/(tabs)/events/` (stack: events, deals, rewards, flyer scan) | P3 Parnavi |
| Report | `app/(tabs)/report.tsx` | P4 Jaymin |
| Account | `app/auth/login.tsx` (email code, @usc.edu only) | P4 Jaymin |

## How to build your screen

- Replace the `<Placeholder>` with real UI. Keep the `api.*` call. It already returns typed mock data.
- API client: `import { api } from '@/lib/api'` (uses `expo/fetch`, so chat streaming works).
  Types: `import type { Item } from '@trojanhub/shared'`. Theme: `import { colors, spacing } from '@trojanhub/shared/theme'`.
- Add native packages with `npx expo install <pkg>` (not `npm install`) so the versions match the SDK.
  Examples: `expo-image-picker`, `expo-camera`, `expo-notifications`, `react-native-maps`.
- Expo changes fast. Check the versioned docs for SDK 58 (see `AGENTS.md`).
- Before you push: `npx tsc --noEmit` in `apps/mobile`.
