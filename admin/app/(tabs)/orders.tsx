import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AppCard, PageHeader, PageShell } from '@admin/components/ui';

const orderModules = [
  {
    href: '/orders/sales',
    title: 'Sales orders',
    description: 'Invoice lifecycle from draft to dispatch and completion.',
  },
  {
    href: '/orders/purchase',
    title: 'Purchase orders',
    description: 'Supplier order flow from creation through receiving.',
  },
] as const;

export default function OrdersHubScreen() {
  return (
    <PageShell variant="orders">
      <ScrollView className="px-6 py-6">
        <PageHeader title="Orders" subtitle="Operational order flows for sales and procurement." />

        <View className="gap-4">
          {orderModules.map((item) => (
            <Link key={item.href} href={item.href} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={item.title}
                accessibilityHint={item.description}
              >
                <AppCard title={item.title} className="active:bg-primary-tint">
                  <Text className="text-small text-muted">{item.description}</Text>
                </AppCard>
              </Pressable>
            </Link>
          ))}
        </View>
      </ScrollView>
    </PageShell>
  );
}
