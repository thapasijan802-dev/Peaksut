import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Switch,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/client";
import { Creator } from "../../src/types";

function CreatorItem({
  creator,
  onToggle,
}: {
  creator: Creator;
  onToggle: (cid: string, nextVal: boolean) => Promise<void>;
}) {
  const [switching, setSwitching] = useState(false);
  const isAutoWatch = Boolean(creator.auto_watch);
  const isLive = Boolean(creator.live_job || creator.profile?.live);

  const handleToggle = async (val: boolean) => {
    try {
      setSwitching(true);
      await Haptics.selectionAsync();
      await onToggle(creator.id, val);
    } finally {
      setSwitching(false);
    }
  };

  // Determine platforms
  const platforms = creator.channels ? Object.keys(creator.channels) : [];
  if (platforms.length === 0 && creator.channel) {
    if (creator.channel.includes("kick.com")) platforms.push("kick");
    else if (creator.channel.includes("twitch.tv")) platforms.push("twitch");
    else if (creator.channel.includes("youtube.com")) platforms.push("youtube");
  }

  return (
    <View
      style={{
        backgroundColor: "#2C221D",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: isLive ? "rgba(229, 50, 63, 0.4)" : "rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Creator Info */}
      <View style={{ flex: 1, marginRight: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#F4EEEA", marginRight: 8 }}>
            {creator.name}
          </Text>

          {/* Live Badge */}
          {isLive ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "rgba(229, 50, 63, 0.2)",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#E5323F",
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#E5323F",
                  marginRight: 4,
                }}
              />
              <Text style={{ color: "#E5323F", fontSize: 11, fontWeight: "700" }}>LIVE</Text>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
              }}
            >
              <Text style={{ color: "#6D6159", fontSize: 10, fontWeight: "600" }}>OFFLINE</Text>
            </View>
          )}
        </View>

        {/* Stream title or game */}
        {creator.profile?.title ? (
          <Text numberOfLines={1} style={{ color: "#A99A91", fontSize: 12, marginBottom: 6 }}>
            {creator.profile.title}
          </Text>
        ) : null}

        {/* Platform tags */}
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {platforms.map((p) => (
            <View
              key={p}
              style={{
                backgroundColor: "#1E1612",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.06)",
              }}
            >
              <Text style={{ color: "#A99A91", fontSize: 10, fontWeight: "600", textTransform: "capitalize" }}>
                {p}
              </Text>
            </View>
          ))}
          {platforms.length === 0 && (
            <Text style={{ color: "#6D6159", fontSize: 11 }}>Twitch / Kick</Text>
          )}
        </View>
      </View>

      {/* Auto-Record Switch */}
      <View style={{ alignItems: "center" }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: "600",
            color: isAutoWatch ? "#FF8B33" : "#6D6159",
            marginBottom: 4,
          }}
        >
          Auto-Cut
        </Text>
        {switching ? (
          <ActivityIndicator size="small" color="#FF8B33" style={{ height: 31 }} />
        ) : (
          <Switch
            value={isAutoWatch}
            onValueChange={handleToggle}
            trackColor={{ false: "#1E1612", true: "#FF8B33" }}
            thumbColor={isAutoWatch ? "#FFFFFF" : "#A99A91"}
          />
        )}
      </View>
    </View>
  );
}

export default function MonitorsScreen() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCreators = useCallback(async () => {
    try {
      setError(null);
      const data = await api.creators.list();
      setCreators(data);
    } catch (err: any) {
      setError(err.message || "Failed to load monitored creators.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCreators();
  }, [loadCreators]);

  const onRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    loadCreators();
  }, [loadCreators]);

  const handleToggle = async (cid: string, nextVal: boolean) => {
    // Optimistic update
    setCreators((prev) =>
      prev.map((c) => (c.id === cid ? { ...c, auto_watch: nextVal } : c))
    );

    try {
      await api.creators.toggleAutoWatch(cid, nextVal);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      // Revert optimistic update
      setCreators((prev) =>
        prev.map((c) => (c.id === cid ? { ...c, auto_watch: !nextVal } : c))
      );
      Alert.alert("Update Failed", err.message || "Could not toggle auto-record.");
    }
  };

  const liveCount = creators.filter((c) => Boolean(c.live_job || c.profile?.live)).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#1E1612" }}>
      {/* Top Navbar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255, 255, 255, 0.08)",
        }}
      >
        <View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#F4EEEA" }}>
            Monitored Creators
          </Text>
          <Text style={{ fontSize: 12, color: "#A99A91" }}>
            {liveCount > 0 ? `🔴 ${liveCount} currently live` : "Auto-record stream monitors"}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
            backgroundColor: "#2C221D",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.08)",
          }}
        >
          <Text style={{ color: "#FF8B33", fontWeight: "700", fontSize: 13 }}>
            {creators.length} Channels
          </Text>
        </View>
      </View>

      {/* Main Content */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#FF8B33" />
          <Text style={{ color: "#A99A91", marginTop: 12, fontSize: 14 }}>
            Loading creators...
          </Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={48} color="#D3343F" style={{ marginBottom: 12 }} />
          <Text style={{ color: "#F4EEEA", fontSize: 16, fontWeight: "600", textAlign: "center" }}>
            {error}
          </Text>
        </View>
      ) : creators.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Ionicons name="radio-outline" size={54} color="#6D6159" style={{ marginBottom: 14 }} />
          <Text style={{ color: "#F4EEEA", fontSize: 18, fontWeight: "700", marginBottom: 6 }}>
            No channels configured
          </Text>
          <Text style={{ color: "#A99A91", fontSize: 13, textAlign: "center", lineHeight: 20 }}>
            Configure Kick, Twitch, or YouTube streamer URLs on the PeakCut dashboard.
          </Text>
        </View>
      ) : (
        <FlatList
          data={creators}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CreatorItem creator={item} onToggle={handleToggle} />}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8B33" />
          }
        />
      )}
    </SafeAreaView>
  );
}
