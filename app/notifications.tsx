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
        Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => {
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
                    
                    {/* Indicador de não lido (ponto azul) */}
                    {!item.read && <View style={styles.unreadDot} />}
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
                
                {/* Header Consistente com Favoritos/Perfil */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Notificações</Text>
                    
                    <View style={styles.headerActions}>
                        {notifications.length > 0 && (
                             <>
                                <TouchableOpacity onPress={markAllRead} style={styles.iconBtn}>
                                    <Ionicons name="checkmark-done" size={20} color="#007AFF" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={deleteAll} style={styles.iconBtn}>
                                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                </TouchableOpacity>
                             </>
                        )}
                    </View>
                </View>

                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id.toString()}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotifications} />}
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="notifications-off-outline" size={50} color="#ccc" />
                            <Text style={{color:'#999', marginTop:10}}>Sem notificações novas.</Text>
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
    
    // Header Style (Consistente com outras páginas)
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 20,
        // Sem background explícito ou bordas para manter a limpeza
    },
    backBtn: { marginRight: 15 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1 },
    headerActions: { flexDirection: 'row', gap: 15 },
    iconBtn: { padding: 4 },

    // Swipe Container
    swipeContainerStyle: { borderRadius: 16, overflow: 'hidden' },
    
    // Card Style (Consistente com Home Cards mas adaptado para linha)
    card: { 
        flexDirection: 'row', 
        backgroundColor: 'white', 
        padding: 15, 
        borderRadius: 16,
        alignItems: 'flex-start', 
        gap: 15, 
        shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
        borderWidth: 1, borderColor: 'transparent'
    },
    
    unreadCard: { 
        backgroundColor: 'white', // Mantém fundo branco para limpeza
        borderLeftWidth: 4, // Indicador lateral subtil
        borderLeftColor: '#007AFF', // Azul da marca
    },
    
    iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' },
    cardTitle: { fontSize: 16, color: '#1a1a1a', flex: 1, marginBottom: 2 },
    unreadTitle: { fontWeight: '700', color: '#000' },
    cardBody: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 6 },
    date: { fontSize: 12, color: '#999', fontWeight: '500' },
    fullDate: { fontSize: 11, color: '#bbb', marginTop: 2 },
    
    unreadDot: {
        width: 8, height: 8, borderRadius: 4, backgroundColor: '#007AFF',
        alignSelf: 'center', marginLeft: 5
    },

    // Swipe Actions Colors
    leftActionContainer: { flex: 1, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 25 },
    rightActionContainer: { flex: 1, backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 25 },
    actionIcon: { alignItems: 'center', justifyContent: 'center' },
    actionText: { color: 'white', fontSize: 11, fontWeight: 'bold', marginTop: 4 }
});