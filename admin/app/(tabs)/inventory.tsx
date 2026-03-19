import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AppCard, PageHeader } from '@/components/ui';

const inventoryModules = [
  {
    href: '/inventory/stock-on-hand',
    title: 'Stock on hand',
    description: 'Track available, reserved, and on-hand quantities by SKU and location.',
  },
  {
    href: '/inventory/movements',
    title: 'Movements',
    description: 'Complete movement log for receipts, transfers, and adjustments.',
  },
  {
    href: '/inventory/receipts',
    title: 'Receipts',
    description: 'Receive inbound stock from suppliers and purchase orders.',
  },
  {
    href: '/inventory/transfers',
    title: 'Transfers',
    description: 'Move stock between warehouses and retail locations.',
  },
  {
    href: '/inventory/adjustments',
    title: 'Adjustments',
    description: 'Apply manual inventory corrections with reason tracking.',
  },
  {
    href: '/inventory/write-offs',
    title: 'Write-offs',
    description: 'Capture damaged or expired stock as controlled write-offs.',
  },
  {
    href: '/inventory/cycle-counts',
    title: 'Cycle Counts',
    description: 'Run recurring counts and reconcile inventory variance.',
  },
] as const;

export default function InventoryHubScreen() {
  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader title="Inventory" subtitle="Operations across stock, movement, and control workflows." />

      <View className="gap-4">
        {inventoryModules.map((item) => (
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
