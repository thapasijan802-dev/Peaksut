import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Alert,
  StyleSheet,
  Modal,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api, getAuthToken, API_BASE } from "../../src/api/client";
import { Clip, Job } from "../../src/types";
import { PeakCutLogo } from "../../src/components/PeakCutLogo";

interface ClipWithCreator extends Clip {
  creatorName?: string;
}

export default function ClipsScreen() {
  const [clips, setClips] = useState<ClipWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterHighScore, setFilterHighScore] = useState(false);

  // Preview modal
  const [previewClip, setPreviewClip] = useState<Clip | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    getAuthToken().then(setAuthToken);
  }, []);

  const loadAllClips = useCallback(async () => {
    try {
      const [jobsData, creatorsData] = await Promise.all([
        api.getJobs(),
        api.creators.list(),
      ]);

      const creatorMap = new Map<string, string>();
      for (const c of creatorsData) {
        creatorMap.set(c.id, c.name);
      }

      const all: ClipWithCreator[] = [];
      for (const j of jobsData) {
        if (Array.isArray(j.clips)) {
          for (const c of j.clips) {
            all.push({
              ...c,
              job_id: j.id,
              creatorName: (j.creator && creatorMap.get(j.creator)) || j.uploader || "Streamer",
              video_url: `${API_BASE}/api/jobs/${j.id}/clips/${c.id}.mp4`,
            });
          }
        }
      }

      // Sort newest first
      setClips(all.reverse());
    } catch (err: any) {
      console.warn("Error loading clips:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllClips();
  }, [loadAllClips]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAllClips();
  }, [loadAllClips]);

  const handleDownload = async (clip: Clip) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { status } = await MediaLibrary.requestPermissionsAsync(true, ["video"]);
      if (status !== "granted") {
        Alert.alert("Permission Needed", "Please allow gallery permission to save clips.");
        return;
      }
      const tok = await getAuthToken();
      const sanitized = clip.id.replace(/[^a-zA-Z0-9_-]/g, "");
      const dest = `${FileSystem.cacheDirectory}clip_${sanitized}.mp4`;

      const downloadRes = await FileSystem.downloadAsync(clip.video_url, dest, {
        headers: tok ? { Authorization: `Bearer ${tok}`, Origin: API_BASE } : { Origin: API_BASE },
      });

      await MediaLibrary.createAssetAsync(downloadRes.uri);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved to Gallery! 🎬", `Clip has been saved to your Photos.`);
    } catch (err: any) {
      Alert.alert("Download Failed", err.message || "Could not download clip.");
    }
  };

  const handleShare = async (clip: Clip) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const tok = await getAuthToken();
      const dest = `${FileSystem.cacheDirectory}share_${clip.id}.mp4`;
      const res = await FileSystem.downloadAsync(clip.video_url, dest, {
        headers: tok ? { Authorization: `Bearer ${tok}`, Origin: API_BASE } : { Origin: API_BASE },
      });
      await Sharing.shareAsync(res.uri, { mimeType: "video/mp4" });
    } catch (err: any) {
      Alert.alert("Share Failed", err.message || "Could not share video.");
    }
  };

  const displayedClips = filterHighScore ? clips.filter((c) => (c.score || 0) >= 80) : clips;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Topbar */}
      <View style={styles.topbar}>
        <PeakCutLogo size={30} showText={true} />
        <View style={styles.clipCountBadge}>
          <Text style={styles.clipCountText}>{displayedClips.length} Clips</Text>
        </View>
      </View>

      {/* Filter Row */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, !filterHighScore && styles.filterChipActive]}
          onPress={() => setFilterHighScore(false)}
        >
          <Text style={[styles.filterText, !filterHighScore && styles.filterTextActive]}>
            All ({clips.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filterHighScore && styles.filterChipActive]}
          onPress={() => setFilterHighScore(true)}
        >
          <Text style={[styles.filterText, filterHighScore && styles.filterTextActive]}>
            🔥 Viral Scores (80+)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Clips List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#FF8B33" />
        </View>
      ) : (
        <FlatList
          data={displayedClips}
          keyExtractor={(item) => `${item.job_id}_${item.id}`}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF8B33"
              colors={["#FF8B33"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="film-outline" size={44} color="#A99A91" style={{ marginBottom: 10 }} />
              <Text style={styles.emptyTitle}>No Clips Found</Text>
              <Text style={styles.emptySubtitle}>
                {filterHighScore
                  ? "No clips currently exceed viral score 80."
                  : "Paste a video link on the Home tab or record a live creator to start clipping."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const score = item.score || 85;
            const duration = Math.round((item.end || 30) - (item.start || 0));

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.badgeGroup}>
                    <View style={styles.scoreBadge}>
                      <Text style={styles.scoreText}>🔥 {score}</Text>
                    </View>
                    <View style={styles.creatorPill}>
                      <Text style={styles.creatorPillText}>{item.creatorName}</Text>
                    </View>
                  </View>
                  <Text style={styles.durationText}>0:{duration.toString().padStart(2, "0")}</Text>
                </View>

                <Text style={styles.cardTitle}>{item.title || "PeakCut Short"}</Text>
                {item.hook ? <Text style={styles.cardHook}>"{item.hook}"</Text> : null}

                {/* Buttons Row */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.playBtn} onPress={() => setPreviewClip(item)}>
                    <Ionicons name="play" size={16} color="#2A1A12" style={{ marginRight: 6 }} />
                    <Text style={styles.playBtnText}>Preview</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDownload(item)}>
                    <Ionicons name="download-outline" size={16} color="#F4EEEA" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnText}>Save</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(item)}>
                    <Ionicons name="share-social-outline" size={16} color="#F4EEEA" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Video Modal Player */}
      {previewClip && (
        <Modal
          visible={true}
          transparent={false}
          animationType="slide"
          onRequestClose={() => setPreviewClip(null)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setPreviewClip(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color="#F4EEEA" />
              </TouchableOpacity>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {previewClip.title || "Clip Preview"}
              </Text>
              <View style={{ width: 36 }} />
            </View>

            <View style={styles.modalPlayerContainer}>
              <ClipsModalPlayer clip={previewClip} token={authToken} />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalDownloadBtn}
                onPress={() => handleDownload(previewClip)}
              >
                <Ionicons name="download" size={18} color="#2A1A12" style={{ marginRight: 6 }} />
                <Text style={styles.modalDownloadText}>Save to Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalShareBtn}
                onPress={() => handleShare(previewClip)}
              >
                <Ionicons name="share-social" size={18} color="#F4EEEA" style={{ marginRight: 6 }} />
                <Text style={styles.modalShareText}>Share</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function ClipsModalPlayer({ clip, token }: { clip: Clip; token: string | null }) {
  const videoSource = token
    ? {
        uri: clip.video_url,
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: API_BASE,
        },
      }
    : clip.video_url;

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "100%" }}
      nativeControls={true}
      contentFit="contain"
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#1E1612",
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  clipCountBadge: {
    backgroundColor: "rgba(255, 139, 51, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  clipCountText: {
    color: "#FF8B33",
    fontSize: 12,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1E1612",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#2C221D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  filterChipActive: {
    backgroundColor: "rgba(255, 139, 51, 0.2)",
    borderColor: "#FF8B33",
  },
  filterText: {
    color: "#A99A91",
    fontSize: 12,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#FF8B33",
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#2C221D",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  badgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scoreBadge: {
    backgroundColor: "rgba(15, 138, 87, 0.18)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#0F8A57",
  },
  scoreText: {
    color: "#3DDC97",
    fontSize: 11,
    fontWeight: "700",
  },
  creatorPill: {
    backgroundColor: "#1E1612",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  creatorPillText: {
    color: "#A99A91",
    fontSize: 11,
    fontWeight: "600",
  },
  durationText: {
    color: "#A99A91",
    fontSize: 11,
    fontWeight: "600",
  },
  cardTitle: {
    color: "#F4EEEA",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  cardHook: {
    color: "#FF8B33",
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  playBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF8B33",
    height: 36,
    borderRadius: 8,
  },
  playBtnText: {
    color: "#2A1A12",
    fontSize: 13,
    fontWeight: "700",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1612",
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  actionBtnText: {
    color: "#F4EEEA",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyTitle: {
    color: "#F4EEEA",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptySubtitle: {
    color: "#A99A91",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalTitle: {
    color: "#F4EEEA",
    fontSize: 15,
    fontWeight: "600",
    maxWidth: "70%",
  },
  modalPlayerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    backgroundColor: "#1E1612",
  },
  modalDownloadBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF8B33",
    height: 44,
    borderRadius: 10,
  },
  modalDownloadText: {
    color: "#2A1A12",
    fontSize: 14,
    fontWeight: "700",
  },
  modalShareBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2C221D",
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalShareText: {
    color: "#F4EEEA",
    fontSize: 14,
    fontWeight: "700",
  },
});
