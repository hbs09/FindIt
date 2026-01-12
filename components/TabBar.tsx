import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function TabBar({ state, descriptors, navigation }: any) {
  
  // 1. Verificar se a aba atual (focada) pediu para esconder a barra
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  if (focusedOptions.tabBarStyle?.display === 'none') {
    return null;
  }

  const tabs = [
    { name: 'index', label: 'Explorar', icon: 'search-outline', activeIcon: 'search' },
    { name: 'map', label: 'Mapa', icon: 'map-outline', activeIcon: 'map' },
    { name: 'profile', label: 'Perfil', icon: 'person-outline', activeIcon: 'person' },
  ];

  return (
    <View style={styles.floatingNavContainer}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const tabItem = tabs.find(t => t.name === route.name);
        if (!tabItem) return null;

        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            style={styles.navBtn}
          >
            <View style={styles.iconContainer}>
              <Ionicons 
                  name={(isFocused ? tabItem.activeIcon : tabItem.icon) as any} 
                  size={24} 
                  color={isFocused ? '#1a1a1a' : '#999'} 
              />
            </View>
            <Text style={[styles.navLabel, isFocused && styles.navLabelActive]}>
              {tabItem.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingNavContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 35,
    height: 70,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)'
  },
  navBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%'
  },
  iconContainer: {
    marginBottom: 4,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999',
  },
  navLabelActive: {
    color: '#1a1a1a',
  }
});