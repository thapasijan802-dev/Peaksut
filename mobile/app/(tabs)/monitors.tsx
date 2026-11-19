import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api, getAuthToken, API_BASE } from "../../src/api/client";
import { Creator, Clip } from "../../src/types";
import { PeakCutLogo } from "../../src/components/PeakCutLogo";

export default function CreatorsScreen() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"clips" | "settings" | "activity">("clips");
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingLive, setTogglingLive] = useState(false);

  // Video modal preview state
  const [previewClip, setPreviewClip] = useState<Clip | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    getAuthToken().then(setAuthToken);
  }, []);

  const loadCreators = useCallback(async () => {
    try {
      const data = await api.creators.list();
      setCreators(data || []);
      if (!selectedCreatorId && data?.length > 0) {
        setSelectedCreatorId(data[0].id);
      }
    } catch (err: any) {
      console.warn("Error loading creators:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCreatorId]);

  const loadClipsForCreator = useCallback(async (cid: string) => {
    try {
      const allJobs = await api.getJobs();
      const creatorClips: Clip[] = [];
      for (const j of allJobs) {
        if (j.creator === cid && Array.isArray(j.clips)) {
          for (const c of j.clips) {
            creatorClips.push({
              ...c,
              job_id: j.id,
              video_url: `${API_BASE}/api/jobs/${j.id}/clips/${c.id}.mp4`,
            });
          }
        }
      }
      setClips(creatorClips.reverse());
    } catch {
      setClips([]);
    }
  }, []);

  useEffect(() => {
    loadCreators();
  }, [loadCreators]);

  useEffect(() => {
    if (selectedCreatorId) {
      loadClipsForCreator(selectedCreatorId);
    }
  }, [selectedCreatorId, loadClipsForCreator]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCreators();
    if (selectedCreatorId) {
      loadClipsForCreator(selectedCreatorId);
    }
  }, [loadCreators, loadClipsForCreator, selectedCreatorId]);

  const selectedCreator = creators.find((c) => c.id === selectedCreatorId) || creators[0];

  const handleToggleAutoRecord = async (nextVal: boolean) => {
    if (!selectedCreator) return;
    const cid = selectedCreator.id;
    setCreators((prev) =>
      prev.map((c) => (c.id === cid ? { ...c, auto_watch: nextVal } : c))
    );
    try {
      await Haptics.selectionAsync();
      await api.creators.update(cid, { auto_watch: nextVal });
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update auto-record");
      loadCreators();
    }
  };

  const handleToggleAutoPost = async (nextVal: boolean) => {
    if (!selectedCreator) return;
    const cid = selectedCreator.id;
    setCreators((prev) =>
      prev.map((c) => (c.id === cid ? { ...c, autopost: nextVal } : c))
    );
    try {
      await Haptics.selectionAsync();
      await api.creators.update(cid, { autopost: nextVal });
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update auto-post");
      loadCreators();
    }
  };

  const handleToggleLiveRecording = async () => {
    if (!selectedCreator) return;
    const cid = selectedCreator.id;
    const isRecording = Boolean(selectedCreator.live_job);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTogglingLive(true);
      await api.creators.toggleLive(cid, isRecording ? "stop" : "start");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        isRecording ? "Recording Stopped" : "Recording Started! 🔴",
        isRecording
          ? `Stopped recording ${selectedCreator.name}. Finishing clips now.`
          : `Started recording ${selectedCreator.name}. PeakCut will generate clips automatically.`
      );
      loadCreators();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not toggle live recording");
    } finally {
      setTogglingLive(false);
    }
  };

  // Video download helper
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
        headers: tok
          ? { Authorization: `Bearer ${tok}`, Origin: API_BASE }
          : { Origin: API_BASE },
      });

      await MediaLibrary.createAssetAsync(downloadRes.uri);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved! 🎬", `Clip has been saved to your Android Gallery.`);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.topbar}>
        <PeakCutLogo size={30} showText={true} />
        <View style={styles.creatorCountBadge}>
          <Text style={styles.creatorCountText}>{creators.length} Creators</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8B33" colors={["#FF8B33"]} />
        }
      >
        {/* Horizontal Creator Selector Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorBar}>
          {creators.map((c) => {
            const isSelected = selectedCreator?.id === c.id;
            const isLive = Boolean(c.live_job || c.profile?.live);
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.creatorPill, isSelected && styles.creatorPillActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedCreatorId(c.id);
                }}
              >
                <View style={styles.pillAvatar}>
                  <Text style={[styles.pillAvatarText, isSelected && styles.pillAvatarTextActive]}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </Text>
                  {isLive && <View style={styles.pillLiveDot} />}
                </View>
                <Text style={[styles.pillName, isSelected && styles.pillNameActive]}>{c.name}</Text>
                {c.live_job ? (
                  <View style={styles.pillRecBadge}>
                    <Text style={styles.pillRecText}>REC</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {selectedCreator ? (
          <>
            {/* Creator Hero Header Card */}
            <View style={styles.creatorCard}>
              <View style={styles.creatorHeaderRow}>
                <View style={styles.bigAvatar}>
                  <Text style={styles.bigAvatarText}>
                    {selectedCreator.name.slice(0, 2).toUpperCase()}
                  </Text>
                  {Boolean(selectedCreator.live_job || selectedCreator.profile?.live) && (
                    <View style={styles.bigLiveDot} />
                  )}
                </View>

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.bigName}>{selectedCreator.name}</Text>
                  <Text style={styles.channelUrl} numberOfLines={1}>
                    {selectedCreator.channel ? selectedCreator.channel.replace(/^https?:\/\//, "") : "No channel"}
                  </Text>
                  {selectedCreator.profile?.live ? (
                    <Text style={styles.liveStatusText}>
                      🔴 Live now ({selectedCreator.profile?.viewers?.toLocaleString() || "60k+"} watching)
                    </Text>
                  ) : (
                    <Text style={styles.offlineStatusText}>Offline</Text>
                  )}
                </View>

                {/* Live Action Button */}
                <TouchableOpacity
                  style={[
                    styles.liveActionBtn,
                    selectedCreator.live_job ? styles.liveActionBtnStop : styles.liveActionBtnStart,
                  ]}
                  onPress={handleToggleLiveRecording}
                  disabled={togglingLive}
                >
                  {togglingLive ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <View
                        style={[
                          styles.actionDot,
                          { backgroundColor: selectedCreator.live_job ? "#FFFFFF" : "#2A1A12" },
                        ]}
                      />
                      <Text
                        style={[
                          styles.liveActionText,
                          { color: selectedCreator.live_job ? "#FFFFFF" : "#2A1A12" },
                        ]}
                      >
                        {selectedCreator.live_job ? "Stop" : "Record"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Switches Row */}
              <View style={styles.switchesRow}>
                <View style={styles.switchBox}>
                  <Text style={styles.switchLabel}>Auto-Record</Text>
                  <Switch
                    value={Boolean(selectedCreator.auto_watch)}
                    onValueChange={handleToggleAutoRecord}
                    trackColor={{ false: "#1E1612", true: "#FF8B33" }}
                    thumbColor={selectedCreator.auto_watch ? "#FFFFFF" : "#A99A91"}
                  />
                </View>

                <View style={styles.switchBox}>
                  <Text style={styles.switchLabel}>Auto-Post</Text>
                  <Switch
                    value={Boolean(selectedCreator.autopost)}
                    onValueChange={handleToggleAutoPost}
                    trackColor={{ false: "#1E1612", true: "#FF8B33" }}
                    thumbColor={selectedCreator.autopost ? "#FFFFFF" : "#A99A91"}
                  />
                </View>
              </View>
            </View>

            {/* Sub-Navigation Tabs */}
            <View style={styles.tabNav}>
              {(["clips", "settings", "activity"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tabBtn, activeTab === t && styles.tabBtnActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActiveTab(t);
                  }}
                >
                  <Text style={[styles.tabBtnText, activeTab === t && styles.tabBtnTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)} {t === "clips" ? `(${clips.length})` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Sub-Tab Content */}
            {activeTab === "clips" && (
              <View style={styles.clipsList}>
                {clips.length === 0 ? (
                  <View style={styles.emptyClipsBox}>
                    <Ionicons name="film-outline" size={36} color="#A99A91" style={{ marginBottom: 8 }} />
                    <Text style={styles.emptyClipsText}>No clips generated for {selectedCreator.name} yet.</Text>
                    <Text style={styles.emptyClipsSub}>
                      Turn on Auto-Record or tap "Record" when they go live to start clipping highlights.
                    </Text>
                  </View>
                ) : (
                  clips.map((clip) => {
                    const score = clip.score || 85;
                    const duration = Math.round((clip.end || 30) - (clip.start || 0));
                    return (
                      <View key={clip.id} style={styles.clipCard}>
                        <View style={styles.clipHeader}>
                          <View style={styles.scoreBadge}>
                            <Text style={styles.scoreText}>🔥 {score}</Text>
                          </View>
                          <Text style={styles.durationBadge}>0:{duration.toString().padStart(2, "0")}</Text>
                        </View>

                        <Text style={styles.clipTitle}>{clip.title || `${selectedCreator.name} Clip`}</Text>
                        {clip.hook ? <Text style={styles.clipHook}>"{clip.hook}"</Text> : null}

                        {/* Actions */}
                        <View style={styles.clipActionsRow}>
                          <TouchableOpacity
                            style={styles.clipActionBtn}
                            onPress={() => setPreviewClip(clip)}
                          >
                            <Ionicons name="play" size={15} color="#FF8B33" style={{ marginRight: 4 }} />
                            <Text style={styles.clipActionText}>Preview</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.clipActionBtn}
                            onPress={() => handleDownload(clip)}
                          >
                            <Ionicons name="download-outline" size={15} color="#F4EEEA" style={{ marginRight: 4 }} />
                            <Text style={[styles.clipActionText, { color: "#F4EEEA" }]}>Gallery</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.clipActionBtn}
                            onPress={() => handleShare(clip)}
                          >
                            <Ionicons name="share-social-outline" size={15} color="#F4EEEA" style={{ marginRight: 4 }} />
                            <Text style={[styles.clipActionText, { color: "#F4EEEA" }]}>Share</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {activeTab === "settings" && (
              <View style={styles.settingsBox}>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Minimum Clip Duration</Text>
                  <Text style={styles.settingVal}>20 Seconds</Text>
                </View>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Caption Style</Text>
                  <Text style={styles.settingVal}>{selectedCreator.style || "Bounce"}</Text>
                </View>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Video Layout</Text>
                  <Text style={styles.settingVal}>{selectedCreator.layout || "Auto Blur"}</Text>
                </View>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Min Viral Score</Text>
                  <Text style={styles.settingVal}>{selectedCreator.min_score || 80}/100</Text>
                </View>
              </View>
            )}

            {activeTab === "activity" && (
              <View style={styles.activityBox}>
                {(selectedCreator.log || []).length === 0 ? (
                  <Text style={styles.emptyText}>No recent activity logs.</Text>
                ) : (
                  (selectedCreator.log || []).map((l, idx) => (
                    <View key={idx} style={styles.activityItem}>
                      <View style={styles.activityDot} />
                      <Text style={styles.activityText}>{typeof l === "string" ? l : JSON.stringify(l)}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Video Preview Modal */}
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
              <PreviewPlayer clip={previewClip} token={authToken} />
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

function PreviewPlayer({ clip, token }: { clip: Clip; token: string | null }) {
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
  creatorCountBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  creatorCountText: {
    color: "#A99A91",
    fontSize: 12,
    fontWeight: "600",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  selectorBar: {
    marginBottom: 16,
  },
  creatorPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2C221D",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  creatorPillActive: {
    backgroundColor: "#FF8B33",
    borderColor: "#FF8B33",
  },
  pillAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    position: "relative",
  },
  pillAvatarText: {
    color: "#F4EEEA",
    fontSize: 9,
    fontWeight: "700",
  },
  pillAvatarTextActive: {
    color: "#2A1A12",
  },
  pillLiveDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E5323F",
  },
  pillName: {
    color: "#F4EEEA",
    fontSize: 12,
    fontWeight: "600",
  },
  pillNameActive: {
    color: "#2A1A12",
    fontWeight: "800",
  },
  pillRecBadge: {
    backgroundColor: "#E5323F",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: 5,
  },
  pillRecText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
  creatorCard: {
    backgroundColor: "#2C221D",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 16,
  },
  creatorHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  bigAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 139, 51, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bigAvatarText: {
    color: "#FF8B33",
    fontSize: 16,
    fontWeight: "700",
  },
  bigLiveDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E5323F",
    borderWidth: 2,
    borderColor: "#2C221D",
  },
  bigName: {
    color: "#F4EEEA",
    fontSize: 17,
    fontWeight: "700",
  },
  channelUrl: {
    color: "#A99A91",
    fontSize: 11,
    marginTop: 1,
  },
  liveStatusText: {
    color: "#E5323F",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  offlineStatusText: {
    color: "#6D6159",
    fontSize: 11,
    marginTop: 2,
  },
  liveActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  liveActionBtnStart: {
    backgroundColor: "#FF8B33",
  },
  liveActionBtnStop: {
    backgroundColor: "#D3343F",
  },
  actionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  liveActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  switchesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1E1612",
    borderRadius: 10,
    padding: 10,
  },
  switchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  switchLabel: {
    color: "#F4EEEA",
    fontSize: 12,
    fontWeight: "600",
  },
  tabNav: {
    flexDirection: "row",
    backgroundColor: "#2C221D",
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: "#1E1612",
  },
  tabBtnText: {
    color: "#A99A91",
    fontSize: 12,
    fontWeight: "600",
  },
  tabBtnTextActive: {
    color: "#FF8B33",
    fontWeight: "700",
  },
  clipsList: {
    gap: 12,
  },
  clipCard: {
    backgroundColor: "#2C221D",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  clipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
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
  durationBadge: {
    color: "#A99A91",
    fontSize: 11,
    fontWeight: "600",
  },
  clipTitle: {
    color: "#F4EEEA",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  clipHook: {
    color: "#FF8B33",
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 10,
  },
  clipActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  clipActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1612",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  clipActionText: {
    color: "#FF8B33",
    fontSize: 11,
    fontWeight: "600",
  },
  settingsBox: {
    backgroundColor: "#2C221D",
    borderRadius: 14,
    padding: 16,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  settingLabel: {
    color: "#A99A91",
    fontSize: 13,
  },
  settingVal: {
    color: "#F4EEEA",
    fontSize: 13,
    fontWeight: "600",
  },
  activityBox: {
    backgroundColor: "#2C221D",
    borderRadius: 14,
    padding: 16,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF8B33",
    marginRight: 8,
  },
  activityText: {
    color: "#F4EEEA",
    fontSize: 12,
  },
  emptyClipsBox: {
    alignItems: "center",
    padding: 30,
    backgroundColor: "#2C221D",
    borderRadius: 14,
  },
  emptyClipsText: {
    color: "#F4EEEA",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  emptyClipsSub: {
    color: "#A99A91",
    fontSize: 12,
    textAlign: "center",
  },
  emptyText: {
    color: "#A99A91",
    fontSize: 13,
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
