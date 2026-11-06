import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  fetchAccount,
  fetchAccounts,
  updateAccount,
  type AccountDetail,
  type AccountSummary,
  type VendorProfileInput,
} from '../api/client';
import { colors, pointer, serif } from '../theme';
import { BrandingImageField } from './BrandingImageField';

const OFFERING_OPTIONS = [
  { id: 'retail', label: 'Retail products' },
  { id: 'food', label: 'Food' },
  { id: 'service', label: 'Service' },
  { id: 'group', label: 'Group / community organization' },
  { id: 'entertainment', label: 'Entertainment' },
] as const;

function offeringLabel(offering: string | null): string | null {
  if (!offering) {
    return null;
  }
  return OFFERING_OPTIONS.find((option) => option.id === offering)?.label ?? offering;
}

function knownOffering(offering: string | null): VendorProfileInput['offering'] | null {
  return OFFERING_OPTIONS.some((option) => option.id === offering) ? (offering as VendorProfileInput['offering']) : null;
}

export function AccountList({ token, onOpen }: { token: string; onOpen: (id: string) => void }) {
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
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{account.name}</Text>
              <Text style={styles.muted}>{account.email}</Text>
              <Text style={styles.muted}>{account.businessName ?? 'No business name yet'}</Text>
              <Text style={styles.link}>View details</Text>
            </View>
            {account.brandingImage ? (
              <Image
                accessibilityLabel={`${account.name} branding image`}
                source={{ uri: account.brandingImage }}
                style={styles.cardImage}
                resizeMode="cover"
              />
            ) : null}
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
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return fetchAccount(token, userId)
      .then((body) => setAccount(body.user))
      .catch((reason: unknown) => setError(messageFrom(reason)));
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable accessibilityRole="button" onPress={onBack} style={pointer}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!account && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {account && !editing ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {account.name}
            </Text>
            <Text style={styles.muted}>{account.email}</Text>
            <Text style={styles.muted}>
              {account.profileComplete ? 'Profile complete' : 'Profile not finished'} · {account.provider}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={pointer}>
              <Text style={styles.back}>Edit details</Text>
            </Pressable>
            {account.brandingImage ? (
              <Image
                accessibilityLabel="Branding image"
                source={{ uri: account.brandingImage }}
                style={styles.branding}
                resizeMode="contain"
              />
            ) : (
              <Detail label="Branding image" value={null} />
            )}
            <Detail label="Business name" value={account.businessName} />
            <Detail label="Contact person" value={account.contactPerson} />
            <Detail label="Phone number" value={account.phone} />
            <Detail label="Venmo" value={account.venmo} />
            <Detail
              label="Crosswinds resident"
              value={account.crosswindsResident == null ? null : account.crosswindsResident ? 'Yes' : 'No'}
            />
            <Detail label="What they offer" value={offeringLabel(account.offering)} />
            <Detail label="Products and services" value={account.productsAndServices} />
            <Detail label="Facebook group or page" value={account.facebookName} />
            <Detail label="Notes" value={account.adminNotes} />
          </>
        ) : null}
        {account && editing ? (
          <AccountEditor
            token={token}
            account={account}
            onCancel={() => setEditing(false)}
            onSaved={(next) => {
              setAccount(next);
              setEditing(false);
              setError(null);
            }}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

function AccountEditor({
  token,
  account,
  onCancel,
  onSaved,
}: {
  token: string;
  account: AccountDetail;
  onCancel: () => void;
  onSaved: (account: AccountDetail) => void;
}) {
  const [venmo, setVenmo] = useState(account.venmo ?? '');
  const [contactPerson, setContactPerson] = useState(account.contactPerson ?? '');
  const [businessName, setBusinessName] = useState(account.businessName ?? '');
  const [phone, setPhone] = useState(account.phone ?? '');
  const [crosswindsResident, setCrosswindsResident] = useState<boolean | null>(account.crosswindsResident);
  const [offering, setOffering] = useState<VendorProfileInput['offering'] | null>(knownOffering(account.offering));
  const [productsAndServices, setProductsAndServices] = useState(account.productsAndServices ?? '');
  const [facebookName, setFacebookName] = useState(account.facebookName ?? '');
  const [brandingImage, setBrandingImage] = useState<string | null>(account.brandingImage);
  const [adminNotes, setAdminNotes] = useState(account.adminNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (crosswindsResident == null) {
      setError('Say whether they are a Crosswinds resident.');
      return;
    }
    if (!offering) {
      setError('Choose what they will offer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await updateAccount(token, account.id, {
        venmo: venmo.trim(),
        contactPerson: contactPerson.trim(),
        businessName: businessName.trim(),
        phone: phone.trim(),
        crosswindsResident,
        offering,
        productsAndServices: productsAndServices.trim(),
        facebookName: facebookName.trim() || null,
        brandingImage,
        adminNotes: adminNotes.trim() || null,
      });
      onSaved(result.user);
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'The account could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text style={styles.title} accessibilityRole="header">
        Edit {account.name}
      </Text>
      <Text style={styles.muted}>{account.email}</Text>
      <Text style={styles.muted}>Name and email come from their Google or Microsoft account.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Field label="Venmo account name or phone number" value={venmo} onChangeText={setVenmo} />
      <Field label="Contact person" value={contactPerson} onChangeText={setContactPerson} />
      <Field label="Name of business" value={businessName} onChangeText={setBusinessName} />
      <BrandingImageField value={brandingImage} onChange={setBrandingImage} onError={setError} />
      <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Text style={styles.detailLabel}>Crosswinds resident</Text>
      <View style={styles.choiceRow}>
        <Choice label="Yes" selected={crosswindsResident === true} onPress={() => setCrosswindsResident(true)} />
        <Choice label="No" selected={crosswindsResident === false} onPress={() => setCrosswindsResident(false)} />
      </View>
      <Text style={styles.detailLabel}>What they offer</Text>
      {OFFERING_OPTIONS.map((option) => (
        <Choice
          key={option.id}
          label={option.label}
          selected={offering === option.id}
          onPress={() => setOffering(option.id)}
        />
      ))}
      <Field
        label="Products and services"
        value={productsAndServices}
        onChangeText={setProductsAndServices}
        multiline
      />
      <Field
        label="Facebook group or page"
        value={facebookName}
        onChangeText={setFacebookName}
        placeholder="Optional"
      />
      <Field
        label="Notes"
        value={adminNotes}
        onChangeText={setAdminNotes}
        placeholder="Only administrators can see this"
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.choiceRow}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            void submit();
          }}
          style={({ pressed }) => [styles.save, busy && styles.disabled, pressed && styles.pressed, pointer]}
        >
          <Text style={styles.saveLabel}>{busy ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={pointer}>
          <Text style={styles.back}>Cancel</Text>
        </Pressable>
      </View>
    </>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad';
}) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected, pointer]}
    >
      <Text style={styles.body}>{label}</Text>
    </Pressable>
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
    paddingTop: 20,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 16,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardImage: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: colors.background,
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
  branding: {
    width: 240,
    height: 160,
    marginTop: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
  },
  detailLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
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
    minHeight: 120,
    textAlignVertical: 'top',
  },
  save: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveLabel: {
    color: colors.inverseText,
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
});
