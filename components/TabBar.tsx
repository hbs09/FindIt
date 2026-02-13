import { AntDesign, Feather } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase'; // Confirma se o caminho está correto

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  
  const primaryColor = '#1a1a1a';
  const greyColor = '#737373';
  const [isManager, setIsManager] = useState(false);

  // Adicionei 'manager' à lista, mas ele só aparece se a verificação passar
  const allowedRoutes = ['index', 'map', 'profile', 'manager'];

  useEffect(() => {
    checkUserRole();
  }, []);

  async function checkUserRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Verificar se é DONO
      const { data: owner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
      if (owner) {
          setIsManager(true);
          return;
      }

      // 2. Verificar se é STAFF (Gerente)
      const { data: staff } = await supabase
          .from('salon_staff')
          .select('role, status')
          .eq('user_id', user.id)
          .eq('status', 'ativo')
          .single();

      if (staff) {
          setIsManager(true);
      }
  }

  return (
    <View style={styles.tabbar}>
      {state.routes.map((route, index) => {
        if (!allowedRoutes.includes(route.name)) return null;

        // SE FOR A ROTA MANAGER E NÃO FOR GERENTE, ESCONDE
        if (route.name === 'manager' && !isManager) return null;

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
            {/* Ícones */}
            {
                route.name === "index" ? (
                    <AntDesign name="home" size={24} color={isFocused ? primaryColor : greyColor} />
                ) : route.name === "map" ? (
                    <Feather name="map" size={24} color={isFocused ? primaryColor : greyColor} />
                ) : route.name === "profile" ? (
                    <Feather name="user" size={24} color={isFocused ? primaryColor : greyColor} />
                ) : route.name === "manager" ? (
                    // ÍCONE DA MALA (MANAGER)
                    <Feather name="briefcase" size={24} color={isFocused ? primaryColor : greyColor} />
                ) : null
            }
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
    marginHorizontal: 80, 
    paddingVertical: 15, 
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
  }
});