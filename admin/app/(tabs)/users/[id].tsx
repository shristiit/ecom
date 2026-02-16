import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppBadge, AppButton, AppCard, AppInput, PageHeader } from '@/components/ui';
import {
  useResetUserPasswordMutation,
  useUpdateUserStatusMutation,
  useUserQuery,
} from '@/features/users';

export default function UserDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const userId = Array.isArray(rawId) ? rawId[0] : rawId;

  const query = useUserQuery(userId, Boolean(userId));
  const updateStatus = useUpdateUserStatusMutation();
  const resetPassword = useResetUserPasswordMutation();

  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const user = query.data;

  const handleToggleStatus = async () => {
    if (!userId || !user) return;

    setError(null);
    setMessage(null);
    try {
      await updateStatus.mutateAsync({ id: userId, status: user.status === 'active' ? 'disabled' : 'active' });
      setMessage('User status updated.');
      await query.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user status.');
    }
  };

  const handleResetPassword = async () => {
    if (!userId || !newPassword) {
      setError('Enter a new password.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      await resetPassword.mutateAsync({ id: userId, newPassword });
      setMessage('Password reset successfully.');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    }
  };

  return (
    <ScrollView className="bg-bg px-6 py-6">
      <PageHeader title={user ? user.fullName : 'User detail'} subtitle="Profile, role assignment, and audit activity." />

      {query.isLoading ? <Text className="text-small text-muted">Loading user...</Text> : null}
      {query.error ? (
        <View className="gap-3">
          <Text className="text-small text-error">{query.error.message}</Text>
          <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
        </View>
      ) : null}

      {user ? (
        <View className="gap-4">
          <AppCard title="Identity">
            <View className="gap-2">
              <Text className="text-small text-text">Email: {user.email}</Text>
              <Text className="text-small text-text">Role: {user.roles[0]?.name || '-'}</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-small text-text">Status:</Text>
                <AppBadge label={user.status} tone={user.status === 'active' ? 'success' : 'default'} />
              </View>
              <Text className="text-small text-muted">Last active: {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : '-'}</Text>
            </View>
          </AppCard>

          <AppCard title="Actions">
            <View className="gap-3">
              <AppButton
                label={user.status === 'active' ? 'Deactivate user' : 'Activate user'}
                variant="secondary"
                onPress={() => void handleToggleStatus()}
                loading={updateStatus.isPending}
              />
              <AppInput
                label="Reset password"
                secureTextEntry
                placeholder="New password"
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <AppButton
                label="Apply new password"
                variant="secondary"
                onPress={() => void handleResetPassword()}
                loading={resetPassword.isPending}
              />
              {error ? <Text className="text-small text-error">{error}</Text> : null}
              {message ? <Text className="text-small text-success">{message}</Text> : null}
            </View>
          </AppCard>

          <AppCard title="Recent audit trail">
            <View className="gap-2">
              {(user.recentAudit ?? []).map((event) => (
                <View key={event.id} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <Text className="text-small text-text">{event.why || 'Audit event'}</Text>
                  <Text className="text-caption text-muted">{new Date(event.created_at).toLocaleString()}</Text>
                </View>
              ))}
              {(user.recentAudit ?? []).length === 0 ? (
                <Text className="text-small text-muted">No recent events for this user.</Text>
              ) : null}
            </View>
          </AppCard>
        </View>
      ) : null}
    </ScrollView>
  );
}
