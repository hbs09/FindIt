import { AntDesign, Feather } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext'; // <-- Importar o Tema
import { supabase } from '../supabase';

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  
  // 1. Hook de Tema
  const { colors, isDarkMode } = useTheme();
  
  // 2. Estilos Dinâmicos
  const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);

  // 3. Cores dos Ícones adaptativas
  const primaryColor = isDarkMode ? '#FFFFFF' : '#1A1A1A'; // Cor ativa
  const greyColor = isDarkMode ? '#888888' : '#8E8E93';    // Cor inativa

  const [isManager, setIsManager] = useState(false);
  
  // Estados para as bolinhas de notificação
  const [hasUnread, setHasUnread] = useState(false); 
  const [hasPendingRequests, setHasPendingRequests] = useState(false); 
  const [userSalonId, setUserSalonId] = useState<string | null>(null); 

  const allowedRoutes = ['index', 'map', 'profile', 'manager'];

  useEffect(() => {
    checkUserRole();
    checkUnreadNotifications();

    let channel: any;
    async function setupRealtime() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel('tabbar_notifications')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            checkUnreadNotifications();
          }
        )
        .subscribe();
    }
    setupRealtime();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!userSalonId) return;

    checkPendingRequests(userSalonId);

    const channelAppointments = supabase
      .channel('tabbar_appointments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments', 
          filter: `salon_id=eq.${userSalonId}`
        },
        () => {
          checkPendingRequests(userSalonId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelAppointments);
    };
  }, [userSalonId]);

  async function checkUserRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: owner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
      if (owner) {
          setIsManager(true);
          setUserSalonId(owner.id); 
          return;
      }

      const { data: staff } = await supabase
          .from('salon_staff')
          .select('role, status, salon_id') 
          .eq('user_id', user.id)
          .eq('status', 'ativo')
          .single();

      if (staff) {
          setIsManager(true);
          setUserSalonId(staff.salon_id); 
      }
  }

  async function checkUnreadNotifications() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count, error } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false);

      if (!error && count !== null) {
          setHasUnread(count > 0);
      }
  }

  async function checkPendingRequests(salonId: string) {
      const { count, error } = await supabase
          .from('appointments') 
          .select('*', { count: 'exact', head: true })
          .eq('salon_id', salonId)
          .eq('status', 'pendente'); 

      if (!error && count !== null) {
          setHasPendingRequests(count > 0);
      }
  }

  return (
    <View style={[styles.tabbar, { bottom: Platform.OS === 'ios' ? 20 : 20 }]}>
      {state.routes.map((route, index) => {
        if (!allowedRoutes.includes(route.name)) return null;

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
            {
                route.name === "index" ? (
                    <AntDesign name="home" size={24} color={isFocused ? primaryColor : greyColor} />
                ) : route.name === "map" ? (
                    <Feather name="map" size={24} color={isFocused ? primaryColor : greyColor} />
                ) : route.name === "profile" ? (
                    <View>
                        <Feather name="user" size={24} color={isFocused ? primaryColor : greyColor} />
                        {hasUnread && <View style={styles.unreadBadge} />}
                    </View>
                ) : route.name === "manager" ? (
                    <View>
                        <Feather name="briefcase" size={24} color={isFocused ? primaryColor : greyColor} />
                        {hasPendingRequests && <View style={styles.unreadBadge} />}
                    </View>
                ) : null
            }
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// 4. Função Dinâmica de Estilos
const createStyles = (colors: any, isDarkMode: boolean) => StyleSheet.create({
  tabbar: {
    position: 'absolute',
    bottom: 20, 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    
    // DINÂMICO: Preto no Dark, Branco no Light
    backgroundColor: isDarkMode ? '#121212' : '#FFFFFF', 
    borderWidth: 1,
    // DINÂMICO: Borda branca no Dark, cinza muito clarinha no Light
    borderColor: isDarkMode ? '#FFFFFF' : '#E5E7EB',

    marginHorizontal: 80, 
    paddingVertical: 15, 
    borderRadius: 35,     
    borderCurve: 'continuous',
    
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
    shadowOpacity: isDarkMode ? 0.3 : 0.1, // Sombra mais forte no escuro para separar do fundo
    elevation: 5, 
  },
  tabbarItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    // DINÂMICO: O recorte da bolinha acompanha a cor de fundo da TabBar
    borderColor: isDarkMode ? '#000000' : '#FFFFFF', 
  }
});