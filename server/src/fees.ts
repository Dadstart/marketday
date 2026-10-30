export const RESIDENT_FEE_CENTS = 500;
export const GUEST_FEE_CENTS = 1000;

export function feeCents(resident: boolean): number {
  return resident ? RESIDENT_FEE_CENTS : GUEST_FEE_CENTS;
}

export function isBoothFee(cents: number): boolean {
  return cents === RESIDENT_FEE_CENTS || cents === GUEST_FEE_CENTS;
}
