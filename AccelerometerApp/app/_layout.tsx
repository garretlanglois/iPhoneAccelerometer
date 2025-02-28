// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs>
      {/* Your existing tabs */}
      
      {/* Add the new accelerometer tab */}
      <Tabs.Screen
        name="accelerometer"
        options={{
          title: 'Accelerometer',
          tabBarIcon: ({ color }) => <FontAwesome name="line-chart" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
