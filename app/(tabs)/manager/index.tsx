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
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../../supabase';

// --- CONFIGURAÇÃO DE DIMENSÕES ---
const { width } = Dimensions.get('window');
const PADDING_HORIZONTAL = 20;
const GAP = 12;
const CARD_WIDTH = (width - (PADDING_HORIZONTAL * 2) - GAP) / 2;

const THEME_COLOR = '#1A1A1A';

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

    const todayStr = new Date().toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });

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

    const averageTicket = dailyStats.count > 0 
        ? (dailyStats.revenue / dailyStats.count).toFixed(2) 
        : "0.00";

    const GridCard = ({ title, subtitle, icon, route, badge, disabled, iconColor, iconBg }: any) => {
        if (disabled) return null;
        return (
            <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push(route)}
                activeOpacity={0.8}
            >
                <View style={styles.cardHeader}>
                    <View style={[styles.iconCircle, { backgroundColor: iconBg || '#F5F5F5' }]}>
                        <Ionicons name={icon} size={20} color={iconColor || THEME_COLOR} />
                    </View>
                    {badge > 0 ? (
                        <View style={styles.badgeContainer}>
                            <Text style={styles.badgeText}>{badge}</Text>
                        </View>
                    ) : (
                        <Ionicons name="chevron-forward" size={16} color="#E0E0E0" />
                    )}
                </View>

                <View style={styles.cardContent}>
                    <Text style={styles.gridTitle}>{title}</Text>
                    {subtitle && <Text style={styles.gridSubtitle} numberOfLines={1}>{subtitle}</Text>}
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={THEME_COLOR} /></View>;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
            <StatusBar style="dark" />

            {/* CONTAINER SEM SCROLL */}
            <View style={styles.container}>
                
                {/* 1. CABEÇALHO */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.dateText}>{todayStr.toUpperCase()}</Text>
                        <Text style={styles.greetingText}>Olá, {userName.split(' ')[0]}!</Text>
                    </View>

                    <View style={styles.headerRight}>
                        <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.iconBtn}>
                            <Ionicons name="notifications-outline" size={22} color="#333" />
                            {notificationCount > 0 && <View style={styles.dot} />}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')}>
                            {userAvatar ?
                                <Image source={{ uri: userAvatar }} style={styles.avatar} /> :
                                <View style={[styles.avatar, { backgroundColor: '#EEE', justifyContent: 'center', alignItems: 'center' }]}>
                                    <Ionicons name="person" size={18} color="#999" />
                                </View>
                            }
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 2. CARTÃO DE FATURAÇÃO PREMIUM (AJUSTADO) */}
                {userRole === 'owner' && (
                    <View style={styles.heroCard}>
                        {/* Efeito de Fundo */}
                        <View style={styles.heroGlow} />
                        
                        {/* Cabeçalho do Card */}
                        <View style={styles.heroHeader}>
                            <View style={styles.liveBadge}>
                                <View style={styles.liveDot} />
                                <Text style={styles.liveText}>TEMPO REAL</Text>
                            </View>
                            <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.4)" />
                        </View>

                        {/* Valor Principal - DESIGN MELHORADO */}
                        <View style={styles.heroMain}>
                            <Text style={styles.currencySymbol}>€</Text>
                            <Text style={styles.heroValue}>
                                {dailyStats.revenue.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                            </Text>
                        </View>

                        {/* Footer do Card */}
                        <View style={styles.heroFooter}>
                            {/* Clientes */}
                            <View style={styles.heroMetricItem}>
                                <View style={[styles.metricIcon, { backgroundColor: 'rgba(76, 217, 100, 0.2)' }]}>
                                    <Ionicons name="people" size={12} color="#4CD964" />
                                </View>
                                <View>
                                    <Text style={styles.metricLabel}>Clientes</Text>
                                    <Text style={styles.metricValue}>{dailyStats.count}</Text>
                                </View>
                            </View>

                            <View style={styles.verticalDivider} />

                            {/* Ticket Médio */}
                            <View style={styles.heroMetricItem}>
                                <View style={[styles.metricIcon, { backgroundColor: 'rgba(255, 149, 0, 0.2)' }]}>
                                    <Ionicons name="receipt" size={12} color="#FF9500" />
                                </View>
                                <View>
                                    <Text style={styles.metricLabel}>Ticket Médio</Text>
                                    <Text style={styles.metricValue}>{averageTicket}€</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* 3. AGENDA (Barra Horizontal) */}
                <TouchableOpacity
                    style={styles.agendaCard}
                    onPress={() => router.push('/manager/agenda')}
                    activeOpacity={0.8}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={[styles.iconCircle, { backgroundColor: '#E3F2FD' }]}>
                            <Ionicons name="calendar" size={20} color="#007AFF" />
                        </View>
                        <View>
                            <Text style={styles.gridTitle}>Agenda</Text>
                            <Text style={styles.gridSubtitle}>Ver marcações</Text>
                        </View>
                    </View>
                    
                    {pendingCount > 0 ? (
                        <View style={styles.urgentBadge}>
                            <Text style={styles.urgentText}>{pendingCount}</Text>
                        </View>
                    ) : (
                        <Ionicons name="chevron-forward" size={18} color="#CCC" />
                    )}
                </TouchableOpacity>

                {/* 4. GRELHA DE OPÇÕES */}
                <View style={styles.gridContainer}>
                    <GridCard
                        title="Serviços"
                        subtitle="Preçário"
                        icon="cut"
                        route="/manager/servicos"
                        disabled={userRole !== 'owner'}
                        iconColor="#9C27B0"
                        iconBg="#F3E5F5"
                    />

                    <GridCard
                        title="Equipa"
                        subtitle="Funcionários"
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
                        subtitle="Setup"
                        icon="settings"
                        route="/manager/definicoes"
                        disabled={userRole !== 'owner'}
                        iconColor="#607D8B"
                        iconBg="#ECEFF1"
                    />
                </View>

            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: {
        flex: 1,
        paddingTop: 10,
        paddingBottom: 90, 
        justifyContent: 'flex-start'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: PADDING_HORIZONTAL,
        marginBottom: 15,
    },
    dateText: { fontSize: 11, color: '#999', fontWeight: '600', textTransform: 'uppercase' },
    greetingText: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBtn: { padding: 4 },
    dot: { position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30', borderWidth: 1.5, borderColor: '#FAFAFA' },
    avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#EEE' },

    // --- HERO CARD ---
    heroCard: {
        backgroundColor: '#151515', 
        borderRadius: 24,
        marginHorizontal: PADDING_HORIZONTAL,
        marginBottom: 15,
        padding: 20,
        height: 160,
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10
    },
    heroGlow: {
        position: 'absolute',
        top: -60,
        right: -60,
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    heroHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    liveBadge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(76, 217, 100, 0.1)',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
        borderWidth: 1, borderColor: 'rgba(76, 217, 100, 0.2)'
    },
    liveDot: {
        width: 6, height: 6, borderRadius: 3, backgroundColor: '#4CD964', marginRight: 6
    },
    liveText: {
        color: '#4CD964', fontSize: 10, fontWeight: '700', letterSpacing: 0.5
    },
    
    // ESTILOS DO PREÇO (CORRIGIDOS)
    heroMain: {
        flexDirection: 'row', 
        alignItems: 'baseline', // ALINHA O € PELA BASE DO NÚMERO
        marginTop: 4,
        marginBottom: 8, // Espaço extra em baixo
    },
    currencySymbol: {
        fontSize: 20, 
        color: 'rgba(255,255,255,0.6)', 
        marginRight: 4, 
        fontWeight: '600',
        // marginTop removido, pois o alignItems: 'baseline' trata disto
    },
    heroValue: {
        fontSize: 32, // Reduzido de 38 para 32 para melhor enquadramento
        fontWeight: '800', 
        color: 'white', 
        letterSpacing: -0.5
    },

    heroFooter: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 10
    },
    verticalDivider: {
        width: 1, height: '80%', backgroundColor: 'rgba(255,255,255,0.1)'
    },
    heroMetricItem: {
        flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center'
    },
    metricIcon: {
        width: 28, height: 28, borderRadius: 10, justifyContent: 'center', alignItems: 'center'
    },
    metricLabel: {
        color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '600'
    },
    metricValue: {
        color: 'white', fontSize: 13, fontWeight: '700'
    },

    // --- Outros Componentes ---
    agendaCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'white',
        marginHorizontal: PADDING_HORIZONTAL,
        padding: 16,
        borderRadius: 20,
        marginBottom: 15,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
        height: 70
    },
    gridContainer: {
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: PADDING_HORIZONTAL,
        justifyContent: 'space-between',
        alignContent: 'flex-start',
        gap: GAP,
    },
    gridCard: {
        width: CARD_WIDTH,
        height: 125,
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 16,
        justifyContent: 'space-between',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardContent: { gap: 2 },
    iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    gridTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
    gridSubtitle: { fontSize: 11, color: '#888', fontWeight: '500' },
    badgeContainer: { backgroundColor: '#FF3B30', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    urgentBadge: { backgroundColor: '#FF3B30', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    urgentText: { color: 'white', fontSize: 12, fontWeight: 'bold' }
});