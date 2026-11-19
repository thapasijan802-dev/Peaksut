import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api, API_BASE } from "../../src/api/client";
import { User, UsageStats } from "../../src/types";

export default function AccountScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [userData, usageData] = await Promise.all([
        api.auth.getMe(),
        api.usage.get().catch(() => null),
      ]);
      setUser(userData);
      setUsage(usageData);
    } catch (err: any) {
      console.warn("Error loading account data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Sign Out", "Are you sure you want to sign out of PeakCut?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            setSigningOut(true);
            await api.auth.logout();
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace("/(auth)/login");
          } catch {
            router.replace("/(auth)/login");
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#1E1612" }}>
      {/* Top Navbar */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255, 255, 255, 0.08)",
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "700", color: "#F4EEEA" }}>Account</Text>
        <Text style={{ fontSize: 12, color: "#A99A91" }}>Profile & Server Usage</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#FF8B33" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8B33" />
          }
        >
          {/* User Profile Card */}
          <View
            style={{
              backgroundColor: "#2C221D",
              borderRadius: 20,
              padding: 20,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.08)",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: "#FF8B33",
                justifyContent: "center",
                alignItems: "center",
                marginRight: 16,
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: "700", color: "#1E1612" }}>
                {(user?.name || user?.email || "U")[0].toUpperCase()}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#F4EEEA" }}>
                  {user?.name || "PeakCut User"}
                </Text>
                <View
                  style={{
                    backgroundColor: user?.is_admin ? "#E5323F" : "#FF8B33",
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ color: "#1E1612", fontWeight: "700", fontSize: 11, textTransform: "uppercase" }}>
                    {user?.is_admin ? "Admin" : "Pro"}
                  </Text>
                </View>
              </View>
              <Text style={{ color: "#A99A91", fontSize: 13 }}>{user?.email}</Text>
            </View>
          </View>

          {/* Current Plan Card */}
          <View
            style={{
              backgroundColor: "#2C221D",
              borderRadius: 20,
              padding: 20,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.08)",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#F4EEEA" }}>Active Subscription</Text>
              <View
                style={{
                  backgroundColor: "rgba(15, 138, 87, 0.2)",
                  borderColor: "#0F8A57",
                  borderWidth: 1,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: "#34D399", fontSize: 11, fontWeight: "700" }}>ACTIVE</Text>
              </View>
            </View>

            <Text style={{ fontSize: 20, fontWeight: "800", color: "#FF8B33", marginBottom: 6 }}>
              {user?.is_admin ? "Full Access Enterprise" : "Creator 30-Day Pass"}
            </Text>
            <Text style={{ color: "#A99A91", fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
              Automatic live monitoring, dual-signal flash-forward clipping, and 1080x1920 vertical video rendering.
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: "#1E1612", padding: 12, borderRadius: 12 }}>
                <Text style={{ color: "#6D6159", fontSize: 11, fontWeight: "600" }}>VIDEO LIMIT</Text>
                <Text style={{ color: "#F4EEEA", fontSize: 16, fontWeight: "700", marginTop: 2 }}>Unlimited</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#1E1612", padding: 12, borderRadius: 12 }}>
                <Text style={{ color: "#6D6159", fontSize: 11, fontWeight: "600" }}>AI POOL</Text>
                <Text style={{ color: "#F4EEEA", fontSize: 16, fontWeight: "700", marginTop: 2 }}>8x Gemini</Text>
              </View>
            </View>
          </View>

          {/* Usage Stats Card */}
          <View
            style={{
              backgroundColor: "#2C221D",
              borderRadius: 20,
              padding: 20,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.08)",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#F4EEEA", marginBottom: 12 }}>
              Server Activity
            </Text>

            <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
              <View style={{ flex: 1, backgroundColor: "#1E1612", padding: 12, borderRadius: 12 }}>
                <Text style={{ color: "#6D6159", fontSize: 11, fontWeight: "600" }}>TODAY'S CLIPS</Text>
                <Text style={{ color: "#FF8B33", fontSize: 20, fontWeight: "800", marginTop: 2 }}>
                  {usage?.today_calls ?? 0}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#1E1612", padding: 12, borderRadius: 12 }}>
                <Text style={{ color: "#6D6159", fontSize: 11, fontWeight: "600" }}>TOTAL PROCESSED</Text>
                <Text style={{ color: "#F4EEEA", fontSize: 20, fontWeight: "800", marginTop: 2 }}>
                  {usage?.total_calls ?? 0}
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#1E1612",
                padding: 10,
                borderRadius: 12,
              }}
            >
              <Ionicons name="server-outline" size={16} color="#0F8A57" style={{ marginRight: 8 }} />
              <Text style={{ color: "#A99A91", fontSize: 12, flex: 1 }}>
                Connected to: <Text style={{ color: "#F4EEEA", fontWeight: "600" }}>{API_BASE}</Text>
              </Text>
            </View>
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity
            onPress={handleSignOut}
            disabled={signingOut}
            activeOpacity={0.8}
            style={{
              backgroundColor: "rgba(211, 52, 63, 0.15)",
              borderWidth: 1,
              borderColor: "rgba(211, 52, 63, 0.3)",
              borderRadius: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 8,
              marginBottom: 32,
            }}
          >
            {signingOut ? (
              <ActivityIndicator color="#E5323F" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={20} color="#E5323F" style={{ marginRight: 8 }} />
                <Text style={{ color: "#E5323F", fontWeight: "700", fontSize: 15 }}>Sign Out</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
