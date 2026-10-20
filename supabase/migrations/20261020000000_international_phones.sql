-- Fix round 1: leads and staff may have any international phone number.
-- Phones are stored as E.164: "+", then 8 to 15 digits, first digit 1 to 9.
-- Pakistani numbers (+92...) keep their own length rule (9 or 10 digits after 92).
-- Every row stored so far is a valid +92 number, so the wider rule accepts all of them.

alter table public.leads drop constraint if exists leads_phone_check;
alter table public.leads add constraint leads_phone_check check (
  phone ~ '^\+[1-9][0-9]{7,14}$' and (phone !~ '^\+92' or phone ~ '^\+92[1-9][0-9]{8,9}$')
);

alter table public.profiles drop constraint if exists profiles_phone_check;
alter table public.profiles add constraint profiles_phone_check check (
  phone ~ '^\+[1-9][0-9]{7,14}$' and (phone !~ '^\+92' or phone ~ '^\+92[1-9][0-9]{8,9}$')
);
