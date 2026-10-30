export type ProviderName = 'google' | 'microsoft';

export type Identity = {
  provider: ProviderName;
  subject: string;
  email: string;
  name: string;
  picture: string | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  provider: ProviderName;
  admin: boolean;
  profileComplete: boolean;
};

export type SpaceRequest = 'grass-generator' | 'grass' | 'food-truck' | 'pavilion';
export type Offering = 'retail' | 'food' | 'service' | 'group' | 'entertainment';

export type VendorProfileInput = {
  venmo: string;
  contactPerson: string;
  businessName: string;
  phone: string;
  crosswindsResident: boolean;
  spaceRequested: SpaceRequest;
  offering: Offering;
  productsAndServices: string;
  facebookName: string | null;
};

export type EventInput = {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number | null;
};

export type EventRecord = EventInput & {
  id: string;
  registrationCount: number;
  registered: boolean;
  paid: boolean;
  feeCents: number | null;
  createdAt: string;
};

export type RegistrationRecord = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
};
