# Community Day

Sign in with a Google account or a Microsoft account. The same Expo app runs on the web, iOS, and Android.

## Run it

```bash
npm --prefix client install
npm --prefix server install
npm --prefix server run dev
npm --prefix client run web
```

The API listens on `http://localhost:8787`. The Expo app calls it after sign-in.

### Supabase

The database is the Supabase project at `https://fiwpwhgcyhaujunmcdxw.supabase.co`.

1. Open the SQL editor and run `server/supabase/migrations/20261030120000_init.sql`, then `server/supabase/migrations/20261030130000_vendor_profile.sql`, then `server/supabase/migrations/20261030140000_registration_payment.sql`, then `server/supabase/migrations/20261030150000_registration_space.sql`, then `server/supabase/migrations/20261030160000_same_email.sql`, then `server/supabase/migrations/20261030170000_event_spaces.sql`, then `server/supabase/migrations/20261104160000_admin_notes.sql`, then `server/supabase/migrations/20261105150000_registration_spaces.sql`, then `server/supabase/migrations/20261105153000_registration_space_counts.sql`, then `server/supabase/migrations/20261105180000_space_assignments.sql`.
2. In Project Settings → API, copy the `service_role` key into `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
3. Set `SESSION_SECRET` in `.env` to a long random string.

Booth fees are charged with Stripe Checkout. A live secret key (`STRIPE_LIVE_SECRET_KEY`) is used when it is set. Otherwise the server uses `STRIPE_TEST_SECRET_KEY`. Either key stays on the server. A Crosswinds resident pays $5. Anyone else pays $10. Registration is saved either way, and an unpaid registration is highlighted on the events page until Stripe reports the payment. Canceling a paid registration refunds that booth fee through Stripe before the signup is removed.

The service role key is used only by the server. Row level security blocks the anon and publishable keys. Authenticated requests carry a session issued after the Google or Microsoft identity token is verified. A Google account and a Microsoft account with the same email are the same user. Creating an event is limited to `andrew@bishop4.com` and `louise@bishop4.com`.

iOS and Android sign-in need a development build so the OAuth redirect can open this app's URL scheme.

```bash
npm --prefix client run android
npm --prefix client run ios
```

`npm --prefix client run ios` needs macOS. On Windows, use the web app or an Android emulator.

## Client IDs

Copy `.env.example` to `.env` and fill in the client IDs. Restart Expo after saving `.env`. These values are public client IDs. Token exchange uses PKCE.

The sign-in screen lists any missing variable and the exact redirect URI for the platform you are running. Register that URI with the provider.

### Google

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the OAuth consent screen and add your account as a test user while the app is in testing.

Create three OAuth client IDs:

| Client | Value |
| --- | --- |
| Web | Authorized JavaScript origin `http://localhost:8081`. Authorized redirect URI `http://localhost:8081/redirect` (or the URI shown in the app). |
| iOS | Bundle ID `com.marketday.app`. |
| Android | Package name `com.marketday.app` and the SHA-1 of the keystore you build with. |

Debug Android SHA-1:

```bash
keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
```

Put each client ID in `.env`. After you add the iOS or Android client ID, rebuild the native app. The reversed client ID (`com.googleusercontent.apps.…`) is registered as a URL scheme so Google can return to the app.

On the web, Google returns an access token in the browser. On iOS and Android, the app exchanges an authorization code with PKCE.

### Microsoft

In [Microsoft Entra](https://entra.microsoft.com/), register an app.

- Supported accounts: any organizational directory and personal Microsoft accounts.
- Copy the Application (client) ID into `EXPO_PUBLIC_MICROSOFT_CLIENT_ID`.
- Authentication → Add a platform → **Single-page application** → `http://localhost:8081/redirect`.
- Authentication → Add a platform → **Mobile and desktop applications** → `marketday://redirect`.
- Enable public client flows.

The web redirect URI has to be a **Single-page application** platform. If it was added as **Web** (the default on the registration form), Microsoft returns `AADSTS70002` and asks for a client secret. Remove that URI from Web, add it under Single-page application, and sign in again. Leave the client secret out of the app.

Use the redirect URI shown in the app if the web port is different. Add the production site URL the same way when you deploy.

Microsoft sign-in uses the authorization code flow with PKCE on every platform. The issuer is `common`, so both personal Microsoft accounts and work or school accounts can sign in.

## What is stored

Users, events, and registrations live in Supabase. After sign-in, the app keeps a session token on the device until it expires or you sign out. iOS and Android use the keychain and encrypted storage. The web app uses `localStorage`. The Google or Microsoft identity token is checked once by the server and is not saved.
