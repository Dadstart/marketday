export type LegalDocumentName = 'privacy' | 'terms';

export type LegalDocument = {
  title: string;
  path: string;
  intro: string[];
  points: string[];
};

export const legalDocuments: Record<LegalDocumentName, LegalDocument> = {
  privacy: {
    title: 'Privacy',
    path: '/privacy.html',
    intro: [
      'This service is provided by Crosswinds Community, LLC.',
      'By using this service, you agree to the following privacy policy:',
    ],
    points: [
      'We will not collect any personal information from you except for the information you provide to us when you sign up.',
      'Personal information will only be used in conjuction with registration for events.',
      'We will not sell or share your personal information with anyone.',
      'Only community coordinators and staff will have access to your personal information.',
    ],
  },
  terms: {
    title: 'Terms of Service',
    path: '/tos.html',
    intro: [
      'This service is provided by Crosswinds Community',
      'By using this service, you agree to the following terms of service:',
    ],
    points: [
      'You will not use this service to send any spam or unsolicited messages.',
      'You will not use this service to send any messages that are illegal or infringe on the rights of others.',
      'You will not use this service to send any messages that are abusive or harassing.',
      'You will not use this service to send any messages that are spam or unsolicited.',
    ],
  },
};

export function legalDocumentFromPath(pathname: string): LegalDocumentName | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/privacy.html' || path === '/privacy') {
    return 'privacy';
  }
  if (path === '/tos.html' || path === '/terms') {
    return 'terms';
  }
  return null;
}
