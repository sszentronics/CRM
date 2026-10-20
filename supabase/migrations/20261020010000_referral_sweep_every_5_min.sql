-- Fix round 1 (A15): check for referrals with no session date every 5 minutes, not 15.
-- The app also runs the sweep when someone opens a page (lib/sweeps.ts). The sweep stamps each
-- referral once it has alerted, so running it more often never sends a second alert.
select cron.unschedule('referral-sweep');
select cron.schedule('referral-sweep', '*/5 * * * *', $$select public.run_referral_sweep()$$);
