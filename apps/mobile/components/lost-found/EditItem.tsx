// P2 Vishwa: the finder edits their post: photo, "What is it?" and "Where did you find it?".
import type { Item } from '@trojanhub/shared';
import { colors, radius, spacing } from '@trojanhub/shared/theme';
import { useState } from 'react';
import { Image, Text, TextInput, View } from 'react-native';

import { type ItemChanges, type PickedPhoto, editItem, pickPhoto } from './data';
import { Button, ErrorNote, ItemPhoto, s } from './ui';

export function EditItem({ item, onSaved, onCancel }: { item: Item; onSaved: (item: Item) => void; onCancel: () => void }) {
  const [description, setDescription] = useState(item.description ?? '');
  const [where, setWhere] = useState(item.location_text ?? '');
  const [newPhoto, setNewPhoto] = useState<PickedPhoto | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPhoto = !!newPhoto || (!!item.photo_url && !removePhoto);

  async function choose(source: 'camera' | 'library') {
    setError(null);
    try {
      const p = await pickPhoto(source);
      if (p) {
        setNewPhoto(p);
        setRemovePhoto(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    if (!where.trim()) return setError('Say where you found it, e.g. Leavey Library, 2nd floor.');
    if (!hasPhoto && !description.trim()) return setError('Add a short description, or keep a photo.');
    const changes: ItemChanges = {};
    if (description.trim() !== (item.description ?? '')) changes.description = description.trim();
    if (where.trim() !== (item.location_text ?? '')) changes.location_text = where.trim();
    if (newPhoto) changes.photo = newPhoto.file;
    else if (removePhoto) changes.remove_photo = true;
    if (!Object.keys(changes).length) return onCancel();
    setBusy(true);
    setError(null);
    try {
      onSaved(await editItem(item.id, changes));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[s.card, { borderColor: colors.cardinal, borderWidth: 1 }]}>
      <Text style={s.title}>Edit your post</Text>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        {newPhoto ? (
          <Image source={{ uri: newPhoto.uri }} style={{ width: 96, height: 96, borderRadius: radius.md }} accessibilityLabel="New photo" />
        ) : hasPhoto ? (
          <ItemPhoto item={item} size={96} />
        ) : (
          <View style={[s.noPhoto, { width: 96, height: 96 }]}>
            <Text style={s.small}>No photo</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Button label={hasPhoto ? 'Retake photo' : 'Take photo'} kind="secondary" onPress={() => choose('camera')} />
          <Button label="Choose photo" kind="secondary" onPress={() => choose('library')} />
          {hasPhoto ? (
            <Button
              label={newPhoto && item.photo_url ? 'Keep old photo' : 'Remove photo'}
              kind="secondary"
              onPress={() => (newPhoto ? setNewPhoto(null) : setRemovePhoto(true))}
            />
          ) : removePhoto ? (
            <Button label="Undo remove" kind="secondary" onPress={() => setRemovePhoto(false)} />
          ) : null}
        </View>
      </View>
      <Text style={s.title}>What is it?</Text>
      <TextInput value={description} onChangeText={setDescription} accessibilityLabel="What is it?" placeholderTextColor={colors.muted} style={s.input} />
      <Text style={s.title}>Where did you find it?</Text>
      <TextInput value={where} onChangeText={setWhere} accessibilityLabel="Where did you find it?" placeholderTextColor={colors.muted} style={s.input} />
      {error && <ErrorNote message={error} />}
      <Button label={busy ? 'Saving…' : 'Save changes'} onPress={save} busy={busy} />
      <Button label="Cancel" kind="secondary" onPress={onCancel} disabled={busy} />
    </View>
  );
}
