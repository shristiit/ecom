// mobile-app/app/_layout.tsx
import { Stack } from "expo-router";
import { GluestackUIProvider } from "@gluestack-ui/themed";
import { config } from "@gluestack-ui/config";
import "../globals.css";                 // <-- only if you created one

export default function RootLayout() {
  return (
    <GluestackUIProvider config={config}>
      {/* the Stack (or Slot) renders your routes */}
      <Stack screenOptions={{ headerShown: false }} />
    </GluestackUIProvider>
  );
}
