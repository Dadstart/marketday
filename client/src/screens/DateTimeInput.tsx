import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { colors, pointer } from '../theme';

export function DateTimeInput({
  label,
  mode,
  value,
  onChange,
}: {
  label: string;
  mode: 'date' | 'time';
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseValue(mode, value);

  function commit(date: Date) {
    onChange(mode === 'date' ? formatDate(date) : formatTime(date));
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={selected}
          mode={mode}
          display="compact"
          themeVariant="light"
          onValueChange={(_event, date) => commit(date)}
        />
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.input, pointer]}>
            <Text style={value ? styles.value : styles.placeholder}>{value ? displayValue(mode, value) : prompt(mode)}</Text>
          </Pressable>
          {open ? (
            <DateTimePicker
              value={selected}
              mode={mode}
              design="material"
              title={label}
              onValueChange={(_event, date) => {
                commit(date);
                setOpen(false);
              }}
              onDismiss={() => setOpen(false)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function prompt(mode: 'date' | 'time'): string {
  return mode === 'date' ? 'Choose a date' : 'Choose a time';
}

function parseValue(mode: 'date' | 'time', value: string): Date {
  const parsed = new Date();
  if (mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    parsed.setFullYear(year, month - 1, day);
  }
  if (mode === 'time' && /^\d{2}:\d{2}$/.test(value)) {
    const [hours, minutes] = value.split(':').map(Number);
    parsed.setHours(hours, minutes, 0, 0);
  }
  return parsed;
}

function formatDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function formatTime(value: Date): string {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function displayValue(mode: 'date' | 'time', value: string): string {
  const parsed = parseValue(mode, value);
  if (mode === 'date') {
    return parsed.toLocaleDateString(undefined, { dateStyle: 'medium' });
  }
  return parsed.toLocaleTimeString(undefined, { timeStyle: 'short' });
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  value: {
    color: colors.ink,
    fontSize: 16,
  },
  placeholder: {
    color: colors.muted,
    fontSize: 16,
  },
});
