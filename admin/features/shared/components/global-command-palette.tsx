import { useMemo, useState } from 'react';
import { type Href, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { AppButton, AppInput, AppModal } from '@admin/components/ui';

type Command = {
  id: string;
  label: string;
  description: string;
  href: Href;
};

const COMMANDS: Command[] = [
  { id: 'dashboard', label: 'Go to Dashboard', description: 'Open operational overview', href: '/' },
  { id: 'product-new', label: 'Create Product', description: 'Add a new product to catalog', href: '/products/new' },
  { id: 'stock', label: 'Stock On Hand', description: 'View current balances by location', href: '/inventory/stock-on-hand' },
  { id: 'receive', label: 'New Receipt', description: 'Open receipts workspace', href: '/inventory/receipts' },
  { id: 'so', label: 'Sales Orders', description: 'Open sales invoice list', href: '/orders/sales' },
  { id: 'po', label: 'Purchase Orders', description: 'Open purchase order list', href: '/orders/purchase' },
  { id: 'users', label: 'Users & Access', description: 'Manage users and roles', href: '/users' },
  { id: 'ai', label: 'My AI Assistant', description: 'Open AI command center', href: '/ai' },
];

type GlobalCommandPaletteProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function GlobalCommandPalette({ isOpen, onClose }: GlobalCommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const commands = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return COMMANDS;
    return COMMANDS.filter((item) => item.label.toLowerCase().includes(term) || item.description.toLowerCase().includes(term));
  }, [query]);

  const openCommand = (href: Href) => {
    onClose();
    router.push(href);
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title="Global Command Palette"
      description="Search and run app navigation commands."
      size="md"
      footer={<AppButton label="Close" variant="secondary" size="sm" onPress={onClose} />}
    >
      <View className="gap-3">
        <AppInput
          label="Command"
          placeholder="Try: create product, stock, sales..."
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        <View className="gap-2">
          {commands.map((command) => (
            <Pressable
              key={command.id}
              accessibilityRole="button"
              accessibilityLabel={command.label}
              accessibilityHint={command.description}
              onPress={() => openCommand(command.href)}
              className="rounded-md border border-border bg-surface-2 px-3 py-3 active:bg-primary-tint"
            >
              <Text className="text-small font-semibold text-text">{command.label}</Text>
              <Text className="text-caption text-muted">{command.description}</Text>
            </Pressable>
          ))}
          {commands.length === 0 ? <Text className="text-small text-muted">No commands found.</Text> : null}
        </View>
      </View>
    </AppModal>
  );
}
