import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useAuthSession } from '../hooks/use-auth-session';

type PermissionGateProps = {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
};

export function PermissionGate({ permission, anyOf = [], fallback, children }: PermissionGateProps) {
  const { hasAnyPermission, hasPermission, user } = useAuthSession();

  const checks: string[] = [...anyOf, ...(permission ? [permission] : [])];
  const allowed = checks.length === 0 || hasAnyPermission(checks) || (permission ? hasPermission(permission) : false);

  if (allowed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <View className="m-6 rounded-lg border border-error/30 bg-error-tint p-4">
      <Text className="text-small font-semibold text-error">Access denied</Text>
      <Text className="mt-1 text-caption text-error/90">
        {user?.email ?? 'This account'} does not have required permission to view this section.
      </Text>
    </View>
  );
}
