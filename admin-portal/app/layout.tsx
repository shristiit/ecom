// app/layout.tsx
import '@gluestack-ui/themed/css';          // ← Gluestack base styles
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import '../app/globals.css';                // Tailwind’s global CSS

export const metadata = {
  title: 'ECOM Admin',
  description: 'Admin portal for the ECOM platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <GluestackUIProvider config={config}>
          {children}
        </GluestackUIProvider>
      </body>
    </html>
  );
}
