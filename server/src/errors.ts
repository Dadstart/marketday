export class DatabaseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class PaymentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class SesError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function databaseFailure(message: string | undefined): DatabaseError {
  console.error(message ?? 'Supabase request failed.');
  if (message?.includes('does not exist') || message?.includes('schema cache')) {
    return new DatabaseError(
      503,
      'The database schema is not installed. Run the SQL files in server/supabase/migrations in the Supabase SQL editor.',
    );
  }
  return new DatabaseError(500, 'The database request failed.');
}
