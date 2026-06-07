import { Tabs } from "expo-router";
import { Home, FileText, DollarSign } from "lucide-react-native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: {
          borderTopColor: "#E5E7EB",
          paddingBottom: 6,
          height: 58,
        },
        headerStyle: { backgroundColor: "#fff" },
        headerTitleStyle: { fontSize: 16, fontWeight: "600" },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Meu Contrato",
          tabBarLabel: "Início",
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
          headerTitle: "Financer Auto",
        }}
      />
      <Tabs.Screen
        name="parcelas"
        options={{
          title: "Parcelas",
          tabBarLabel: "Parcelas",
          tabBarIcon: ({ color, size }) => <DollarSign size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: "Histórico",
          tabBarLabel: "Histórico",
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
