// Photo for Tommy: camera or library, sent inline as a data: URL. The AI service decides where it
// goes (a found item's photo becomes public in Lost & Found; a complaint photo goes to a private
// bucket only staff can see), so the app never uploads it to a public bucket itself.
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

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
    Alert.alert('Add a photo', 'A problem to report, a flyer, or something you found', [
      { text: 'Take photo', onPress: () => resolve('camera') },
      { text: 'Choose from library', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) }),
  );
}

/** Ask for a photo. Returns null if the student cancels. */
export async function pickPhoto(): Promise<Photo | null> {
  const source = await chooseSource();
  if (!source) return null;
  const result = source === 'camera' ? await fromCamera() : await ImagePicker.launchImageLibraryAsync(OPTIONS);
  if (!result || result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (!asset.base64) throw new Error("Couldn't read that photo");
  return { url: `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`, previewUri: asset.uri };
}
