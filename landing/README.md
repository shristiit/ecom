# StockAisle Landing

Expo Router web app for `stockaisle.com`.

## Local

```bash
cd /Users/Apple/Desktop/ecom
pnpm --filter landing web
```

## Production build

```bash
cd /Users/Apple/Desktop/ecom
pnpm --filter landing build
```

The build exports the web app to `landing/dist/` and writes `robots.txt` plus `sitemap.xml`.

## Public environment variables

- `EXPO_PUBLIC_LOGIN_URL`
  Defaults to `https://admin.stockasile.com`
- `EXPO_PUBLIC_SITE_URL`
  Defaults to `https://stockaisle.com`
- `EXPO_PUBLIC_MS_FORMS_URL`
  Optional Microsoft Forms destination for the demo request form
- `EXPO_PUBLIC_RECAPTCHA_SITE_KEY`
  Defaults to the configured StockAisle site key

Keep the reCAPTCHA secret key server-side only. It must not be embedded in the web bundle.
