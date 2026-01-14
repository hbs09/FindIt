import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
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
};

// --- COMPONENTE INDIVIDUAL (LINHA) ---
const NotificationRow = ({ item, onMarkRead, onMarkUnread, onDelete }: any) => {
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
                    <Ionicons name="mail-unread" size={22} color="white" />
                    <Text style={styles.actionText}>Marcar n/ lida</Text>
                </Animated.View>
            </View>
        );
    };

    const renderRightActions = (progress: any, dragX: any) => {
        const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
        return (
            <View style={styles.rightActionContainer}>
                <Animated.View style={[styles.actionIcon, { transform: [{ scale }] }]}>
                    <Ionicons name="trash" size={22} color="white" />
                    <Text style={styles.actionText}>Apagar</Text>
                </Animated.View>
            </View>
        );
    };

    const animateAndDelete = () => {
        Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
            onDelete(item.id);
        });
    };

    // Ícone baseado no título
    const getIconInfo = () => {
        if (item.title.toLowerCase().includes("cancelado") || item.title.toLowerCase().includes("recusado")) {
            return { name: "close", color: "#FF3B30", bg: "#FFEBEE" };
        }
        if (item.title.toLowerCase().includes("confirmado") || item.title.toLowerCase().includes("aceite")) {
            return { name: "checkmark", color: "#34C759", bg: "#E8F5E9" };
        }
        // Default
        return { name: "notifications", color: "#007AFF", bg: "#E3F2FD" };
    };

    const iconInfo = getIconInfo();

    return (
        <Animated.View style={{ opacity, marginBottom: 12 }}>
            <Swipeable
                ref={swipeableRef}
                friction={2}
                leftThreshold={60}
                rightThreshold={60}
                
                // --- ALTERAÇÃO PRINCIPAL ---
                // Se item.read for false (não lida), passamos undefined para bloquear o slide
                renderLeftActions={item.read ? renderLeftActions : undefined}   // Bloqueia "Marcar n/ lida"
                renderRightActions={item.read ? renderRightActions : undefined} // Bloqueia "Apagar" (Desaparecer)
                // ---------------------------

                onSwipeableOpen={(direction) => {
                    // Segurança extra: só executa as ações se estiver lida
                    if (!item.read) {
                        closeSwipe();
                        return;
                    }

                    if (direction === 'left') { 
                        onMarkUnread(item.id); 
                        closeSwipe(); 
                    }
                    else if (direction === 'right') { 
                        animateAndDelete(); 
                    }
                }}
                containerStyle={styles.swipeContainerStyle}
            >
                <TouchableOpacity 
                    style={[styles.card, !item.read && styles.unreadCard]} 
                    onPress={() => onMarkRead(item.id)}
                    activeOpacity={0.95}
                >
                    {/* Coluna Esquerda: Ícone */}
                    <View style={[styles.iconBox, { backgroundColor: iconInfo.bg }]}>
                        <Ionicons 
                            name={iconInfo.name as any} 
                            size={20} 
                            color={iconInfo.color} 
                        />
                    </View>
                    
                    {/* Coluna Central: Conteúdo */}
                    <View style={{ flex: 1, paddingVertical: 2 }}>
                        <View style={styles.cardHeaderRow}>
                            <Text style={[styles.cardTitle, !item.read && styles.unreadTitle]} numberOfLines={1}>
                                {item.title}
                            </Text>
                            {/* Ponto azul se não lido */}
                            {!item.read && <View style={styles.unreadDot} />}
                        </View>
                        
                        <Text style={[styles.cardBody, !item.read && styles.unreadBody]} numberOfLines={3}>
                            {item.body}
                        </Text>
                        
                        <Text style={styles.dateText}>
                            {new Date(item.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })} às {new Date(item.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
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

    async function markAsUnread(id: number) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
        await supabase.from('notifications').update({ read: false }).eq('id', id);
    }

    async function deleteNotification(id: number) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        
        const previousList = [...notifications];
        setNotifications(prev => prev.filter(n => n.id !== id));
        
        const { error } = await supabase.from('notifications').delete().eq('id', id);
        if (error) {
            console.error(error);
            Alert.alert("Erro", "Não foi possível apagar.");
            setNotifications(previousList);
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
            "Tem a certeza que deseja apagar todas as notificações?",
            [
                { text: "Cancelar", style: "cancel" },
                { 
                    text: "Apagar Tudo", 
                    style: 'destructive', 
                    onPress: async () => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        const previousList = [...notifications];
                        setNotifications([]); 
                        const { error } = await supabase.from('notifications').delete().gt('id', 0);
                        if (error) {
                            Alert.alert("Erro", "Falha ao limpar notificações.");
                            setNotifications(previousList);
                        }
                    } 
                }
            ]
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={styles.container} edges={['top']}>
                
                {/* Header melhorado */}
                <View style={styles.header}>
                    <View style={styles.headerTopRow}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={20}>
                            <Ionicons name="arrow-back" size={26} color="#1a1a1a" />
                        </TouchableOpacity>
                        
                        {notifications.length > 0 && (
                            <View style={styles.headerActions}>
                                <TouchableOpacity onPress={markAllRead} style={styles.actionBtn} activeOpacity={0.7}>
                                    <Ionicons name="checkmark-done-circle-outline" size={24} color="#007AFF" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={deleteAll} style={styles.actionBtn} activeOpacity={0.7}>
                                    <Ionicons name="trash-outline" size={24} color="#FF3B30" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                    <Text style={styles.title}>Notificações</Text>
                    <Text style={styles.subtitle}>Fica a par das novidades</Text>
                </View>

                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id.toString()}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotifications} tintColor="#333" />}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconBg}>
                                <Ionicons name="notifications-off" size={40} color="#ccc" />
                            </View>
                            <Text style={styles.emptyTitle}>Tudo limpo!</Text>
                            <Text style={styles.emptyText}>Não tens notificações novas de momento.</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <NotificationRow 
                            item={item}
                            onMarkRead={markAsRead}
                            onMarkUnread={markAsUnread}
                            onDelete={deleteNotification}
                        />
                    )}
                />
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' }, // Fundo ligeiramente off-white
    
    // Header
    header: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 20, backgroundColor: '#F8F9FA' },
    headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerActions: { flexDirection: 'row', gap: 15 },
    actionBtn: { padding: 4 },
    title: { fontSize: 34, fontWeight: '800', color: '#1a1a1a', letterSpacing: -1 },
    subtitle: { fontSize: 14, color: '#666', marginTop: 4, fontWeight: '500' },

    // List
    listContent: { paddingHorizontal: 20, paddingBottom: 100 },
    
    // Swipe
    swipeContainerStyle: { borderRadius: 20, overflow: 'hidden' },

    // Card Design Atualizado
    card: { 
        flexDirection: 'row', 
        backgroundColor: 'white', 
        padding: 18, 
        borderRadius: 20,
        alignItems: 'flex-start', 
        gap: 16, 
        
        // Sombra mais suave e difusa
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 4 }, 
        shadowOpacity: 0.06, 
        shadowRadius: 12, 
        elevation: 2,
    },
    
    unreadCard: { 
        backgroundColor: '#F0F8FF', // Azul muito claro para não lidos
    },

    // Ícone lateral
    iconBox: { 
        width: 44, 
        height: 44, 
        borderRadius: 22, 
        justifyContent: 'center', 
        alignItems: 'center' 
    },

    // Conteúdo do Texto
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
    
    cardTitle: { 
        fontSize: 16, 
        color: '#444', 
        fontWeight: '600', 
        flex: 1, 
        marginRight: 10 
    },
    unreadTitle: { 
        color: '#1a1a1a', 
        fontWeight: '800' 
    },
    
    unreadDot: {
        width: 8, height: 8, borderRadius: 4, backgroundColor: '#007AFF', marginTop: 6
    },

    cardBody: { 
        fontSize: 14, 
        color: '#888', 
        lineHeight: 20, 
        marginBottom: 8 
    },
    unreadBody: {
        color: '#555'
    },

    dateText: { 
        fontSize: 11, 
        color: '#AAA', 
        fontWeight: '600',
        textTransform: 'uppercase'
    },

    // Empty State
    emptyState: { alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
    emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EFEFEF', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    emptyText: { color: '#999', textAlign: 'center', lineHeight: 20 },

    // Swipe Actions Styles
    leftActionContainer: { flex: 1, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 25 },
    rightActionContainer: { flex: 1, backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 25 },
    actionIcon: { alignItems: 'center', justifyContent: 'center', gap: 2 },
    actionText: { color: 'white', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }
});