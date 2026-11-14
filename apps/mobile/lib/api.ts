// The one API client for the app. Import `api` from '@/lib/api' in any screen.
import { createApi } from '@trojanhub/shared/api';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';

import { getAccessToken } from './supabase';

/**
 * EXPO_PUBLIC_API_URL if set. Otherwise guess the laptop running `expo start`
 * (same Wi-Fi) on port 8000, so a phone in Expo Go reaches the local AI service.
 */
function apiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:8000` : 'http://localhost:8000';
}

export const API_URL = apiUrl();

export const api = createApi({
  baseUrl: API_URL,
  getToken: getAccessToken,
  // expo/fetch can stream response bodies (needed for chat); RN's global fetch can't
  fetch: expoFetch as unknown as typeof fetch,
});
