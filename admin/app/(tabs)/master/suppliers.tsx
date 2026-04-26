import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@admin/components/ui';
import { useDebouncedNameFilter } from '@admin/features/shared';
import {
  MasterFormModal,
  useCreateMasterSupplierMutation,
  useDeleteMasterSupplierMutation,
  useMasterSuppliersQuery,
  useUpdateMasterSupplierMutation,
} from '@admin/features/master';

export default function MasterSuppliersScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const query = useMasterSuppliersQuery();
  const createSupplier = useCreateMasterSupplierMutation();
  const updateSupplier = useUpdateMasterSupplierMutation();
  const deleteSupplier = useDeleteMasterSupplierMutation();
  const rows = query.data ?? [];
  const { nameFilter, setNameFilter, filteredRows, hasActiveFilter } = useDebouncedNameFilter(rows);
  const editingRow = rows.find((row) => row.id === editingId);

  const handleSubmit = async (values: Record<string, string>) => {
    const payload = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      address: values.address.trim(),
      status: (values.status || 'active') as 'active' | 'inactive',
    };
    if (editingId) {
      await updateSupplier.mutateAsync({ id: editingId, input: payload });
    } else {
      await createSupplier.mutateAsync(payload);
    }
    await query.refetch();
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteSupplier.mutateAsync(id);
    await query.refetch();
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Master suppliers"
        subtitle="Supplier catalog used by purchasing and receiving flows."
        actions={
          <View className="flex-row gap-2">
            <Link href="/master/locations" asChild>
              <AppButton label="Locations" size="sm" variant="secondary" />
            </Link>
            <Link href="/master/customers" asChild>
              <AppButton label="Customers" size="sm" variant="secondary" />
            </Link>
            <Link href="/master/categories" asChild>
              <AppButton label="Categories" size="sm" variant="secondary" />
            </Link>
            <AppButton
              label="Add supplier"
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
        {query.isLoading ? <Text className="text-small text-muted">Loading suppliers...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <View className="gap-4">
            <AppInput
              label="Filter by supplier name"
              placeholder="Type a supplier name"
              value={nameFilter}
              onChangeText={setNameFilter}
              autoCapitalize="none"
              autoCorrect={false}
              containerClassName="max-w-md"
            />

            <AppTable>
              <AppTableRow header>
                <AppTableHeaderCell>Name</AppTableHeaderCell>
                <AppTableHeaderCell>Email</AppTableHeaderCell>
                <AppTableHeaderCell>Phone</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Actions</AppTableHeaderCell>
              </AppTableRow>

              {filteredRows.map((row) => (
                <AppTableRow key={row.id}>
                  <AppTableCell>{row.name}</AppTableCell>
                  <AppTableCell>{row.email || '-'}</AppTableCell>
                  <AppTableCell>{row.phone || '-'}</AppTableCell>
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
                        loading={deleteSupplier.isPending}
                        onPress={() => void handleDelete(row.id)}
                      />
                    </View>
                  </AppTableCell>
                </AppTableRow>
              ))}

              {filteredRows.length === 0 ? (
                <AppTableRow>
                  <AppTableCell className="min-w-full">
                    <Text className="text-small text-muted">
                      {rows.length === 0 ? 'No suppliers found.' : hasActiveFilter ? 'No suppliers match that name.' : 'No suppliers found.'}
                    </Text>
                  </AppTableCell>
                </AppTableRow>
              ) : null}
            </AppTable>
          </View>
        ) : null}
      </AppCard>

      <MasterFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit supplier' : 'Add supplier'}
        submitLabel={editingId ? 'Update supplier' : 'Create supplier'}
        onSubmit={handleSubmit}
        loading={createSupplier.isPending || updateSupplier.isPending}
        error={createSupplier.error?.message ?? updateSupplier.error?.message ?? null}
        initialValues={
          editingRow
            ? {
                name: editingRow.name,
                email: editingRow.email ?? '',
                phone: editingRow.phone ?? '',
                address: editingRow.address ?? '',
                status: editingRow.status,
              }
            : { status: 'active' }
        }
        fields={[
          { key: 'name', label: 'Name', placeholder: 'North Supply', required: true },
          { key: 'email', label: 'Email', placeholder: 'procurement@supplier.com' },
          { key: 'phone', label: 'Phone', placeholder: '+1 555...' },
          { key: 'address', label: 'Address', placeholder: 'Street, City' },
          { key: 'status', label: 'Status', placeholder: 'active' },
        ]}
      />
    </ScrollView>
  );
}
