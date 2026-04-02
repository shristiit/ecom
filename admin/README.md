# StockAisle Admin

Expo-managed admin app with Android, iOS, and web targets.

## Prerequisites

- `pnpm` at the workspace root
- Android Studio / Android SDK for Android builds
- Xcode for iOS builds
- A valid backend URL for the build modes below

Configure [`admin/.env`](/Users/Apple/Desktop/ecom/admin/.env) once:

```bash
# default mode used by `pnpm --filter admin start`
ADMIN_DEFAULT_MODE=dev

# mode-specific backend URLs
ADMIN_DEV_API_URL=http://localhost:4000/api
ADMIN_BROWSERSTACK_API_URL=https://api.example.com/api
ADMIN_PROD_API_URL=https://api.example.com/api
```

`dev` runs against Metro and your local API by default.
`browserstack` and `prod` build release binaries that point directly at the backend URL you configure.
Use mode-specific scripts (`start:dev`, `start:browserstack`, `start:prod`, `android:*`, `ios:*`) so you can switch targets without editing env values each run.

For full workspace env mapping, see [`LOCAL_DEV_ENV.md`](/Users/Apple/Desktop/ecom/LOCAL_DEV_ENV.md).

## Development

From the workspace root:

```bash
pnpm --filter admin start
pnpm --filter admin android
pnpm --filter admin ios
```

If you need to regenerate native folders after changing Expo config:

```bash
pnpm --filter admin prebuild
```

That writes local [`android`](/Users/Apple/Desktop/ecom/admin/android) and [`ios`](/Users/Apple/Desktop/ecom/admin/ios) folders so you can open the app directly in Android Studio or Xcode.

## Build

BrowserStack-style local builds:

```bash
pnpm --filter admin android:browserstack
pnpm --filter admin ios:browserstack
```

Production local builds:

```bash
pnpm --filter admin android:prod
pnpm --filter admin ios:prod
```

The Android APK is written under [`admin/android/app/build/outputs/apk/release`](/Users/Apple/Desktop/ecom/admin/android/app/build/outputs/apk/release).
The iOS build products are written under [`admin/ios/build/Build/Products`](/Users/Apple/Desktop/ecom/admin/ios/build/Build/Products).

## Open Native Projects

After `pnpm --filter admin native:sync`:

```bash
open -a "Android Studio" /Users/Apple/Desktop/ecom/admin/android
open /Users/Apple/Desktop/ecom/admin/ios/StockAisleAdmin.xcworkspace
```

## Notes

- Native auth tokens are stored with `expo-secure-store`.
- Native settings data is stored with Async Storage.
- Audit exports download on web and use the native share sheet on Android/iOS.
- The default bundle/package ID is `com.stockaisle.admin`. Change it in `app.json` before store submission if needed.
