import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
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

type Notification = {
    id: number;
    title: string;
    body: string;
    read: boolean;
    created_at: string;
    user_id: string;
    data?: any;
};

// --- FUNÇÃO AUXILIAR DE DATA ---
const formatNotificationDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Hoje, ${time}`;
    if (isYesterday) return `Ontem, ${time}`;
    
    return `${date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })} • ${time}`;
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
                    <Ionicons name={item.read ? "mail-unread" : "mail-open-outline"} size={22} color="white" />
                </Animated.View>
            </View>
        );
    };

    const renderRightActions = (progress: any, dragX: any) => {
        const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
        return (
            <View style={styles.rightActionContainer}>
                <Animated.View style={[styles.actionIcon, { transform: [{ scale }] }]}>
                    <Ionicons name="trash-outline" size={22} color="white" />
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
            return { name: "alert", color: "#FF3B30", bg: "#FFECEC" }; // Vermelho suave
        }
        if (title.includes("confirmado") || title.includes("sucesso") || title.includes("aceite")) {
            return { name: "checkmark", color: "#34C759", bg: "#E8FAEB" }; // Verde suave
        }
        if (title.includes("marcação") || title.includes("agendamento")) {
            return { name: "calendar", color: "#5856D6", bg: "#EFEEFA" }; // Roxo suave
        }
        return { name: "notifications", color: "#007AFF", bg: "#EBF3FF" }; // Azul suave
    };

    const iconInfo = getIconInfo();
    const formattedDate = formatNotificationDate(item.created_at);

    return (
        <Animated.View style={{ opacity, marginBottom: 16, marginHorizontal: 20 }}>
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
                    style={[styles.card, !item.read && styles.unreadCardBg]}
                    onPress={() => onPress(item)}
                    activeOpacity={0.9}
                >
                    <View style={styles.cardRow}>
                        {/* Ícone com Badge de não lido integrado */}
                        <View style={styles.iconWrapper}>
                            <View style={[styles.iconBox, { backgroundColor: iconInfo.bg }]}>
                                <Ionicons name={iconInfo.name as any} size={20} color={iconInfo.color} />
                            </View>
                            {!item.read && <View style={styles.unreadDot} />}
                        </View>

                        {/* Conteúdo de Texto */}
                        <View style={styles.cardContent}>
                            <View style={styles.cardHeader}>
                                <Text style={[styles.cardTitle, !item.read && styles.boldText]} numberOfLines={1}>
                                    {item.title}
                                </Text>
                                <Text style={styles.dateText}>{formattedDate}</Text>
                            </View>

                            <Text style={[styles.cardBody, !item.read && styles.cardBodyDark]} numberOfLines={2}>
                                {item.body}
                            </Text>
                        </View>
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
        if (!user) {
            setLoading(false);
            return;
        }

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
        const previousList = [...notifications];
        setNotifications(prev => prev.filter(n => n.id !== id));
        const { error } = await supabase.from('notifications').delete().eq('id', id);
        if (error) setNotifications(previousList);
    }

    async function handleNotificationPress(notification: Notification) {
        if (!notification.read) markAsRead(notification.id);

        const titleLower = notification.title.toLowerCase();

        // Lógica de Redirecionamento
        if (titleLower.includes("nova marcação") || titleLower.includes("novo agendamento") || titleLower.includes("novo pedido")) {
            router.push('/(tabs)/manager/agenda');
        } else if (
            titleLower.includes("confirmado") || 
            titleLower.includes("cancelado") || 
            titleLower.includes("recusado") || 
            titleLower.includes("aceite") ||
            titleLower.includes("sua marcação") ||
            titleLower.includes("atualização") ||
            titleLower.includes("alterado") ||
            titleLower.includes("reagendado")
        ) {
            router.push('/(tabs)/profile');
        } else if (notification.data && notification.data.screen) {
            if (notification.data.params) {
                router.push({ pathname: notification.data.screen, params: notification.data.params });
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
            "Desejas apagar todas as notificações permanentemente?",
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

    // Calcula as não lidas AQUI (dentro do componente, onde 'notifications' existe)
    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={styles.container} edges={['top']}>
                
                {/* --- HEADER NOVO E CORRIGIDO --- */}
                <View style={styles.headerContainer}>
                    {/* Barra de Topo: Navegação e Ações */}
                    <View style={styles.topBar}>
                        <TouchableOpacity 
                            onPress={() => router.back()} 
                            style={styles.backButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
                        </TouchableOpacity>

                        {notifications.length > 0 && (
                            <View style={styles.actionsRow}>
                                <TouchableOpacity 
                                    onPress={markAllRead} 
                                    style={styles.iconButton}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="checkmark-done" size={22} color="#007AFF" />
                                </TouchableOpacity>
                                
                                <TouchableOpacity 
                                    onPress={deleteAll} 
                                    style={[styles.iconButton, styles.deleteButton]} 
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Título e Subtítulo usando unreadCount corretamente */}
                    <View style={styles.titleContainer}>
                        <Text style={styles.screenTitle}>Notificações</Text>
                        <Text style={styles.screenSubtitle}>
                            {unreadCount > 0 
                                ? `Tens ${unreadCount} ${unreadCount === 1 ? 'nova mensagem' : 'novas mensagens'}` 
                                : 'Tudo limpo por aqui'}
                        </Text>
                    </View>
                </View>

                {/* --- LISTA --- */}
                {loading && notifications.length === 0 ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#007AFF" />
                    </View>
                ) : (
                    <FlatList
                        data={notifications}
                        keyExtractor={item => item.id.toString()}
                        refreshControl={
                            <RefreshControl 
                                refreshing={loading} 
                                onRefresh={fetchNotifications} 
                                tintColor="#007AFF" 
                            />
                        }
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <View style={styles.emptyIconBg}>
                                    <Ionicons name="notifications-off-outline" size={40} color="#999" />
                                </View>
                                <Text style={styles.emptyTitle}>Sem notificações</Text>
                                <Text style={styles.emptySubtitle}>Neste momento não tens novos avisos.</Text>
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
                )}
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },

    // HEADER STYLES
    headerContainer: {
        paddingHorizontal: 24,
        paddingBottom: 24,
        paddingTop: 12,
        backgroundColor: '#F8F9FA',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.03)',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#EBF3FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButton: {
        backgroundColor: '#FFF0F0',
    },
    titleContainer: {
        gap: 4,
    },
    screenTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#1A1A1A',
        letterSpacing: -1,
        lineHeight: 38,
    },
    screenSubtitle: {
        fontSize: 15,
        color: '#8E8E93',
        fontWeight: '500',
    },

    // LISTA
    listContent: {
        paddingTop: 8,
        paddingBottom: 40,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // SWIPE
    swipeContainerStyle: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    leftActionContainer: {
        flex: 1,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        paddingLeft: 24,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
    },
    rightActionContainer: {
        flex: 1,
        backgroundColor: '#FF3B30',
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingRight: 24,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
    },
    actionIcon: {
        width: 30,
        alignItems: 'center',
    },

    // CARD DESIGN
    card: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 3,
        borderWidth: 0,
    },
    unreadCardBg: {
        backgroundColor: '#FFFFFF',
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
    },

    // Ícone lateral
    iconWrapper: {
        position: 'relative',
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    unreadDot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#007AFF',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },

    // Conteúdo de texto
    cardContent: {
        flex: 1,
        justifyContent: 'center',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1C1C1E',
        flex: 1,
        marginRight: 8,
    },
    boldText: {
        fontWeight: '800',
    },
    dateText: {
        fontSize: 11,
        color: '#8E8E93',
        fontWeight: '500',
    },
    cardBody: {
        fontSize: 13,
        lineHeight: 18,
        color: '#8E8E93',
        marginTop: 2,
    },
    cardBodyDark: {
        color: '#48484A',
    },

    // EMPTY STATE
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
        paddingHorizontal: 40,
    },
    emptyIconBg: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#EAECEF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1C1C1E',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#8E8E93',
        textAlign: 'center',
        lineHeight: 20,
    },
});