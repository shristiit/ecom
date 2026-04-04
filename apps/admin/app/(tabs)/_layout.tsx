import { Slot } from 'expo-router';
import { AppShell } from '@/components/navigation/app-shell';

export default function TabLayout() {
  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}
