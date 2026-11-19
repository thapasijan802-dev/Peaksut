import "../global.css";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { api, setUnauthorizedHandler } from "../src/api/client";

export default function RootLayout() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      router.replace("/(auth)/login");
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [router]);

  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      try {
        const authed = await api.auth.isAuthenticated();
        if (!isMounted) return;

        const inAuthGroup = segments[0] === "(auth)";

        if (!authed && !inAuthGroup) {
          router.replace("/(auth)/login");
        } else if (authed && inAuthGroup) {
          router.replace("/(tabs)");
        }
      } catch {
        if (!isMounted) return;
        router.replace("/(auth)/login");
      } finally {
        if (isMounted) setCheckingAuth(false);
      }
    }

    checkAuth();
    return () => {
      isMounted = false;
    };
  }, [segments]);

  if (checkingAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: "#1E1612", justifyContent: "center", alignItems: "center" }}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#FF8B33" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#1E1612" }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#1E1612" },
          animation: "fade",
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </View>
  );
}
