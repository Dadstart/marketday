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
  createdAt: string;
};

export type RegistrationRecord = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
};
