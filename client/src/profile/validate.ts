export type ProfileFormValues = {
  venmo: string;
  contactPerson: string;
  businessName: string;
  phone: string;
  crosswindsResident: boolean | null;
  offering: string | null;
  productsAndServices: string;
};

/** Returns an error message when required vendor profile fields are incomplete. */
export function profileFormError(
  values: ProfileFormValues,
  voice: 'you' | 'they' = 'you',
): string | null {
  if (values.venmo.trim().length < 2) {
    return 'Enter a Venmo account name or phone number.';
  }
  if (values.contactPerson.trim().length < 2) {
    return 'Enter the contact person.';
  }
  if (values.businessName.trim().length < 2) {
    return 'Enter the business name.';
  }
  const digits = values.phone.replace(/\D/g, '');
  if (digits.length < 10) {
    return 'Enter a phone number with at least 10 digits.';
  }
  if (values.crosswindsResident == null) {
    return voice === 'they'
      ? 'Say whether they are a Crosswinds resident.'
      : 'Say whether you are a Crosswinds resident.';
  }
  if (!values.offering) {
    return voice === 'they' ? 'Choose what they will offer.' : 'Choose what you will offer.';
  }
  if (values.productsAndServices.trim().length < 2) {
    return voice === 'they'
      ? 'List the products or services they will offer.'
      : 'List the products or services you will offer.';
  }
  return null;
}

export function profileFormComplete(values: ProfileFormValues): boolean {
  return profileFormError(values) == null;
}
