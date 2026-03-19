import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, AppModal, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@/components/ui';
import { PermissionGate } from '@/features/auth';
import { useCreatePolicyMutation, useDeletePolicyMutation, usePoliciesQuery, useUpdatePolicyMutation } from '@/features/users';

export default function PoliciesScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [rules, setRules] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const query = usePoliciesQuery();
  const createPolicy = useCreatePolicyMutation();
  const updatePolicy = useUpdatePolicyMutation();
  const deletePolicy = useDeletePolicyMutation();
  const rows = query.data ?? [];

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setRules('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (id: string) => {
    const row = rows.find((item) => item.id === id);
    setEditingId(id);
    setName(row?.name ?? '');
    setRules((row?.rules ?? []).map((rule) => rule.type).join(', '));
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError('Policy name is required.');
      return;
    }

    const parsedRules = rules
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((type) => ({ type, params: {} as Record<string, unknown> }));

    if (editingId) {
      await updatePolicy.mutateAsync({ id: editingId, input: { name: name.trim(), rules: parsedRules } });
    } else {
      await createPolicy.mutateAsync({ name: name.trim(), rules: parsedRules });
    }

    await query.refetch();
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deletePolicy.mutateAsync(id);
    await query.refetch();
  };

  return (
    <PermissionGate permission="admin.policies.read">
      <ScrollView className="bg-bg px-4 py-4">
        <PageHeader
          title="Policies"
          subtitle="Permission policies and rule sets."
          actions={<AppButton label="Create policy" size="sm" onPress={openCreate} />}
        />

        <AppCard>
          {query.isLoading ? <Text className="text-small text-muted">Loading policies...</Text> : null}
          {query.error ? (
            <View className="gap-3">
              <Text className="text-small text-error">{query.error.message}</Text>
              <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
            </View>
          ) : null}

          {!query.isLoading && !query.error ? (
            <AppTable>
              <AppTableRow header>
                <AppTableHeaderCell>Name</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Rules</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Actions</AppTableHeaderCell>
              </AppTableRow>

              {rows.map((row) => (
                <AppTableRow key={row.id}>
                  <AppTableCell>{row.name}</AppTableCell>
                  <AppTableCell align="right" className="tabular-nums">
                    {row.rules?.length ?? 0}
                  </AppTableCell>
                  <AppTableCell align="right">
                    <View className="flex-row justify-end gap-2">
                      <AppButton label="Edit" size="sm" variant="tertiary" onPress={() => openEdit(row.id)} />
                      <AppButton
                        label="Delete"
                        size="sm"
                        variant="tertiary"
                        loading={deletePolicy.isPending}
                        onPress={() => void handleDelete(row.id)}
                      />
                    </View>
                  </AppTableCell>
                </AppTableRow>
              ))}

              {rows.length === 0 ? (
                <AppTableRow>
                  <AppTableCell className="min-w-full">
                    <Text className="text-small text-muted">No policies found.</Text>
                  </AppTableCell>
                </AppTableRow>
              ) : null}
            </AppTable>
          ) : null}
        </AppCard>

        <AppModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingId ? 'Edit policy' : 'Create policy'}
          description="Enter rule types as comma-separated keys."
          footer={
            <View className="flex-row justify-end gap-2">
              <AppButton label="Cancel" size="sm" variant="secondary" onPress={() => setIsModalOpen(false)} />
              <AppButton
                label={editingId ? 'Update policy' : 'Create policy'}
                size="sm"
                loading={createPolicy.isPending || updatePolicy.isPending}
                onPress={() => void handleSubmit()}
              />
            </View>
          }
        >
          <View className="gap-3">
            <AppInput label="Policy name" placeholder="Inventory controls" value={name} onChangeText={setName} />
            <AppInput
              label="Rule types"
              placeholder="max_qty, restricted_location"
              value={rules}
              onChangeText={setRules}
            />
            {formError ? <Text className="text-small text-error">{formError}</Text> : null}
            {createPolicy.error ? <Text className="text-small text-error">{createPolicy.error.message}</Text> : null}
            {updatePolicy.error ? <Text className="text-small text-error">{updatePolicy.error.message}</Text> : null}
          </View>
        </AppModal>
      </ScrollView>
    </PermissionGate>
  );
}
