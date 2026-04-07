import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@admin/components/ui';
import {
  MasterFormModal,
  useCreateMasterLocationMutation,
  useDeleteMasterLocationMutation,
  useMasterLocationsQuery,
  useUpdateMasterLocationMutation,
} from '@admin/features/master';

export default function MasterLocationsScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const query = useMasterLocationsQuery();
  const createLocation = useCreateMasterLocationMutation();
  const updateLocation = useUpdateMasterLocationMutation();
  const deleteLocation = useDeleteMasterLocationMutation();
  const rows = query.data ?? [];

  const editingRow = rows.find((row) => row.id === editingId);

  const handleSubmit = async (values: Record<string, string>) => {
    const payload = {
      code: values.code.trim(),
      name: values.name.trim(),
      type: values.type.trim(),
      address: values.address.trim(),
      status: (values.status || 'active') as 'active' | 'inactive',
    };

    if (editingId) {
      await updateLocation.mutateAsync({ id: editingId, input: payload });
    } else {
      await createLocation.mutateAsync(payload);
    }

    await query.refetch();
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteLocation.mutateAsync(id);
    await query.refetch();
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Master locations"
        subtitle="Warehouse and store entities used in inventory operations."
        actions={
          <View className="flex-row gap-2">
            <Link href="/master/suppliers" asChild>
              <AppButton label="Suppliers" size="sm" variant="secondary" />
            </Link>
            <Link href="/master/customers" asChild>
              <AppButton label="Customers" size="sm" variant="secondary" />
            </Link>
            <Link href="/master/categories" asChild>
              <AppButton label="Categories" size="sm" variant="secondary" />
            </Link>
            <AppButton
              label="Add location"
              size="sm"
              onPress={() => {
                setEditingId(null);
                setIsModalOpen(true);
              }}
            />
          </View>
        }
      />

      <AppCard>
        {query.isLoading ? <Text className="text-small text-muted">Loading locations...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>Code</AppTableHeaderCell>
              <AppTableHeaderCell>Name</AppTableHeaderCell>
              <AppTableHeaderCell>Type</AppTableHeaderCell>
              <AppTableHeaderCell>Address</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Actions</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.code}</AppTableCell>
                <AppTableCell>{row.name}</AppTableCell>
                <AppTableCell>{row.type}</AppTableCell>
                <AppTableCell>{row.address || '-'}</AppTableCell>
                <AppTableCell align="right">
                  <AppBadge label={row.status} tone={row.status === 'active' ? 'success' : 'default'} />
                </AppTableCell>
                <AppTableCell align="right">
                  <View className="flex-row justify-end gap-2">
                    <AppButton
                      label="Edit"
                      size="sm"
                      variant="tertiary"
                      onPress={() => {
                        setEditingId(row.id);
                        setIsModalOpen(true);
                      }}
                    />
                    <AppButton
                      label="Delete"
                      size="sm"
                      variant="tertiary"
                      loading={deleteLocation.isPending}
                      onPress={() => void handleDelete(row.id)}
                    />
                  </View>
                </AppTableCell>
              </AppTableRow>
            ))}

            {rows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No locations found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <MasterFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit location' : 'Add location'}
        submitLabel={editingId ? 'Update location' : 'Create location'}
        onSubmit={handleSubmit}
        loading={createLocation.isPending || updateLocation.isPending}
        error={createLocation.error?.message ?? updateLocation.error?.message ?? null}
        initialValues={
          editingRow
            ? {
                code: editingRow.code,
                name: editingRow.name,
                type: editingRow.type,
                address: editingRow.address ?? '',
                status: editingRow.status,
              }
            : { status: 'active' }
        }
        fields={[
          { key: 'code', label: 'Code', placeholder: 'WH-01', required: true },
          { key: 'name', label: 'Name', placeholder: 'Main Warehouse', required: true },
          { key: 'type', label: 'Type', placeholder: 'warehouse', required: true },
          { key: 'address', label: 'Address', placeholder: 'Street, City' },
          { key: 'status', label: 'Status', placeholder: 'active' },
        ]}
      />
    </ScrollView>
  );
}
