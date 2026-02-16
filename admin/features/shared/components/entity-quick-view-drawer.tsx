import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { AppButton, AppCard, AppDrawer } from '@/components/ui';

type EntityQuickViewDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function EntityQuickViewDrawer({ isOpen, onClose }: EntityQuickViewDrawerProps) {
  return (
    <AppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Entity Quick View"
      description="Fast context for high-traffic records."
      footer={<AppButton label="Close" variant="secondary" size="sm" onPress={onClose} />}
    >
      <View className="gap-3">
        <AppCard title="Product" subtitle="CORE-TEE-001">
          <Text className="text-small text-muted">Active at 6 locations · 184 units available</Text>
          <View className="mt-2">
            <Link href="/products" asChild>
              <AppButton label="Open products" size="sm" variant="tertiary" onPress={onClose} />
            </Link>
          </View>
        </AppCard>

        <AppCard title="Purchase Order" subtitle="PO-7A62C112">
          <Text className="text-small text-muted">Supplier: North Supply · Status: partially_received</Text>
          <View className="mt-2">
            <Link href="/orders/purchase" asChild>
              <AppButton label="Open purchase orders" size="sm" variant="tertiary" onPress={onClose} />
            </Link>
          </View>
        </AppCard>

        <AppCard title="User" subtitle="ops@demo.com">
          <Text className="text-small text-muted">Role: Admin · Last active today</Text>
          <View className="mt-2">
            <Link href="/users" asChild>
              <AppButton label="Open users" size="sm" variant="tertiary" onPress={onClose} />
            </Link>
          </View>
        </AppCard>
      </View>
    </AppDrawer>
  );
}
