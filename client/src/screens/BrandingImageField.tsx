import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, pointer } from '../theme';

const MAX_BYTES = 1_500_000;
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function BrandingImageField({
  value,
  onChange,
  onError,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function choose() {
    setBusy(true);
    onError(null);
    try {
      const file = await chooseImageFile();
      if (!file) {
        return;
      }
      const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
      if (!ACCEPTED.has(contentType)) {
        onError('Use a PNG, JPEG, GIF, or WebP image.');
        return;
      }
      if (file.size > MAX_BYTES) {
        onError('The branding image must be 1.5 MB or smaller.');
        return;
      }
      onChange(await readDataUrl(file));
    } catch (reason) {
      onError(reason instanceof Error && reason.message ? reason.message : 'That image could not be read.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Branding image</Text>
      <Text style={styles.help}>Optional. A logo or photo for the business. PNG, JPEG, GIF, or WebP, up to 1.5 MB.</Text>
      {value ? (
        <Image accessibilityLabel="Branding image" source={{ uri: value }} style={styles.preview} resizeMode="contain" />
      ) : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value ? 'Replace branding image' : 'Add branding image'}
          disabled={busy}
          onPress={() => {
            void choose();
          }}
          style={({ pressed }) => [styles.button, busy && styles.disabled, pressed && styles.pressed, pointer]}
        >
          <Text style={styles.buttonLabel}>{busy ? 'Reading image…' : value ? 'Replace image' : 'Add image'}</Text>
        </Pressable>
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove branding image"
            disabled={busy}
            onPress={() => onChange(null)}
            style={pointer}
          >
            <Text style={styles.remove}>Remove image</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function chooseImageFile(): Promise<File | null> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Add a branding image from the web app.'));
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    window.addEventListener(
      'focus',
      () => {
        window.setTimeout(() => finish(null), 400);
      },
      { once: true },
    );
    input.click();
  });
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        reject(new Error('That image could not be read.'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  help: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  preview: {
    width: 240,
    height: 160,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  remove: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
});
