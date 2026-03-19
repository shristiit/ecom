import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, PageHeader } from '@/components/ui';
import { useSettingsIntegrationsQuery, useUpdateSettingsIntegrationMutation } from '@/features/settings';

export default function SettingsIntegrationsScreen() {
  const query = useSettingsIntegrationsQuery();
  const updateIntegration = useUpdateSettingsIntegrationMutation();
  const rows = query.data ?? [];

  const handleToggle = async (key: 'erp' | 'accounting' | 'sso' | 'webhooks', currentlyConnected: boolean) => {
    await updateIntegration.mutateAsync({
      key,
      patch: {
        status: currentlyConnected ? 'not_connected' : 'connected',
      },
    });
    await query.refetch();
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader title="Settings · Integrations" subtitle="External systems and connection health." />

      {query.isLoading ? <Text className="mb-3 text-small text-muted">Loading integrations...</Text> : null}
      {query.error ? <Text className="mb-3 text-small text-error">{query.error.message}</Text> : null}

      <View className="gap-4">
        {rows.map((integration) => (
          <AppCard
            key={integration.key}
            title={integration.name}
            rightSlot={
              <AppButton
                label={integration.status === 'connected' ? 'Disconnect' : 'Connect'}
                size="sm"
                variant="secondary"
                loading={updateIntegration.isPending}
                onPress={() => void handleToggle(integration.key, integration.status === 'connected')}
              />
            }
          >
            <Text className="text-small text-muted">
              {integration.status === 'connected' ? 'Connected' : integration.status === 'error' ? 'Error' : 'Not connected'}
            </Text>
            <Text className="text-caption text-subtle">Updated {new Date(integration.updatedAt).toLocaleString()}</Text>
          </AppCard>
        ))}
      </View>
    </ScrollView>
  );
}
