import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../components/ThemeContext";
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com";
const BACKEND_URL = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");

const ChangePassword = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [currentError, setCurrentError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchParent = async ({ skipLoading = false } = {}) => {
    if (!skipLoading) setLoading(true);
    try {
      const storedParentRaw = await AsyncStorage.getItem('parent');
      // just ensure we can parse it; this helps refresh validation
      if (storedParentRaw) {
        try { JSON.parse(storedParentRaw); } catch (e) { /* ignore parse errors */ }
      }
    } catch (e) {
      console.warn('[ChangePass] fetchParent failed', e);
    } finally {
      if (!skipLoading) setLoading(false);
    }
  };

  const onRefresh = async () => {
    console.log('[ChangePass] onRefresh called');
    setRefreshing(true);
    await fetchParent({ skipLoading: true });
    setRefreshing(false);
  };

  const handleSave = async () => {
    setCurrentError("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setCurrentError("Please fill all fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      setCurrentError("New passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setCurrentError("New password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const username = await AsyncStorage.getItem('username');
      if (!username) {
        setCurrentError("No logged-in user found");
        setLoading(false);
        return;
      }

      const token = await AsyncStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Token ${token}`;
      }

      let storedParent = null;
      try {
        const storedParentRaw = await AsyncStorage.getItem('parent');
        if (storedParentRaw) {
          storedParent = JSON.parse(storedParentRaw);
        }
      } catch (e) {
        console.warn('Failed to parse stored parent data', e);
      }

      let parent = (storedParent && storedParent.username === username) ? storedParent : null;

      if (!parent) {
        try {
          // Use the public endpoint first (no auth required).
          const resp = await fetch(`${BACKEND_URL}/api/parents/parents/public/`, { headers });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          let data = await resp.json();
          if (data && data.results) data = data.results;
          if (!Array.isArray(data)) data = [];
          parent = data.find(p => p && p.username === username);
        } catch (fetchErr) {
          console.warn('Failed to load parent list (public), attempting authenticated endpoint', fetchErr);
          // If we have a token, try the authenticated list endpoint as a fallback.
          if (token) {
            try {
              const resp2 = await fetch(`${BACKEND_URL}/api/parents/parents/`, { headers });
              if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);
              let data2 = await resp2.json();
              if (data2 && data2.results) data2 = data2.results;
              if (!Array.isArray(data2)) data2 = [];
              parent = data2.find(p => p && p.username === username);
            } catch (e2) {
              console.warn('Failed to load parent list (authenticated) fallback', e2);
            }
          }
        }
      }

      if (!parent) {
        setCurrentError("Parent record not found");
        setLoading(false);
        return;
      }

      // Send PATCH to update password (server will verify current_password)
      const patchRes = await fetch(`${BACKEND_URL}/api/parents/parent/${parent.id}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ password: newPassword, current_password: currentPassword }),
      });

      if (!patchRes.ok) {
        const raw = (await patchRes.text()) || "";
        console.warn('Password update failed:', patchRes.status, raw);

        const normalized = raw.toLowerCase();
        if (patchRes.status === 401 || normalized.includes("current")) {
          setCurrentError("Current password is incorrect");
          setLoading(false);
          return;
        }

        if (normalized.includes("match")) {
          setCurrentError("New passwords do not match");
          setLoading(false);
          return;
        }

        if (normalized.includes("short") || normalized.includes("minimum")) {
          setCurrentError("New password must be at least 6 characters");
          setLoading(false);
          return;
        }

        setCurrentError("Failed to update password");
        setLoading(false);
        return;
      }

      // Refresh parent record from server (password will not be returned)
      try {
        const fresh = await fetch(`${BACKEND_URL}/api/parents/parent/${parent.id}/`, { headers });
        if (fresh.ok) {
          const parentData = await fresh.json();
          await AsyncStorage.setItem('parent', JSON.stringify(parentData));
        } else {
          // fallback: store existing parent without password
          const toStore = { ...parent };
          delete toStore.password;
          await AsyncStorage.setItem('parent', JSON.stringify(toStore));
        }
      } catch (e) {
        console.warn('Failed to refresh cached parent', e);
      }

      setCurrentError("");
      alert('Password changed successfully');
      navigation.goBack();
    } catch (err) {
      console.warn('Error changing password', err);
      setCurrentError("Error changing password — check network");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={isDark ? ["#0b0f19", "#1a1f2b"] : ["#f5f5f5", "#e0e0e0"]}
      style={styles.container}
    >
      {/* Header */}
       <View style={styles.header}>
        <Ionicons
          name="arrow-back"
          size={24}
          color={isDark ? "#fff" : "#333"}
          onPress={() => {
            if (navigation.canGoBack && navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('home');
            }
          }}
        />
        <Text style={[styles.headerTitle, { color: isDark ? "#fff" : "#333" }]}>
          Change Password
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View
          style={[
            styles.formCard,
            { backgroundColor: isDark ? "#1e1e1e" : "#fff" },
          ]}
        >
          {/* Current Password */}
          <View style={styles.inputRow}>
            <Ionicons
              name="lock-closed-outline"
              size={22}
              color={isDark ? "#bbb" : "#555"}
            />
            <TextInput
              style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
              placeholder="Current Password"
              placeholderTextColor={isDark ? "#888" : "#999"}
              secureTextEntry={!showCurrent}
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)}>
              <Ionicons
                name={showCurrent ? "eye" : "eye-off"}
                size={22}
                color={isDark ? "#bbb" : "#555"}
              />
            </TouchableOpacity>
          </View>

          {/* New Password */}
          <View style={styles.inputRow}>
            <Ionicons
              name="key-outline"
              size={22}
              color={isDark ? "#bbb" : "#555"}
            />
            <TextInput
              style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
              placeholder="New Password"
              placeholderTextColor={isDark ? "#888" : "#999"}
              secureTextEntry={!showNew}
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TouchableOpacity onPress={() => setShowNew(!showNew)}>
              <Ionicons
                name={showNew ? "eye" : "eye-off"}
                size={22}
                color={isDark ? "#bbb" : "#555"}
              />
            </TouchableOpacity>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputRow}>
            <Ionicons
              name="checkmark-done-outline"
              size={22}
              color={isDark ? "#bbb" : "#555"}
            />
            <TextInput
              style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
              placeholder="Confirm Password"
              placeholderTextColor={isDark ? "#888" : "#999"}
              secureTextEntry={!showConfirm}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
              <Ionicons
                name={showConfirm ? "eye" : "eye-off"}
                size={22}
                color={isDark ? "#bbb" : "#555"}
              />
            </TouchableOpacity>
          </View>

          {currentError ? (
            <Text style={[styles.errorText, { color: isDark ? "#ff7675" : "#c0392b" }]}>
              {currentError}
            </Text>
          ) : null}

          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: isDark ? "#3498db" : "#2980b9" },
            ]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.saveText}>{loading ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    marginTop: 40,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", marginLeft: 12 },
  formCard: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    elevation: 3,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    paddingVertical: 10,
  },
  saveButton: {
    padding: 14,
    borderRadius: 30,
    alignItems: "center",
    marginTop: 20,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 8,
    textAlign: "center",
  },
  saveText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});

export default ChangePassword;
