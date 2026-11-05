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

export type Offering = 'retail' | 'food' | 'service' | 'group' | 'entertainment';

export type VendorProfileInput = {
  venmo: string;
  contactPerson: string;
  businessName: string;
  phone: string;
  crosswindsResident: boolean;
  offering: Offering;
  productsAndServices: string;
  facebookName: string | null;
  brandingImage: string | null;
};

export type VendorProfileDraft = {
  venmo: string;
  contactPerson: string;
  businessName: string;
  phone: string;
  crosswindsResident: boolean | null;
  offering: Offering | null;
  productsAndServices: string;
  facebookName: string;
  brandingImage: string | null;
};

export type SpaceRequest = 'grass-generator' | 'grass' | 'food-truck' | 'pavilion';

export type EventInput = {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number | null;
  spacesAvailable: SpaceRequest[];
};

export type MapArea = 'pavilion' | 'grass' | 'food-truck';

export type SpaceAssignment = {
  area: MapArea;
  spot: number;
  registrationId: string;
};

export type MapRegistration = {
  id: string;
  name: string;
  businessName: string | null;
  spacesRequested: SpaceRequest[];
};

export type EventMap = {
  title: string;
  volunteers: string;
  assignments: SpaceAssignment[];
  registrations: MapRegistration[];
};

export type EventRecord = EventInput & {
  id: string;
  registrationCount: number;
  registered: boolean;
  paid: boolean;
  refundable: boolean;
  feeCents: number | null;
  spacesRequested: SpaceRequest[];
  createdAt: string;
};

export type RegistrationRecord = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  paid: boolean | null;
  refundable: boolean;
  amountCents: number | null;
  spacesRequested: SpaceRequest[];
  createdAt: string;
};

export type AccountSummary = {
  id: string;
  name: string;
  email: string;
  businessName: string | null;
  profileComplete: boolean;
  brandingImage: string | null;
};

export type AccountDetail = AccountSummary & {
  provider: ProviderName;
  venmo: string | null;
  contactPerson: string | null;
  phone: string | null;
  crosswindsResident: boolean | null;
  offering: string | null;
  productsAndServices: string | null;
  facebookName: string | null;
  adminNotes: string | null;
  createdAt: string;
};
