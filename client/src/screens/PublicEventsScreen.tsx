import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchEvent, fetchEvents, type EventSummary } from '../api/client';
import { Logo } from '../Logo';
import { colors, pointer, serif } from '../theme';
import { FormattedText } from './FormattedText';
import { SignInPrompt } from './SignInScreen';

const SPACE_LABELS: Record<string, string> = {
  'grass-generator': '10x10 grass plus generator',
  grass: '10x10 grass',
  'food-truck': 'Food truck',
  pavilion: '10x10 pavilion',
};

export function PublicEventsScreen({ onViewingEvent }: { onViewingEvent: (eventId: string | null) => void }) {
  const [eventId, setEventId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<'register' | 'sign-in' | null>(null);

  function open(id: string, nextPrompt: 'register' | 'sign-in' | null = null) {
    setEventId(id);
    setPrompt(nextPrompt);
    onViewingEvent(nextPrompt === 'register' ? id : null);
  }

  function back() {
    setEventId(null);
    setPrompt(null);
    onViewingEvent(null);
  }

  function dismissPrompt() {
    setPrompt(null);
    onViewingEvent(null);
  }

  function registerFor(id: string) {
    setEventId(id);
    setPrompt('register');
    onViewingEvent(id);
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Events"
          onPress={back}
          style={[styles.logoButton, pointer]}
        >
          <Logo />
        </Pressable>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>COMMUNITY DAY</Text>
            <Text style={styles.headerTitle}>Crosswinds</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (prompt === 'register') {
                return;
              }
              onViewingEvent(null);
              setPrompt((current) => (current === 'sign-in' ? null : 'sign-in'));
            }}
            style={pointer}
          >
            <Text style={styles.signIn}>Sign in</Text>
          </Pressable>
        </View>
      </View>
      {eventId ? (
        <PublicEventDetail
          eventId={eventId}
          prompt={prompt}
          onBack={back}
          onRegister={() => registerFor(eventId)}
          onDismissPrompt={dismissPrompt}
        />
      ) : (
        <PublicEventList prompt={prompt} onOpen={open} onDismissPrompt={dismissPrompt} />
      )}
    </View>
  );
}

function PublicEventList({
  prompt,
  onOpen,
  onDismissPrompt,
}: {
  prompt: 'register' | 'sign-in' | null;
  onOpen: (id: string, nextPrompt?: 'register' | 'sign-in' | null) => void;
  onDismissPrompt: () => void;
}) {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchEvents(null)
      .then((body) => setEvents(body.events))
      .catch((reason: unknown) => setError(messageFrom(reason)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Text style={styles.title} accessibilityRole="header">
          Events
        </Text>
        <Text style={styles.intro}>
          This website is used for Crosswinds Community and Market Day registrations.
        </Text>
        {prompt === 'sign-in' ? (
          <SignInPrompt message="Sign in with your Google or Microsoft account." onDismiss={onDismissPrompt} />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {events == null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {events?.length === 0 ? <Text style={styles.muted}>No events yet.</Text> : null}
        {events?.map((event) => {
          const full = event.capacity != null && event.registrationCount >= event.capacity;
          return (
            <View key={event.id} style={styles.eventCard}>
              <Pressable accessibilityRole="button" onPress={() => onOpen(event.id)} style={pointer}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.muted}>{formatWhen(event.startsAt)}</Text>
                {event.location ? <Text style={styles.muted}>{event.location}</Text> : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={full}
                onPress={() => onOpen(event.id, 'register')}
                style={({ pressed }) => [styles.primaryButton, full && styles.disabled, pressed && styles.pressed, pointer]}
              >
                <Text style={styles.primaryLabel}>{full ? 'Event is full' : 'Register'}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function PublicEventDetail({
  eventId,
  prompt,
  onBack,
  onRegister,
  onDismissPrompt,
}: {
  eventId: string;
  prompt: 'register' | 'sign-in' | null;
  onBack: () => void;
  onRegister: () => void;
  onDismissPrompt: () => void;
}) {
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setEvent(null);
    setError(null);
    fetchEvent(null, eventId)
      .then((detail) => {
        if (active) {
          setEvent(detail.event);
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
  }, [eventId]);

  const full = event?.capacity != null && event.registrationCount >= event.capacity;
  const promptMessage =
    prompt === 'register' ? 'Sign in to register for this event.' : 'Sign in with your Google or Microsoft account.';

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable accessibilityRole="button" onPress={onBack} style={pointer}>
          <Text style={styles.back}>Events</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!event && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {event ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {event.title}
            </Text>
            <Text style={styles.body}>{formatWhen(event.startsAt)}</Text>
            {event.endsAt ? <Text style={styles.muted}>Until {formatWhen(event.endsAt)}</Text> : null}
            {event.location ? <Text style={styles.body}>{event.location}</Text> : null}
            {event.description ? <FormattedText value={event.description} style={styles.body} /> : null}
            <Text style={styles.body}>
              Booth fee is $5 for Crosswinds residents and $10 otherwise.
            </Text>
            <Text style={styles.body}>
              Spaces available: {event.spacesAvailable.map((id) => SPACE_LABELS[id] ?? id).join(', ') || 'None'}
            </Text>
            {prompt ? (
              <SignInPrompt message={promptMessage} onDismiss={onDismissPrompt} />
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={full}
                onPress={onRegister}
                style={({ pressed }) => [styles.primaryButton, full && styles.disabled, pressed && styles.pressed, pointer]}
              >
                <Text style={styles.primaryLabel}>{full ? 'Event is full' : 'Register'}</Text>
              </Pressable>
            )}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
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
  logoButton: { alignSelf: 'flex-start' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: { flexShrink: 1 },
  eyebrow: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  headerTitle: {
    color: colors.ink,
    fontSize: 16,
    marginTop: 2,
  },
  signIn: {
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
  title: {
    ...serif,
    color: colors.ink,
    fontSize: 36,
    lineHeight: 42,
  },
  intro: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
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
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
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
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBackground,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
});
