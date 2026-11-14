// Photo for Tommy: camera or library. Uploads to Supabase Storage ("photos" bucket) when logged
// in; otherwise sends it inline as a data: URL (the AI service swaps it for a short reference
// before the LLM sees it).
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import type { Photo } from './useTommy';

const OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };

async function fromCamera(): Promise<ImagePicker.ImagePickerResult | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Camera access is off', 'Turn it on in Settings, or choose a photo from your library.');
    return null;
  }
  return ImagePicker.launchCameraAsync(OPTIONS);
}

function chooseSource(): Promise<'camera' | 'library' | null> {
  if (Platform.OS === 'web') return Promise.resolve('library'); // Alert has no buttons on web
  return new Promise((resolve) =>
    Alert.alert('Add a photo', 'A flyer, or something you found', [
      { text: 'Take photo', onPress: () => resolve('camera') },
      { text: 'Choose from library', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) }),
  );
}

async function upload(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  try {
    const bytes = await (await fetch(asset.uri)).arrayBuffer();
    const path = `chat/${uid}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('photos').upload(path, bytes, { contentType: asset.mimeType ?? 'image/jpeg' });
    return error ? null : supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

/** Ask for a photo. Returns null if the student cancels. */
export async function pickPhoto(): Promise<Photo | null> {
  const source = await chooseSource();
  if (!source) return null;
  const result = source === 'camera' ? await fromCamera() : await ImagePicker.launchImageLibraryAsync(OPTIONS);
  if (!result || result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const uploaded = await upload(asset);
  if (uploaded) return { url: uploaded, previewUri: asset.uri };
  if (!asset.base64) throw new Error("Couldn't read that photo");
  return { url: `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`, previewUri: asset.uri };
}
