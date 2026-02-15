import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../../supabase';

// --- CONFIGURAÇÃO DE DIMENSÕES ---
const { width } = Dimensions.get('window');
const PADDING_HORIZONTAL = 24;
const GAP = 16;
// Ajuste para garantir que cabem 2 colunas perfeitamente
const CARD_WIDTH = (width - (PADDING_HORIZONTAL * 2) - GAP) / 2;

const THEME_COLOR = '#1A1A1A';
const BG_COLOR = '#F4F6F8';

type UserRole = 'owner' | 'staff' | null;

export default function ManagerDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Dados
    const [salonName, setSalonName] = useState('');
    const [salonId, setSalonId] = useState<number | null>(null);
    const [userRole, setUserRole] = useState<UserRole>(null);
    const [userName, setUserName] = useState('');
    const [userAvatar, setUserAvatar] = useState<string | null>(null);

    // Stats
    const [dailyStats, setDailyStats] = useState({ count: 0, revenue: 0 });
    const [pendingCount, setPendingCount] = useState(0);
    const [notificationCount, setNotificationCount] = useState(0);

    const todayStr = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

    useFocusEffect(
        useCallback(() => {
            checkManager();
        }, [])
    );

    useEffect(() => {
        if (salonId) {
            fetchDailyStats();
            fetchPendingCount();
            fetchNotificationCount();
        }
    }, [salonId]);

    // --- FUNÇÕES DE DADOS ---
    async function checkManager() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return router.replace('/login');

        const { data: profile } = await supabase.from('profiles').select('nome').eq('id', user.id).single();
        setUserName(profile?.nome || user.user_metadata?.full_name || 'Gestor');
        if (user.user_metadata?.avatar_url) setUserAvatar(user.user_metadata.avatar_url);

        const { data: salonOwner } = await supabase.from('salons').select('*').eq('dono_id', user.id).single();
        if (salonOwner) {
            configureUser(salonOwner, 'owner');
            return;
        }

        const { data: staffRecord } = await supabase
            .from('salon_staff')
            .select('salon_id, id, status, role')
            .or(`user_id.eq.${user.id},email.eq.${user.email}`)
            .single();

        if (staffRecord && staffRecord.status === 'ativo') {
            const { data: salonDetails } = await supabase.from('salons').select('*').eq('id', staffRecord.salon_id).single();
            if (salonDetails) {
                const role = staffRecord.role === 'gerente' ? 'owner' : 'staff';
                configureUser(salonDetails, role);
                return;
            }
        }
        Alert.alert("Acesso Negado", "Não tens permissão de gestor.");
        router.replace('/');
    }

    function configureUser(salonData: any, role: UserRole) {
        setSalonId(salonData.id);
        setSalonName(salonData.nome_salao);
        setUserRole(role);
        setLoading(false);
    }

    async function fetchDailyStats() {
        if (!salonId) return;
        const now = new Date();
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        const end = new Date(now); end.setHours(23, 59, 59, 999);

        const { data } = await supabase
            .from('appointments')
            .select(`status, services (preco)`)
            .eq('salon_id', salonId)
            .gte('data_hora', start.toISOString())
            .lte('data_hora', end.toISOString())
            .neq('status', 'cancelado');

        if (data) {
            const count = data.length;
            const revenue = data.reduce((total: number, item: any) => {
                if (item.status === 'faltou') return total;
                const preco = Array.isArray(item.services) ? item.services[0]?.preco : item.services?.preco;
                return total + (preco || 0);
            }, 0);
            setDailyStats({ count, revenue });
        }
    }

    async function fetchPendingCount() {
        if (!salonId) return;
        const { count } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('salon_id', salonId)
            .eq('status', 'pendente');
        if (count !== null) setPendingCount(count);
    }

    async function fetchNotificationCount() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('read', false);
        if (count !== null) setNotificationCount(count);
    }

    // --- COMPONENTE DO CARD ---
    const GridCard = ({ title, subtitle, icon, route, badge, disabled, iconColor, iconBg }: any) => {
        if (disabled) return null;
        return (
            <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push(route)}
                activeOpacity={0.7}
            >
                <View style={styles.cardHeader}>
                    <View style={[styles.iconCircle, { backgroundColor: iconBg || '#F5F5F5' }]}>
                        <Ionicons name={icon} size={24} color={iconColor || THEME_COLOR} />
                    </View>

                    {!badge && <View style={styles.cardArrow}>
                        <Ionicons name="chevron-forward" size={16} color="#DDD" />
                    </View>}
                </View>

                <View style={styles.cardContent}>
                    <Text style={styles.gridTitle}>{title}</Text>
                    {subtitle && <Text style={styles.gridSubtitle} numberOfLines={1}>{subtitle}</Text>}
                </View>

                {badge > 0 && (
                    <View style={styles.floatingBadge}>
                        <Text style={styles.badgeText}>{badge}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={THEME_COLOR} /></View>;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: BG_COLOR }}>
            <StatusBar style="dark" backgroundColor={BG_COLOR} />

            <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
            >
                {/* 1. CABEÇALHO */}
                <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.dateText}>{todayStr}</Text>
                        <Text style={styles.greetingText}>Olá, {userName.split(' ')[0]}</Text>
                        <Text style={styles.salonNameText}>{salonName}</Text>
                    </View>

                    <View style={styles.headerRight}>
                        <TouchableOpacity
                            onPress={() => router.push('/notifications')}
                            style={styles.notificationBtn}
                        >
                            <Ionicons name="notifications-outline" size={24} color="#333" />
                            {notificationCount > 0 && <View style={styles.dot} />}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')}>
                            {userAvatar ?
                                <Image source={{ uri: userAvatar }} style={styles.avatar} /> :
                                <View style={styles.placeholderAvatar}>
                                    <Ionicons name="person" size={20} color="#666" />
                                </View>
                            }
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 2. CARTÃO DE FATURAÇÃO (PREMIUM) */}
                {userRole === 'owner' && (
                    <View style={styles.statsCardWrapper}>
                        <View style={styles.statsCard}>
                            <View style={styles.statsTopRow}>
                                <View>
                                    <Text style={styles.statsLabel}>FATURAÇÃO HOJE</Text>
                                    <Text style={styles.statsValue}>
                                        {dailyStats.revenue.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}€
                                    </Text>
                                </View>
                                <View style={styles.statsIconContainer}>
                                    <Ionicons name="trending-up" size={20} color="#4CAF50" />
                                </View>
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.statsBottomRow}>
                                <View style={styles.miniStatItem}>
                                    <Ionicons name="people-outline" size={16} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.miniStatText}>
                                        <Text style={{ fontWeight: 'bold', color: 'white' }}>{dailyStats.count}</Text> Atendimentos
                                    </Text>
                                </View>
                                <View style={styles.miniStatItem}>
                                    <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.miniStatText}>Previsão</Text>
                                </View>
                            </View>

                            <Ionicons name="stats-chart" size={140} color="white" style={styles.statsBgIcon} />
                        </View>
                    </View>
                )}

                {/* 3. AGENDA (Destaque Principal) */}
                <View style={styles.sectionContainer}>
                    <TouchableOpacity
                        style={styles.agendaCard}
                        onPress={() => router.push('/manager/agenda')}
                        activeOpacity={0.8}
                    >
                        <View style={styles.agendaLeft}>
                            <View style={[styles.iconCircle, { backgroundColor: '#E3F2FD' }]}>
                                <Ionicons name="calendar" size={24} color="#007AFF" />
                            </View>
                            <View>
                                <Text style={styles.cardTitleLarge}>Agenda</Text>
                                <Text style={styles.cardSubtitleLarge}>Gerir marcações</Text>
                            </View>
                        </View>

                        {pendingCount > 0 ? (
                            <View style={styles.urgentBadgeLarge}>
                                <Text style={styles.urgentTextLarge}>{pendingCount}</Text>
                                <Text style={styles.urgentLabel}>Pendentes</Text>
                            </View>
                        ) : (
                            <View style={styles.cardArrow}>
                                <Ionicons name="chevron-forward" size={20} color="#CCC" />
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* 4. GRELHA DE OPÇÕES */}
                <View style={styles.gridContainer}>
                    <GridCard
                        title="Serviços"
                        subtitle="Preçário"
                        icon="pricetag"
                        route="/manager/servicos"
                        disabled={userRole !== 'owner'}
                        iconColor="#9C27B0"
                        iconBg="#F3E5F5"
                    />

                    <GridCard
                        title="Equipa"
                        subtitle="Staff"
                        icon="people"
                        route="/manager/equipa"
                        disabled={userRole !== 'owner'}
                        iconColor="#FF9800"
                        iconBg="#FFF3E0"
                    />

                    <GridCard
                        title="Galeria"
                        subtitle="Fotos"
                        icon="images"
                        route="/manager/galeria"
                        disabled={userRole !== 'owner'}
                        iconColor="#E91E63"
                        iconBg="#FCE4EC"
                    />

                    <GridCard
                        title="Definições"
                        subtitle="Configurar"
                        icon="settings"
                        route="/manager/definicoes"
                        disabled={userRole !== 'owner'}
                        iconColor="#607D8B"
                        iconBg="#ECEFF1"
                    />
                </View>

                {/* --- ESPAÇADOR FINAL (Para evitar a TabBar) --- */}
                {/* Esta View garante espaço extra no final do scroll */}
                <View style={{ height: 130 }} />

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Header Styles
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: PADDING_HORIZONTAL,
        paddingTop: 20,
        marginBottom: 24
    },
    dateText: {
        fontSize: 12,
        color: '#888',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    greetingText: {
        fontSize: 26,
        fontWeight: '800',
        color: '#1A1A1A',
        marginTop: 4,
        letterSpacing: -0.5
    },
    salonNameText: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
        fontWeight: '500'
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
    },
    notificationBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#EFEFEF'
    },
    dot: {
        position: 'absolute',
        top: 10,
        right: 12,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF3B30',
        borderWidth: 1,
        borderColor: 'white'
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: 'white',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 5
    },
    placeholderAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#E1E1E1',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'white'
    },

    // Stats Card (Hero)
    statsCardWrapper: {
        paddingHorizontal: PADDING_HORIZONTAL,
        marginBottom: 24,
    },
    statsCard: {
        backgroundColor: '#212121',
        borderRadius: 28,
        padding: 24,
        height: 170,
        justifyContent: 'space-between',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 12
    },
    statsTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
    },
    statsLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        textTransform: 'uppercase'
    },
    statsValue: {
        color: 'white',
        fontSize: 36,
        fontWeight: '800',
        marginTop: 8,
        letterSpacing: -1
    },
    statsIconContainer: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 8,
        borderRadius: 14
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 10
    },
    statsBottomRow: {
        flexDirection: 'row',
        gap: 20
    },
    miniStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    miniStatText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '500'
    },
    statsBgIcon: {
        position: 'absolute',
        right: -30,
        bottom: -30,
        opacity: 0.05
    },

    // Agenda Section
    sectionContainer: {
        paddingHorizontal: PADDING_HORIZONTAL,
        marginBottom: GAP,
    },
    agendaCard: {
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 4
    },
    agendaLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16
    },
    cardTitleLarge: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1A1A1A'
    },
    cardSubtitleLarge: {
        fontSize: 13,
        color: '#888',
        fontWeight: '500'
    },
    urgentBadgeLarge: {
        backgroundColor: '#FF3B30',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        alignItems: 'center',
        flexDirection: 'row',
        gap: 6
    },
    urgentTextLarge: {
        color: 'white',
        fontSize: 14,
        fontWeight: '800'
    },
    urgentLabel: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 11,
        fontWeight: '600'
    },

    // Grid System
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: PADDING_HORIZONTAL,
        gap: GAP,
    },
    gridCard: {
        width: CARD_WIDTH,
        height: 160,
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 18,
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
    },
    iconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardArrow: {
        marginTop: 5
    },
    cardContent: {
        gap: 2
    },
    gridTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#222'
    },
    gridSubtitle: {
        fontSize: 12,
        color: '#999',
        fontWeight: '500'
    },
    floatingBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: '#FF3B30',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold'
    }
});