import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../components/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

// const DEFAULT_RENDER_BACKEND_URL = "https://capstone-foal.onrender.com";
const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com";

const BACKEND_URL = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");

const EVENTS_ENDPOINT = `${BACKEND_URL}/api/parents/events/`;

const Events = ({ navigation, route }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;

  // Color palette for events
  const PALETTE = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f'];

  const hashStringToInt = (str) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  };

  const mulberry32 = (a) => {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };

  const pickColor = (key) => {
    const seededKey = `event:${String(key || '')}`;
    const seed = Math.abs(hashStringToInt(seededKey));
    const rnd = mulberry32(seed)();
    const idx = Math.floor(rnd * PALETTE.length);
    return PALETTE[idx];
  };

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [studentSection, setStudentSection] = useState(null);

  const formatDate = (dateString) => {
    if (!dateString) return 'Date not set';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  const loadEvents = async ({ skipLoading = false } = {}) => {
    if (!skipLoading) setLoading(true);
    setError(null);
    
    try {
      // Get section from route params or stored parent data
      let section = route?.params?.section || null;
      
      if (!section) {
        // Try to get section from stored parent data
        const storedParent = await AsyncStorage.getItem('parent');
        if (storedParent) {
          try {
            const parentData = JSON.parse(storedParent);
            section = parentData.student_section || 
                     (parentData.student && parentData.student.section) || 
                     null;
          } catch (e) {
            console.warn('[Events] Failed to parse stored parent', e);
          }
        }
      }

      setStudentSection(section);
      console.log('[Events] Loading events for section:', section);

      // Build query with section filter
      const params = [];
      if (section) {
        params.push(`section=${encodeURIComponent(section)}`);
      }
      
      const queryUrl = params.length 
        ? `${EVENTS_ENDPOINT}?${params.join('&')}` 
        : EVENTS_ENDPOINT;

      console.log('[Events] Fetching from:', queryUrl);

      // Get token for authentication
      const token = await AsyncStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Token ${token}`;
      }

      const response = await fetch(queryUrl, { headers });
      console.log('[Events] Response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let data = await response.json();
      console.log('[Events] Raw response:', data);

      // Handle paginated response
      if (data && data.results) {
        data = data.results;
      }

      if (!Array.isArray(data)) {
        data = [];
      }

      console.log('[Events] Received', data.length, 'events');

      // Transform data for display
      const transformedEvents = data.map((event, idx) => ({
        id: event.id ? String(event.id) : String(idx + 1),
        title: event.title || 'Untitled Event',
        date: formatDate(event.scheduled_at),
        rawDate: event.scheduled_at,
        description: event.description || 'No description provided',
        location: event.location || '',
        eventType: event.event_type || 'general',
        icon: event.icon || 'calendar',
        color: pickColor(event.id || event.title || idx),
        section: event.section || null,
        teacher: event.teacher_name || null,
      }));

      // Sort by date (most recent first)
      transformedEvents.sort((a, b) => {
        if (!a.rawDate) return 1;
        if (!b.rawDate) return -1;
        return new Date(b.rawDate) - new Date(a.rawDate);
      });

      setEvents(transformedEvents);
      setError(null);
      console.log('[Events] Successfully loaded', transformedEvents.length, 'events');

    } catch (err) {
      console.error('[Events] Load failed:', err);
      setError(err.message || 'Failed to load events');
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [route?.params?.section]);

  const onRefresh = async () => {
    console.log('[Events] Refreshing...');
    setRefreshing(true);
    await loadEvents({ skipLoading: true });
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "#1e2633" : "#ffffff",
          borderColor: isDark ? "#2d3748" : "#e1e4e8",
          borderWidth: 1,
        },
      ]}
      onPress={() => navigation.navigate("EventDetails", { event: item })}
    >
      <View>
        <View style={[styles.banner, { backgroundColor: item.color }]}>
          <Ionicons name={item.icon} size={24} color="#fff" style={styles.icon} />
          <Text style={styles.bannerText} numberOfLines={1}>{item.title}</Text>
        </View>
        <View style={styles.details}>
          <View style={styles.dateRow}>
            <Ionicons 
              name="calendar-outline" 
              size={16} 
              color={isDark ? "#a0aec0" : "#555"} 
            />
            <Text style={[styles.date, { color: isDark ? "#a0aec0" : "#555" }]}>
              {item.date}
            </Text>
          </View>
          
          {item.location ? (
            <View style={styles.locationRow}>
              <Ionicons 
                name="location-outline" 
                size={16} 
                color={isDark ? "#a0aec0" : "#555"} 
              />
              <Text style={[styles.location, { color: isDark ? "#a0aec0" : "#555" }]}>
                {item.location}
              </Text>
            </View>
          ) : null}

          <Text 
            style={[styles.description, { color: isDark ? "#cbd5e0" : "#666" }]} 
            numberOfLines={2}
          >
            {item.description}
          </Text>

          {item.section && (
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionText}>Section {item.section}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={isDark ? ["#0b0f19", "#1a1f2b"] : ["#f5f5f5", "#ffffff"]}
      style={styles.container}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: isDark ? "#333" : "#ddd" },
        ]}
      >
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
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: isDark ? "#fff" : "#333" }]}>
            Events
          </Text>
          {studentSection && (
            <Text style={[styles.headerSubtitle, { color: isDark ? "#a0aec0" : "#666" }]}>
              Section {studentSection}
            </Text>
          )}
        </View>
      </View>

      {/* Event List */}
      {loading ? (
        <View style={styles.centerContent}>
          <Text style={{ color: isDark ? '#fff' : '#333' }}>Loading events…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <Ionicons 
            name="alert-circle-outline" 
            size={48} 
            color={isDark ? '#e74c3c' : '#c0392b'} 
          />
          <Text style={[styles.errorText, { color: isDark ? '#fff' : '#333' }]}>
            {error}
          </Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => loadEvents()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons 
                name="calendar-outline" 
                size={64} 
                color={isDark ? '#555' : '#ccc'} 
              />
              <Text style={[styles.emptyText, { color: isDark ? '#fff' : '#333' }]}>
                No events found
              </Text>
              {studentSection && (
                <Text style={[styles.emptySubtext, { color: isDark ? '#a0aec0' : '#666' }]}>
                  No events for Section {studentSection}
                </Text>
              )}
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
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  card: {
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
    overflow: 'hidden',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  bannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  details: {
    padding: 12,
  },
  icon: {
    marginRight: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  date: {
    fontSize: 13,
    marginLeft: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  location: {
    fontSize: 13,
    marginLeft: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  sectionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  sectionText: {
    color: '#3498db',
    fontSize: 12,
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#3498db',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 300,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default Events;