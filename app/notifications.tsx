import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    FlatList,
    LayoutAnimation,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

// Ativar animações de layout no Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

type Notification = {
    id: number;
    title: string;
    body: string;
    read: boolean;
    created_at: string;
    user_id: string;
    data?: any;
};

// --- COMPONENTE INDIVIDUAL (LINHA) ---
const NotificationRow = ({ item, onPress, onMarkUnread, onDelete }: any) => {
    const swipeableRef = useRef<Swipeable>(null);
    const opacity = useRef(new Animated.Value(1)).current;

    const closeSwipe = () => {
        swipeableRef.current?.close();
    };

    const renderLeftActions = (progress: any, dragX: any) => {
        const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
            <View style={styles.leftActionContainer}>
                <Animated.View style={[styles.actionIcon, { transform: [{ scale }] }]}>
                    <Ionicons name={item.read ? "mail-unread" : "mail-open"} size={24} color="white" />
                </Animated.View>
            </View>
        );
    };

    const renderRightActions = (progress: any, dragX: any) => {
        const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
        return (
            <View style={styles.rightActionContainer}>
                <Animated.View style={[styles.actionIcon, { transform: [{ scale }] }]}>
                    <Ionicons name="trash-outline" size={24} color="white" />
                </Animated.View>
            </View>
        );
    };

    const animateAndDelete = () => {
        Animated.timing(opacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            onDelete(item.id);
        });
    };

    const getIconInfo = () => {
        const title = item.title.toLowerCase();
        if (title.includes("cancelado") || title.includes("recusado") || title.includes("erro")) {
            return { name: "alert-circle", color: "#FF3B30", bg: "#FFF0F0" };
        }
        if (title.includes("confirmado") || title.includes("sucesso") || title.includes("aceite")) {
            return { name: "checkmark-circle", color: "#34C759", bg: "#F0FFF4" };
        }
        return { name: "notifications", color: "#007AFF", bg: "#F0F8FF" };
    };

    const iconInfo = getIconInfo();

    // Formatação de data simplificada
    const dateObj = new Date(item.created_at);
    const dateString = dateObj.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
    const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <Animated.View style={{ opacity, marginBottom: 12, marginHorizontal: 20 }}>
            <Swipeable
                ref={swipeableRef}
                friction={2}
                leftThreshold={60}
                rightThreshold={60}
                renderLeftActions={renderLeftActions}
                renderRightActions={renderRightActions}
                onSwipeableOpen={(direction) => {
                    if (direction === 'left') {
                        onMarkUnread(item.id);
                        closeSwipe();
                    } else if (direction === 'right') {
                        animateAndDelete();
                    }
                }}
                containerStyle={styles.swipeContainerStyle}
            >
                <TouchableOpacity
                    style={[styles.card, !item.read && styles.unreadCardBorder]}
                    onPress={() => onPress(item)}
                    activeOpacity={0.7}
                >
                    {/* Indicador de Não Lido (Ponto Azul) */}
                    {!item.read && <View style={styles.unreadIndicator} />}

                    {/* Ícone */}
                    <View style={[styles.iconBox, { backgroundColor: iconInfo.bg }]}>
                        <Ionicons name={iconInfo.name as any} size={22} color={iconInfo.color} />
                    </View>

                    {/* Conteúdo */}
                    <View style={styles.cardContent}>
                        <View style={styles.cardHeader}>
                            <Text style={[styles.cardTitle, !item.read && styles.cardTitleBold]} numberOfLines={1}>
                                {item.title}
                            </Text>
                            <Text style={styles.dateText}>
                                {dateString} • {timeString}
                            </Text>
                        </View>

                        <Text style={[styles.cardBody, !item.read && styles.cardBodyDark]} numberOfLines={2}>
                            {item.body}
                        </Text>
                    </View>
                </TouchableOpacity>
            </Swipeable>
        </Animated.View>
    );
};

