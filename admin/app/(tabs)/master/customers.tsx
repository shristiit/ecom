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
} from '@/components/ui';
import {
  MasterFormModal,
  useCreateMasterCustomerMutation,
  useDeleteMasterCustomerMutation,
  useMasterCustomersQuery,
  useUpdateMasterCustomerMutation,
} from '@/features/master';

export default function MasterCustomersScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const query = useMasterCustomersQuery();
  const createCustomer = useCreateMasterCustomerMutation();
  const updateCustomer = useUpdateMasterCustomerMutation();
  const deleteCustomer = useDeleteMasterCustomerMutation();
  const rows = query.data ?? [];
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
      await updateCustomer.mutateAsync({ id: editingId, input: payload });
    } else {
      await createCustomer.mutateAsync(payload);
    }
    await query.refetch();
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteCustomer.mutateAsync(id);
    await query.refetch();
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader
        title="Master customers"
        subtitle="Customer records used in sales and invoicing."
        actions={
          <View className="flex-row gap-2">
            <Link href="/master/locations" asChild>
              <AppButton label="Locations" size="sm" variant="secondary" />
            </Link>
            <Link href="/master/suppliers" asChild>
              <AppButton label="Suppliers" size="sm" variant="secondary" />
            </Link>
            <Link href="/master/categories" asChild>
              <AppButton label="Categories" size="sm" variant="secondary" />
            </Link>
            <AppButton
              label="Add customer"
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
        {query.isLoading ? <Text className="text-small text-muted">Loading customers...</Text> : null}
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
              <AppTableHeaderCell>Email</AppTableHeaderCell>
              <AppTableHeaderCell>Phone</AppTableHeaderCell>
              <AppTableHeaderCell>Address</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Actions</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.name}</AppTableCell>
                <AppTableCell>{row.email || '-'}</AppTableCell>
                <AppTableCell>{row.phone || '-'}</AppTableCell>
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
                      loading={deleteCustomer.isPending}
                      onPress={() => void handleDelete(row.id)}
                    />
                  </View>
                </AppTableCell>
              </AppTableRow>
            ))}

            {rows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No customers found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <MasterFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit customer' : 'Add customer'}
        submitLabel={editingId ? 'Update customer' : 'Create customer'}
        onSubmit={handleSubmit}
        loading={createCustomer.isPending || updateCustomer.isPending}
        error={createCustomer.error?.message ?? updateCustomer.error?.message ?? null}
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
          { key: 'name', label: 'Name', placeholder: 'Retail Customer A', required: true },
          { key: 'email', label: 'Email', placeholder: 'buyer@customer.com' },
          { key: 'phone', label: 'Phone', placeholder: '+1 555...' },
          { key: 'address', label: 'Address', placeholder: 'Street, City' },
          { key: 'status', label: 'Status', placeholder: 'active' },
        ]}
      />
    </ScrollView>
  );
}
