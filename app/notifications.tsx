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
                    <Ionicons name="mail-unread" size={24} color="white" />
                    <Text style={styles.actionText}>Não Lida</Text>
                </Animated.View>
            </View>
        );
    };

    const renderRightActions = (progress: any, dragX: any) => {
        const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
        return (
            <View style={styles.rightActionContainer}>
                <Animated.View style={[styles.actionIcon, { transform: [{ scale }] }]}>
                    <Ionicons name="trash" size={24} color="white" />
                    <Text style={styles.actionText}>Apagar</Text>
                </Animated.View>
            </View>
        );
    };

    const animateAndDelete = () => {
        // 1. Faz Fade Out
        Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true, // Melhor performance
        }).start(() => {
            // 2. Após o fade, diz à lista para animar o layout (colapsar o espaço)
            onDelete(item.id);
        });
    };

    return (
        <Animated.View style={{ opacity, marginBottom: 15 }}>
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
                    <View style={[styles.iconBox, !item.read && { backgroundColor: '#e3f2fd' }]}>
                        <Ionicons 
                            name={item.title.includes("Cancelado") ? "close-circle" : item.title.includes("Confirmado") ? "checkmark-circle" : "notifications"} 
                            size={24} 
                            color={!item.read ? "#007AFF" : "#999"} 
                        />
                    </View>
                    
                    <View style={{ flex: 1, paddingVertical: 5 }}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom: 4}}>
                            <Text style={[styles.cardTitle, !item.read && styles.unreadTitle]}>
                                {item.title}
                            </Text>
                            <Text style={styles.date}>
                                {new Date(item.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                            </Text>
                        </View>
                        
                        <Text style={[styles.cardBody, !item.read && {color: '#333'}]}>
                            {item.body}
                        </Text>
                        
                        <Text style={styles.fullDate}>
                            {new Date(item.created_at).toLocaleDateString()}
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
        // Configura a animação de layout ANTES de mudar o estado
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
                
                <View style={styles.headerContainer}>
                    <View style={styles.topRow}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
                        </TouchableOpacity>
                        
                        <View style={styles.actionsRow}>
                            <TouchableOpacity onPress={markAllRead} style={styles.circleBtn}>
                                <Ionicons name="checkmark-done" size={20} color="#007AFF" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={deleteAll} style={styles.circleBtn}>
                                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <Text style={styles.headerTitle}>Notificações</Text>
                    <Text style={styles.headerSubtitle}>Fica a par de todas as atualizações.</Text>
                </View>

                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id.toString()}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotifications} />}
                    // Padding extra no fundo para o último item não ficar cortado
                    contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <View style={styles.emptyIconBg}>
                                <Ionicons name="notifications-off-outline" size={32} color="#ccc" />
                            </View>
                            <Text style={styles.emptyText}>Sem notificações novas.</Text>
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
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { alignItems: 'center', marginTop: 100 },
    
    // Header
    headerContainer: { paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#f8f9fa' },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10 },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    actionsRow: { flexDirection: 'row', gap: 10 },
    circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 16, color: '#666', marginTop: 4 },

    // Swipe Container
    swipeContainerStyle: { borderRadius: 20, overflow: 'hidden' },
    
    // Card
    card: { 
        flexDirection: 'row', 
        backgroundColor: 'white', 
        padding: 18, 
        borderRadius: 20,
        alignItems: 'flex-start', 
        gap: 15, 
        shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.03, shadowRadius: 8, elevation: 3,
        borderWidth: 1, borderColor: 'transparent'
    },
    
    unreadCard: { 
        backgroundColor: '#F5FAFF', // Fundo azul subtil
        borderColor: '#007AFF', // BORDA AZUL
        borderWidth: 1.5,
    },
    
    iconBox: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' },
    cardTitle: { fontSize: 16, color: '#1a1a1a', flex: 1, marginBottom: 2 },
    unreadTitle: { fontWeight: '800', color: '#000' },
    cardBody: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 6 },
    date: { fontSize: 12, color: '#999', fontWeight: '500' },
    fullDate: { fontSize: 11, color: '#bbb', marginTop: 2 },
    
    emptyIconBg: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    emptyText: { color: '#999', fontSize: 16, fontWeight: '500' },

    // Swipe Actions
    leftActionContainer: { flex: 1, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 25, borderRadius: 20 },
    rightActionContainer: { flex: 1, backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 25, borderRadius: 20 },
    actionIcon: { alignItems: 'center', justifyContent: 'center' },
    actionText: { color: 'white', fontSize: 11, fontWeight: 'bold', marginTop: 4 }
});