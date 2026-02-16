import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AppCard, PageHeader } from '@/components/ui';

const settingsItems = [
  {
    href: '/settings/profile',
    title: 'Profile',
    description: 'Tenant profile and branding details.',
  },
  {
    href: '/settings/integrations',
    title: 'Integrations',
    description: 'ERP, accounting, SSO, and webhook connections.',
  },
  {
    href: '/settings/alerts',
    title: 'Alerts',
    description: 'Low-stock and anomaly threshold configuration.',
  },
  {
    href: '/settings/workflows',
    title: 'Workflows',
    description: 'Approval matrices by transaction type.',
  },
  {
    href: '/settings/numbering',
    title: 'Numbering',
    description: 'SO/PO/invoice numbering patterns and sequence rules.',
  },
] as const;

export default function SettingsHubScreen() {
  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader title="Settings" subtitle="Governance, integrations, and operational defaults." />

      <View className="gap-4">
        {settingsItems.map((item) => (
          <Link key={item.href} href={item.href} asChild>
            <Pressable>
              <AppCard title={item.title} className="active:bg-primary-tint">
                <Text className="text-small text-muted">{item.description}</Text>
              </AppCard>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}
