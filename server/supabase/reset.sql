-- Deletes every user and every registration.
-- Events are included because each event must belong to the user who created it.
-- This does not refund Stripe payments. Charges that already succeeded stay paid in Stripe.
-- Run in the Supabase SQL editor. This cannot be undone.

begin;

delete from public.registrations;
delete from public.events;
delete from public.users;

commit;
