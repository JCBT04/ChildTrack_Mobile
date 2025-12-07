import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl, Image, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient"; 
import { useTheme } from "../components/ThemeContext";
import AsyncStorage from '@react-native-async-storage/async-storage';

// const DEFAULT_RENDER_BACKEND_URL = "https://capstone-foal.onrender.com";
const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com";

const BACKEND_URL = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");
const PARENT_GUARDIAN_ENDPOINT = `${BACKEND_URL}/api/guardian/parent/`;

const Unregistered = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;

  const [unregisteredList, setUnregisteredList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [imageErrors, setImageErrors] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [modalImageUri, setModalImageUri] = useState(null);

  const loadUnregistered = async ({ skipLoading = false } = {}) => {
    if (!skipLoading) {
      setLoading(true);
      setError(null);
    }
    
    try {
      const parentData = await AsyncStorage.getItem('parent');
      
      if (!parentData) {
        setError("Please log in first.");
        setUnregisteredList([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const parent = JSON.parse(parentData);
      const parentId = parent.id;

      console.log(`[LoadUnregistered] Fetching guardians for parent ID: ${parentId}`);

      // Fetch from parent-specific endpoint with parent_id
      const response = await fetch(`${PARENT_GUARDIAN_ENDPOINT}?parent_id=${parentId}`, {
        method: 'GET',
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[LoadUnregistered] Response data:`, JSON.stringify(data, null, 2));
      
      const guardians = Array.isArray(data) ? data : (data.results || []);

      // Map backend data to frontend format
      const mapped = guardians.map((g) => {
        // Priority: photo_url from serializer > photo field > null
        let photoUri = null;
        
        if (g.photo_url) {
          photoUri = g.photo_url;
          console.log(`[Guardian ${g.id}] Using photo_url:`, photoUri);
        } else if (g.photo) {
          // Handle relative paths
          if (g.photo.startsWith('http://') || g.photo.startsWith('https://')) {
            photoUri = g.photo;
          } else {
            // Remove leading slash if present to avoid double slashes
            const photoPath = g.photo.startsWith('/') ? g.photo : `/${g.photo}`;
            photoUri = `${BACKEND_URL}${photoPath}`;
          }
          console.log(`[Guardian ${g.id}] Using photo field, constructed URL:`, photoUri);
        } else {
          console.log(`[Guardian ${g.id}] No photo available`);
        }

        return {
          id: g.id,
          name: g.name || "Unnamed Guardian",
          relation: g.relationship || "Guardian",
          studentName: g.student_name || "Unknown student",
          reason: g.contact ? `Contact: ${g.contact}` : "Awaiting approval",
          photo: photoUri,
          age: g.age,
          address: g.address,
          status: g.status,
        };
      });

      console.log(`[LoadUnregistered] Mapped ${mapped.length} guardians`);
      setUnregisteredList(mapped);
      setError(mapped.length ? null : "No pending guardian requests.");
    } catch (err) {
      console.error("[LoadUnregistered] Error:", err);
      setError(err.message || "Failed to load guardians");
      setUnregisteredList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadUnregistered();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setImageErrors({});
    await loadUnregistered({ skipLoading: true });
  };

  const handleAllow = async (item) => {
    setProcessingId(item.id);
    try {
      const parentData = await AsyncStorage.getItem('parent');
      if (!parentData) {
        Alert.alert("Error", "Please log in first.");
        setProcessingId(null);
        return;
      }

      const parent = JSON.parse(parentData);
      const parentId = parent.id;

      console.log(`[Allow] Updating guardian ${item.id} to 'allowed' status`);

      // Use PATCH for partial update (only status field)
      const response = await fetch(`${PARENT_GUARDIAN_ENDPOINT}${item.id}/?parent_id=${parentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: 'allowed',
        }),
      });

      const responseData = await response.text();
      console.log(`[Allow] Response status: ${response.status}`);
      console.log(`[Allow] Response data:`, responseData);

      if (!response.ok) {
        throw new Error(responseData || `HTTP ${response.status}`);
      }
      
      Alert.alert("Success", `${item.name} has been allowed as a guardian.`);
      
      // Remove from list
      setUnregisteredList((prev) =>
        prev.filter((guardian) => String(guardian.id) !== String(item.id))
      );
    } catch (err) {
      console.error("[Allow] Error:", err);
      Alert.alert("Error", err.message || "Failed to allow guardian");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (item) => {
    setProcessingId(item.id);
    try {
      const parentData = await AsyncStorage.getItem('parent');
      if (!parentData) {
        Alert.alert("Error", "Please log in first.");
        setProcessingId(null);
        return;
      }

      const parent = JSON.parse(parentData);
      const parentId = parent.id;

      console.log(`[Reject] Updating guardian ${item.id} to 'declined' status`);

      const response = await fetch(`${PARENT_GUARDIAN_ENDPOINT}${item.id}/?parent_id=${parentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: 'declined' }),
      });

      const responseData = await response.text();
      console.log(`[Reject] Response status: ${response.status}`);
      console.log(`[Reject] Response data:`, responseData);

      if (!response.ok) {
        throw new Error(responseData || `HTTP ${response.status}`);
      }
      
      Alert.alert("Declined", `${item.name} has been declined as a guardian.`);
      
      // Remove from list
      setUnregisteredList((prev) => prev.filter((guardian) => String(guardian.id) !== String(item.id)));
    } catch (err) {
      console.error("[Reject] Error:", err);
      Alert.alert("Error", err.message || "Failed to decline guardian");
    } finally {
      setProcessingId(null);
    }
  };

  const handleImageError = (itemId, error) => {
    console.error(`[Image Error] Failed to load image for guardian ${itemId}:`, error);
    setImageErrors(prev => ({ ...prev, [itemId]: true }));
  };

  const renderItem = ({ item }) => {
    const hasImageError = imageErrors[item.id];
    const shouldShowPhoto = item.photo && !hasImageError;

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: isDark ? "#1e1e1e" : "#fff" },
        ]}
      >
        {shouldShowPhoto ? (
          <TouchableOpacity onPress={() => { setModalImageUri(item.photo); setModalVisible(true); }}>
            <Image 
              source={{ uri: item.photo }} 
              style={styles.guardianPhoto}
              onError={(e) => handleImageError(item.id, e.nativeEvent.error)}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : (
          <View style={[
            styles.guardianPhotoPlaceholder,
            { backgroundColor: isDark ? "#2a2a2a" : "#f0f0f0" }
          ]}>
            <Ionicons 
              name="person-circle-outline" 
              size={40} 
              color={isDark ? "#3498db" : "#3498db"} 
            />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.name, { color: isDark ? "#fff" : "#333" }]}>
            {item.name}
          </Text>
          <Text style={[styles.relation, { color: isDark ? "#bbb" : "#666" }]}>
            {item.relation} • {item.studentName}
          </Text>
          <Text style={[styles.reason, { color: isDark ? "#aaa" : "#777" }]}>
            {item.reason}
          </Text>
          {item.age && (
            <Text style={[styles.detail, { color: isDark ? "#999" : "#888" }]}>
              Age: {item.age}
            </Text>
          )}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.allowButton,
              processingId === item.id && styles.disabledButton
            ]}
            onPress={() => handleAllow(item)}
            disabled={processingId === item.id}
          >
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={styles.allowText}>
              {processingId === item.id ? "..." : "Allow"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.rejectButton,
              processingId === item.id && styles.disabledButton
            ]}
            onPress={() => handleReject(item)}
            disabled={processingId === item.id}
          >
            <Ionicons name="close-circle" size={16} color="#fff" />
            <Text style={styles.rejectText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={isDark ? ["#0b0f19", "#1a1f2b"] : ["#f5f5f5", "#e0e0e0"]}
      style={styles.container}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: isDark ? "#333" : "#ddd" },
        ]}
      >
        <TouchableOpacity onPress={() => {
          if (navigation.canGoBack && navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('home');
          }
        }}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={isDark ? "#fff" : "#333"}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? "#fff" : "#333" }]}>
          Pending Guardians
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={{ color: isDark ? '#fff' : '#333', fontSize: 16 }}>
            Loading guardians...
          </Text>
        </View>
      ) : (
        <FlatList
          data={unregisteredList}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons 
                name="shield-checkmark-outline" 
                size={64} 
                color={isDark ? '#555' : '#ccc'} 
              />
              <Text style={[styles.emptyText, { color: isDark ? '#ddd' : '#555' }]}>
                {error || 'No pending guardian requests.'}
              </Text>
              <Text style={[styles.emptySubtext, { color: isDark ? '#999' : '#777' }]}>
                All guardians have been approved or declined.
              </Text>
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={isDark ? '#fff' : '#333'}
              colors={[isDark ? '#fff' : '#333']}
              progressBackgroundColor={isDark ? '#111' : '#fff'}
            />
          }
        />
      )}
        

        <Modal
          visible={modalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          >
            {modalImageUri ? (
              <Image
                source={{ uri: modalImageUri }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            ) : null}
          </TouchableOpacity>
        </Modal>
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
    marginTop: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginLeft: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  name: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  relation: { fontSize: 14, marginBottom: 2 },
  reason: { fontSize: 13, marginTop: 2 },
  detail: { fontSize: 12, marginTop: 4 },
  actions: { flexDirection: "column", gap: 8 },
  allowButton: {
    backgroundColor: "#28a745",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 90,
    justifyContent: "center",
  },
  allowText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  rejectButton: {
    backgroundColor: "#dc3545",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 90,
    justifyContent: "center",
  },
  rejectText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  disabledButton: {
    opacity: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  guardianPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e0e0e0',
    borderWidth: 2,
    borderColor: '#3498db',
  },
  guardianPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: 8,
  },
});

export default Unregistered;