// --- ECRÃ PRINCIPAL ---
export default function NotificationsScreen() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchNotifications();
    }, []);

    useEffect(() => {
        let channel: any;
        async function setupRealtime() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            channel = supabase
                .channel('realtime_notifications')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${user.id}`
                    },
                    (payload) => {
                        if (payload.eventType === 'INSERT') {
                            setNotifications(prev => [payload.new as Notification, ...prev]);
                        } else if (payload.eventType === 'UPDATE') {
                            setNotifications(prev =>
                                prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n)
                            );
                        } else if (payload.eventType === 'DELETE') {
                            setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
                        }
                    }
                )
                .subscribe();
        }
        setupRealtime();
        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    async function fetchNotifications() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (data) setNotifications(data);
        setLoading(false);
    }

    async function markAsRead(id: number) {
        const needsUpdate = notifications.find(n => n.id === id && !n.read);
        if (needsUpdate) {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
            await supabase.from('notifications').update({ read: true }).eq('id', id);
        }
    }

    async function toggleReadStatus(id: number) {
        const notif = notifications.find(n => n.id === id);
        if (!notif) return;

        const newStatus = !notif.read;
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: newStatus } : n));
        await supabase.from('notifications').update({ read: newStatus }).eq('id', id);
    }

    async function deleteNotification(id: number) {
        // LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); // Opcional: pode conflitar com Swipeable às vezes
        const previousList = [...notifications];
        setNotifications(prev => prev.filter(n => n.id !== id));

        const { error } = await supabase.from('notifications').delete().eq('id', id);
        if (error) {
            setNotifications(previousList);
        }
    }

   async function handleNotificationPress(notification: Notification) {
        // 1. Marca como lida se ainda não estiver
        if (!notification.read) {
            markAsRead(notification.id);
        }

        const titleLower = notification.title.toLowerCase();

        // --- LÓGICA DE REDIRECIONAMENTO ---

        // CASO 1: Notificações para o GERENTE (Novas Marcações)
        // Redireciona para a Agenda para gerir o pedido
        if (titleLower.includes("nova marcação") || titleLower.includes("novo agendamento") || titleLower.includes("novo pedido")) {
            router.push('/(tabs)/manager/agenda');
        }
        
        // CASO 2: Notificações para o CLIENTE (Estados e Atualizações)
        // Redireciona para o Perfil para ver o histórico/estado
        else if (
            titleLower.includes("confirmado") || 
            titleLower.includes("cancelado") || 
            titleLower.includes("recusado") || 
            titleLower.includes("aceite") ||
            titleLower.includes("sua marcação") ||
            // --- NOVOS TERMOS ADICIONADOS AQUI ---
            titleLower.includes("atualização") ||  // Cobre "Atualização de agendamento"
            titleLower.includes("alterado") ||     // Cobre "Agendamento alterado"
            titleLower.includes("reagendado")      // Cobre reagendamentos
        ) {
            router.push('/(tabs)/profile');
        }

        // CASO 3: Outros tipos de notificação (Genéricas)
        // Usa o ecrã definido nos dados da notificação, se existir
        else if (notification.data && notification.data.screen) {
            if (notification.data.params) {
                router.push({
                    pathname: notification.data.screen,
                    params: notification.data.params
                });
            } else {
                router.push(notification.data.screen);
            }
        }
    }

    async function markAllRead() {
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length === 0) return;
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    }

    async function deleteAll() {
        if (notifications.length === 0) return;
        Alert.alert(
            "Limpar Tudo",
            "Desejas apagar todas as notificações?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Apagar",
                    style: 'destructive',
                    onPress: async () => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        const previousList = [...notifications];
                        setNotifications([]);
                        const { error } = await supabase.from('notifications').delete().gt('id', 0);
                        if (error) setNotifications(previousList);
                    }
                }
            ]
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={styles.container} edges={['top']}>

                {/* --- HEADER --- */}
                <View style={styles.headerContainer}>
                    <View style={styles.headerLeft}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
                            <Ionicons name="chevron-back" size={28} color="#000" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Notificações</Text>
                    </View>

                    {notifications.length > 0 && (
                        <View style={styles.headerActions}>
                            <TouchableOpacity onPress={markAllRead} style={styles.iconBtn} activeOpacity={0.6}>
                                <Ionicons name="checkmark-done" size={22} color="#007AFF" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={deleteAll} style={styles.iconBtn} activeOpacity={0.6}>
                                <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* --- LISTA --- */}
                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id.toString()}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotifications} />}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyCircle}>
                                <Ionicons name="notifications-off-outline" size={48} color="#BDC3C7" />
                            </View>
                            <Text style={styles.emptyTitle}>Sem notificações</Text>
                            <Text style={styles.emptySubtitle}>Estás a par de tudo!</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <NotificationRow
                            item={item}
                            onPress={handleNotificationPress}
                            onMarkUnread={toggleReadStatus}
                            onDelete={deleteNotification}
                        />
                    )}
                />
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F7F8FA', // Fundo cinza muito suave
    },

    // HEADER
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#F7F8FA',
        zIndex: 10,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    backButton: {
        padding: 4,
        marginLeft: -8,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1A1A1A',
        letterSpacing: -0.5,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 16,
    },
    iconBtn: {
        padding: 6,
        backgroundColor: '#EAECEF',
        borderRadius: 20,
    },

    // LISTA
    listContent: {
        paddingTop: 10,
        paddingBottom: 40,
    },

    // SWIPE
    swipeContainerStyle: {
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: 'transparent',
    },
    leftActionContainer: {
        flex: 1,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingLeft: 25,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
    },
    rightActionContainer: {
        flex: 1,
        backgroundColor: '#FF3B30',
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingRight: 25,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
    },
    actionIcon: {
        width: 30,
        alignItems: 'center',
    },

    // CARD DESIGN
    card: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 16,
        alignItems: 'flex-start',
        gap: 14,

        // Sombra suave e moderna
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,

        // Borda subtil
        borderWidth: 1,
        borderColor: '#EFF1F3',
    },
    unreadCardBorder: {
        borderColor: '#D0E3FF', // Borda azulada se não lido
        backgroundColor: '#FFFFFF', // Mantemos branco para ficar clean
    },

    // Ícone lateral
    iconBox: {
        width: 42,
        height: 42,
        borderRadius: 21,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Conteúdo
    cardContent: {
        flex: 1,
        paddingVertical: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#444',
        flex: 1,
        marginRight: 8,
    },
    cardTitleBold: {
        color: '#000',
        fontWeight: '800',
    },
    cardBody: {
        fontSize: 14,
        color: '#8E8E93',
        lineHeight: 20,
    },
    cardBodyDark: {
        color: '#444', // Texto mais escuro se não lido
    },

    // Data/Hora
    dateText: {
        fontSize: 11,
        color: '#B0B0B0',
        fontWeight: '500',
        marginTop: 2,
    },

    // Ponto Azul (Unread)
    unreadIndicator: {
        position: 'absolute',
        top: 16,
        right: 16, // Posicionado no canto se preferires, ou à esquerda do titulo
        width: 0,
        height: 0,
        // Nota: Removi o ponto flutuante em favor do Estilo Bold + Borda Azul.
        // Se quiseres o ponto, descomenta abaixo:
        /*
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#007AFF',
        */
    },

    // EMPTY STATE
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
    },
    emptyCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#EAECEF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#333',
        marginBottom: 6,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#999',
    },
});