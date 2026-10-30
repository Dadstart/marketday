import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  confirmCheckout,
  createEvent,
  deleteEvent,
  fetchEvent,
  fetchEvents,
  registerForEvent,
  startEventPayment,
  unregisterFromEvent,
  updateEvent,
  type EventDetail,
  type EventSummary,
} from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { AccountDetailView, AccountList } from './UsersScreen';
import { colors, pointer, serif } from '../theme';
import { DateTimeInput } from './DateTimeInput';

const SPACE_OPTIONS = [
  { id: 'grass-generator', label: '10x10 grass plus generator' },
  { id: 'grass', label: '10x10 grass' },
  { id: 'food-truck', label: 'Food truck' },
  { id: 'pavilion', label: '10x10 pavilion' },
] as const;

function spaceLabel(id: string | null): string {
  if (!id) {
    return 'Not chosen';
  }
  return SPACE_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

type Screen =
  | { name: 'list' }
  | { name: 'detail'; id: string }
  | { name: 'create' }
  | { name: 'edit'; event: EventSummary }
  | { name: 'users' }
  | { name: 'account'; id: string; back: 'users' | 'detail'; eventId?: string };

export function EventsScreen({ onEditProfile }: { onEditProfile: () => void }) {
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
        <View style={styles.headerActions}>
          {user.admin ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setScreen({ name: 'users' })}
              style={pointer}
            >
              <Text style={styles.signOut}>Users</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onEditProfile} style={pointer}>
            <Text style={styles.signOut}>Profile</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={signOut} style={pointer}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
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
          admin={user.admin}
          eventId={screen.id}
          onBack={() => setScreen({ name: 'list' })}
          onEdit={(event) => setScreen({ name: 'edit', event })}
          onOpenUser={(id) => setScreen({ name: 'account', id, back: 'detail', eventId: screen.id })}
        />
      ) : null}
      {screen.name === 'users' ? (
        <AccountList
          token={token}
          onBack={() => setScreen({ name: 'list' })}
          onOpen={(id) => setScreen({ name: 'account', id, back: 'users' })}
        />
      ) : null}
      {screen.name === 'account' ? (
        <AccountDetailView
          token={token}
          userId={screen.id}
          onBack={() =>
            setScreen(
              screen.back === 'detail' && screen.eventId
                ? { name: 'detail', id: screen.eventId }
                : { name: 'users' },
            )
          }
        />
      ) : null}
      {screen.name === 'create' ? (
        <EventForm
          token={token}
          onCancel={() => setScreen({ name: 'list' })}
          onSaved={(id) => setScreen({ name: 'detail', id })}
        />
      ) : null}
      {screen.name === 'edit' ? (
        <EventForm
          token={token}
          event={screen.event}
          onCancel={() => setScreen({ name: 'detail', id: screen.event.id })}
          onSaved={(id) => setScreen({ name: 'detail', id })}
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

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const sessionId = new URLSearchParams(window.location.search).get('checkout_session_id');
    if (!sessionId) {
      return;
    }
    window.history.replaceState({}, '', window.location.pathname);
    confirmCheckout(token, sessionId)
      .then(() => load())
      .catch((reason: unknown) => setError(messageFrom(reason)));
  }, [load, token]);

  const unpaid = events?.filter((event) => event.registered && !event.paid) ?? [];

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
        {unpaid.length > 0 ? (
          <View style={styles.unpaidBanner}>
            <Text style={styles.unpaidLabel}>
              {unpaid.length === 1
                ? `${unpaid[0].title} still needs payment${
                    unpaid[0].feeCents != null ? ` of ${formatFee(unpaid[0].feeCents)}` : ''
                  }.`
                : `${unpaid.length} registrations still need payment.`}
            </Text>
          </View>
        ) : null}
        {events == null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {events?.length === 0 ? <Text style={styles.muted}>No events yet.</Text> : null}
        {events?.map((event) => (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            onPress={() => onOpen(event.id)}
            style={({ pressed }) => [
              styles.eventCard,
              event.registered && !event.paid && styles.unpaidCard,
              pressed && styles.pressed,
              pointer,
            ]}
          >
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.muted}>{formatWhen(event.startsAt)}</Text>
            {event.location ? <Text style={styles.muted}>{event.location}</Text> : null}
            <Text style={styles.meta}>
              {registrationLabel(event)}
              {event.registered ? ' · You are registered' : ''}
            </Text>
            {event.registered && !event.paid ? (
              <Text style={styles.unpaidLabel}>
                {event.feeCents != null ? `Payment due: ${formatFee(event.feeCents)}` : 'Payment due'}
              </Text>
            ) : null}
            {event.registered && event.paid ? <Text style={styles.paidLabel}>Paid</Text> : null}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function EventDetailView({
  token,
  admin,
  eventId,
  onBack,
  onEdit,
  onOpenUser,
}: {
  token: string;
  admin: boolean;
  eventId: string;
  onBack: () => void;
  onEdit: (event: EventSummary) => void;
  onOpenUser: (userId: string) => void;
}) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spaceRequested, setSpaceRequested] = useState<(typeof SPACE_OPTIONS)[number]['id'] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

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
  const availableSpaces = SPACE_OPTIONS.filter((option) => event?.spacesAvailable.includes(option.id));
  const selectedSpace = availableSpaces.some((option) => option.id === spaceRequested) ? spaceRequested : null;
  const full = event?.capacity != null && event.registrationCount >= event.capacity && !event.registered;

  async function pay() {
    if (!event) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await startEventPayment(token, event.id, paymentReturnUrl());
      if (result.paid || !result.url) {
        load();
        return;
      }
      if (Platform.OS === 'web') {
        window.location.assign(result.url);
        return;
      }
      const browser = await WebBrowser.openAuthSessionAsync(result.url, paymentReturnUrl());
      if (browser.type === 'success') {
        const sessionId = new URL(browser.url).searchParams.get('checkout_session_id');
        if (sessionId) {
          await confirmCheckout(token, sessionId);
        }
        load();
      }
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent() {
    if (deleteText !== 'delete') {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteEvent(token, eventId);
      onBack();
    } catch (reason) {
      setError(messageFrom(reason));
      setDeleting(false);
    }
  }

  async function changeRegistration() {
    if (!event) {
      return;
    }
    if (!event.registered && !selectedSpace) {
      setError('Choose the space you are requesting.');
      return;
    }
    const canceling = event.registered;
    setBusy(true);
    setError(null);
    try {
      const next = canceling
        ? await unregisterFromEvent(token, event.id)
        : await registerForEvent(token, event.id, selectedSpace as (typeof SPACE_OPTIONS)[number]['id']);
      if (canceling) {
        onBack();
        return;
      }
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
            {admin ? (
              <Pressable accessibilityRole="button" onPress={() => onEdit(event)} style={pointer}>
                <Text style={styles.back}>Edit event</Text>
              </Pressable>
            ) : null}
            <Text style={styles.body}>{formatWhen(event.startsAt)}</Text>
            {event.endsAt ? <Text style={styles.muted}>Until {formatWhen(event.endsAt)}</Text> : null}
            {event.location ? <Text style={styles.body}>{event.location}</Text> : null}
            {event.description ? <Text style={styles.body}>{event.description}</Text> : null}
            <Text style={styles.meta}>{registrationLabel(event)}</Text>
            <Text style={styles.body}>{feeLabel(event)}</Text>
            <Text style={styles.body}>
              Spaces available: {event.spacesAvailable.map((id) => spaceLabel(id)).join(', ') || 'None'}
            </Text>
            {event.registered ? (
              <Text style={styles.body}>Space requested: {spaceLabel(event.spaceRequested)}</Text>
            ) : (
              <>
                <Text style={styles.label}>Space requested</Text>
                {availableSpaces.length === 0 ? (
                  <Text style={styles.muted}>No spaces are available for this event.</Text>
                ) : null}
                {availableSpaces.map((option) => (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedSpace === option.id }}
                    onPress={() => setSpaceRequested(option.id)}
                    style={[styles.choice, selectedSpace === option.id && styles.choiceSelected, pointer]}
                  >
                    <Text style={styles.choiceLabel}>{option.label}</Text>
                  </Pressable>
                ))}
              </>
            )}
            {event.registered && event.paid ? (
              <Text style={styles.paidLabel}>Paid. Canceling refunds this booth fee through Stripe.</Text>
            ) : null}
            {event.registered && !event.paid ? (
              <View style={styles.unpaidBanner}>
                <Text style={styles.unpaidLabel}>
                  {event.feeCents != null
                    ? `Payment due: ${formatFee(event.feeCents)}`
                    : 'Payment due. Add your Crosswinds residency on your profile first.'}
                </Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy || full || (!event.registered && !selectedSpace)}
              onPress={() => {
                void changeRegistration();
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                (busy || full || (!event.registered && !selectedSpace)) && styles.disabled,
                pressed && styles.pressed,
                pointer,
              ]}
            >
              <Text style={styles.primaryLabel}>
                {busy
                  ? event.registered && event.paid
                    ? 'Refunding…'
                    : 'Saving…'
                  : full
                    ? 'Event is full'
                    : event.registered
                      ? event.paid
                        ? 'Cancel and refund'
                        : 'Cancel registration'
                      : 'Register'}
              </Text>
            </Pressable>
            {event.registered && !event.paid ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy || event.feeCents == null}
                onPress={() => {
                  void pay();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (busy || event.feeCents == null) && styles.disabled,
                  pressed && styles.pressed,
                  pointer,
                ]}
              >
                <Text style={styles.primaryLabel}>
                  {event.feeCents != null ? `Pay ${formatFee(event.feeCents)}` : 'Pay booth fee'}
                </Text>
              </Pressable>
            ) : null}
            <Text style={styles.section}>Registrations</Text>
            {detail?.registrations.length === 0 ? (
              <Text style={styles.muted}>No one has registered yet.</Text>
            ) : (
              detail?.registrations.map((registration) => (
                <View key={registration.id} style={styles.person}>
                  {admin && registration.userId ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onOpenUser(registration.userId as string)}
                      style={pointer}
                    >
                      <Text style={styles.personLink}>{registration.name}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.personName}>{registration.name}</Text>
                  )}
                  {registration.email ? <Text style={styles.muted}>{registration.email}</Text> : null}
                  {admin ? <Text style={styles.meta}>Space requested: {spaceLabel(registration.spaceRequested)}</Text> : null}
                  {registration.paid === true ? (
                    <Text style={styles.paidLabel}>
                      Paid{registration.amountCents != null ? ` ${formatFee(registration.amountCents)}` : ''}
                    </Text>
                  ) : null}
                  {registration.paid === false ? <Text style={styles.unpaidLabel}>Payment due</Text> : null}
                </View>
              ))
            )}
            {admin ? (
              confirmingDelete ? (
                <View style={styles.deleteBox}>
                  <Text style={styles.warning}>
                    This permanently deletes {event.title} and every registration. Paid booth fees are not refunded.
                  </Text>
                  <Field
                    label="Type delete to confirm"
                    value={deleteText}
                    onChangeText={setDeleteText}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={deleting || deleteText !== 'delete'}
                    onPress={() => {
                      void removeEvent();
                    }}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      (deleting || deleteText !== 'delete') && styles.disabled,
                      pressed && styles.pressed,
                      pointer,
                    ]}
                  >
                    <Text style={styles.primaryLabel}>{deleting ? 'Deleting…' : 'Delete event'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={deleting}
                    onPress={() => {
                      setConfirmingDelete(false);
                      setDeleteText('');
                    }}
                    style={pointer}
                  >
                    <Text style={styles.back}>Keep event</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmingDelete(true)}
                  style={[styles.deleteButton, pointer]}
                >
                  <Text style={styles.primaryLabel}>Delete event</Text>
                </Pressable>
              )
            ) : null}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function EventForm({
  token,
  event,
  onCancel,
  onSaved,
}: {
  token: string;
  event?: EventSummary;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const editing = event != null;
  const start = splitDateTime(event?.startsAt);
  const end = splitDateTime(event?.endsAt);
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(end.time);
  const [capacity, setCapacity] = useState(event?.capacity != null ? String(event.capacity) : '');
  const [spaces, setSpaces] = useState<(typeof SPACE_OPTIONS)[number]['id'][]>(event?.spacesAvailable ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const startsAt = combineDateTime(date, time);
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    if (!startsAt) {
      setError('Choose a start date and start time.');
      return;
    }
    const endsAt = endDate || endTime ? combineDateTime(endDate, endTime || '00:00') : null;
    if ((endDate || endTime) && !endsAt) {
      setError('Choose both an end date and an end time, or leave both empty.');
      return;
    }
    const parsedCapacity = capacity.trim() ? Number(capacity) : null;
    if (parsedCapacity != null && (!Number.isInteger(parsedCapacity) || parsedCapacity < 1)) {
      setError('Capacity must be a whole number greater than zero.');
      return;
    }
    if (spaces.length === 0) {
      setError('Choose at least one available space.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const draft = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        startsAt,
        endsAt,
        capacity: parsedCapacity,
        spacesAvailable: spaces,
      };
      if (event) {
        await updateEvent(token, event.id, draft);
        onSaved(event.id);
      } else {
        const result = await createEvent(token, draft);
        onSaved(result.event.id);
      }
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
          <Text style={styles.back}>{editing ? 'Event' : 'Events'}</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {editing ? 'Edit event' : 'Create event'}
        </Text>
        {error ? <ErrorText message={error} /> : null}
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        <Field label="Location" value={location} onChangeText={setLocation} />
        <DateTimeInput label="Start date" mode="date" value={date} onChange={setDate} />
        <DateTimeInput label="Start time" mode="time" value={time} onChange={setTime} />
        <DateTimeInput label="End date (optional)" mode="date" value={endDate} onChange={setEndDate} />
        <DateTimeInput label="End time (optional)" mode="time" value={endTime} onChange={setEndTime} />
        <Field label="Capacity" value={capacity} onChangeText={setCapacity} placeholder="Optional" />
        <Text style={styles.label}>Spaces available</Text>
        {SPACE_OPTIONS.map((option) => {
          const selected = spaces.includes(option.id);
          return (
            <Pressable
              key={option.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                setSpaces((current) =>
                  current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id],
                );
              }}
              style={[styles.choice, selected && styles.choiceSelected, pointer]}
            >
              <Text style={styles.choiceLabel}>{option.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          disabled={busy || spaces.length === 0}
          onPress={() => {
            void submit();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            (busy || spaces.length === 0) && styles.disabled,
            pressed && styles.pressed,
            pointer,
          ]}
        >
          <Text style={styles.primaryLabel}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save event'}</Text>
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
  autoCapitalize,
  autoCorrect,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
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
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function ErrorText({ message }: { message: string }) {
  return <Text style={styles.error}>{message}</Text>;
}

function formatFee(cents: number): string {
  return `$${cents / 100}`;
}

function feeLabel(event: EventSummary): string {
  if (event.feeCents === 500) {
    return 'Booth fee: $5 because you are a Crosswinds resident.';
  }
  if (event.feeCents === 1000) {
    return 'Booth fee: $10.';
  }
  return 'Booth fee is $5 for Crosswinds residents and $10 otherwise. Add your residency on your profile before paying.';
}

function paymentReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return 'marketday://payment';
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

function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  if (!value) {
    return { date: '', time: '' };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { date: '', time: '' };
  }
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return {
    date: `${parsed.getFullYear()}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
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
  unpaidCard: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBackground,
  },
  unpaidBanner: {
    backgroundColor: colors.dangerBackground,
    borderRadius: 12,
    padding: 12,
  },
  unpaidLabel: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  paidLabel: {
    color: '#245C32',
    fontSize: 15,
    fontWeight: '700',
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
  deleteBox: {
    gap: 12,
    marginTop: 12,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.danger,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  warning: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
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
  personLink: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
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
  choice: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  choiceSelected: {
    borderColor: colors.accent,
    backgroundColor: '#F8E6DE',
  },
  choiceLabel: {
    color: colors.ink,
    fontSize: 16,
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
