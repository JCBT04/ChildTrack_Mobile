import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from "@react-navigation/native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useColorScheme } from "react-native";
import Loading from "./screens/loading";
import Login from './screens/login';
import FPass from './screens/forgotpassword';
import Home from './screens/home';
import Event from './screens/event'
import Attendance from './screens/attendance'
import Schedule from './screens/schedule'
import Unregistered from './screens/unregistered'
import Authorized from './screens/authorized'
import Unauthorized from './screens/unauthorized'
import Notification from './screens/notification'
import Setting from './screens/setting'
import { ThemeProvider } from "./components/ThemeContext";
import Profile from './screens/profile'
import ChangePass from './screens/changepass'



const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();
// routes we don't want to persist across refreshes (transient or unwanted)
// keep splash/login excluded but allow pages like 'event' and 'attendance' to be restored
const IGNORE_ROUTES = ['loading', 'login'];

export default function App() {
  const scheme = useColorScheme(); // auto-detect system dark/light

  return (
    <ThemeProvider>
    <NavigationContainer
      ref={navigationRef}
      onStateChange={async () => {
        try {
          if (!navigationRef.isReady()) return;
          const route = navigationRef.getCurrentRoute();
          if (route && route.name && !IGNORE_ROUTES.includes(route.name)) {
            // persist last visited route name (skip ignored transient screens)
            await AsyncStorage.setItem('lastRoute', route.name);
          }
        } catch (e) {
          // ignore write errors
        }
      }}
      theme={scheme === "dark" ? DarkTheme : DefaultTheme}
    >
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack.Navigator
        initialRouteName="loading"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="loading" component={Loading} />
        <Stack.Screen name="login" component={Login} />
        <Stack.Screen name="fpass" component={FPass} />
        <Stack.Screen name="home" component={Home} />
        <Stack.Screen name="event" component={Event} />
        <Stack.Screen name="attendance" component={Attendance} />
        <Stack.Screen name="schedule" component={Schedule} />
        <Stack.Screen name="unregistered" component={Unregistered} />
        <Stack.Screen name="authorized" component={Authorized} />
        <Stack.Screen name="unauthorized" component={Unauthorized} />
        <Stack.Screen name="notification" component={Notification} />
        <Stack.Screen name="setting" component={Setting} />
        <Stack.Screen name="profile" component={Profile} />
        <Stack.Screen name="changepass" component={ChangePass} />
        {/* firstlogin removed - credential changes handled in Profile screen */}


        {/* Later you can add: <Stack.Screen name="Home" component={Home} /> */}
      </Stack.Navigator>
    </NavigationContainer>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
