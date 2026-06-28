import { withLayoutContext } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabNavigationEventMap,
  type MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import type { ParamListBase, TabNavigationState } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";

const { Navigator } = createMaterialTopTabNavigator();

/**
 * Material Top Tabs (backed by react-native-pager-view) give us swipe-to-switch
 * between tabs; we keep the tab bar pinned to the bottom so it still reads as a
 * standard bottom nav.
 */
const SwipeTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

const HAIRLINE = 0.5;

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SwipeTabs
      tabBarPosition="bottom"
      screenOptions={{
        swipeEnabled: true,
        tabBarShowIcon: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarPressColor: "transparent",
        tabBarIndicatorStyle: { height: 0 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: HAIRLINE,
          elevation: 0,
          shadowOpacity: 0,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarItemStyle: {
          flexDirection: "column",
          gap: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          textTransform: "none",
          margin: 0,
        },
      }}
    >
      <SwipeTabs.Screen
        name="index"
        options={{
          title: "Talk",
          tabBarIcon: ({ color }) => <Ionicons name="mic" color={color} size={22} />,
        }}
      />
      <SwipeTabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color }) => <Ionicons name="albums" color={color} size={22} />,
        }}
      />
      <SwipeTabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Ionicons name="person" color={color} size={22} />,
        }}
      />
      <SwipeTabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Ionicons name="settings-sharp" color={color} size={22} />,
        }}
      />
    </SwipeTabs>
  );
}
