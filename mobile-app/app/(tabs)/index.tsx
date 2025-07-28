// mobile-app/app/(tabs)/index.tsx
import { Box, Text, Button } from "@gluestack-ui/themed";

export default function TabOneScreen() {
  return (
    <Box className="flex-1 items-center justify-center bg-gray-100">
      <Text className="text-2xl font-bold text-green-600 mb-4">
        Mobile App up 🎉
      </Text>

      <Button size="lg">Gluestack Button</Button>
    </Box>
  );
}
