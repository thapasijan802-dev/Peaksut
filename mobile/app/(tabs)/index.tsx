import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  SafeAreaView,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api, getAuthToken, API_BASE } from "../../src/api/client";
import { Clip } from "../../src/types";

interface ClipCardProps {
  clip: Clip;
  isActive: boolean;
  token: string | null;
}

function ClipCard({ clip, isActive, token }: ClipCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Setup video source with session Cookie and Authorization headers
  const videoSource = token
    ? {
        uri: clip.video_url,
        headers: {
          Cookie: `peakcut_session=${token}`,
          Authorization: `Bearer ${token}`,
          Origin: API_BASE,
        },
      }
    : clip.video_url;

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Autoplay visible video, pause off-screen videos to save memory and audio overlap
  useEffect(() => {
    try {
      if (isActive) {
        player.play();
      } else {
        player.pause();
      }
    } catch {
      // player state safeguard
    }
  }, [isActive, player]);

  const handleDownloadToGallery = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setDownloading(true);

      // Request media library permission for video
      const { status } = await MediaLibrary.requestPermissionsAsync(true, ["video"]);
      if (status !== "granted") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          "Gallery Permission Required",
          "Please grant media permission so PeakCut can save generated clips directly to your Android device gallery."
        );
        return;
      }

      const authToken = await getAuthToken();
      const sanitizedId = clip.id.replace(/[^a-zA-Z0-9_-]/g, "");
      const tempUri = `${FileSystem.cacheDirectory}clip_${sanitizedId}.mp4`;

      // Download file to cache
      const downloadRes = await FileSystem.downloadAsync(clip.video_url, tempUri, {
        headers: authToken
          ? {
              Cookie: `peakcut_session=${authToken}`,
              Authorization: `Bearer ${authToken}`,
              Origin: API_BASE,
            }
          : { Origin: API_BASE },
      });

      // Save directly to device gallery
      try {
        await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
      } catch {
        await MediaLibrary.createAssetAsync(downloadRes.uri);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved to Gallery! 🎬", `"${clip.title || "Clip"}" has been saved to your Photos.`);
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Download Error", err.message || "Failed to download clip to gallery.");
    } finally {
      // Clean up temporary cache file so phone storage is preserved
      const sanitizedId = clip.id.replace(/[^a-zA-Z0-9_-]/g, "");
      const tempUri = `${FileSystem.cacheDirectory}clip_${sanitizedId}.mp4`;
      FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    const sanitizedId = clip.id.replace(/[^a-zA-Z0-9_-]/g, "");
    const tempUri = `${FileSystem.cacheDirectory}share_${sanitizedId}.mp4`;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSharing(true);

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing Unavailable", "Native sharing is not supported on this device.");
        return;
      }

      const authToken = await getAuthToken();
      const fileInfo = await FileSystem.getInfoAsync(tempUri);
      let targetUri = tempUri;

      if (!fileInfo.exists) {
        const downloadRes = await FileSystem.downloadAsync(clip.video_url, tempUri, {
          headers: authToken
            ? {
                Cookie: `peakcut_session=${authToken}`,
                Authorization: `Bearer ${authToken}`,
                Origin: API_BASE,
              }
            : { Origin: API_BASE },
        });
        targetUri = downloadRes.uri;
      }

      await Sharing.shareAsync(targetUri, {
        mimeType: "video/mp4",
        dialogTitle: clip.title || "Share PeakCut Viral Clip",
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Share Error", err.message || "Could not share clip.");
    } finally {
      FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      setSharing(false);
    }
  };

  const score = Math.round(clip.score || 75);
  const isHighViral = score >= 85;

  return (
    <View
      style={{
        backgroundColor: "#2C221D",
        borderRadius: 20,
        marginBottom: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Video View */}
      <View style={{ width: "100%", height: 380, backgroundColor: "#140E0B", position: "relative" }}>
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          nativeControls
        />

        {/* Viral Score Badge */}
        <View
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 12,
            backgroundColor: isHighViral ? "rgba(229, 50, 63, 0.9)" : "rgba(255, 139, 51, 0.9)",
          }}
        >
          <Text style={{ fontSize: 13, marginRight: 4 }}>{isHighViral ? "🔥" : "⚡"}</Text>
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}>
            Score {score}
          </Text>
        </View>

        {/* Layout Badge */}
        <View
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: "rgba(30, 22, 18, 0.8)",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.1)",
          }}
        >
          <Text style={{ color: "#A99A91", fontSize: 11, fontWeight: "600", textTransform: "capitalize" }}>
            {clip.layout || "9:16"}
          </Text>
        </View>

        {/* Hook Text Overlay Preview */}
        {clip.hook ? (
          <View
            style={{
              position: "absolute",
              bottom: 14,
              left: 14,
              right: 14,
              backgroundColor: "rgba(0, 0, 0, 0.65)",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
            }}
          >
            <Text
              numberOfLines={2}
              style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700", textAlign: "center" }}
            >
              "{clip.hook}"
            </Text>
          </View>
        ) : null}
      </View>

      {/* Info & Actions */}
      <View style={{ padding: 16 }}>
        <Text
          numberOfLines={2}
          style={{ fontSize: 16, fontWeight: "700", color: "#F4EEEA", lineHeight: 22, marginBottom: 4 }}
        >
          {clip.title || "Viral Stream Moment"}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <Ionicons name="person-circle-outline" size={16} color="#A99A91" style={{ marginRight: 4 }} />
          <Text style={{ color: "#A99A91", fontSize: 13, fontWeight: "500", marginRight: 12 }}>
            {clip.creator_name || "Streamer"}
          </Text>
          {clip.duration ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="time-outline" size={14} color="#6D6159" style={{ marginRight: 3 }} />
              <Text style={{ color: "#6D6159", fontSize: 12 }}>{Math.round(clip.duration)}s</Text>
            </View>
          ) : null}
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={handleDownloadToGallery}
            disabled={downloading}
            activeOpacity={0.8}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FF8B33",
              borderRadius: 12,
              paddingVertical: 12,
              opacity: downloading ? 0.7 : 1,
            }}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#1E1612" />
            ) : (
              <>
                <Ionicons name="images-outline" size={18} color="#1E1612" style={{ marginRight: 6 }} />
                <Text style={{ color: "#1E1612", fontWeight: "700", fontSize: 14 }}>Save to Gallery</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            activeOpacity={0.8}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#1E1612",
              borderRadius: 12,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.12)",
              opacity: sharing ? 0.7 : 1,
            }}
          >
            {sharing ? (
              <ActivityIndicator size="small" color="#FF8B33" />
            ) : (
              <>
                <Ionicons name="share-social-outline" size={18} color="#FF8B33" style={{ marginRight: 6 }} />
                <Text style={{ color: "#F4EEEA", fontWeight: "600", fontSize: 14 }}>Share</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ClipsFeedScreen() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClips = useCallback(async () => {
    try {
      setError(null);
      const [data, authToken] = await Promise.all([api.clips.getRecent(), getAuthToken()]);
      setClips(data);
      setToken(authToken);
      if (data.length > 0 && !activeClipId) {
        setActiveClipId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load clips from server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeClipId]);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  const onRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    loadClips();
  }, [loadClips]);

  // Pause off-screen videos as the user scrolls through the vertical feed
  const onViewableItemsChanged = useRef((info: { viewableItems: any[] }) => {
    if (info.viewableItems.length > 0 && info.viewableItems[0].item) {
      setActiveClipId(info.viewableItems[0].item.id);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

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
            Peak<Text style={{ color: "#FF8B33" }}>Cut</Text>
          </Text>
          <Text style={{ fontSize: 12, color: "#A99A91" }}>AI Viral Clips Feed</Text>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          activeOpacity={0.7}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: "#2C221D",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.08)",
          }}
        >
          <Ionicons name="refresh" size={18} color="#FF8B33" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#FF8B33" />
          <Text style={{ color: "#A99A91", marginTop: 12, fontSize: 14 }}>Loading viral clips...</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Ionicons name="cloud-offline-outline" size={48} color="#D3343F" style={{ marginBottom: 12 }} />
          <Text style={{ color: "#F4EEEA", fontSize: 16, fontWeight: "600", textAlign: "center" }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={loadClips}
            style={{
              marginTop: 18,
              backgroundColor: "#FF8B33",
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "#1E1612", fontWeight: "700" }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : clips.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Ionicons name="film-outline" size={54} color="#6D6159" style={{ marginBottom: 14 }} />
          <Text style={{ color: "#F4EEEA", fontSize: 18, fontWeight: "700", marginBottom: 6 }}>
            No clips rendered yet
          </Text>
          <Text style={{ color: "#A99A91", fontSize: 13, textAlign: "center", lineHeight: 20 }}>
            When monitored creators go live or recordings complete, AI hooks and split-screen clips will
            appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={clips}
          keyExtractor={(item) => `${item.jid}_${item.id}`}
          renderItem={({ item }) => (
            <ClipCard clip={item} isActive={item.id === activeClipId} token={token} />
          )}
          contentContainerStyle={{ padding: 16 }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8B33" colors={["#FF8B33"]} />
          }
        />
      )}
    </SafeAreaView>
  );
}
