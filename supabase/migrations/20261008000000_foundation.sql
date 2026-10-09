-- Module 0: foundation.
-- pgTAP powers `supabase test db`. Business tables arrive from Module 1 onward,
-- each with RLS enabled and a default deny.
create extension if not exists pgtap with schema extensions;
