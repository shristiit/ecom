import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@admin/components/ui';
import {
  MasterFormModal,
  useCreateMasterCategoryMutation,
  useDeleteMasterCategoryMutation,
  useMasterCategoriesQuery,
  useUpdateMasterCategoryMutation,
} from '@admin/features/master';

export default function MasterCategoriesScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const query = useMasterCategoriesQuery();
  const createCategory = useCreateMasterCategoryMutation();
  const updateCategory = useUpdateMasterCategoryMutation();
  const deleteCategory = useDeleteMasterCategoryMutation();
  const rows = query.data ?? [];
  const editingRow = rows.find((row) => row.id === editingId);

  const handleSubmit = async (values: Record<string, string>) => {
    const payload = {
      name: values.name.trim(),
      slug: values.slug.trim(),
    };
    if (editingId) {
      await updateCategory.mutateAsync({ id: editingId, input: payload });
    } else {
      await createCategory.mutateAsync(payload);
    }
    await query.refetch();
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteCategory.mutateAsync(id);
    await query.refetch();
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Master categories"
        subtitle="Product taxonomy and category slugs."
        actions={
          <View className="flex-row gap-2">
            <Link href="/master/locations" asChild>
              <AppButton label="Locations" size="sm" variant="secondary" />
            </Link>
            <Link href="/master/suppliers" asChild>
              <AppButton label="Suppliers" size="sm" variant="secondary" />
            </Link>
            <Link href="/master/customers" asChild>
              <AppButton label="Customers" size="sm" variant="secondary" />
            </Link>
            <AppButton
              label="Add category"
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
        {query.isLoading ? <Text className="text-small text-muted">Loading categories...</Text> : null}
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
              <AppTableHeaderCell>Slug</AppTableHeaderCell>
              <AppTableHeaderCell>Created</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Actions</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>{row.name}</AppTableCell>
                <AppTableCell>{row.slug}</AppTableCell>
                <AppTableCell>{new Date(row.createdAt).toLocaleDateString()}</AppTableCell>
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
                      loading={deleteCategory.isPending}
                      onPress={() => void handleDelete(row.id)}
                    />
                  </View>
                </AppTableCell>
              </AppTableRow>
            ))}

            {rows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No categories found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>

      <MasterFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit category' : 'Add category'}
        submitLabel={editingId ? 'Update category' : 'Create category'}
        onSubmit={handleSubmit}
        loading={createCategory.isPending || updateCategory.isPending}
        error={createCategory.error?.message ?? updateCategory.error?.message ?? null}
        initialValues={editingRow ? { name: editingRow.name, slug: editingRow.slug } : undefined}
        fields={[
          { key: 'name', label: 'Name', placeholder: 'Shirts', required: true },
          { key: 'slug', label: 'Slug', placeholder: 'shirts', required: true },
        ]}
      />
    </ScrollView>
  );
}
