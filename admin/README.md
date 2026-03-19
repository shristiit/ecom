# StockAisle Admin

Expo-managed admin app with Android, iOS, and web targets.

## Prerequisites

- `pnpm` at the workspace root
- An Expo account authenticated with `eas login`
- A valid backend URL exposed as `EXPO_PUBLIC_API_URL`

Copy the example env file and adjust values for your environment:

```bash
cp .env.example .env
```

## Development

From the workspace root:

```bash
pnpm --filter admin start
pnpm --filter admin android
pnpm --filter admin ios
```

## Build

Preview builds:

```bash
pnpm --filter admin build:android:preview
pnpm --filter admin build:ios:preview
```

Production builds:

```bash
pnpm --filter admin build:android
pnpm --filter admin build:ios
```

## Notes

- Native auth tokens are stored with `expo-secure-store`.
- Native settings data is stored with Async Storage.
- Audit exports download on web and use the native share sheet on Android/iOS.
- The default bundle/package ID is `com.stockaisle.admin`. Change it in `app.json` before store submission if needed.
