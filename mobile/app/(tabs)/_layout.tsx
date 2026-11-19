import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#1E1612",
          borderTopColor: "rgba(255, 255, 255, 0.08)",
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#FF8B33",
        tabBarInactiveTintColor: "#A99A91",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Clips",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "videocam" : "videocam-outline"} size={22} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="monitors"
        options={{
          title: "Monitors",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "radio" : "radio-outline"} size={22} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color as any} />
          ),
        }}
      />
    </Tabs>
  );
}
