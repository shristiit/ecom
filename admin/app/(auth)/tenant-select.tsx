import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { AppButton, AppSelect } from '@admin/components/ui';
import { AuthScreenShell, useAuthSession } from '@admin/features/auth';

export default function TenantSelectScreen() {
  const { tenants, selectedTenantId, selectTenant } = useAuthSession();
  const [value, setValue] = useState(selectedTenantId ?? tenants[0]?.id ?? '');

  const options = useMemo(
    () => tenants.map((tenant) => ({ label: tenant.name, value: tenant.id, description: tenant.slug })),
    [tenants],
  );

  const hasTenantOptions = options.length > 0;

  return (
    <AuthScreenShell title="Select workspace" subtitle="Choose tenant context before entering the portal">
      <View className="gap-4">
        {hasTenantOptions ? (
          <AppSelect label="Tenant" value={value} options={options} onValueChange={setValue} />
        ) : (
          <Text className="text-small text-muted">No tenant memberships found for this account.</Text>
        )}

        <AppButton
          label="Continue"
          fullWidth
          disabled={!value}
          onPress={() => {
            if (value) {
              selectTenant(value);
            }
          }}
        />
      </View>
    </AuthScreenShell>
  );
}
