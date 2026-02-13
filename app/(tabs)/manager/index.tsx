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
const GAP = 15;
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

    // --- COMPONENTE DO CARD ---
    // Agora aceita 'iconColor' e 'iconBg' para personalização
    const GridCard = ({ title, subtitle, icon, route, badge, disabled, iconColor, iconBg }: any) => {
        if (disabled) return null;
        return (
            <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push(route)}
                activeOpacity={0.8}
            >
                <View style={styles.cardHeader}>
                    {/* Ícone com Cores Personalizadas */}
                    <View style={[styles.iconCircle, { backgroundColor: iconBg || '#F5F5F5' }]}>
                        <Ionicons name={icon} size={22} color={iconColor || THEME_COLOR} />
                    </View>

                    {/* Badge ou Seta */}
                    {badge > 0 ? (
                        <View style={styles.badgeContainer}>
                            <Text style={styles.badgeText}>{badge}</Text>
                        </View>
                    ) : (
                        // Seta discreta
                        <Ionicons name="arrow-forward" size={16} color="#E0E0E0" />
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

            <View style={{ flex: 1, paddingTop: 10 }}>
                {/* 1. CABEÇALHO */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.dateText}>{todayStr.toUpperCase()}</Text>
                        <Text style={styles.greetingText}>Olá, {userName.split(' ')[0]}!</Text>
                    </View>

                    <View style={styles.headerRight}>
                        <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.iconBtn}>
                            <Ionicons name="notifications-outline" size={24} color="#333" />
                            {notificationCount > 0 && <View style={styles.dot} />}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')}>
                            {userAvatar ?
                                <Image source={{ uri: userAvatar }} style={styles.avatar} /> :
                                <View style={[styles.avatar, { backgroundColor: '#EEE', justifyContent: 'center', alignItems: 'center' }]}>
                                    <Ionicons name="person" size={20} color="#999" />
                                </View>
                            }
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 2. CARTÃO DE FATURAÇÃO (PRETO - Destaque Principal) */}
                {userRole === 'owner' && (
                    <View style={styles.statsCard}>
                        <View>
                            <Text style={styles.statsLabel}>FATURAÇÃO HOJE (PREVISÃO)</Text>
                            <Text style={styles.statsValue}>
                                {dailyStats.revenue.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}€
                            </Text>
                        </View>
                        <View style={styles.statsRow}>
                            <View style={styles.miniStat}>
                                <Ionicons name="people" size={16} color="rgba(255,255,255,0.7)" />
                                <Text style={styles.miniStatText}>{dailyStats.count} Clientes</Text>
                            </View>
                        </View>
                        <Ionicons name="stats-chart" size={120} color="rgba(255,255,255,0.05)" style={styles.statsBgIcon} />
                    </View>
                )}

                {/* 3. GRELHA */}
                <View style={[
                    styles.gridContainer,
                    userRole !== 'owner' ? { marginTop: 10 } : { marginTop: 0 }
                ]}>

                    {/* AGENDA - Azul (Confiança/Calendário) */}
                    <TouchableOpacity
                        style={[styles.gridCard, styles.agendaCard]}
                        onPress={() => router.push('/manager/agenda')}
                        activeOpacity={0.8}
                    >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={[styles.iconCircle, { backgroundColor: '#E3F2FD' }]}>
                                <Ionicons name="calendar" size={22} color="#007AFF" />
                            </View>
                            {pendingCount > 0 ? (
                                <View style={styles.urgentBadge}>
                                    <Text style={styles.urgentText}>{pendingCount} Pendentes</Text>
                                </View>
                            ) : (
                                <Ionicons name="arrow-forward" size={18} color="#E0E0E0" />
                            )}
                        </View>
                        <View>
                            <Text style={styles.gridTitle}>Agenda</Text>
                            <Text style={styles.gridSubtitle}>Ver marcações e pedidos</Text>
                        </View>
                    </TouchableOpacity>

                    {/* SERVIÇOS - Roxo (Premium) */}
                    <GridCard
                        title="Serviços"
                        subtitle="Preçário"
                        icon="cut"
                        route="/manager/servicos"
                        disabled={userRole !== 'owner'}
                        iconColor="#9C27B0"
                        iconBg="#F3E5F5"
                    />

                    {/* EQUIPA - Laranja (Energia) */}
                    <GridCard
                        title="Equipa"
                        subtitle="Funcionários"
                        icon="people"
                        route="/manager/equipa"
                        disabled={userRole !== 'owner'}
                        iconColor="#FF9800"
                        iconBg="#FFF3E0"
                    />

                    {/* GALERIA - Rosa (Criatividade) */}
                    <GridCard
                        title="Galeria"
                        subtitle="Portfólio"
                        icon="images"
                        route="/manager/galeria"
                        disabled={userRole !== 'owner'}
                        iconColor="#E91E63"
                        iconBg="#FCE4EC"
                    />

                    {/* DEFINIÇÕES - Cinza (Técnico/Neutro) */}
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

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: PADDING_HORIZONTAL,
        marginBottom: 20
    },
    dateText: { fontSize: 13, color: '#999', fontWeight: '600', textTransform: 'uppercase' },
    greetingText: { fontSize: 24, fontWeight: '800', color: '#1A1A1A', marginTop: 2 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 15 },
    iconBtn: { padding: 5 },
    dot: { position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30', borderWidth: 1.5, borderColor: '#FAFAFA' },
    avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'white' },

    // Stats Card (Dark Theme - Premium)
    statsCard: {
        backgroundColor: '#1A1A1A',
        borderRadius: 26,
        padding: 24,
        marginHorizontal: PADDING_HORIZONTAL,
        marginBottom: 25,
        height: 160,
        justifyContent: 'space-between',
        overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 15, elevation: 10
    },
    statsLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
    statsValue: { color: 'white', fontSize: 32, fontWeight: '800', marginTop: 5 },
    statsRow: { flexDirection: 'row', gap: 12 },
    miniStat: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
    miniStatText: { color: 'white', fontSize: 12, fontWeight: '600' },
    statsBgIcon: { position: 'absolute', right: -20, bottom: -20, opacity: 0.1 },

    // Grid Layout
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: PADDING_HORIZONTAL,
        justifyContent: 'space-between',
        gap: GAP,
    },

    // Agenda (Wide)
    agendaCard: {
        width: '100%',
        marginBottom: 0,
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: 120
    },

    // Standard Cards
    gridCard: {
        width: CARD_WIDTH,
        height: 150,
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 18,
        marginBottom: 0,
        justifyContent: 'space-between',

        // Sombra Suave
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },

    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
    },

    cardContent: {
        gap: 4
    },

    // Círculo do Ícone (Destaque de Cor)
    iconCircle: {
        width: 46,
        height: 46,
        borderRadius: 23,
        justifyContent: 'center',
        alignItems: 'center',
        // A cor de fundo vem via style inline do componente
    },

    gridTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
    gridSubtitle: { fontSize: 12, color: '#888', fontWeight: '500' },

    // Badge de Urgência
    badgeContainer: { backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    urgentBadge: { backgroundColor: '#FF3B30', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    urgentText: { color: 'white', fontSize: 11, fontWeight: 'bold' }
});