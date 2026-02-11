import { AntDesign, Feather } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  
  const primaryColor = '#1a1a1a';
  const greyColor = '#737373';

  const allowedRoutes = ['index', 'map', 'profile'];

  return (
    <View style={styles.tabbar}>
      {state.routes.map((route, index) => {
        if (!allowedRoutes.includes(route.name)) return null;

        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <TouchableOpacity
            key={route.name}
            style={styles.tabbarItem}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
          >
            {/* Ícones (Aumentados ligeiramente para 24px) */}
            {
                route.name === "index" ? (
                    <AntDesign name="home" size={24} color={isFocused ? primaryColor : greyColor} />
                ) : route.name === "map" ? (
                    <Feather name="map" size={24} color={isFocused ? primaryColor : greyColor} />
                ) : route.name === "profile" ? (
                    <Feather name="user" size={24} color={isFocused ? primaryColor : greyColor} />
                ) : null
            }
            
            {/* O Texto (Label) foi removido aqui */}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabbar: {
    position: 'absolute',
    bottom: 20, 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 80, // Aumentei para 80 para a barra ficar mais compacta (pílula)
    paddingVertical: 15,  // Aumentei o padding vertical para a barra não ficar demasiado fina
    borderRadius: 35,     
    borderCurve: 'continuous',
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
    shadowOpacity: 0.1,
    elevation: 5, 
  },
  tabbarItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // gap: 3, -> Removido pois já não temos texto
  }
});