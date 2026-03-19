import { Link } from 'expo-router';
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
import { PermissionGate } from '@/features/auth';
import { useUsersQuery } from '@/features/users';

export default function UsersScreen() {
  const query = useUsersQuery({ page: 1, pageSize: 100 });
  const users = query.data?.items ?? [];

  return (
    <PermissionGate permission="admin.roles.read">
      <ScrollView className="bg-bg px-4 py-4">
        <PageHeader
          title="Users & Access"
          subtitle="Users, role definitions, and permission policies."
          actions={
            <View className="flex-row gap-2">
              <Link href="/roles" asChild>
                <AppButton label="Roles" size="sm" variant="secondary" />
              </Link>
              <Link href="/policies" asChild>
                <AppButton label="Policies" size="sm" variant="secondary" />
              </Link>
              <AppButton label="Invite user" size="sm" />
            </View>
          }
        />

        <AppCard title="User directory">
          {query.isLoading ? <Text className="text-small text-muted">Loading users...</Text> : null}
          {query.error ? (
            <View className="gap-3">
              <Text className="text-small text-error">{query.error.message}</Text>
              <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
            </View>
          ) : null}

          {!query.isLoading && !query.error ? (
            <AppTable>
              <AppTableRow header>
                <AppTableHeaderCell>User</AppTableHeaderCell>
                <AppTableHeaderCell>Role</AppTableHeaderCell>
                <AppTableHeaderCell>Email</AppTableHeaderCell>
                <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
              </AppTableRow>

              {users.map((user) => (
                <AppTableRow key={user.id}>
                  <AppTableCell>
                    <Link href={`/users/${user.id}`} asChild>
                      <Text className="text-small font-medium text-primary">{user.fullName || user.email}</Text>
                    </Link>
                  </AppTableCell>
                  <AppTableCell>{user.roles[0]?.name || '-'}</AppTableCell>
                  <AppTableCell>{user.email}</AppTableCell>
                  <AppTableCell align="right">
                    <AppBadge label={user.status} tone={user.status === 'active' ? 'success' : 'default'} />
                  </AppTableCell>
                </AppTableRow>
              ))}

              {users.length === 0 ? (
                <AppTableRow>
                  <AppTableCell className="min-w-full">
                    <Text className="text-small text-muted">No users found.</Text>
                  </AppTableCell>
                </AppTableRow>
              ) : null}
            </AppTable>
          ) : null}
        </AppCard>
      </ScrollView>
    </PermissionGate>
  );
}
