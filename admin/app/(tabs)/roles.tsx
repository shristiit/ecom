import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, AppModal, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@/components/ui';
import { PermissionGate } from '@/features/auth';
import { useCreateRoleMutation, useDeleteRoleMutation, useRolesQuery, useUpdateRoleMutation } from '@/features/users';

export default function RolesScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const query = useRolesQuery();
  const createRole = useCreateRoleMutation();
  const updateRole = useUpdateRoleMutation();
  const deleteRole = useDeleteRoleMutation();
  const rows = query.data ?? [];

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setPermissions('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (id: string) => {
    const row = rows.find((item) => item.id === id);
    setEditingId(id);
    setName(row?.name ?? '');
    setPermissions((row?.permissions ?? []).join(', '));
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError('Role name is required.');
      return;
    }

    const parsedPermissions = permissions
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (editingId) {
      await updateRole.mutateAsync({ id: editingId, input: { name: name.trim(), permissions: parsedPermissions } });
    } else {
      await createRole.mutateAsync({ name: name.trim(), permissions: parsedPermissions });
    }

    await query.refetch();
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteRole.mutateAsync(id);
    await query.refetch();
  };

  return (
    <PermissionGate permission="admin.roles.read">
      <ScrollView className="bg-bg px-6 py-6">
        <PageHeader
          title="Roles"
          subtitle="Role definitions and bound permissions."
          actions={<AppButton label="Create role" size="sm" onPress={openCreate} />}
        />

        <AppCard>
          {query.isLoading ? <Text className="text-small text-muted">Loading roles...</Text> : null}
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
                <AppTableHeaderCell align="right">Permissions</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Actions</AppTableHeaderCell>
              </AppTableRow>

              {rows.map((row) => (
                <AppTableRow key={row.id}>
                  <AppTableCell>{row.name}</AppTableCell>
                  <AppTableCell align="right" className="tabular-nums">
                    {row.permissions?.length ?? 0}
                  </AppTableCell>
                  <AppTableCell align="right">
                    <View className="flex-row justify-end gap-2">
                      <AppButton label="Edit" size="sm" variant="tertiary" onPress={() => openEdit(row.id)} />
                      <AppButton
                        label="Delete"
                        size="sm"
                        variant="tertiary"
                        loading={deleteRole.isPending}
                        onPress={() => void handleDelete(row.id)}
                      />
                    </View>
                  </AppTableCell>
                </AppTableRow>
              ))}

              {rows.length === 0 ? (
                <AppTableRow>
                  <AppTableCell className="min-w-full">
                    <Text className="text-small text-muted">No roles found.</Text>
                  </AppTableCell>
                </AppTableRow>
              ) : null}
            </AppTable>
          ) : null}
        </AppCard>

        <AppModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingId ? 'Edit role' : 'Create role'}
          description="Permissions should be comma-separated."
          footer={
            <View className="flex-row justify-end gap-2">
              <AppButton label="Cancel" size="sm" variant="secondary" onPress={() => setIsModalOpen(false)} />
              <AppButton
                label={editingId ? 'Update role' : 'Create role'}
                size="sm"
                loading={createRole.isPending || updateRole.isPending}
                onPress={() => void handleSubmit()}
              />
            </View>
          }
        >
          <View className="gap-3">
            <AppInput label="Role name" placeholder="Inventory Manager" value={name} onChangeText={setName} />
            <AppInput
              label="Permissions"
              placeholder="inventory.read, inventory.write"
              value={permissions}
              onChangeText={setPermissions}
            />
            {formError ? <Text className="text-small text-error">{formError}</Text> : null}
            {createRole.error ? <Text className="text-small text-error">{createRole.error.message}</Text> : null}
            {updateRole.error ? <Text className="text-small text-error">{updateRole.error.message}</Text> : null}
          </View>
        </AppModal>
      </ScrollView>
    </PermissionGate>
  );
}
