import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";

// The single entry point at "/" — decides where to send the user before anything else renders.
export default function Index() {
  const { user, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#213e6a" />
      </View>
    );
  }

  return <Redirect href={user ? "/(app)" : "/login"} />;
}
