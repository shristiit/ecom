import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton, AppCard, AppInput, PageHeader } from '@/components/ui';
import { useSaveSettingsProfileMutation, useSettingsProfileQuery } from '@/features/settings';

export default function SettingsProfileScreen() {
  const query = useSettingsProfileQuery();
  const saveProfile = useSaveSettingsProfileMutation();

  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setTenantName(query.data.tenantName);
    setTenantSlug(query.data.tenantSlug);
    setSupportEmail(query.data.supportEmail);
  }, [query.data]);

  const handleSave = async () => {
    setMessage(null);
    setError(null);
    if (!tenantName.trim() || !tenantSlug.trim()) {
      setError('Tenant name and slug are required.');
      return;
    }

    await saveProfile.mutateAsync({
      tenantName: tenantName.trim(),
      tenantSlug: tenantSlug.trim(),
      supportEmail: supportEmail.trim(),
    });

    setMessage('Profile saved.');
    await query.refetch();
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader title="Settings · Profile" subtitle="Tenant identity and branding preferences." />

      <View className="gap-4">
        <AppCard title="Tenant profile">
          <View className="gap-3">
            {query.isLoading ? <Text className="text-small text-muted">Loading profile…</Text> : null}
            {query.error ? <Text className="text-small text-error">{query.error.message}</Text> : null}
            <AppInput label="Tenant name" placeholder="Demo Tenant" value={tenantName} onChangeText={setTenantName} />
            <AppInput label="Tenant slug" placeholder="demo" value={tenantSlug} onChangeText={setTenantSlug} />
            <AppInput
              label="Support email"
              placeholder="ops@demo.com"
              keyboardType="email-address"
              value={supportEmail}
              onChangeText={setSupportEmail}
            />
            {error ? <Text className="text-small text-error">{error}</Text> : null}
            {message ? <Text className="text-small text-success">{message}</Text> : null}
            <AppButton label="Save profile" size="sm" onPress={() => void handleSave()} loading={saveProfile.isPending} />
          </View>
        </AppCard>
      </View>
    </ScrollView>
  );
}
