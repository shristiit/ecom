import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, PageHeader } from '@/components/ui';
import {
  useDeleteSettingsAlertMutation,
  useSettingsAlertsQuery,
  useUpsertSettingsAlertMutation,
} from '@/features/settings';

export default function SettingsAlertsScreen() {
  const query = useSettingsAlertsQuery();
  const upsertAlert = useUpsertSettingsAlertMutation();
  const deleteAlert = useDeleteSettingsAlertMutation();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [threshold, setThreshold] = useState('');
  const [severity, setSeverity] = useState<'warning' | 'critical'>('warning');

  useEffect(() => {
    if (!editingId) return;
    const rule = (query.data ?? []).find((item) => item.id === editingId);
    if (!rule) return;
    setName(rule.name);
    setThreshold(String(rule.threshold));
    setSeverity(rule.severity);
  }, [editingId, query.data]);

  const rules = query.data ?? [];
  const isEditing = Boolean(editingId);
  const canSave = name.trim().length > 1 && Number.isFinite(Number(threshold));
  const buttonLabel = isEditing ? 'Update rule' : 'Create rule';

  const severityOptions = useMemo(
    () => [
      { label: 'Warning', value: 'warning' as const },
      { label: 'Critical', value: 'critical' as const },
    ],
    [],
  );

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setThreshold('');
    setSeverity('warning');
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    const parsedThreshold = Number(threshold);
    const id = editingId ?? `alert-${Date.now()}`;
    await upsertAlert.mutateAsync({
      id,
      name: name.trim(),
      threshold: parsedThreshold,
      severity,
      enabled: true,
    });
    await query.refetch();
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteAlert.mutateAsync(id);
    await query.refetch();
    if (editingId === id) {
      resetForm();
    }
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader title="Settings · Alerts" subtitle="Thresholds for low stock and anomaly detection." />

      <View className="gap-4">
        <AppCard title="Alert rule editor">
          <View className="gap-3">
            <AppInput label="Rule name" placeholder="Low stock" value={name} onChangeText={setName} />
            <AppInput label="Threshold" placeholder="10" keyboardType="number-pad" value={threshold} onChangeText={setThreshold} />
            <View className="flex-row gap-2">
              {severityOptions.map((option) => (
                <AppButton
                  key={option.value}
                  label={option.label}
                  size="sm"
                  variant={severity === option.value ? 'primary' : 'secondary'}
                  onPress={() => setSeverity(option.value)}
                />
              ))}
            </View>
            <View className="flex-row gap-2">
              <AppButton
                label={buttonLabel}
                size="sm"
                disabled={!canSave}
                loading={upsertAlert.isPending}
                onPress={() => void handleSubmit()}
              />
              {isEditing ? <AppButton label="Cancel" size="sm" variant="secondary" onPress={resetForm} /> : null}
            </View>
          </View>
        </AppCard>

        <AppCard title="Active rules">
          {query.isLoading ? <Text className="text-small text-muted">Loading rules...</Text> : null}
          {query.error ? <Text className="text-small text-error">{query.error.message}</Text> : null}
          <View className="gap-2">
            {rules.map((rule) => (
              <View key={rule.id} className="rounded-md border border-border bg-surface-2 px-3 py-3">
                <Text className="text-small font-semibold text-text">{rule.name}</Text>
                <Text className="text-caption text-muted">
                  Threshold: {rule.threshold} · Severity: {rule.severity}
                </Text>
                <View className="mt-2 flex-row gap-2">
                  <AppButton label="Edit" size="sm" variant="secondary" onPress={() => setEditingId(rule.id)} />
                  <AppButton
                    label="Delete"
                    size="sm"
                    variant="tertiary"
                    loading={deleteAlert.isPending}
                    onPress={() => void handleDelete(rule.id)}
                  />
                </View>
              </View>
            ))}
            {rules.length === 0 ? <Text className="text-small text-muted">No alert rules yet.</Text> : null}
          </View>
        </AppCard>
      </View>
    </ScrollView>
  );
}
