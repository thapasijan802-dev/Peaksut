import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, API_BASE } from "../../src/api/client";
import { Creator, Job } from "../../src/types";
import { PeakCutLogo } from "../../src/components/PeakCutLogo";

export default function HomeScreen() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [layout, setLayout] = useState<"blur" | "zoom" | "center">("blur");
  const [style, setStyle] = useState<"bounce" | "clean" | "hype">("bounce");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [creators, setCreators] = useState<Creator[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [overview, setOverview] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [cRes, jRes, oRes] = await Promise.allSettled([
        api.getCreators(),
        api.getJobs(),
        api.getOverview(),
      ]);

      if (cRes.status === "fulfilled") setCreators(cRes.value || []);
      if (jRes.status === "fulfilled") setJobs(jRes.value || []);
      if (oRes.status === "fulfilled") setOverview(oRes.value || {});
    } catch (err: any) {
      console.warn("Home data load error:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleSubmitUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert("Link Required", "Please paste a YouTube, Twitch, or Kick link.");
      return;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSubmitting(true);
      await api.createJob(trimmed, {
        layout,
        style,
        min_len: 20,
        max_len: 60,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Job Started! 🎬",
        "PeakCut has started analyzing your video. High-scoring viral moments will appear in Clips shortly."
      );
      setUrl("");
      loadData();
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error Creating Job", err.message || "Could not process link.");
    } finally {
      setSubmitting(false);
    }
  };

  // Calculations
  const liveCount = creators.filter((c) => c.live_job || c.profile?.live).length;
  const totalClips = jobs.reduce((acc, j) => acc + (j.clips?.length || 0), 0);
  const postedCount = overview?.posted_today || 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.topbar}>
        <PeakCutLogo size={32} showText={true} />
        <View style={styles.proBadge}>
          <Text style={styles.proText}>PRO</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8B33" colors={["#FF8B33"]} />
        }
      >
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>What do you want to clip today?</Text>
          <Text style={styles.heroSubtitle}>
            Paste a link or drop in videos. You get captioned shorts back with AI viral scores.
          </Text>

          {/* Input Box */}
          <View style={styles.inputContainer}>
            <Ionicons name="link-outline" size={18} color="#FF8B33" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder="Paste YouTube, Twitch or Kick link..."
              placeholderTextColor="#A99A91"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {url.length > 0 && (
              <TouchableOpacity onPress={() => setUrl("")}>
                <Ionicons name="close-circle" size={18} color="#A99A91" />
              </TouchableOpacity>
            )}
          </View>

          {/* Options Row */}
          <View style={styles.optionsRow}>
            {/* Layout selector */}
            <View style={styles.optionGroup}>
              <Text style={styles.groupLabel}>Layout:</Text>
              {(["blur", "zoom", "center"] as const).map((l) => (
                <TouchableOpacity
                  key={l}
                  onPress={() => setLayout(l)}
                  style={[styles.pill, layout === l && styles.pillActive]}
                >
                  <Text style={[styles.pillText, layout === l && styles.pillTextActive]}>
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Style selector */}
            <View style={styles.optionGroup}>
              <Text style={styles.groupLabel}>Style:</Text>
              {(["bounce", "clean", "hype"] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setStyle(s)}
                  style={[styles.pill, style === s && styles.pillActive]}
                >
                  <Text style={[styles.pillText, style === s && styles.pillTextActive]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmitUrl}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#2A1A12" size="small" />
            ) : (
              <>
                <Ionicons name="cut" size={18} color="#2A1A12" style={{ marginRight: 6 }} />
                <Text style={styles.submitBtnText}>Get Clips</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Day at a Glance Stats */}
        <Text style={styles.sectionHeader}>Today at a Glance</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <View style={styles.statIconRow}>
              <View style={[styles.pulseDot, liveCount > 0 && styles.pulseDotLive]} />
              <Text style={styles.statLabel}>Recording</Text>
            </View>
            <Text style={styles.statValue}>{liveCount}</Text>
            <Text style={styles.statSub}>{liveCount > 0 ? "Streamers Live" : "Idle"}</Text>
          </View>

          <View style={styles.statTile}>
            <View style={styles.statIconRow}>
              <Ionicons name="film" size={16} color="#FF8B33" style={{ marginRight: 4 }} />
              <Text style={styles.statLabel}>Clips Made</Text>
            </View>
            <Text style={styles.statValue}>{totalClips}</Text>
            <Text style={styles.statSub}>Min 20s length</Text>
          </View>

          <View style={styles.statTile}>
            <View style={styles.statIconRow}>
              <Ionicons name="paper-plane" size={16} color="#3DDC97" style={{ marginRight: 4 }} />
              <Text style={styles.statLabel}>Posted</Text>
            </View>
            <Text style={styles.statValue}>{postedCount}</Text>
            <Text style={styles.statSub}>To socials</Text>
          </View>

          <View style={styles.statTile}>
            <View style={styles.statIconRow}>
              <Ionicons name="hardware-chip" size={16} color="#FF8B33" style={{ marginRight: 4 }} />
              <Text style={styles.statLabel}>AI Engine</Text>
            </View>
            <Text style={styles.statValue}>8x</Text>
            <Text style={styles.statSub}>Gemini pool</Text>
          </View>
        </View>

        {/* Live Streamers Section */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionHeader}>Live Streamers Monitored</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/monitors")}>
            <Text style={styles.viewAllText}>View All ({creators.length})</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#FF8B33" style={{ marginVertical: 20 }} />
        ) : creators.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No creators tracked yet.</Text>
          </View>
        ) : (
          <View style={styles.creatorsList}>
            {creators.slice(0, 6).map((c) => {
              const isLive = Boolean(c.live_job || c.profile?.live);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.creatorCard}
                  onPress={() => router.push("/(tabs)/monitors")}
                  activeOpacity={0.7}
                >
                  <View style={styles.creatorLeft}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{c.name.slice(0, 2).toUpperCase()}</Text>
                      {isLive && <View style={styles.avatarLiveDot} />}
                    </View>
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.creatorName}>{c.name}</Text>
                      <Text style={styles.creatorChannel}>
                        {isLive
                          ? `🔴 Live (${c.profile?.viewers?.toLocaleString() || "active"} viewers)`
                          : c.channel
                          ? c.channel.replace(/^https?:\/\/(www\.)?/, "")
                          : "Offline"}
                      </Text>
                    </View>
                  </View>

                  {isLive ? (
                    <View style={styles.recBadge}>
                      <Text style={styles.recText}>REC</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#A99A91" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  proBadge: {
    backgroundColor: "rgba(255, 139, 51, 0.16)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FF8B33",
  },
  proText: {
    color: "#FF8B33",
    fontSize: 11,
    fontWeight: "800",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: "#2C221D",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    marginBottom: 20,
  },
  heroTitle: {
    color: "#F4EEEA",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroSubtitle: {
    color: "#A99A91",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1612",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: "#F4EEEA",
    fontSize: 13,
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    flexWrap: "wrap",
    gap: 8,
  },
  optionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  groupLabel: {
    color: "#A99A91",
    fontSize: 12,
    marginRight: 2,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#1E1612",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  pillActive: {
    backgroundColor: "rgba(255, 139, 51, 0.2)",
    borderColor: "#FF8B33",
  },
  pillText: {
    color: "#A99A91",
    fontSize: 11,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#FF8B33",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF8B33",
    borderRadius: 10,
    height: 42,
  },
  submitBtnText: {
    color: "#2A1A12",
    fontSize: 14,
    fontWeight: "700",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 8,
  },
  sectionHeader: {
    color: "#F4EEEA",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  viewAllText: {
    color: "#FF8B33",
    fontSize: 12,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  statTile: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: "#2C221D",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  statIconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  statLabel: {
    color: "#A99A91",
    fontSize: 12,
    fontWeight: "500",
  },
  statValue: {
    color: "#F4EEEA",
    fontSize: 22,
    fontWeight: "800",
  },
  statSub: {
    color: "#6D6159",
    fontSize: 11,
    marginTop: 2,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6D6159",
    marginRight: 6,
  },
  pulseDotLive: {
    backgroundColor: "#E5323F",
  },
  creatorsList: {
    backgroundColor: "#2C221D",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  creatorCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  creatorLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 139, 51, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarText: {
    color: "#FF8B33",
    fontSize: 13,
    fontWeight: "700",
  },
  avatarLiveDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E5323F",
    borderWidth: 2,
    borderColor: "#2C221D",
  },
  creatorName: {
    color: "#F4EEEA",
    fontSize: 14,
    fontWeight: "600",
  },
  creatorChannel: {
    color: "#A99A91",
    fontSize: 11,
    marginTop: 2,
  },
  recBadge: {
    backgroundColor: "#E5323F",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  recText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  emptyCard: {
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    color: "#A99A91",
    fontSize: 13,
  },
});
