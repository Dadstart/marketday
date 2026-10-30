import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchAccount, fetchAccounts, type AccountDetail, type AccountSummary } from '../api/client';
import { colors, pointer, serif } from '../theme';

const OFFERING_LABELS: Record<string, string> = {
  retail: 'Retail products',
  food: 'Food',
  service: 'Service',
  group: 'Group / community organization',
  entertainment: 'Entertainment',
};

export function AccountList({
  token,
  onOpen,
  onBack,
}: {
  token: string;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const [users, setUsers] = useState<AccountSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchAccounts(token)
      .then((body) => setUsers(body.users))
      .catch((reason: unknown) => setError(messageFrom(reason)));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable accessibilityRole="button" onPress={onBack} style={pointer}>
          <Text style={styles.back}>Events</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Users
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {users == null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {users?.length === 0 ? <Text style={styles.muted}>No accounts yet.</Text> : null}
        {users?.map((account) => (
          <Pressable
            key={account.id}
            accessibilityRole="button"
            onPress={() => onOpen(account.id)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed, pointer]}
          >
            <Text style={styles.cardTitle}>{account.name}</Text>
            <Text style={styles.muted}>{account.email}</Text>
            <Text style={styles.muted}>{account.businessName ?? 'No business name yet'}</Text>
            <Text style={styles.link}>View details</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

export function AccountDetailView({
  token,
  userId,
  onBack,
}: {
  token: string;
  userId: string;
  onBack: () => void;
}) {
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAccount(token, userId)
      .then((body) => {
        if (active) {
          setAccount(body.user);
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
  }, [token, userId]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable accessibilityRole="button" onPress={onBack} style={pointer}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!account && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {account ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {account.name}
            </Text>
            <Text style={styles.muted}>{account.email}</Text>
            <Text style={styles.muted}>
              {account.profileComplete ? 'Profile complete' : 'Profile not finished'} · {account.provider}
            </Text>
            <Detail label="Business name" value={account.businessName} />
            <Detail label="Contact person" value={account.contactPerson} />
            <Detail label="Phone number" value={account.phone} />
            <Detail label="Venmo" value={account.venmo} />
            <Detail
              label="Crosswinds resident"
              value={
                account.crosswindsResident == null ? null : account.crosswindsResident ? 'Yes' : 'No'
              }
            />
            <Detail
              label="What they offer"
              value={account.offering ? (OFFERING_LABELS[account.offering] ?? account.offering) : null}
            />
            <Detail label="Products and services" value={account.productsAndServices} />
            <Detail label="Facebook group or page" value={account.facebookName} />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.body}>{value ?? 'Not provided'}</Text>
    </View>
  );
}

function messageFrom(reason: unknown): string {
  return reason instanceof Error && reason.message ? reason.message : 'The accounts could not be loaded.';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  back: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    ...serif,
    color: colors.ink,
    fontSize: 36,
    lineHeight: 42,
  },
  muted: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  body: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 4,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '600',
  },
  link: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  detail: { gap: 2, marginTop: 8 },
  detailLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: { opacity: 0.88 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBackground,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
});
