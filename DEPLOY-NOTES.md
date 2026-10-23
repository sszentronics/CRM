# Deploy notes (Hostinger)

## 1. Tailwind is precompiled
Hostinger's build server does not let Turbopack start the extra Node process that the
`@tailwindcss/turbopack` loader needs, so a build that compiles Tailwind there crashes with
"An unexpected Turbopack error ... creating new process".

- Edit styles in `styles/tailwind-source.css` (this is the real stylesheet).
- `app/globals.css` is the compiled output the app imports. Do not edit it by hand.
- After adding or changing Tailwind classes anywhere in the code, run:

      pnpm css

  then commit `app/globals.css` together with your change. If you forget, new classes
  will have no styling on the live site (nothing breaks, it just looks unstyled).

## 2. Redirects are relative
Behind Hostinger's proxy the app sees its internal address (`0.0.0.0:3000`) as the host.
Sign-out and email-link redirects (`app/auth/signout`, `app/auth/confirm`) therefore use
`redirectTo()` from `lib/http/origin.ts`, which sends a relative `Location: /login...`.
The browser keeps the domain it is on, so this works on any domain with no setting.

## 3. Environment variables (hPanel > Environment variables)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (secret, never commit it)

`NEXT_PUBLIC_*` values are baked in at build time: redeploy after changing them.

## 4. Supabase (Authentication > URL Configuration)
- Site URL: `https://www.quantrapro.com`
- Redirect URLs: `https://www.quantrapro.com/**`, `https://quantrapro.com/**`
