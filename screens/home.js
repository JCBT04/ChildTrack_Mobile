import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../components/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';

const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com/";
const BACKEND_URL = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");
const ALL_TEACHERS_ENDPOINT = `${BACKEND_URL}/api/parents/all-teachers-students/`;

import logo from '../assets/lg.png';

const Home = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isFocused = useIsFocused();
  const isDark = darkModeEnabled;
  const [childNames, setChildNames] = useState([]);
  const [loadingChild, setLoadingChild] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState('');

  const dashboardItems = [
    { title: 'Events', icon: 'calendar', color: '#2980b9', screen: 'event' },
    {
      title: 'Attendance',
      icon: 'people',
      color: '#27ae60',
      screen: 'attendance',
    },
    {
      title: 'Student Schedule',
      icon: 'time-outline',
      color: '#8e44ad',
      screen: 'schedule',
    },
    {
      title: 'Unregistered',
      icon: 'close-circle',
      color: '#e74c3c',
      screen: 'unregistered',
    },
    {
      title: 'Authorized List',
      icon: 'checkmark-done-circle',
      color: '#16a085',
      screen: 'authorized',
    },
  ];

  // Helper function to get status color and label - LIMITED TO 4 OPTIONS
  const getStatusInfo = (status) => {
    const normalizedStatus = (status || 'absent').toLowerCase().trim().replace(/[\s_-]/g, '');
    
    switch (normalizedStatus) {
      case 'present':
      case 'pickup': // Pick-up also represents Present
      case 'dropoff': // Drop-off also represents Present
        return { color: '#2ecc71', label: 'Present' };
      case 'absent':
        return { color: '#e74c3c', label: 'Absent' };
      case 'late':
        return { color: '#f39c12', label: 'Late' };
      case 'droppedout':
      case 'dropout':
        return { color: '#95a5a6', label: 'Dropped Out' };
      default:
        // Any other status defaults to Absent
        return { color: '#e74c3c', label: 'Absent' };
    }
  };

  // Function to handle phone number press - shows custom modal
  const handlePhonePress = (phoneNumber) => {
    setSelectedPhoneNumber(phoneNumber);
    setContactModalVisible(true);
  };

  const handleCall = () => {
    setContactModalVisible(false);
    setTimeout(() => {
      const telUrl = `tel:${selectedPhoneNumber}`;
      Linking.openURL(telUrl).catch((err) => {
        console.error('Error opening phone:', err);
      });
    }, 300);
  };

  const handleMessage = () => {
    setContactModalVisible(false);
    setTimeout(() => {
      const smsUrl = `sms:${selectedPhoneNumber}`;
      Linking.openURL(smsUrl).catch((err) => {
        console.error('Error opening messages:', err);
      });
    }, 300);
  };

  const loadChild = async ({ skipLoading = false } = {}) => {
    if (!skipLoading) setLoadingChild(true);
    try {
      const username = await AsyncStorage.getItem('username');
      if (!username) {
        setChildNames([]);
        setLoadingChild(false);
        return;
      }

      const extractParentsFromTeachers = (payload) => {
        const teachersArray = Array.isArray(payload)
          ? payload
          : payload && Array.isArray(payload.results)
            ? payload.results
            : [];

        const aggregated = [];
        teachersArray.forEach((teacher) => {
          if (!teacher || typeof teacher !== 'object') return;
          const students = Array.isArray(teacher.students) ? teacher.students : [];
          students.forEach((student) => {
            if (!student || typeof student !== 'object') return;
            const parents = Array.isArray(student.parents_guardians)
              ? student.parents_guardians
              : [];
            parents.forEach((parent) => {
              if (parent) {
                aggregated.push(parent);
              }
            });
          });
        });
        return aggregated;
      };

      let fallbackParentData = null;
      try {
        const storedParent = await AsyncStorage.getItem('parent');
        if (storedParent) {
          fallbackParentData = JSON.parse(storedParent);
        }
      } catch (e) {
        console.warn('Failed to parse stored parent data', e);
      }

      const token = await AsyncStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Token ${token}`;
      }

      let fetchedParentRecords = [];
      try {
        const parentsResp = await fetch(`${BACKEND_URL}/api/parents/parents/`, { headers });
        if (!parentsResp.ok) {
          throw new Error(`HTTP ${parentsResp.status}`);
        }
        const parentsData = await parentsResp.json();
        fetchedParentRecords = Array.isArray(parentsData) 
          ? parentsData 
          : (parentsData && parentsData.results ? parentsData.results : []);
      } catch (e) {
        console.warn('Failed to fetch parents from API, attempting fallback', e);
        if (token) {
          try {
            const fallbackResp = await fetch(ALL_TEACHERS_ENDPOINT, { headers });
            if (!fallbackResp.ok) {
              throw new Error(`All teachers HTTP ${fallbackResp.status}`);
            }
            const fallbackData = await fallbackResp.json();
            fetchedParentRecords = extractParentsFromTeachers(fallbackData);
          } catch (fallbackErr) {
            console.warn('Failed to fetch parents from fallback endpoint', fallbackErr);
          }
        }
        if (!fetchedParentRecords.length && fallbackParentData) {
          fetchedParentRecords = [fallbackParentData];
        }
      }

      const parentsList = username
        ? fetchedParentRecords.filter(p => p.username === username)
        : fetchedParentRecords;

      if (parentsList.length === 0) {
        setChildNames([]);
        setLoadingChild(false);
        return;
      }

      try {
        await AsyncStorage.setItem('parent', JSON.stringify(parentsList[0]));
      } catch (e) {
        console.warn('Failed to cache primary parent record', e);
      }

      const guardiansByStudent = fetchedParentRecords.reduce((acc, record) => {
        if (!record || typeof record !== 'object') return acc;
        const key = (record.student_name || '').trim().toLowerCase();
        if (!key) return acc;
        if ((record.role || '').toLowerCase() !== 'guardian') return acc;
        if (!acc[key]) acc[key] = [];
        acc[key].push(record);
        return acc;
      }, {});

      const kids = parentsList
        .filter(p => p.student_name)
        .map(p => ({
          id: p.student_lrn || p.student || p.id,
          lrn: p.student_lrn || '',
          name: p.student_name,
          section: p.student_section || (p.student && p.student.section) || null,
          teacherName: p.teacher_name || '',
          teacherPhone: p.contact_number || '',
          attendanceStatus: null,
          attendanceStatusLabel: null,
          guardians: guardiansByStudent[(p.student_name || '').trim().toLowerCase()] || [],
        }));

      if (kids.length === 0) {
        setChildNames([]);
        setLoadingChild(false);
        return;
      }

      const fetchPublicAttendance = async () => {
        const resp = await fetch(`${BACKEND_URL}/api/attendance/public/`);
        if (!resp.ok) {
          throw new Error(`Attendance HTTP ${resp.status}`);
        }
        let data = await resp.json();
        if (data && data.results) data = data.results;
        if (!Array.isArray(data)) data = [];
        return data;
      };

      const matchesKidRecord = (record, kid) => {
        const recName = (record.student_name || '').trim().toLowerCase();
        const recLrn = (record.student_lrn || '').trim();
        const kidName = (kid.name || '').trim().toLowerCase();
        const kidLrn = (kid.lrn || '').trim();
        const matchesName = kidName && recName === kidName;
        const matchesLrn = kidLrn && recLrn && recLrn === kidLrn;
        return matchesName || matchesLrn;
      };

      try {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const date = String(today.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${date}`;
        console.log(`[Home] Today's local date: ${todayStr}`);

        let attendanceData = [];
        try {
          attendanceData = await fetchPublicAttendance();
        } catch (err) {
          console.warn('Failed fetching public attendance list', err);
          attendanceData = [];
        }

        const kidsWithStatus = await Promise.all(kids.map(async (kid) => {
          try {
            console.log(`[Home] Looking for attendance for: ${kid.name} (LRN: ${kid.lrn})`);
            console.log(`[Home] Today's date: ${todayStr}`);
            console.log(`[Home] Total attendance records: ${attendanceData.length}`);
            
            const todayRecords = attendanceData.filter(r => r.date === todayStr);
            console.log(`[Home] Records for today (${todayStr}):`, todayRecords.map(r => ({
              name: r.student_name,
              lrn: r.student_lrn,
              status: r.status,
              date: r.date
            })));

            const todayAttendance = attendanceData.find(
              (record) => record.date === todayStr && matchesKidRecord(record, kid)
            );
            
            if (todayAttendance) {
              const rawStatus = (todayAttendance.status || 'Absent').trim();
              console.log(`[Home] Found attendance for ${kid.name}: status="${rawStatus}"`);
              const normalizedStatus = rawStatus.toLowerCase().trim().replace(/[\s_-]/g, '');
              console.log(`[Home] Normalized status: "${normalizedStatus}"`);
              
              // Only allow the 4 valid statuses (pickup and dropoff count as present)
              const validStatuses = ['present', 'absent', 'late', 'droppedout', 'dropout', 'pickup', 'dropoff'];
              const finalStatus = validStatuses.includes(normalizedStatus) ? normalizedStatus : 'absent';
              
              return { ...kid, attendanceStatus: finalStatus, attendanceStatusLabel: rawStatus };
            }
            console.log(`[Home] No attendance found for ${kid.name}, defaulting to absent`);
            return { ...kid, attendanceStatus: 'absent', attendanceStatusLabel: 'Absent' };
          } catch (e) {
            console.warn('Failed fetching attendance for', kid.name, e);
            return { ...kid, attendanceStatus: 'absent', attendanceStatusLabel: 'Absent' };
          }
        }));
        setChildNames(kidsWithStatus);
        setLoadingChild(false);
      } catch (e) {
        console.warn('Failed to fetch attendance statuses', e);
        const absentKids = kids.map(k => ({ ...k, attendanceStatus: 'absent', attendanceStatusLabel: 'Absent' }));
        setChildNames(absentKids);
        setLoadingChild(false);
      }
    } catch (err) {
      console.warn('Failed loading child', err);
      setChildNames([]);
      setLoadingChild(false);
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    loadChild();
  }, [isFocused]);

  const onRefresh = async () => {
    console.log('[Home] onRefresh called');
    setRefreshing(true);
    await loadChild({ skipLoading: true });
    setRefreshing(false);
  };

  return (
    <LinearGradient
      colors={isDark ? ['#0b0f19', '#1a1f2b'] : ['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View
          style={[
            styles.header,
            { backgroundColor: isDark ? '#1a1a1a' : '#3498db' },
          ]}>
          <Text style={[styles.welcome, { color: '#fff' }]}>
            👋 Welcome back, Parent!
          </Text>

          <View style={styles.childInfo}>
            <View>
              <Text style={[styles.label, { color: '#fff' }]}>Your Child</Text>
              {loadingChild ? (
                <Text style={[styles.childName, { color: '#fff' }]}>Loading…</Text>
              ) : !childNames.length ? (
                <Text style={[styles.childName, { color: '#fff' }]}>No child found</Text>
              ) : (
                childNames.map((c, i) => {
                  const statusInfo = getStatusInfo(c.attendanceStatus);
                  return (
                    <View key={i} style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.childName, { color: '#fff' }]}>{c.name}</Text>
                        <View style={[
                          styles.statusContainer,
                          { marginLeft: 20, backgroundColor: statusInfo.color }
                        ]}>
                          <Text style={styles.statusText}>
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>
                      {c.section ? (
                        <Text style={[styles.sectionText, { color: '#fff', marginTop: 4 }]}>Section: {c.section}</Text>
                      ) : null}
                      <View style={styles.teacherRow}>
                        <Text style={[styles.teacherName, { color: '#fff' }]}>
                          {c.teacherName ? `Teacher: ${c.teacherName}` : 'Teacher: Not provided'}
                        </Text>
                        {c.teacherPhone ? (
                          <TouchableOpacity
                            onPress={() => handlePhonePress(c.teacherPhone)}
                            style={styles.phoneButton}
                          >
                            <Ionicons name="call" size={14} color="#fff" />
                            <Text style={[styles.teacherPhone, { color: '#fff' }]}> {c.teacherPhone}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {c.guardians && c.guardians.length > 0 ? (
                        <Text style={[styles.guardianInfo, { color: '#fff' }]}>
                          Guardian{c.guardians.length > 1 ? 's' : ''}: {c.guardians.map(g => g.name).join(', ')}
                        </Text>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </View>

        <View style={styles.dashboardHeader}>
          <MaterialIcons
            name="dashboard"
            size={22}
            color={isDark ? '#f0f0f0' : '#333'}
          />
          <Text
            style={[
              styles.dashboardText,
              { color: isDark ? '#f0f0f0' : '#333' },
            ]}>
            Dashboard
          </Text>
          <View style={{ flexDirection: 'row', marginLeft: 'auto' }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('notification')}>
              <Ionicons
                name="notifications-outline"
                size={22}
                color={isDark ? '#f0f0f0' : '#333'}
                style={{ marginRight: 15 }}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('setting')}>
              <Ionicons
                name="settings-outline"
                size={22}
                color={isDark ? '#f0f0f0' : '#333'}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.grid, { paddingHorizontal: 16, flexDirection: 'row', minHeight: 380 }]}> 
          <View style={{ width: '60%', justifyContent: 'space-between' }}>
            {dashboardItems.slice(0, 3).map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? '#1a1a1a' : '#fff',
                    borderColor: isDark ? '#30363d' : '#ddd',
                    borderWidth: 1,
                    width: '100%',
                  },
                ]}
                onPress={() => {
                  const section = (childNames && childNames.length && childNames[0].section) ? childNames[0].section : null;
                  if (item.screen === 'event') {
                    navigation.navigate(item.screen, section ? { section } : {});
                  } else {
                    navigation.navigate(item.screen);
                  }
                }}
              >
                <Ionicons name={item.icon} size={28} color={item.color} />
                <Text style={[styles.cardTitle, { color: isDark ? '#e6edf3' : '#333' }]}> 
                  {item.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ width: '38%', marginLeft: '2%', justifyContent: 'space-between' }}>
            {dashboardItems.slice(3).map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? '#1a1a1a' : '#fff',
                    borderColor: isDark ? '#30363d' : '#ddd',
                    borderWidth: 1,
                    width: '100%',
                    marginBottom: 16,
                    height: 180,
                    justifyContent:
                      item.title === 'Unregistered' || item.title === 'Authorized List'
                        ? 'center'
                        : 'flex-end',
                  },
                ]}
                onPress={() => {
                  const section = (childNames && childNames.length && childNames[0].section) ? childNames[0].section : null;
                  if (item.screen === 'event') {
                    navigation.navigate(item.screen, section ? { section } : {});
                  } else {
                    navigation.navigate(item.screen);
                  }
                }}
              >
                <Ionicons name={item.icon} size={28} color={item.color} />
                <Text style={[styles.cardTitle, { color: isDark ? '#e6edf3' : '#333' }]}> 
                  {item.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Custom Contact Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={contactModalVisible}
        onRequestClose={() => setContactModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setContactModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity 
              activeOpacity={1}
              style={[
                styles.modalContent,
                { backgroundColor: isDark ? '#1a1a1a' : '#fff' }
              ]}
            >
              <Text style={[
                styles.modalTitle,
                { color: isDark ? '#e6edf3' : '#333' }
              ]}>
                Open with
              </Text>
              
              <View style={styles.optionsContainer}>
                <TouchableOpacity 
                  style={styles.optionButton}
                  onPress={handleCall}
                >
                  <View style={[styles.iconCircle, { backgroundColor: '#2196F3' }]}>
                    <Ionicons name="call" size={28} color="#fff" />
                  </View>
                  <Text style={[
                    styles.optionText,
                    { color: isDark ? '#e6edf3' : '#333' }
                  ]}>
                    Phone
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.optionButton}
                  onPress={handleMessage}
                >
                  <View style={[styles.iconCircle, { backgroundColor: '#4CAF50' }]}>
                    <Ionicons name="chatbubble" size={28} color="#fff" />
                  </View>
                  <Text style={[
                    styles.optionText,
                    { color: isDark ? '#e6edf3' : '#333' }
                  ]}>
                    Messages
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.onceButton,
                    { backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0' }
                  ]}
                  onPress={() => setContactModalVisible(false)}
                >
                  <Text style={[
                    styles.buttonText,
                    { color: isDark ? '#e6edf3' : '#333' }
                  ]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingVertical: 50,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 5,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  logo: {
    width: 120,
    height: 70,
  },
  welcome: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 30,
  },
  childInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
  },
  childName: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  sectionText: {
    fontSize: 13,
    opacity: 0.95,
  },
  teacherInfo: {
    fontSize: 14,
    marginTop: 15,
  },
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  teacherName: {
    fontSize: 14,
    opacity: 0.95,
  },
  guardianInfo: {
    fontSize: 13,
    marginTop: 2,
    opacity: 0.9,
  },
  teacherPhone: {
    fontSize: 13,
    opacity: 0.95,
    marginLeft: 6,
  },
  phoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: 8,
  },
  statusContainer: {
    backgroundColor: '#2ecc71',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontWeight: '600',
  },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginTop: 30,
  },
  dashboardText: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 25,
  },
  card: {
    width: '47%',
    borderRadius: 16,
    padding: 25,
    marginBottom: 20,
    alignItems: 'center',
  },
  cardTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 30,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
  },
  optionButton: {
    alignItems: 'center',
    width: 100,
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  onceButton: {
    borderWidth: 1,
    borderColor: '#ddd',
  },
  alwaysButton: {
    backgroundColor: '#2196F3',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Home;