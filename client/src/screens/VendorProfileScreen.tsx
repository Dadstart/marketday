import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fetchVendorProfile, saveVendorProfile, type VendorProfileInput } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { colors, pointer, serif } from '../theme';

const SPACE_OPTIONS = [
  { id: 'grass-generator', label: '10x10 grass plus generator' },
  { id: 'grass', label: '10x10 grass' },
  { id: 'food-truck', label: 'Food truck' },
  { id: 'pavilion', label: '10x10 pavilion' },
] as const;

const OFFERING_OPTIONS = [
  { id: 'retail', label: 'Retail products' },
  { id: 'food', label: 'Food' },
  { id: 'service', label: 'Service' },
  { id: 'group', label: 'Group / community organization' },
  { id: 'entertainment', label: 'Entertainment' },
] as const;

export function VendorProfileScreen({ onBack }: { onBack?: () => void }) {
  const editing = onBack != null;
  const { token, updateUser, signOut } = useAuth();
  const [venmo, setVenmo] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [crosswindsResident, setCrosswindsResident] = useState<boolean | null>(null);
  const [spaceRequested, setSpaceRequested] = useState<VendorProfileInput['spaceRequested'] | null>(null);
  const [offering, setOffering] = useState<VendorProfileInput['offering'] | null>(null);
  const [productsAndServices, setProductsAndServices] = useState('');
  const [facebookName, setFacebookName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);

  useEffect(() => {
    if (!editing || !token) {
      return;
    }
    let active = true;
    fetchVendorProfile(token)
      .then((profile) => {
        if (!active || !profile) {
          return;
        }
        setVenmo(profile.venmo);
        setContactPerson(profile.contactPerson);
        setBusinessName(profile.businessName);
        setPhone(profile.phone);
        setCrosswindsResident(profile.crosswindsResident);
        setSpaceRequested(profile.spaceRequested);
        setOffering(profile.offering);
        setProductsAndServices(profile.productsAndServices);
        setFacebookName(profile.facebookName ?? '');
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error && reason.message ? reason.message : 'The profile could not be loaded.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [editing, token]);

  async function submit() {
    if (!token) {
      return;
    }
    if (crosswindsResident == null) {
      setError('Say whether you are a Crosswinds resident.');
      return;
    }
    if (!spaceRequested) {
      setError('Choose the space you are requesting.');
      return;
    }
    if (!offering) {
      setError('Choose what you will offer.');
      return;
    }

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await saveVendorProfile(token, {
        venmo: venmo.trim(),
        contactPerson: contactPerson.trim(),
        businessName: businessName.trim(),
        phone: phone.trim(),
        crosswindsResident,
        spaceRequested,
        offering,
        productsAndServices: productsAndServices.trim(),
        facebookName: facebookName.trim() || null,
      });
      updateUser(result.user);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'The profile could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MARKET DAY</Text>
          <Pressable accessibilityRole="button" onPress={signOut} style={pointer}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
        {onBack ? (
          <Pressable accessibilityRole="button" onPress={onBack} style={pointer}>
            <Text style={styles.signOut}>Events</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title} accessibilityRole="header">
          {editing ? 'Your profile' : 'Tell us about your business'}
        </Text>
        <Text style={styles.intro}>
          {editing
            ? 'Update the business details used for your market registration.'
            : 'We need these details the first time you sign in, before you can register for a market.'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.saved}>Profile saved.</Text> : null}
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {loading ? null : (
          <>
        <Field label="Venmo account name or phone number" value={venmo} onChangeText={setVenmo} />
        <Field label="Contact person" value={contactPerson} onChangeText={setContactPerson} />
        <Field label="Name of business" value={businessName} onChangeText={setBusinessName} />
        <Field
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Crosswinds resident</Text>
        <View style={styles.choiceRow}>
          <Choice
            label="Yes"
            selected={crosswindsResident === true}
            onPress={() => setCrosswindsResident(true)}
          />
          <Choice
            label="No"
            selected={crosswindsResident === false}
            onPress={() => setCrosswindsResident(false)}
          />
        </View>

        <Text style={styles.label}>Space requested</Text>
        {SPACE_OPTIONS.map((option) => (
          <Choice
            key={option.id}
            label={option.label}
            selected={spaceRequested === option.id}
            onPress={() => setSpaceRequested(option.id)}
          />
        ))}

        <Text style={styles.label}>What will you offer</Text>
        {OFFERING_OPTIONS.map((option) => (
          <Choice
            key={option.id}
            label={option.label}
            selected={offering === option.id}
            onPress={() => setOffering(option.id)}
          />
        ))}

        <Field
          label="List of all specific products or services you will sell or offer"
          value={productsAndServices}
          onChangeText={setProductsAndServices}
          multiline
        />

        <Text style={styles.help}>
          If you have a Facebook presence for your business, tell us so we can invite you to be
          co-hosts for the Crosswinds Market Day events. This helps expose the event page to more
          people.
        </Text>
        <Field
          label="Facebook group or page name"
          value={facebookName}
          onChangeText={setFacebookName}
          placeholder="Optional"
        />

        <Pressable
          accessibilityRole="button"
          disabled={busy || loading}
          onPress={() => {
            void submit();
          }}
          style={({ pressed }) => [styles.save, (busy || loading) && styles.disabled, pressed && styles.pressed, pointer]}
        >
          <Text style={styles.saveLabel}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save and continue'}</Text>
        </Pressable>
          </>
        )}
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
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
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

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected, pointer]}
    >
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 48,
  },
  column: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  signOut: {
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
  intro: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  help: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
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
    minHeight: 120,
    textAlignVertical: 'top',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
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
  choiceLabelSelected: {
    fontWeight: '600',
  },
  save: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  saveLabel: {
    color: colors.inverseText,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBackground,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
  saved: {
    color: '#245C32',
    backgroundColor: '#E4EFE4',
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
});
