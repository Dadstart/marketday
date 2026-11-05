import { createElement, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';

import type { EmailImage } from '../api/client';
import { sanitizeEmailHtml } from '../description';
import { colors, pointer } from '../theme';

const MAX_IMAGE_BYTES = 1_500_000;
const IMAGE_TYPES = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
} as const;

export function EmailMessageEditor({
  value,
  images,
  onChange,
  onImagesChange,
  onError,
}: {
  value: string;
  images: EmailImage[];
  onChange: (value: string) => void;
  onImagesChange: (images: EmailImage[]) => void;
  onError: (message: string | null) => void;
}) {
  const [fontSize, setFontSize] = useState('18');
  const [link, setLink] = useState('https://');
  const selection = useRef({ start: 0, end: 0 });
  const frozenSelection = useRef<{ start: number; end: number } | null>(null);
  const [caret, setCaret] = useState<{ start: number; end: number } | null>(null);
  const nextImage = useRef(1);

  function applyWrap(open: string, close: string) {
    if (frozenSelection.current) {
      selection.current = frozenSelection.current;
      frozenSelection.current = null;
    }
    const start = Math.min(selection.current.start, selection.current.end);
    const end = Math.max(selection.current.start, selection.current.end);
    const from = Math.max(0, Math.min(start, value.length));
    const to = Math.max(from, Math.min(end, value.length));
    const next = `${value.slice(0, from)}${open}${value.slice(from, to)}${close}${value.slice(to)}`;
    const cursor = from + open.length + (to - from);
    selection.current = { start: cursor, end: cursor };
    setCaret({ start: cursor, end: cursor });
    onChange(next);
  }

  function applyFontSize() {
    const size = Number(fontSize);
    if (!Number.isInteger(size) || size < 12 || size > 48) {
      onError('Font size must be a whole number from 12 to 48.');
      return;
    }
    onError(null);
    applyWrap(`<span style="font-size: ${size}px">`, '</span>');
  }

  function applyLink() {
    const href = link.trim();
    if (!/^https?:\/\/\S+$/i.test(href) && !/^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(href)) {
      onError('Use an http, https, or mailto link.');
      return;
    }
    onError(null);
    applyWrap(`<a href="${href}">`, '</a>');
  }

  function applyList() {
    if (frozenSelection.current) {
      selection.current = frozenSelection.current;
      frozenSelection.current = null;
    }
    const start = Math.min(selection.current.start, selection.current.end);
    const end = Math.max(selection.current.start, selection.current.end);
    const from = Math.max(0, Math.min(start, value.length));
    const to = Math.max(from, Math.min(end, value.length));
    const selected = value.slice(from, to);
    const items = (selected.trim() ? selected.split('\n') : ['']).filter((line) => line.trim());
    const list = `<ul>${items.map((line) => `<li>${line.trim()}</li>`).join('')}</ul>`;
    const next = `${value.slice(0, from)}${list}${value.slice(to)}`;
    const cursor = from + list.length;
    selection.current = { start: cursor, end: cursor };
    setCaret({ start: cursor, end: cursor });
    onChange(next);
  }

  async function addImage() {
    frozenSelection.current = { ...selection.current };
    onError(null);
    let file: File | null;
    try {
      file = await chooseImageFile();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'That image could not be read.');
      return;
    }
    if (!file) {
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      onError('Each image must be 1.5 MB or smaller.');
      return;
    }
    const contentType = IMAGE_TYPES[file.type as keyof typeof IMAGE_TYPES];
    if (!contentType) {
      onError('Use a PNG, JPEG, GIF, or WebP image.');
      return;
    }
    if (images.length >= 6) {
      onError('An email can include up to 6 images.');
      return;
    }
    const data = await readBase64(file);
    const id = `img${nextImage.current}`;
    nextImage.current += 1;
    const alt = file.name.replace(/\.[^.]+$/, '').replace(/[<>"&]/g, '').trim() || 'Image';
    onImagesChange([...images, { id, contentType, data }]);
    applyWrap(`<img src="cid:${id}" alt="${alt}">`, '');
  }

  const previewHtml = previewMarkup(value, images);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Message</Text>
      <Text style={styles.muted}>
        Select text, then apply formatting. Images are embedded in the email. You can also type {'<b>'}, {'<a href>'},{' '}
        {'<ul>'}, and {'<h2>'}.
      </Text>
      <View style={styles.formatRow}>
        <FormatButton label="Bold" textStyle={styles.boldSample} onPress={() => applyWrap('<b>', '</b>')} />
        <FormatButton label="Italic" textStyle={styles.italicSample} onPress={() => applyWrap('<i>', '</i>')} />
        <FormatButton label="Underline" textStyle={styles.underlineSample} onPress={() => applyWrap('<u>', '</u>')} />
        <FormatButton label="Heading" onPress={() => applyWrap('<h2>', '</h2>')} />
        <FormatButton label="List" onPress={applyList} />
        <TextInput
          accessibilityLabel="Font size"
          value={fontSize}
          onChangeText={setFontSize}
          keyboardType="number-pad"
          onFocus={() => {
            frozenSelection.current = { ...selection.current };
          }}
          style={styles.fontSizeInput}
        />
        <FormatButton label="Apply size" onPress={applyFontSize} />
      </View>
      <View style={styles.formatRow}>
        <TextInput
          accessibilityLabel="Link address"
          value={link}
          onChangeText={setLink}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => {
            frozenSelection.current = { ...selection.current };
          }}
          style={styles.linkInput}
        />
        <FormatButton label="Link" onPress={applyLink} />
        <FormatButton label="Image" onPress={() => void addImage()} />
      </View>
      <TextInput
        accessibilityLabel="Message"
        value={value}
        onChangeText={(next) => {
          setCaret(null);
          onChange(next);
        }}
        onSelectionChange={(event) => {
          selection.current = event.nativeEvent.selection;
        }}
        multiline
        placeholderTextColor={colors.muted}
        style={[styles.input, styles.inputMultiline]}
        {...(caret ? { selection: caret } : {})}
      />
      {value.trim() ? (
        <View style={styles.preview}>
          <Text style={styles.label}>Preview</Text>
          {Platform.OS === 'web' ? (
            createElement('div', {
              style: previewStyle,
              dangerouslySetInnerHTML: { __html: previewHtml },
            })
          ) : (
            <Text style={styles.body}>{value}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function previewMarkup(value: string, images: EmailImage[]): string {
  const safe = sanitizeEmailHtml(value);
  return safe.replace(/src="cid:([^"]+)"/g, (_match, id: string) => {
    const image = images.find((item) => item.id === id);
    return image ? `src="data:${image.contentType};base64,${image.data}"` : 'src=""';
  });
}

function chooseImageFile(): Promise<File | null> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Add images from the web app.'));
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

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const data = result.split(',')[1] ?? '';
      if (!data) {
        reject(new Error('That image could not be read.'));
        return;
      }
      resolve(data);
    };
    reader.readAsDataURL(file);
  });
}

function FormatButton({
  label,
  onPress,
  textStyle,
}: {
  label: string;
  onPress: () => void;
  textStyle?: TextStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...(Platform.OS === 'web'
        ? {
            onMouseDown: (event: { preventDefault: () => void }) => {
              event.preventDefault();
            },
          }
        : {})}
      style={({ pressed }) => [styles.formatButton, pressed && styles.pressed, pointer]}
    >
      <Text style={[styles.formatLabel, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const previewStyle = {
  color: colors.ink,
  fontSize: 16,
  lineHeight: '24px',
};

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
  },
  body: {
    color: colors.ink,
    fontSize: 16,
  },
  formatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  formatButton: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  formatLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  boldSample: { fontWeight: '700' },
  italicSample: { fontStyle: 'italic' },
  underlineSample: { textDecorationLine: 'underline' },
  pressed: { opacity: 0.88 },
  fontSizeInput: {
    width: 64,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: colors.ink,
  },
  linkInput: {
    flexGrow: 1,
    minWidth: 180,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  inputMultiline: {
    minHeight: 140,
    textAlignVertical: 'top',
  },
  preview: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 6,
  },
});
