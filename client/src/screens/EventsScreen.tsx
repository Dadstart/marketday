import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createEvent,
  fetchEvent,
  fetchEvents,
  registerForEvent,
  unregisterFromEvent,
  type EventDetail,
  type EventSummary,
} from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { colors, pointer, serif } from '../theme';

type Screen =
  | { name: 'list' }
  | { name: 'detail'; id: string }
  | { name: 'create' };

export function EventsScreen() {
  const { token, user, signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>({ name: 'list' });

  if (!token || !user) {
    return null;
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>MARKET DAY</Text>
          <Text style={styles.headerName} numberOfLines={1}>
            {user.name}
            {user.admin ? ' · Administrator' : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={signOut} style={pointer}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
      {screen.name === 'list' ? (
        <EventList
          token={token}
          admin={user.admin}
          onOpen={(id) => setScreen({ name: 'detail', id })}
          onCreate={() => setScreen({ name: 'create' })}
        />
      ) : null}
      {screen.name === 'detail' ? (
        <EventDetailView
          token={token}
          eventId={screen.id}
          onBack={() => setScreen({ name: 'list' })}
        />
      ) : null}
      {screen.name === 'create' ? (
        <CreateEvent
          token={token}
          onCancel={() => setScreen({ name: 'list' })}
          onCreated={(id) => setScreen({ name: 'detail', id })}
        />
      ) : null}
    </View>
  );
}

function EventList({
  token,
  admin,
  onOpen,
  onCreate,
}: {
  token: string;
  admin: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchEvents(token)
      .then((body) => setEvents(body.events))
      .catch((reason: unknown) => setError(messageFrom(reason)));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">
            Events
          </Text>
          {admin ? (
            <Pressable accessibilityRole="button" onPress={onCreate} style={[styles.primaryButton, pointer]}>
              <Text style={styles.primaryLabel}>Create event</Text>
            </Pressable>
          ) : null}
        </View>
        {error ? <ErrorText message={error} /> : null}
        {events == null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {events?.length === 0 ? <Text style={styles.muted}>No events yet.</Text> : null}
        {events?.map((event) => (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            onPress={() => onOpen(event.id)}
            style={({ pressed }) => [styles.eventCard, pressed && styles.pressed, pointer]}
          >
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.muted}>{formatWhen(event.startsAt)}</Text>
            {event.location ? <Text style={styles.muted}>{event.location}</Text> : null}
            <Text style={styles.meta}>
              {registrationLabel(event)}
              {event.registered ? ' · You are registered' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function EventDetailView({
  token,
  eventId,
  onBack,
}: {
  token: string;
  eventId: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetchEvent(token, eventId)
      .then(setDetail)
      .catch((reason: unknown) => setError(messageFrom(reason)));
  }, [eventId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const event = detail?.event;
  const full = event?.capacity != null && event.registrationCount >= event.capacity && !event.registered;

  async function changeRegistration() {
    if (!event) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = event.registered
        ? await unregisterFromEvent(token, event.id)
        : await registerForEvent(token, event.id);
      setDetail(next);
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable accessibilityRole="button" onPress={onBack} style={pointer}>
          <Text style={styles.back}>Events</Text>
        </Pressable>
        {error ? <ErrorText message={error} /> : null}
        {!event && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {event ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {event.title}
            </Text>
            <Text style={styles.body}>{formatWhen(event.startsAt)}</Text>
            {event.endsAt ? <Text style={styles.muted}>Until {formatWhen(event.endsAt)}</Text> : null}
            {event.location ? <Text style={styles.body}>{event.location}</Text> : null}
            {event.description ? <Text style={styles.body}>{event.description}</Text> : null}
            <Text style={styles.meta}>{registrationLabel(event)}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy || full}
              onPress={() => {
                void changeRegistration();
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                (busy || full) && styles.disabled,
                pressed && styles.pressed,
                pointer,
              ]}
            >
              <Text style={styles.primaryLabel}>
                {busy
                  ? 'Saving…'
                  : full
                    ? 'Event is full'
                    : event.registered
                      ? 'Cancel registration'
                      : 'Register'}
              </Text>
            </Pressable>
            <Text style={styles.section}>Registrations</Text>
            {detail?.registrations.length === 0 ? (
              <Text style={styles.muted}>No one has registered yet.</Text>
            ) : (
              detail?.registrations.map((registration) => (
                <View key={registration.id} style={styles.person}>
                  <Text style={styles.personName}>{registration.name}</Text>
                  {registration.email ? <Text style={styles.muted}>{registration.email}</Text> : null}
                </View>
              ))
            )}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function CreateEvent({
  token,
  onCancel,
  onCreated,
}: {
  token: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [capacity, setCapacity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const startsAt = combineDateTime(date, time);
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    if (!startsAt) {
      setError('Use a start date like 2026-11-14 and a time like 09:00.');
      return;
    }
    const endsAt = endDate || endTime ? combineDateTime(endDate, endTime || '00:00') : null;
    if ((endDate || endTime) && !endsAt) {
      setError('Use an end date like 2026-11-14 and a time like 12:00.');
      return;
    }
    const parsedCapacity = capacity.trim() ? Number(capacity) : null;
    if (parsedCapacity != null && (!Number.isInteger(parsedCapacity) || parsedCapacity < 1)) {
      setError('Capacity must be a whole number greater than zero.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await createEvent(token, {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        startsAt,
        endsAt,
        capacity: parsedCapacity,
      });
      onCreated(result.event.id);
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={pointer}>
          <Text style={styles.back}>Events</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Create event
        </Text>
        {error ? <ErrorText message={error} /> : null}
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        <Field label="Location" value={location} onChangeText={setLocation} />
        <Field label="Start date" value={date} onChangeText={setDate} placeholder="2026-11-14" />
        <Field label="Start time" value={time} onChangeText={setTime} placeholder="09:00" />
        <Field label="End date" value={endDate} onChangeText={setEndDate} placeholder="Optional" />
        <Field label="End time" value={endTime} onChangeText={setEndTime} placeholder="Optional" />
        <Field label="Capacity" value={capacity} onChangeText={setCapacity} placeholder="Optional" />
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            void submit();
          }}
          style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed, pointer]}
        >
          <Text style={styles.primaryLabel}>{busy ? 'Saving…' : 'Save event'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function ErrorText({ message }: { message: string }) {
  return <Text style={styles.error}>{message}</Text>;
}

function registrationLabel(event: EventSummary): string {
  const count = `${event.registrationCount} registered`;
  if (event.capacity == null) {
    return count;
  }
  return `${count} of ${event.capacity}`;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function combineDateTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) || !/^\d{2}:\d{2}$/.test(time.trim())) {
    return null;
  }
  const parsed = new Date(`${date.trim()}T${time.trim()}`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function messageFrom(reason: unknown): string {
  return reason instanceof Error && reason.message ? reason.message : 'The request failed.';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerText: { flex: 1 },
  eyebrow: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  headerName: {
    color: colors.ink,
    fontSize: 16,
    marginTop: 2,
  },
  signOut: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  column: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  title: {
    ...serif,
    color: colors.ink,
    fontSize: 36,
    lineHeight: 42,
  },
  body: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
  },
  muted: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  meta: {
    color: colors.ink,
    fontSize: 14,
    marginTop: 4,
  },
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 4,
  },
  eventTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '600',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryLabel: {
    color: colors.inverseText,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
  back: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  person: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  personName: {
    color: colors.ink,
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBackground,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
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
    fontSize: 16,
    color: colors.ink,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
