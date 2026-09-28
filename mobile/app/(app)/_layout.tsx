import { View, ActivityIndicator } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../lib/auth/AuthContext";

export default function AppLayout() {
  const { user, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#213e6a" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
