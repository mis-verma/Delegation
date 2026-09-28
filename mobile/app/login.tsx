import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";
import { ApiError } from "../lib/api/http";

export default function Login() {
  const { user, isBootstrapping, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isBootstrapping && user) return <Redirect href="/(app)" />;

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign in — check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-surface"
    >
      <View className="flex-1 justify-center px-6">
        <Text className="text-3xl font-bold text-text mb-1">Karya</Text>
        <Text className="text-base text-text-muted mb-8">Sign in to see your checklists and delegations.</Text>

        <Text className="text-sm font-medium text-text-secondary mb-1.5">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@company.com"
          placeholderTextColor="#94a3b8"
          className="border border-border rounded-xl px-4 py-3 text-base text-text bg-surface mb-4"
        />

        <Text className="text-sm font-medium text-text-secondary mb-1.5">Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="••••••••"
          placeholderTextColor="#94a3b8"
          className="border border-border rounded-xl px-4 py-3 text-base text-text bg-surface mb-2"
          onSubmitEditing={handleSubmit}
        />

        {error && <Text className="text-sm text-red-600 mt-2">{error}</Text>}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          className={`mt-6 rounded-xl py-3.5 items-center ${canSubmit ? "bg-primary-700" : "bg-primary-700/40"}`}
        >
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-base font-semibold">Sign in</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
