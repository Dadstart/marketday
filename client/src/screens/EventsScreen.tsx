import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

import {
  cancelRegistration,
  confirmCheckout,
  createEvent,
  deleteEvent,
  fetchEmailAudiences,
  fetchEvent,
  fetchEvents,
  markRegistrationPaid,
  registerForEvent,
  sendEventEmail,
  startEventPayment,
  type EmailAudience,
  type EmailAudienceCounts,
  type EmailImage,
  unregisterFromEvent,
  updateEvent,
  updateRegistrationSpaces,
  type EventDetail,
  type EventSummary,
  type RegistrationSummary,
} from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { parseAddressList, recipientNoun } from '../email/addresses';
import { descriptionForEditor } from '../description';
import { Logo } from '../Logo';
import { AccountDetailView, AccountList } from './UsersScreen';
import { colors, pointer, serif } from '../theme';
import { DateTimeInput } from './DateTimeInput';
import { EmailMessageEditor } from './EmailMessageEditor';
import { FormattedText } from './FormattedText';
import { MapScreen } from './MapScreen';
import { VendorProfileScreen } from './VendorProfileScreen';

const SPACE_OPTIONS = [
  { id: 'grass-generator', label: '10x10 grass plus generator' },
  { id: 'grass', label: '10x10 grass' },
  { id: 'food-truck', label: 'Food truck' },
  { id: 'pavilion', label: '10x10 pavilion' },
] as const;

const MAX_SPACES = 20;

function spaceLabel(id: string): string {
  return SPACE_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

function spacesLabel(ids: string[]): string {
  if (ids.length === 0) {
    return 'Not chosen';
  }
  return SPACE_OPTIONS.flatMap((option) => {
    const count = ids.filter((id) => id === option.id).length;
    if (count === 0) {
      return [];
    }
    return [count === 1 ? option.label : `${option.label} × ${count}`];
  }).join(', ');
}

type Screen =
  | { name: 'list' }
  | { name: 'detail'; id: string }
  | { name: 'create' }
  | { name: 'edit'; event: EventSummary }
  | { name: 'map'; id: string }
  | { name: 'users' }
  | { name: 'account'; id: string; back: 'users' | 'detail'; eventId?: string }
  | { name: 'profile' };

function sectionFor(screen: Screen): 'events' | 'users' | 'profile' {
  if (screen.name === 'profile') {
    return 'profile';
  }
  if (screen.name === 'users' || (screen.name === 'account' && screen.back !== 'detail')) {
    return 'users';
  }
  return 'events';
}

export function EventsScreen() {
  const { token, user, signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>({ name: 'list' });

  if (!token || !user) {
    return null;
  }

  const section = sectionFor(screen);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Events"
          onPress={() => setScreen({ name: 'list' })}
          style={[styles.logoButton, pointer]}
        >
          <Logo />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>COMMUNITY DAY</Text>
          <Text style={styles.headerName} numberOfLines={1}>
            {user.name}
            {user.admin ? ' · Administrator' : ''}
          </Text>
        </View>
        <View style={styles.navRow}>
          <View style={styles.navTabs}>
            <NavTab label="Events" selected={section === 'events'} onPress={() => setScreen({ name: 'list' })} />
            {user.admin ? (
              <NavTab label="Users" selected={section === 'users'} onPress={() => setScreen({ name: 'users' })} />
            ) : null}
            <NavTab label="Profile" selected={section === 'profile'} onPress={() => setScreen({ name: 'profile' })} />
          </View>
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
          onOpenMap={() => setScreen({ name: 'map', id: screen.id })}
          onOpenUser={(id) => setScreen({ name: 'account', id, back: 'detail', eventId: screen.id })}
        />
      ) : null}
      {screen.name === 'users' ? (
        <AccountList token={token} onOpen={(id) => setScreen({ name: 'account', id, back: 'users' })} />
      ) : null}
      {screen.name === 'profile' ? <VendorProfileScreen embedded onBack={() => setScreen({ name: 'list' })} /> : null}
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
      {screen.name === 'map' ? (
        <MapScreen token={token} eventId={screen.id} onBack={() => setScreen({ name: 'detail', id: screen.id })} />
      ) : null}
    </View>
  );
}

function NavTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.navTab, selected && styles.navTabSelected, pointer]}
    >
      <Text style={[styles.navTabLabel, selected && styles.navTabLabelSelected]}>{label}</Text>
    </Pressable>
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
  onOpenMap,
  onOpenUser,
}: {
  token: string;
  admin: boolean;
  eventId: string;
  onBack: () => void;
  onEdit: (event: EventSummary) => void;
  onOpenMap: () => void;
  onOpenUser: (userId: string) => void;
}) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedSpaces, setSelectedSpaces] = useState<(typeof SPACE_OPTIONS)[number]['id'][]>([]);
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
  const chosenSpaces = selectedSpaces.filter((id) => availableSpaces.some((option) => option.id === id));
  const full = event?.capacity != null && event.registrationCount >= event.capacity && !event.registered;
  const refundable = Boolean(event?.refundable);
  const refundClosed = Boolean(refundable && event && eventHasStarted(event.startsAt));

  function setSpaceCount(id: (typeof SPACE_OPTIONS)[number]['id'], count: number) {
    const next = Math.max(0, Math.min(MAX_SPACES, count));
    setSelectedSpaces((current) => [
      ...current.filter((item) => item !== id),
      ...Array.from({ length: next }, () => id),
    ]);
  }

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
    if (!event.registered && chosenSpaces.length === 0) {
      setError('Choose at least one space.');
      return;
    }
    const canceling = event.registered;
    setBusy(true);
    setError(null);
    try {
      if (canceling) {
        await unregisterFromEvent(token, event.id);
      } else {
        await registerForEvent(token, event.id, chosenSpaces);
      }
      onBack();
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
              <View style={styles.adminActions}>
                <Pressable accessibilityRole="button" onPress={() => onEdit(event)} style={pointer}>
                  <Text style={styles.back}>Edit event</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={onOpenMap} style={pointer}>
                  <Text style={styles.back}>Assign spaces</Text>
                </Pressable>
              </View>
            ) : null}
            {admin ? <EmailVendors token={token} eventId={event.id} /> : null}
            <Text style={styles.body}>{formatWhen(event.startsAt)}</Text>
            {event.endsAt ? <Text style={styles.muted}>Until {formatWhen(event.endsAt)}</Text> : null}
            {event.location ? <Text style={styles.body}>{event.location}</Text> : null}
            {event.description ? <FormattedText value={event.description} style={styles.body} /> : null}
            <Text style={styles.meta}>{registrationLabel(event)}</Text>
            <Text style={styles.body}>{feeLabel(event)}</Text>
            <Text style={styles.body}>
              Spaces available: {event.spacesAvailable.map((id) => spaceLabel(id)).join(', ') || 'None'}
            </Text>
            {event.registered ? (
              <Text style={styles.body}>Spaces requested: {spacesLabel(event.spacesRequested)}</Text>
            ) : (
              <>
                <Text style={styles.label}>Spaces requested</Text>
                {availableSpaces.length === 0 ? (
                  <Text style={styles.muted}>No spaces are available for this event.</Text>
                ) : null}
                {availableSpaces.map((option) => {
                  const count = chosenSpaces.filter((id) => id === option.id).length;
                  return (
                    <View key={option.id} style={[styles.quantityRow, count > 0 && styles.choiceSelected]}>
                      <Text style={styles.choiceLabel}>{option.label}</Text>
                      <View style={styles.quantityControls}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove one ${option.label}`}
                          disabled={count === 0}
                          onPress={() => setSpaceCount(option.id, count - 1)}
                          style={[styles.quantityButton, count === 0 && styles.disabled, pointer]}
                        >
                          <Text style={styles.quantityButtonLabel}>−</Text>
                        </Pressable>
                        <Text style={styles.quantityCount}>{count}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Add one ${option.label}`}
                          disabled={count >= MAX_SPACES}
                          onPress={() => setSpaceCount(option.id, count + 1)}
                          style={[styles.quantityButton, count >= MAX_SPACES && styles.disabled, pointer]}
                        >
                          <Text style={styles.quantityButtonLabel}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
            {event.registered && event.paid && !refundable ? <Text style={styles.paidLabel}>Paid.</Text> : null}
            {refundable && !refundClosed ? (
              <Text style={styles.paidLabel}>Paid. Canceling refunds this booth fee through Stripe.</Text>
            ) : null}
            {refundClosed ? (
              <Text style={styles.muted}>This event has started, so the booth fee cannot be refunded.</Text>
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
            {refundClosed ? null : (
            <Pressable
              accessibilityRole="button"
              disabled={busy || full || (!event.registered && chosenSpaces.length === 0)}
              onPress={() => {
                void changeRegistration();
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                (busy || full || (!event.registered && chosenSpaces.length === 0)) && styles.disabled,
                pressed && styles.pressed,
                pointer,
              ]}
            >
              <Text style={styles.primaryLabel}>
                {busy
                  ? refundable
                    ? 'Refunding…'
                    : 'Saving…'
                  : full
                    ? 'Event is full'
                    : event.registered
                      ? refundable
                        ? 'Cancel and refund'
                        : event.paid
                          ? 'Cancel'
                          : 'Cancel registration'
                      : 'Register'}
              </Text>
            </Pressable>
            )}
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
                  {admin ? (
                    <Text style={styles.meta}>Spaces requested: {spacesLabel(registration.spacesRequested)}</Text>
                  ) : null}
                  {registration.paid === true ? (
                    <Text style={styles.paidLabel}>
                      Paid{registration.amountCents != null ? ` ${formatFee(registration.amountCents)}` : ''}
                    </Text>
                  ) : null}
                  {registration.paid === false ? <Text style={styles.unpaidLabel}>Payment due</Text> : null}
                  {admin ? (
                    <RegistrationOverride
                      token={token}
                      eventId={event.id}
                      offered={event.spacesAvailable}
                      registration={registration}
                      onChanged={setDetail}
                    />
                  ) : null}
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
  const [description, setDescription] = useState(() => descriptionForEditor(event?.description ?? ''));
  const [fontSize, setFontSize] = useState('18');
  const selection = useRef({ start: 0, end: 0 });
  const frozenSelection = useRef<{ start: number; end: number } | null>(null);
  const [caret, setCaret] = useState<{ start: number; end: number } | null>(null);
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

  function applyWrap(open: string, close: string) {
    if (frozenSelection.current) {
      selection.current = frozenSelection.current;
      frozenSelection.current = null;
    }
    const start = Math.min(selection.current.start, selection.current.end);
    const end = Math.max(selection.current.start, selection.current.end);
    const from = Math.max(0, Math.min(start, description.length));
    const to = Math.max(from, Math.min(end, description.length));
    const next = `${description.slice(0, from)}${open}${description.slice(from, to)}${close}${description.slice(to)}`;
    const cursor = from + open.length + (to - from);
    selection.current = { start: cursor, end: cursor };
    setCaret({ start: cursor, end: cursor });
    setDescription(next);
  }

  function applyFontSize() {
    const size = Number(fontSize);
    if (!Number.isInteger(size) || size < 12 || size > 48) {
      setError('Font size must be a whole number from 12 to 48.');
      return;
    }
    setError(null);
    applyWrap(`<span style="font-size: ${size}px">`, '</span>');
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
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.muted}>
            Select text, then apply bold, italic, underline, or a font size from 12 to 48. You can also type {'<b>'},{' '}
            {'<i>'}, {'<u>'}, and {'<span style="font-size: 18px">'}. Email addresses are shown as links.
          </Text>
          <View style={styles.formatRow}>
            <FormatButton label="Bold" textStyle={styles.boldSample} onPress={() => applyWrap('<b>', '</b>')} />
            <FormatButton label="Italic" textStyle={styles.italicSample} onPress={() => applyWrap('<i>', '</i>')} />
            <FormatButton
              label="Underline"
              textStyle={styles.underlineSample}
              onPress={() => applyWrap('<u>', '</u>')}
            />
            <TextInput
              accessibilityLabel="Font size"
              value={fontSize}
              onChangeText={setFontSize}
              keyboardType="number-pad"
              {...(Platform.OS === 'web'
                ? {
                    onMouseDown: () => {
                      frozenSelection.current = { ...selection.current };
                    },
                  }
                : {})}
              style={styles.fontSizeInput}
            />
            <FormatButton label="Apply size" onPress={applyFontSize} />
          </View>
          <TextInput
            accessibilityLabel="Description"
            value={description}
            onChangeText={(value) => {
              setCaret(null);
              setDescription(value);
            }}
            onSelectionChange={(event) => {
              selection.current = event.nativeEvent.selection;
            }}
            multiline
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.inputMultiline, styles.descriptionInput]}
            {...(caret ? { selection: caret } : {})}
          />
          {description.trim() ? (
            <View style={styles.preview}>
              <Text style={styles.label}>Preview</Text>
              <FormattedText value={description} style={styles.body} />
            </View>
          ) : null}
        </View>
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

const EMAIL_AUDIENCES: { id: EmailAudience; label: string }[] = [
  { id: 'vendors', label: 'All vendors' },
  { id: 'registered', label: 'Signed up for this event' },
  { id: 'unpaid', label: 'Signed up and not paid' },
  { id: 'addresses', label: 'Specific addresses' },
];

function EmailVendors({ token, eventId }: { token: string; eventId: string }) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<EmailAudience>('registered');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<EmailImage[]>([]);
  const [addresses, setAddresses] = useState('');
  const [counts, setCounts] = useState<EmailAudienceCounts | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    fetchEmailAudiences(token, eventId)
      .then((next) => {
        if (active) {
          setCounts(next);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(messageFrom(reason));
        }
      });
    return () => {
      active = false;
    };
  }, [eventId, open, token]);

  const addressList = parseAddressList(addresses);
  const addressProblem = audience === 'addresses' ? addressList.error : null;
  const count = audience === 'addresses' ? addressList.emails.length : (counts?.[audience] ?? null);

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const sent = await sendEventEmail(
        token,
        eventId,
        audience,
        subject.trim(),
        message.trim(),
        images.filter((image) => message.includes(`cid:${image.id}`)),
        addresses,
      );
      const failed = sent.failed.length === 0 ? '' : ` ${sent.failed.length} could not be sent.`;
      setResult(`Sent to ${sent.sent} ${recipientNoun(audience, sent.sent)}.${failed}`);
      if (sent.failed.length > 0) {
        setError(sent.failed.map((item) => `${item.email}: ${item.error}`).join('\n'));
      }
      setConfirming(false);
      setSubject('');
      setMessage('');
      setImages([]);
    } catch (reason) {
      setError(messageFrom(reason));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.emailBox}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setOpen((shown) => !shown);
          setConfirming(false);
        }}
        style={pointer}
      >
        <Text style={styles.back}>{open ? 'Close email' : 'Email vendors'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.emailForm}>
          {EMAIL_AUDIENCES.map((option) => {
            const selected = audience === option.id;
            const optionCount = option.id === 'addresses' ? undefined : counts?.[option.id];
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setAudience(option.id);
                  setConfirming(false);
                }}
                style={[styles.choice, selected && styles.choiceSelected, pointer]}
              >
                <Text style={styles.choiceLabel}>
                  {option.label}
                  {option.id !== 'addresses' && optionCount != null ? ` (${optionCount})` : ''}
                </Text>
              </Pressable>
            );
          })}
          {audience === 'addresses' ? (
            <Field
              label="Email addresses"
              value={addresses}
              onChangeText={(value) => {
                setAddresses(value);
                setConfirming(false);
              }}
              placeholder="One address per line, or separated by commas"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}
          <Field label="Subject" value={subject} onChangeText={(value) => {
            setSubject(value);
            setConfirming(false);
          }} />
          <EmailMessageEditor
            value={message}
            images={images}
            onChange={(value) => {
              setMessage(value);
              setConfirming(false);
            }}
            onImagesChange={(next) => {
              setImages(next);
              setConfirming(false);
            }}
            onError={setError}
          />
          {addressProblem ? <Text style={styles.warning}>{addressProblem}</Text> : null}
          {audience !== 'addresses' && count === 0 ? <Text style={styles.muted}>No vendors match that choice.</Text> : null}
          {error ? <ErrorText message={error} /> : null}
          {result ? <Text style={styles.paidLabel}>{result}</Text> : null}
          {confirming && count != null && count > 0 ? (
            <Text style={styles.warning}>
              Send this email to {count} {recipientNoun(audience, count)}?
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy || count === 0 || addressProblem != null || !subject.trim() || !message.trim()}
            onPress={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              void send();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              (busy || count === 0 || addressProblem != null || !subject.trim() || !message.trim()) && styles.disabled,
              pressed && styles.pressed,
              pointer,
            ]}
          >
            <Text style={styles.primaryLabel}>{busy ? 'Sending…' : confirming ? 'Send email' : 'Review'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
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

function RegistrationOverride({
  token,
  eventId,
  offered,
  registration,
  onChanged,
}: {
  token: string;
  eventId: string;
  offered: RegistrationSummary['spacesRequested'];
  registration: RegistrationSummary;
  onChanged: (detail: EventDetail) => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'cancel'>('view');
  const [spaces, setSpaces] = useState<RegistrationSummary['spacesRequested']>(registration.spacesRequested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = SPACE_OPTIONS.filter((option) => offered.includes(option.id));

  function setCount(id: RegistrationSummary['spacesRequested'][number], count: number) {
    const next = Math.max(0, Math.min(MAX_SPACES, count));
    setSpaces((current) => [...current.filter((item) => item !== id), ...Array.from({ length: next }, () => id)]);
  }

  async function saveSpaces() {
    if (spaces.length === 0) {
      setError('Choose at least one space.');
      return;
    }
    if (spaces.length > MAX_SPACES) {
      setError('Request 20 spaces or fewer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await updateRegistrationSpaces(token, eventId, registration.id, spaces));
      setMode('view');
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await cancelRegistration(token, eventId, registration.id));
    } catch (reason) {
      setError(messageFrom(reason));
      setBusy(false);
    }
  }

  async function recordPayment() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await markRegistrationPaid(token, eventId, registration.id));
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  }

  const cancelWarning = registration.refundable
    ? 'Canceling refunds the Stripe booth fee, including after the event has started.'
    : 'Remove this registration?';

  return (
    <View style={styles.override}>
      {mode === 'view' ? (
        <View style={styles.adminActions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setSpaces(registration.spacesRequested);
              setError(null);
              setMode('edit');
            }}
            style={pointer}
          >
            <Text style={styles.back}>Modify</Text>
          </Pressable>
          {registration.paid === false ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void recordPayment();
              }}
              style={pointer}
            >
              <Text style={styles.back}>{busy ? 'Saving…' : 'Mark paid'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setError(null);
              setMode('cancel');
            }}
            style={pointer}
          >
            <Text style={styles.back}>{registration.refundable ? 'Cancel and refund' : 'Cancel'}</Text>
          </Pressable>
        </View>
      ) : null}
      {mode === 'edit' ? (
        <View style={styles.overridePanel}>
          {choices.map((option) => {
            const count = spaces.filter((id) => id === option.id).length;
            return (
              <View key={option.id} style={styles.quantityRow}>
                <Text style={styles.choiceLabel}>{option.label}</Text>
                <View style={styles.quantityControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Fewer ${option.label}`}
                    disabled={count === 0 || busy}
                    onPress={() => setCount(option.id, count - 1)}
                    style={[styles.quantityButton, (count === 0 || busy) && styles.disabled, pointer]}
                  >
                    <Text style={styles.quantityButtonLabel}>−</Text>
                  </Pressable>
                  <Text style={styles.quantityCount}>{count}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`More ${option.label}`}
                    disabled={count >= MAX_SPACES || busy}
                    onPress={() => setCount(option.id, count + 1)}
                    style={[styles.quantityButton, (count >= MAX_SPACES || busy) && styles.disabled, pointer]}
                  >
                    <Text style={styles.quantityButtonLabel}>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          <View style={styles.adminActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void saveSpaces();
              }}
              style={pointer}
            >
              <Text style={styles.back}>{busy ? 'Saving…' : 'Save spaces'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setError(null);
                setMode('view');
              }}
              style={pointer}
            >
              <Text style={styles.back}>Keep spaces</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {mode === 'cancel' ? (
        <View style={styles.overridePanel}>
          <Text style={styles.warning}>{cancelWarning}</Text>
          <View style={styles.adminActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void confirmCancel();
              }}
              style={pointer}
            >
              <Text style={styles.back}>{busy ? 'Canceling…' : 'Confirm cancel'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setError(null);
                setMode('view');
              }}
              style={pointer}
            >
              <Text style={styles.back}>Keep registration</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function eventHasStarted(startsAt: string): boolean {
  const start = Date.parse(startsAt);
  return Number.isFinite(start) && start <= Date.now();
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 8,
  },
  headerText: { flexShrink: 1 },
  logoButton: { alignSelf: 'flex-start' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  navTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  navTab: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  navTabSelected: {
    backgroundColor: colors.accent,
  },
  navTabLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  navTabLabelSelected: {
    color: colors.inverseText,
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
    paddingTop: 20,
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
  override: {
    gap: 8,
    marginTop: 8,
  },
  overridePanel: {
    gap: 8,
  },
  adminActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
  },
  emailBox: {
    gap: 12,
  },
  emailForm: {
    gap: 10,
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
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  quantityButtonLabel: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
  },
  quantityCount: {
    minWidth: 24,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 16,
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
  descriptionInput: {
    minHeight: 140,
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
  preview: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 6,
  },
});
