import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api, API_BASE } from "../../src/api/client";

export default function LoginScreen() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError("Please fill in both email and password.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        await api.auth.signup(email, password, name);
      } else {
        await api.auth.login(email, password);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (err: any) {
      const msg = err.message || (isSignUp ? "Sign up failed." : "Invalid credentials.");
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#1E1612" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ alignItems: "center", marginBottom: 36 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: "#2C221D",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.12)",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons name="cut" size={32} color="#FF8B33" />
            </View>
            <Text style={{ fontSize: 28, fontWeight: "700", color: "#F4EEEA", letterSpacing: -0.5 }}>
              Peak<Text style={{ color: "#FF8B33" }}>Cut</Text>
            </Text>
            <Text style={{ fontSize: 14, color: "#A99A91", marginTop: 6 }}>
              AI Live Stream Clipper & Viral Shorts
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 10,
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: "#2C221D",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.06)",
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#0F8A57",
                  marginRight: 6,
                }}
              />
              <Text style={{ fontSize: 11, color: "#A99A91" }}>
                {API_BASE.replace("https://", "")}
              </Text>
            </View>
          </View>

          {/* Form Card */}
          <View
            style={{
              backgroundColor: "#2C221D",
              borderRadius: 20,
              padding: 24,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.08)",
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "600", color: "#F4EEEA", marginBottom: 18 }}>
              {isSignUp ? "Create your account" : "Sign in to PeakCut"}
            </Text>

            {error && (
              <View
                style={{
                  backgroundColor: "rgba(211, 52, 63, 0.15)",
                  borderWidth: 1,
                  borderColor: "rgba(211, 52, 63, 0.3)",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: "#F87171", fontSize: 13, lineHeight: 18 }}>{error}</Text>
              </View>
            )}

            {isSignUp && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: "#A99A91", fontSize: 12, marginBottom: 6, fontWeight: "500" }}>
                  Your Name
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Alex"
                  placeholderTextColor="#6D6159"
                  autoCapitalize="words"
                  style={{
                    backgroundColor: "#1E1612",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    color: "#F4EEEA",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                  }}
                />
              </View>
            )}

            <View style={{ marginBottom: 14 }}>
              <Text style={{ color: "#A99A91", fontSize: 12, marginBottom: 6, fontWeight: "500" }}>
                Email address
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor="#6D6159"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  backgroundColor: "#1E1612",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  color: "#F4EEEA",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                }}
              />
            </View>

            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: "#A99A91", fontSize: 12, marginBottom: 6, fontWeight: "500" }}>
                Password
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#6D6159"
                secureTextEntry
                autoCapitalize="none"
                style={{
                  backgroundColor: "#1E1612",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  color: "#F4EEEA",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                }}
              />
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
              style={{
                backgroundColor: "#FF8B33",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {loading ? (
                <ActivityIndicator color="#1E1612" />
              ) : (
                <Text style={{ color: "#1E1612", fontWeight: "700", fontSize: 16 }}>
                  {isSignUp ? "Create Account" : "Sign In"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              activeOpacity={0.7}
              style={{ marginTop: 18, alignItems: "center" }}
            >
              <Text style={{ color: "#A99A91", fontSize: 13 }}>
                {isSignUp ? "Already have an account? " : "Don't have an account yet? "}
                <Text style={{ color: "#FF8B33", fontWeight: "600" }}>
                  {isSignUp ? "Sign In" : "Sign Up"}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
