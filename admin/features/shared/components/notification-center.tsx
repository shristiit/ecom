import { type Href, Link } from 'expo-router';
import { Text, View } from 'react-native';
import { AppBadge, AppButton, AppDrawer } from '@/components/ui';

const notifications: Array<{ id: string; title: string; detail: string; tone: 'warning' | 'error'; href: Href }> = [
  { id: 'n1', title: 'Low stock detected', detail: 'SKU-CORE-TEE-BLK-S at WH-01', tone: 'warning' as const, href: '/inventory/stock-on-hand' },
  { id: 'n2', title: 'Approval pending', detail: '2 AI actions are waiting for approval', tone: 'warning' as const, href: '/ai/approvals' },
  { id: 'n3', title: 'PO overdue', detail: '1 purchase order is past expected date', tone: 'error' as const, href: '/orders/purchase' },
];

type NotificationCenterProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  return (
    <AppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Notification Center"
      description="Operational alerts and follow-ups."
      footer={<AppButton label="Close" variant="secondary" size="sm" onPress={onClose} />}
    >
      <View className="gap-3">
        {notifications.map((item) => (
          <View key={item.id} className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <View className="flex-row items-start justify-between gap-2">
              <Text className="text-small font-semibold text-text">{item.title}</Text>
              <AppBadge label={item.tone} tone={item.tone} />
            </View>
            <Text className="mt-1 text-caption text-muted">{item.detail}</Text>
            <View className="mt-2">
              <Link href={item.href} asChild>
                <AppButton label="Open" size="sm" variant="tertiary" onPress={onClose} />
              </Link>
            </View>
          </View>
        ))}
      </View>
    </AppDrawer>
  );
}
