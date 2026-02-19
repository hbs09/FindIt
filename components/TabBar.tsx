import { AntDesign, Feather } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  
  const primaryColor = '#1a1a1a';
  const greyColor = '#737373';
  const [isManager, setIsManager] = useState(false);
  
  // Estados para as bolinhas de notificação
  const [hasUnread, setHasUnread] = useState(false); // Para o perfil
  const [hasPendingRequests, setHasPendingRequests] = useState(false); // Para o manager
  const [userSalonId, setUserSalonId] = useState<string | null>(null); // Guardar o ID do salão

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

  // NOVO: useEffect específico para escutar alterações nas marcações do salão
  useEffect(() => {
    if (!userSalonId) return;

    // Verificar ao iniciar
    checkPendingRequests(userSalonId);

    // Subscrever a novas marcações em tempo real
    const channelAppointments = supabase
      .channel('tabbar_appointments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments', // ATENÇÃO: Altera para o nome da tua tabela (ex: 'agendamentos')
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

      // 1. Verificar se é DONO
      const { data: owner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
      if (owner) {
          setIsManager(true);
          setUserSalonId(owner.id); // Guardamos o ID do salão
          return;
      }

      // 2. Verificar se é STAFF (Gerente)
      const { data: staff } = await supabase
          .from('salon_staff')
          .select('role, status, salon_id') // ATENÇÃO: Adicionei salon_id ao select
          .eq('user_id', user.id)
          .eq('status', 'ativo')
          .single();

      if (staff) {
          setIsManager(true);
          setUserSalonId(staff.salon_id); // Guardamos o ID do salão
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

  // NOVO: Função para verificar se há agendamentos pendentes no salão
  async function checkPendingRequests(salonId: string) {
      const { count, error } = await supabase
          .from('appointments') // ATENÇÃO: Altera para o nome da tua tabela
          .select('*', { count: 'exact', head: true })
          .eq('salon_id', salonId)
          .eq('status', 'pendente'); // ATENÇÃO: Confirma se o status que usas é 'pendente'

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
            {/* Ícones */}
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
                    // NOVO: View em volta da mala com a badge de pedidos pendentes
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
    borderColor: 'white',
  }
});