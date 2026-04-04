import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="mfa" />
      <Stack.Screen name="tenant-select" />
      <Stack.Screen name="select-tenant" />
    </Stack>
  );
}
