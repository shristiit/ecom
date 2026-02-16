import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, PageHeader } from '@/components/ui';
import { useSettingsWorkflowsQuery, useUpsertSettingsWorkflowMutation } from '@/features/settings';

export default function SettingsWorkflowsScreen() {
  const query = useSettingsWorkflowsQuery();
  const upsertWorkflow = useUpsertSettingsWorkflowMutation();
  const rows = query.data ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [approver, setApprover] = useState('');
  const [threshold, setThreshold] = useState('');

  useEffect(() => {
    if (!editingId) return;
    const match = (query.data ?? []).find((row) => row.id === editingId);
    if (!match) return;
    setAction(match.action);
    setApprover(match.approver);
    setThreshold(match.threshold);
  }, [editingId, query.data]);

  const resetEditor = () => {
    setEditingId(null);
    setAction('');
    setApprover('');
    setThreshold('');
  };

  const handleSave = async () => {
    if (!action.trim() || !approver.trim() || !threshold.trim()) return;
    await upsertWorkflow.mutateAsync({
      id: editingId ?? `workflow-${Date.now()}`,
      action: action.trim(),
      approver: approver.trim(),
      threshold: threshold.trim(),
      enabled: true,
    });
    await query.refetch();
    resetEditor();
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader title="Settings · Workflows" subtitle="Approval matrices by action type." />

      <View className="gap-4">
        <AppCard title={editingId ? 'Edit workflow' : 'New workflow'}>
          <View className="gap-3">
            <AppInput label="Action" placeholder="Large adjustment" value={action} onChangeText={setAction} />
            <AppInput label="Approver role" placeholder="Inventory manager" value={approver} onChangeText={setApprover} />
            <AppInput label="Threshold" placeholder="> 50 units" value={threshold} onChangeText={setThreshold} />
            <View className="flex-row gap-2">
              <AppButton
                label={editingId ? 'Update workflow' : 'Create workflow'}
                size="sm"
                onPress={() => void handleSave()}
                loading={upsertWorkflow.isPending}
              />
              {editingId ? <AppButton label="Cancel" size="sm" variant="secondary" onPress={resetEditor} /> : null}
            </View>
          </View>
        </AppCard>

        {query.isLoading ? <Text className="text-small text-muted">Loading workflows...</Text> : null}
        {query.error ? <Text className="text-small text-error">{query.error.message}</Text> : null}

        {rows.map((row) => (
          <AppCard key={row.id} title={row.action} rightSlot={<AppButton label="Edit" size="sm" variant="secondary" onPress={() => setEditingId(row.id)} />}>
            <Text className="text-small text-muted">Approver: {row.approver}</Text>
            <Text className="text-small text-muted">Threshold: {row.threshold}</Text>
          </AppCard>
        ))}
      </View>
    </ScrollView>
  );
}
