                    import React, { useState, useEffect, useRef } from "react";
                    import {
                    View,
                    Text,
                    StyleSheet,
                    Image,
                    TouchableOpacity,
                    Modal,
                    TextInput,
                    ScrollView,
                    RefreshControl,
                    Alert,
                    Platform,
                    } from "react-native";
                    import { Ionicons } from "@expo/vector-icons";
                    import { LinearGradient } from "expo-linear-gradient";
                    import * as ImagePicker from "expo-image-picker";
                    import AsyncStorage from "@react-native-async-storage/async-storage";
                    import { useTheme } from "../components/ThemeContext";

                    const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com/";
                    const BACKEND_URL = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");

                    // Normalize and encode image URLs returned from backend or local file URIs.
                    // Ensures spaces/special chars are encoded and relative paths are prefixed with BACKEND_URL.
                    const normalizeImageUrl = (url) => {
                         if (!url) return null;
                         try {
                              // Local file/content URIs - just ensure they are encoded
                              if (url.startsWith('file://') || url.startsWith('content://')) {
                                   return encodeURI(url);
                              }
                              // Already absolute URL
                              if (url.startsWith('http://') || url.startsWith('https://')) {
                                   return encodeURI(url);
                              }
                              // Relative path from backend (e.g. /media/parent_avatars/xyz.png)
                              // Ensure we don't accidentally produce double slashes
                              const prefix = BACKEND_URL.replace(/\/$/, '');
                              const path = url.startsWith('/') ? url : `/${url}`;
                              return encodeURI(`${prefix}${path}`);
                         } catch (e) {
                              return url;
                         }
                    }

                    const Profile = ({ navigation, route }) => {
                    const { darkModeEnabled } = useTheme();
                    const isDark = darkModeEnabled;

                    // Profile state
                    const [profile, setProfile] = useState({
                    name: "",
                    id: null,
                    phone: "",
                    address: "",
                    username: "",
                    image: null,
                    must_change: false,
                    });

                    const [loading, setLoading] = useState(true);
                    const [refreshing, setRefreshing] = useState(false);
                    const mountedRef = useRef(true);

                    const fetchParentsForUsername = async (username) => {
                    const token = await AsyncStorage.getItem("token");
                    const headers = { "Content-Type": "application/json" };
                    if (token) headers["Authorization"] = `Token ${token}`;

                    try {
                         const res = await fetch(`${BACKEND_URL}/api/parents/parents/`, { headers });
                         if (!res.ok) throw new Error(`HTTP ${res.status}`);
                         const data = await res.json();
                         let parents = Array.isArray(data) ? data : (data && data.results ? data.results : []);
                         parents = parents.filter((p) => p.username === username);
                         if (parents.length) {
                         await AsyncStorage.setItem("parent", JSON.stringify(parents[0]));
                         return parents;
                         }
                    } catch (err) {
                         console.warn("[Profile] Failed to fetch parents from API:", err?.message || err);
                    }

                    try {
                         const storedParent = await AsyncStorage.getItem("parent");
                         if (storedParent) {
                         const parsed = JSON.parse(storedParent);
                         if (parsed && parsed.username === username) {
                              return [parsed];
                         }
                         }
                    } catch (err) {
                         console.warn("[Profile] Failed to read cached parent:", err?.message || err);
                    }

                    return [];
                    };

                    const fetchParent = async ({ skipLoading = false } = {}) => {
                    if (!skipLoading) setLoading(true);
                    try {
                         const username = await AsyncStorage.getItem("username");
                         if (!username) {
                         if (mountedRef.current) setLoading(false);
                         return;
                         }

                         const parents = await fetchParentsForUsername(username);
                         if (!mountedRef.current) return;
                         if (!parents.length) {
                         setLoading(false);
                         return;
                         }

                         const p = parents[0];
                         // Prefer avatar_url (absolute URL from backend), fall back to avatar
                         const avatarField = p.avatar_url || p.avatar;
                         const avatarUrlRaw = avatarField
                         ? (avatarField.startsWith("http") ? avatarField : `${avatarField}`)
                         : null;
                         const avatarUrl = normalizeImageUrl(avatarUrlRaw);

                         if (mountedRef.current) {
                         setProfile((prev) => ({
                              ...prev,
                              id: p.id || prev.id,
                              name: p.name || prev.name,
                              address: p.address || prev.address,
                              username: p.username || prev.username,
                              phone: p.contact_number || prev.phone,
                              must_change: !!p.must_change_credentials,
                              image: avatarUrl || prev.image,
                         }));
                         setLoading(false);
                         }
                    } catch (err) {
                         console.warn("Failed to load parent profile:", err.message || err);
                         if (mountedRef.current) setLoading(false);
                    }
                    };

                    useEffect(() => {
                    fetchParent();
                    // If routed here with forceChange, open edit modal automatically
                    if (route && route.params && route.params.forceChange) {
                         setModalVisible(true);
                    }
                    return () => { mountedRef.current = false; };
                    }, []);

                    const onRefresh = async () => {
                    console.log('[Profile] onRefresh called');
                    setRefreshing(true);
                    await fetchParent({ skipLoading: true });
                    setRefreshing(false);
                    };

                    const [modalVisible, setModalVisible] = useState(false);
                    const [avatarModalVisible, setAvatarModalVisible] = useState(false);
                    const [avatarUploading, setAvatarUploading] = useState(false);
                    const [pendingAvatar, setPendingAvatar] = useState(null);
                    const [saving, setSaving] = useState(false);
                    const [currentPassword, setCurrentPassword] = useState('');
                    const [newPassword, setNewPassword] = useState('');
                    const [confirmPassword, setConfirmPassword] = useState('');
                    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
                    const [showNewPassword, setShowNewPassword] = useState(false);
                    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

                    const isForced = !!(profile.must_change || (route && route.params && route.params.forceChange));

                    // Pick from gallery
                    const pickImage = async () => {
                    const result = await ImagePicker.launchImageLibraryAsync({
                         mediaTypes: ImagePicker.MediaTypeOptions.Images,
                         allowsEditing: true,
                         aspect: [1, 1],
                         quality: 0.8,
                    });
                    if (!result.canceled) {
                         const uri = result.assets[0].uri;
                         // store pending avatar and show preview/confirm (normalize local URI)
                         setProfile((prev) => ({ ...prev, image: normalizeImageUrl(uri) }));
                         setPendingAvatar(normalizeImageUrl(uri));
                         setAvatarModalVisible(true);
                    }
                    };

                    // Take a selfie
                    const takePhoto = async () => {
                    const result = await ImagePicker.launchCameraAsync({
                                             allowsEditing: true,
                                             aspect: [1, 1],
                                             quality: 0.8,
                                             cameraType: ImagePicker.CameraType.front,
                    });
                    if (!result.canceled) {
                         const uri = result.assets[0].uri;
                         // store pending avatar and show preview/confirm (normalize local URI)
                         setProfile((prev) => ({ ...prev, image: normalizeImageUrl(uri) }));
                         setPendingAvatar(normalizeImageUrl(uri));
                         setAvatarModalVisible(true);
                    }
                    };

    // Upload only the avatar immediately (separate from full profile save)
    const uploadAvatar = async (imageUri) => {
    if (!imageUri) return;
    if (!profile.id) {
         Alert.alert('Error', 'No parent ID available to upload avatar');
         return;
    }
    setAvatarUploading(true);
    try {
         let uri = imageUri;
         if (uri && !uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('http')) {
              uri = `file://${uri}`;
         }

         const uriParts = uri.split('/');
         let filename = uriParts[uriParts.length - 1];
         if (!filename.includes('.')) filename = `avatar_${Date.now()}.jpg`;

         let mime = 'image/jpeg';
         const match = filename.match(/\.([0-9a-zA-Z]+)(?:\?|$)/);
         if (match) {
              const ext = match[1].toLowerCase();
              if (ext === 'png') mime = 'image/png';
              else if (ext === 'gif') mime = 'image/gif';
              else if (ext === 'heic' || ext === 'heif') mime = 'image/heic';
              else if (ext === 'webp') mime = 'image/webp';
         }

         const formData = new FormData();
         formData.append('avatar', { uri, name: filename, type: mime });

         const headers = { Accept: 'application/json' };
         const token = await AsyncStorage.getItem('token');
         if (token) headers['Authorization'] = `Token ${token}`;

         const endpoint = `${BACKEND_URL}/api/parents/parent/${profile.id}/`;
         console.log('[Profile] Uploading avatar to:', endpoint, { uri, filename, mime });

         const xhrResult = await sendFormData(endpoint, headers, formData, 'PATCH');
         console.log('[Profile] avatar upload status:', xhrResult.status);
         const text = xhrResult.responseText;
         let json = null;
         try { json = text ? JSON.parse(text) : null; } catch (e) { console.warn('[Profile] Avatar response not JSON'); }

         if (!xhrResult.ok) {
              Alert.alert('Error', `Avatar upload failed (${xhrResult.status})`);
              return;
         }

         // Update profile image from server response if provided
         const avatarField = json?.avatar_url || json?.avatar;
         const avatarUrlRaw = avatarField ? (avatarField.startsWith('http') ? avatarField : `${avatarField}`) : imageUri;
         const avatarUrl = normalizeImageUrl(avatarUrlRaw);

         setProfile((prev) => ({ ...prev, image: avatarUrl }));

         try {
              // update cached parent entry
              const stored = await AsyncStorage.getItem('parent');
              const parsed = stored ? JSON.parse(stored) : {};
              const merged = { ...parsed, avatar_url: avatarField || parsed.avatar_url };
              await AsyncStorage.setItem('parent', JSON.stringify(merged));
         } catch (e) {
              console.warn('[Profile] Failed to update cached parent after avatar upload', e);
         }

         // Clear pending avatar and close modal so user sees updated profile
         setPendingAvatar(null);
         setAvatarModalVisible(false);
         setModalVisible(false);

         Alert.alert('Success', 'Profile picture updated');
    } catch (err) {
         console.error('[Profile] Avatar upload error:', err);
         Alert.alert('Error', err.message || 'Failed to upload avatar');
    } finally {
         setAvatarUploading(false);
    }
    };

                         // Helper: send FormData using XMLHttpRequest (works around multipart boundary issues on RN)
                         const sendFormData = (endpoint, headers, formData, method = 'PATCH') => {
                         return new Promise((resolve, reject) => {
                              try {
                                   const xhr = new XMLHttpRequest();
                                   xhr.open(method, endpoint);
                                   // Do not set Content-Type for FormData; let XHR set the multipart boundary
                                   Object.entries(headers || {}).forEach(([k, v]) => {
                                        if (v != null) xhr.setRequestHeader(k, v);
                                   });
                                   xhr.onload = () => {
                                        resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, responseText: xhr.responseText });
                                   };
                                   xhr.onerror = () => reject(new Error('Network request failed'));
                                   xhr.send(formData);
                              } catch (e) {
                                   reject(e);
                              }
                         });
                         };

                    const saveProfile = async () => {
                    if (saving) return;
                    if (!profile.id) {
                         Alert.alert("Error", "No parent ID available to save");
                         return;
                    }

                    // Determine whether this save is part of a forced first-login change
                    const wasForced = !!((route && route.params && route.params.forceChange) || profile.must_change);

                    // When this is a forced change on first-login, require username and a new password.
                    if (wasForced) {
                         if (!profile.username || !profile.username.trim()) {
                         Alert.alert('Error', 'Username is required');
                         return;
                         }
                         if (!newPassword || !newPassword.trim()) {
                         Alert.alert('Error', 'New password is required');
                         return;
                         }
                    }

                    // Validate password if provided (or required above)
                    if (newPassword) {
                         if (newPassword !== confirmPassword) {
                         Alert.alert('Error', 'New passwords do not match');
                         return;
                         }
                         if (newPassword.length < 6) {
                         Alert.alert('Error', 'Password must be at least 6 characters');
                         return;
                         }
                    }

                    setSaving(true);

                    try {
                         const endpoint = `${BACKEND_URL}/api/parents/parent/${profile.id}/`;
                         
                         console.log('[Profile] Saving to:', endpoint);
                         console.log('[Profile] Was forced update:', wasForced);

                         // Check if we have a new local image to upload
                         const isLocalImage = profile.image && !profile.image.startsWith("http");

                         const formData = new FormData();
                         
                         // Add basic profile fields
                         if (profile.name) formData.append('name', profile.name);
                         if (profile.username) formData.append('username', profile.username);
                         if (profile.phone) formData.append('contact_number', profile.phone);
                         if (profile.address) formData.append('address', profile.address);

                         // Add password fields if provided
                         if (newPassword) {
                         formData.append('password', newPassword);
                         // Only send current_password if NOT a forced update
                         // (forced updates don't require current password verification)
                         if (currentPassword && !wasForced) {
                              formData.append('current_password', currentPassword);
                         }
                         }

                         // Add avatar image if it's a local file
                         if (isLocalImage) {
                         let uri = profile.image;
                         // Normalize URI for React Native: ensure file:// or content:// if missing
                         if (uri && !uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('http')) {
                              uri = `file://${uri}`;
                         }
                         const uriParts = uri.split("/");
                         let filename = uriParts[uriParts.length - 1];
                         
                         if (!filename.includes(".")) {
                              filename = `avatar_${Date.now()}.jpg`;
                         }

                         let mime = "image/jpeg";
                         const match = filename.match(/\.([0-9a-zA-Z]+)(?:\?|$)/);
                         if (match) {
                              const ext = match[1].toLowerCase();
                              if (ext === "png") mime = "image/png";
                              else if (ext === "gif") mime = "image/gif";
                              else if (ext === "heic" || ext === "heif") mime = "image/heic";
                              else if (ext === "webp") mime = "image/webp";
                         }

                         console.log('[Profile] Attaching avatar:', { filename, mime, uri });
                         
                         formData.append("avatar", {
                              uri: uri,
                              name: filename,
                              type: mime,
                         });
                         }

                         const headers = {
                         'Accept': 'application/json',
                         };

                         // Attach auth token if available
                         const token = await AsyncStorage.getItem('token');
                         if (token) {
                         headers['Authorization'] = `Token ${token}`;
                         }

                         console.log('[Profile] Sending PATCH request');

                         // Use XHR helper for multipart/form-data uploads when attaching a local image
                         let responseOk = false;
                         let responseStatus = null;
                         let responseText = null;
                         let updated = null;

                         if (isLocalImage) {
                              console.log('[Profile] Using XHR for multipart upload');
                              const xhrResult = await sendFormData(endpoint, headers, formData, 'PATCH');
                              responseStatus = xhrResult.status;
                              responseText = xhrResult.responseText;
                              responseOk = xhrResult.ok;
                         } else {
                              const response = await fetch(endpoint, {
                                   method: 'PATCH',
                                   headers,
                                   body: formData,
                              });
                              responseStatus = response.status;
                              responseText = await response.text();
                              responseOk = response.ok;
                         }

                         console.log('[Profile] Response status:', responseStatus);

                         try {
                              updated = responseText ? JSON.parse(responseText) : null;
                         } catch (e) {
                              console.warn('[Profile] Response not JSON:', responseText?.substring(0, 200));
                         }

                         if (!responseOk) {
                              console.error('[Profile] Save failed:', responseStatus, responseText?.substring(0, 200));
                              Alert.alert('Error', `Failed to save profile (${responseStatus})`);
                              setSaving(false);
                              return;
                         }

                         console.log('[Profile] Save successful');
                         console.log('[Profile] must_change_credentials:', updated?.must_change_credentials);

                         // Update local state with response
                         const avatarField = updated?.avatar_url || updated?.avatar;
                         const avatarUrlRaw = avatarField ? (avatarField.startsWith("http") ? avatarField : `${avatarField}`) : profile.image;
                         const avatarUrl = normalizeImageUrl(avatarUrlRaw);

                         const normalized = {
                         ...updated,
                         contact_number: updated?.contact_number ?? profile.phone,
                         address: updated?.address ?? profile.address,
                         name: updated?.name ?? profile.name,
                         username: updated?.username ?? profile.username,
                         must_change: updated?.must_change_credentials ?? false,
                         };

                         setProfile((prev) => ({
                         ...prev,
                         ...normalized,
                         phone: normalized.contact_number,
                         image: avatarUrl,
                         }));

                         // Cache the updated profile
                         try {
                         await AsyncStorage.setItem("parent", JSON.stringify(normalized));
                         if (normalized.username) {
                              await AsyncStorage.setItem("username", normalized.username);
                         }
                         await AsyncStorage.setItem("parent_must_change", normalized.must_change ? "1" : "0");
                         } catch (err) {
                         console.warn("[Profile] Failed to cache parent:", err?.message || err);
                         }

                         // If this was a forced credential change, navigate to login so user can re-authenticate.
                         // Some backends may not return the updated flag in the response body; treat a successful
                         // PATCH (response.ok) as sufficient to clear session and require a re-login.
                         if (wasForced) {
                         console.log('[Profile] Forced update completed; clearing session and navigating to login');

                         // Immediately clear session and navigate to login so user can re-authenticate.
                         try {
                              await AsyncStorage.removeItem('token');
                              await AsyncStorage.removeItem('parent');
                              await AsyncStorage.removeItem('username');
                              await AsyncStorage.removeItem('parent_must_change');
                         } catch (err) {
                              console.warn('[Profile] Failed to clear session', err);
                         }

                         setModalVisible(false);

                         // Replace the navigation stack to prevent going back to protected screens
                         try {
                              navigation.reset({ index: 0, routes: [{ name: 'login' }] });
                         } catch (e) {
                              navigation.navigate('login');
                         }

                         setSaving(false);
                         return;
                         }

                         // For non-forced updates, just show success
                         Alert.alert('Success', 'Profile updated successfully!');
                         setModalVisible(false);
                         
                         // Clear password fields
                         setCurrentPassword('');
                         setNewPassword('');
                         setConfirmPassword('');

                    } catch (err) {
                         console.error("[Profile] Save error:", err);
                         Alert.alert('Error', err.message || 'Failed to save profile. Please try again.');
                    } finally {
                         setSaving(false);
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
                              if (isForced) {
                              Alert.alert('Action Required', 'You must update your credentials before continuing.');
                              return;
                              }
                              if (navigation.canGoBack && navigation.canGoBack()) {
                              navigation.goBack();
                              } else {
                              navigation.navigate('home');
                              }
                              }}
                         />
                         <Text style={[styles.headerTitle, { color: isDark ? "#fff" : "#333" }]}>
                              Profile
                         </Text>
                         </View>

                         <ScrollView 
                         contentContainerStyle={{ paddingBottom: 30 }} 
                         refreshControl={
                              <RefreshControl 
                              refreshing={refreshing} 
                              onRefresh={onRefresh} 
                              tintColor={isDark ? '#fff' : '#333'} 
                              colors={[isDark ? '#fff' : '#333']} 
                              progressBackgroundColor={isDark ? '#111' : '#fff'} 
                              />
                         }
                         >
                         {/* Profile Card */}
                         <View
                              style={[
                              styles.profileCard,
                              { backgroundColor: isDark ? "#1e1e1e" : "#fff" },
                              ]}
                         >
                              <TouchableOpacity onPress={() => setAvatarModalVisible(true)}>
                              {profile.image ? (
                              <Image 
                                   source={{ uri: profile.image }} 
                                   style={styles.avatar}
                                   onError={(e) => {
                                   console.warn('[Profile] Image load error:', e.nativeEvent.error);
                                   setProfile(prev => ({ ...prev, image: null }));
                                   }}
                              />
                              ) : (
                              <View
                                   style={[
                                   styles.avatarPlaceholder,
                                   { backgroundColor: isDark ? "#333" : "#ddd" },
                                   ]}
                              >
                                   <Ionicons
                                   name="person-circle-outline"
                                   size={100}
                                   color={isDark ? "#888" : "#555"}
                                   />
                              </View>
                              )}
                              <View style={styles.cameraIconContainer}>
                              <Ionicons name="camera" size={20} color="#fff" />
                              </View>
                              </TouchableOpacity>
                              <Text style={[styles.name, { color: isDark ? "#fff" : "#333" }]}>
                              {profile.name || 'No Name'}
                              </Text>
                         </View>

                         {/* Info Section */}
                         <View style={styles.infoSection}>
                              <View style={[styles.infoItem, { backgroundColor: isDark ? "#1e1e1e" : "#fff" }]}>
                              <Ionicons name="person-circle-outline" size={22} color="#8e44ad" />
                              <Text style={[styles.infoText, { color: isDark ? "#fff" : "#333" }]}>
                              Username: {profile.username || 'Not set'}
                              </Text>
                              </View>

                              <View style={[styles.infoItem, { backgroundColor: isDark ? "#1e1e1e" : "#fff" }]}>
                              <Ionicons name="call-outline" size={22} color="#27ae60" />
                              <Text style={[styles.infoText, { color: isDark ? "#fff" : "#333" }]}>
                              Contact: {profile.phone || "No contact number"}
                              </Text>
                              </View>

                              <View style={[styles.infoItem, { backgroundColor: isDark ? "#1e1e1e" : "#fff" }]}>
                              <Ionicons name="home-outline" size={22} color="#2980b9" />
                              <Text style={[styles.infoText, { color: isDark ? "#fff" : "#333" }]}>
                              Address: {profile.address || "No address provided"}
                              </Text>
                              </View>
                         </View>

                         {/* Edit Profile Button */}
                         <TouchableOpacity
                              style={[
                              styles.editButton,
                              { backgroundColor: isDark ? "#3498db" : "#2980b9" },
                              ]}
                              onPress={() => setModalVisible(true)}
                         >
                              <Ionicons name="create-outline" size={20} color="#fff" />
                              <Text style={styles.editText}>Edit Profile</Text>
                         </TouchableOpacity>
                         </ScrollView>

                         {/* Edit Modal */}
                         <Modal visible={modalVisible} animationType="slide" transparent>
                         <View style={styles.modalOverlay}>
                              <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'stretch' }}>
                              <View
                              style={[
                                   styles.modalContent,
                                   { backgroundColor: isDark ? "#2c2c2c" : "#fff" },
                              ]}
                              >
                              <Text style={[styles.modalTitle, { color: isDark ? "#fff" : "#333" }]}>
                                   {isForced ? 'Update Your Credentials' : 'Edit Profile'}
                              </Text>

                              {isForced && (
                                   <Text style={[styles.warningText, { color: isDark ? "#ffa726" : "#f57c00" }]}>
                                   For security, please update your username and password before continuing.
                                   </Text>
                              )}

                              {/* Input rows with icons */}
                              {!isForced && (
                                   <View style={styles.inputRow}>
                                   <Ionicons name="person-outline" size={20} color={isDark ? "#fff" : "#333"} />
                                   <TextInput
                                        style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
                                        placeholder="Name"
                                        placeholderTextColor="#999"
                                        value={profile.name}
                                        onChangeText={(text) => setProfile({ ...profile, name: text })}
                                   />
                                   </View>
                              )}

                              <View style={styles.inputRow}>
                                   <Ionicons name="person-circle-outline" size={20} color={isDark ? "#fff" : "#333"} />
                                   <TextInput
                                   style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
                                   placeholder="Username *"
                                   placeholderTextColor="#999"
                                   value={profile.username}
                                   onChangeText={(text) => setProfile({ ...profile, username: text })}
                                   />
                              </View>

                              {/* Password change inputs */}
                              {isForced ? (
                                   <>
                                   <View style={styles.inputRow}>
                                        <Ionicons name="key-outline" size={20} color={isDark ? "#fff" : "#333"} />
                                        <TextInput
                                        style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
                                        placeholder="New password (required) *"
                                        placeholderTextColor="#999"
                                        value={newPassword}
                                        onChangeText={setNewPassword}
                                        secureTextEntry={!showNewPassword}
                                        />
                                        <TouchableOpacity onPress={() => setShowNewPassword((s) => !s)} style={{ paddingHorizontal: 8 }}>
                                        <Ionicons name={showNewPassword ? "eye" : "eye-off"} size={20} color={isDark ? "#fff" : "#333"} />
                                        </TouchableOpacity>
                                   </View>

                                   <View style={styles.inputRow}>
                                        <Ionicons name="checkmark-done-outline" size={20} color={isDark ? "#fff" : "#333"} />
                                        <TextInput
                                        style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
                                        placeholder="Confirm new password *"
                                        placeholderTextColor="#999"
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        secureTextEntry={!showConfirmPassword}
                                        />
                                        <TouchableOpacity onPress={() => setShowConfirmPassword((s) => !s)} style={{ paddingHorizontal: 8 }}>
                                        <Ionicons name={showConfirmPassword ? "eye" : "eye-off"} size={20} color={isDark ? "#fff" : "#333"} />
                                        </TouchableOpacity>
                                   </View>
                                   </>
                              ) : (
                                   <>
                                   <View style={styles.inputRow}>
                                        <Ionicons name="call-outline" size={20} color={isDark ? "#fff" : "#333"} />
                                        <TextInput
                                        style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
                                        placeholder="Phone"
                                        placeholderTextColor="#999"
                                        value={profile.phone}
                                        onChangeText={(text) => setProfile({ ...profile, phone: text })}
                                        keyboardType="phone-pad"
                                        />
                                   </View>

                                   <View style={styles.inputRow}>
                                        <Ionicons name="home-outline" size={20} color={isDark ? "#fff" : "#333"} />
                                        <TextInput
                                        style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
                                        placeholder="Address"
                                        placeholderTextColor="#999"
                                        value={profile.address}
                                        onChangeText={(text) => setProfile({ ...profile, address: text })}
                                        multiline
                                        />
                                   </View>
                                   </>
                              )}

                              <View style={styles.modalButtons}>
                                   <TouchableOpacity
                                   style={[styles.saveButton, { opacity: saving ? 0.6 : 1 }]}
                                   onPress={saveProfile}
                                   disabled={saving}
                                   >
                                   <Text style={styles.saveButtonText}>
                                        {saving ? "Saving..." : "Save"}
                                   </Text>
                                   </TouchableOpacity>
                                   
                                   <TouchableOpacity
                                   style={[styles.cancelButtonStyle, isForced ? { opacity: 0.6 } : null]}
                                   onPress={() => {
                                        if (isForced) {
                                        Alert.alert('Action Required', 'You must change your credentials before continuing.');
                                        return;
                                        }
                                        setModalVisible(false);
                                   }}
                                   disabled={saving || isForced}
                                   >
                                   <Text style={styles.cancelButtonText}>Cancel</Text>
                                   </TouchableOpacity>
                              </View>
                              </View>
                              </ScrollView>
                         </View>
                         </Modal>

                         {/* Avatar Update Modal */}
                         <Modal visible={avatarModalVisible} animationType="fade" transparent>
                         <View style={styles.modalOverlay}>
                              <View
                              style={[
                              styles.avatarModal,
                              { backgroundColor: isDark ? "#2c2c2c" : "#fff" },
                              ]}
                              >
                              <Text style={[styles.modalTitle, { color: isDark ? "#fff" : "#333" }]}>
                              Update Profile Picture
                              </Text>

                              {pendingAvatar ? (
                              <>
                              <Image source={{ uri: pendingAvatar }} style={[styles.avatar, { marginBottom: 8 }]} />
                              <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
                                   <TouchableOpacity
                                   style={[styles.saveButton, { flex: 1, marginRight: 8, opacity: avatarUploading ? 0.6 : 1 }]}
                                   onPress={() => {
                                        // Close the avatar modal immediately so user returns to profile view,
                                        // then perform the upload in background.
                                        const uriToUpload = pendingAvatar;
                                        setPendingAvatar(null);
                                        setAvatarModalVisible(false);
                                        setModalVisible(false);
                                        uploadAvatar(uriToUpload);
                                   }}
                                   disabled={avatarUploading}
                                   >
                                   <Text style={styles.saveButtonText}>{avatarUploading ? 'Uploading...' : 'Upload'}</Text>
                                   </TouchableOpacity>

                                   <TouchableOpacity
                                   style={[styles.cancelButtonStyle, { flex: 1, marginLeft: 8 }]}
                                   onPress={() => { setPendingAvatar(null); setAvatarModalVisible(false); }}
                                   disabled={avatarUploading}
                                   >
                                   <Text style={styles.cancelButtonText}>Cancel</Text>
                                   </TouchableOpacity>
                              </View>
                              </>
                              ) : (
                              <>
                              <TouchableOpacity
                              style={[
                                   styles.avatarOption,
                                   { backgroundColor: isDark ? "#333" : "#f0f0f0" },
                              ]}
                              onPress={takePhoto}
                              >
                              <Ionicons
                                   name="camera-outline"
                                   size={24}
                                   color={isDark ? "#4da6ff" : "#3498db"}
                              />
                              <Text
                                   style={[
                                   styles.optionText,
                                   { color: isDark ? "#fff" : "#333" },
                                   ]}
                              >
                                   Selfie
                              </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                              style={[
                                   styles.avatarOption,
                                   { backgroundColor: isDark ? "#333" : "#f0f0f0" },
                              ]}
                              onPress={pickImage}
                              >
                              <Ionicons
                                   name="image-outline"
                                   size={24}
                                   color={isDark ? "#6edc82" : "#27ae60"}
                              />
                              <Text
                                   style={[
                                   styles.optionText,
                                   { color: isDark ? "#fff" : "#333" },
                                   ]}
                              >
                                   Choose from Gallery
                              </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                              style={[
                                   styles.cancelButton,
                                   { backgroundColor: isDark ? "#444" : "#eee" },
                              ]}
                              onPress={() => { setPendingAvatar(null); setAvatarModalVisible(false); }}
                              >
                              <Text
                                   style={[
                                   styles.cancelText,
                                   { color: isDark ? "#fff" : "#333" },
                                   ]}
                              >
                                   Cancel
                              </Text>
                              </TouchableOpacity>
                              </>
                              )}
                              </View>
                         </View>
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
                    borderBottomColor: "#ddd",
                    marginTop: 40,
                    },
                    headerTitle: { fontSize: 20, fontWeight: "700", marginLeft: 12 },
                    profileCard: {
                    alignItems: "center",
                    margin: 20,
                    padding: 20,
                    borderRadius: 16,
                    elevation: 3,
                    },
                    avatar: {
                    width: 100,
                    height: 100,
                    borderRadius: 50,
                    marginBottom: 12,
                    backgroundColor: "#ccc",
                    },
                    avatarPlaceholder: {
                    width: 100,
                    height: 100,
                    borderRadius: 50,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                    },
                    cameraIconContainer: {
                    position: 'absolute',
                    bottom: 12,
                    right: 0,
                    backgroundColor: '#3498db',
                    borderRadius: 15,
                    width: 30,
                    height: 30,
                    justifyContent: 'center',
                    alignItems: 'center',
                    },
                    name: { fontSize: 20, fontWeight: "700" },
                    infoSection: { marginTop: 10, marginHorizontal: 16 },
                    infoItem: {
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 16,
                    borderRadius: 12,
                    marginBottom: 12,
                    elevation: 2,
                    },
                    infoText: { marginLeft: 12, fontSize: 15, fontWeight: "500", flex: 1 },
                    editButton: {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    marginHorizontal: 50,
                    padding: 14,
                    borderRadius: 30,
                    marginTop: 20,
                    },
                    editText: { color: "#fff", fontWeight: "600", marginLeft: 8, fontSize: 16 },
                    modalOverlay: {
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.6)",
                    justifyContent: "center",
                    alignItems: "stretch",
                    },
                    modalContent: {
                    width: "90%",
                    alignSelf: 'center',
                    padding: 20,
                    borderRadius: 16,
                    maxHeight: '90%',
                    },
                    avatarModal: {
                    width: "80%",
                    alignSelf: "center",
                    padding: 20,
                    borderRadius: 16,
                    alignItems: "center",
                    },
                    modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
                    warningText: {
                    fontSize: 14,
                    marginBottom: 16,
                    textAlign: 'center',
                    fontWeight: '500',
                    },
                    inputRow: {
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#ccc",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    marginBottom: 12,
                    },
                    input: {
                    flex: 1,
                    fontSize: 16,
                    padding: 10,
                    },
                    modalButtons: {
                    marginTop: 8,
                    gap: 10,
                    },
                    saveButton: {
                    backgroundColor: '#27ae60',
                    padding: 14,
                    borderRadius: 8,
                    alignItems: 'center',
                    },
                    saveButtonText: {
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: '600',
                    },
                    cancelButtonStyle: {
                    backgroundColor: '#e74c3c',
                    padding: 14,
                    borderRadius: 8,
                    alignItems: 'center',
                    },
                    cancelButtonText: {
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: '600',
                    },
                    avatarOption: {
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 12,
                    width: "100%",
                    borderRadius: 8,
                    marginBottom: 12,
                    },
                    optionText: {
                    marginLeft: 12,
                    fontSize: 16,
                    fontWeight: '600',
                    },
                    cancelButton: {
                    marginTop: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    borderRadius: 8,
                    alignSelf: 'stretch',
                    alignItems: 'center',
                    },
                    cancelText: {
                    fontSize: 16,
                    fontWeight: '600',
                    },
                    footerSpacer: { height: 30 },
                    });

                    export default Profile;