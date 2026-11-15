// P1 Naman: Tommy chat (streaming bubbles, source chips, confirm cards, camera).
// Opened from the floating "Chat with Tommy" button; `from` picks phrases for that page, `ask` sends one.
import {
  colors,
  fontSize,
  minTapTarget,
  radius,
  spacing,
} from "@trojanhub/shared/theme";
import { SymbolView } from "expo-symbols";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { promptsFor } from "@/components/chat/chatState";
import { Message } from "@/components/chat/Message";
import { pickPhoto } from "@/components/chat/photo";
import { useTommy, type Photo } from "@/components/chat/useTommy";
import { TommyAvatar } from "@/components/tommy/TommyAvatar";

export default function ChatScreen() {
  const { messages, busy, send, stop, confirm, reset } = useTommy();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const { from, ask } = useLocalSearchParams<{ from?: string; ask?: string }>();
  const prompts = promptsFor(from);
  const asked = useRef(false);

  useEffect(() => {
    if (ask && !asked.current) {
      asked.current = true; // the phrase tapped on the floating button
      send(ask);
    }
  }, [ask, send]);

  const canSend = !busy && !photoBusy && (text.trim().length > 0 || !!photo);

  function submit() {
    if (!canSend) return;
    send(text, photo ?? undefined);
    setText("");
    setPhoto(null);
  }

  async function addPhoto() {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const picked = await pickPhoto();
      if (picked) setPhoto(picked);
    } catch {
      setPhotoError("I couldn't read that photo. Try another one.");
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scroll}
        style={styles.list}
        contentContainerStyle={
          messages.length === 0 ? styles.emptyWrap : styles.listContent
        }
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.length === 0 ? (
          <>
            <TommyAvatar mood="winking" size={96} />
            <Text style={styles.hello}>Fight On! What do you need?</Text>
            <Text style={styles.sub}>
              Ask a question, report a problem, or snap a photo of a flyer or
              something you found.
            </Text>
            <View style={styles.prompts}>
              {prompts.map((p) => (
                <Pressable
                  key={p}
                  style={styles.prompt}
                  onPress={() => send(p)}
                  accessibilityRole="button"
                >
                  <Text style={styles.promptText}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            {messages.map((m) => (
              <Message
                key={m.id}
                msg={m}
                onConfirm={(actionId, approved, edits) =>
                  confirm(m.id, actionId, approved, edits)
                }
              />
            ))}
            {!busy && (
              <Pressable
                onPress={reset}
                style={styles.newChat}
                accessibilityRole="button"
              >
                <Text style={styles.newChatText}>Start a new chat</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      {(photo || photoBusy || photoError) && (
        <View style={styles.attachRow}>
          {photo && (
            <Image
              source={{ uri: photo.previewUri }}
              style={styles.thumb}
              accessibilityLabel="Attached photo"
            />
          )}
          {photo && (
            <Pressable
              onPress={() => setPhoto(null)}
              hitSlop={10}
              accessibilityRole="button"
            >
              <Text style={styles.remove}>Remove photo</Text>
            </Pressable>
          )}
          {photoBusy && <ActivityIndicator color={colors.cardinal} />}
          {!!photoError && <Text style={styles.photoError}>{photoError}</Text>}
        </View>
      )}

      <View style={styles.composer}>
        <Pressable
          onPress={addPhoto}
          style={styles.iconButton}
          disabled={photoBusy}
          accessibilityRole="button"
          accessibilityLabel="Attach a photo"
        >
          <SymbolView
            name={{
              ios: "camera",
              android: "photo_camera",
              web: "photo_camera",
            }}
            size={24}
            tintColor={colors.muted}
          />
        </Pressable>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Ask Tommy anything…"
          placeholderTextColor={colors.muted}
          multiline
          accessibilityLabel="Message Tommy"
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="send"
        />
        {busy ? (
          <Pressable
            onPress={stop}
            style={[styles.send, styles.stop]}
            accessibilityRole="button"
          >
            <Text style={styles.stopText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={submit}
            style={[styles.send, !canSend && styles.sendDisabled]}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { padding: spacing.lg, gap: spacing.md },
  emptyWrap: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  hello: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  sub: { fontSize: fontSize.sm, color: colors.muted, textAlign: "center" },
  prompts: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  prompt: {
    minHeight: minTapTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  promptText: { color: colors.ink, fontSize: fontSize.sm },
  newChat: {
    alignSelf: "center",
    minHeight: minTapTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  newChatText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    textDecorationLine: "underline",
  },
  attachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  remove: {
    color: colors.muted,
    textDecorationLine: "underline",
    fontSize: fontSize.sm,
  },
  photoError: { color: colors.danger, fontSize: fontSize.sm, flexShrink: 1 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    margin: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  iconButton: {
    width: minTapTarget,
    height: minTapTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minHeight: minTapTarget,
    maxHeight: 120,
    fontSize: fontSize.md,
    color: colors.ink,
    paddingVertical: spacing.md,
  },
  send: {
    minHeight: minTapTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.cardinal,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "#fff", fontWeight: "700", fontSize: fontSize.md },
  stop: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stopText: { color: colors.ink, fontWeight: "600", fontSize: fontSize.md },
});
