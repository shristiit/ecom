import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppModal,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@admin/components/ui';
import { useProductLocationsQuery, useRemoveProductLocationMutation, useUpsertProductLocationMutation } from '@admin/features/products';

export default function ProductLocationsScreen() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [isEnabled, setIsEnabled] = useState('true');
  const [pickupEnabled, setPickupEnabled] = useState('false');
  const [formError, setFormError] = useState<string | null>(null);

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const productId = Array.isArray(rawId) ? rawId[0] : rawId;

  const query = useProductLocationsQuery(productId, Boolean(productId));
  const upsertLocation = useUpsertProductLocationMutation();
  const removeLocation = useRemoveProductLocationMutation();
  const locationRows = query.data ?? [];

  const handleAssign = async () => {
    if (!productId) return;
    setFormError(null);
    if (!locationId.trim()) {
      setFormError('Location ID is required.');
      return;
    }

    await upsertLocation.mutateAsync({
      productId,
      input: {
        locationId: locationId.trim(),
        isEnabled: isEnabled.trim().toLowerCase() !== 'false',
        pickupEnabled: pickupEnabled.trim().toLowerCase() === 'true',
      },
    });
    await query.refetch();
    setLocationId('');
    setIsEnabled('true');
    setPickupEnabled('false');
    setIsModalOpen(false);
  };

  const handleRemove = async (nextLocationId: string) => {
    if (!productId) return;
    await removeLocation.mutateAsync({ productId, locationId: nextLocationId });
    await query.refetch();
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Product Locations"
        subtitle={`Location assignments for ${productId ?? 'product'}.`}
        actions={<AppButton label="Assign location" size="sm" onPress={() => setIsModalOpen(true)} />}
      />

      {query.isLoading ? <Text className="text-small text-muted">Loading location assignments...</Text> : null}
      {query.error ? (
        <View className="gap-3">
          <Text className="text-small text-error">{query.error.message}</Text>
          <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
        </View>
      ) : null}

      {!query.isLoading && !query.error ? (
        <AppCard>
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>Location</AppTableHeaderCell>
              <AppTableHeaderCell align="center">Catalog enabled</AppTableHeaderCell>
              <AppTableHeaderCell align="center">Pickup enabled</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Actions</AppTableHeaderCell>
            </AppTableRow>

            {locationRows.map((row) => (
              <AppTableRow key={row.locationId}>
                <AppTableCell>{row.name}</AppTableCell>
                <AppTableCell align="center">{row.isEnabled ? 'Yes' : 'No'}</AppTableCell>
                <AppTableCell align="center">{row.pickupEnabled ? 'Yes' : 'No'}</AppTableCell>
                <AppTableCell align="right">
                  <AppBadge label={row.isEnabled ? 'assigned' : 'disabled'} tone={row.isEnabled ? 'success' : 'default'} />
                </AppTableCell>
                <AppTableCell align="right">
                  <AppButton
                    label="Remove"
                    size="sm"
                    variant="tertiary"
                    loading={removeLocation.isPending}
                    onPress={() => void handleRemove(row.locationId)}
                  />
                </AppTableCell>
              </AppTableRow>
            ))}

            {locationRows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No locations assigned to this product.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        </AppCard>
      ) : null}

      <AppModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Assign product location"
        description="Attach a location with catalog and pickup settings."
        footer={
          <View className="flex-row justify-end gap-2">
            <AppButton label="Cancel" size="sm" variant="secondary" onPress={() => setIsModalOpen(false)} />
            <AppButton label="Assign" size="sm" loading={upsertLocation.isPending} onPress={() => void handleAssign()} />
          </View>
        }
      >
        <View className="gap-3">
          <AppInput label="Location ID" placeholder="Location UUID" value={locationId} onChangeText={setLocationId} />
          <AppInput
            label="Catalog enabled (true/false)"
            placeholder="true"
            value={isEnabled}
            onChangeText={setIsEnabled}
          />
          <AppInput
            label="Pickup enabled (true/false)"
            placeholder="false"
            value={pickupEnabled}
            onChangeText={setPickupEnabled}
          />
          {formError ? <Text className="text-small text-error">{formError}</Text> : null}
          {upsertLocation.error ? <Text className="text-small text-error">{upsertLocation.error.message}</Text> : null}
        </View>
      </AppModal>
    </ScrollView>
  );
}
