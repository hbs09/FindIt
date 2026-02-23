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
    const [myEmployeeId, setMyEmployeeId] = useState<number | null>(null); // <--- ADICIONA ESTA LINHA

    // Stats
    const [dailyStats, setDailyStats] = useState({ count: 0, revenue: 0 });
    const [pendingCount, setPendingCount] = useState(0);

    const todayStr = new Date().toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
    useFocusEffect(
        useCallback(() => {
            checkManager();
        }, [])
    );

    // Quando o salonId e a Role estiverem definidos, vai buscar os dados!
    useEffect(() => {
        if (salonId && userRole) {
            fetchDailyStats();
            fetchPendingCount();
        }
    }, [salonId, userRole, myEmployeeId]);

    // --- FUNÇÕES DE DADOS ---
    async function checkManager() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return router.replace('/login');

        const { data: profile } = await supabase.from('profiles').select('nome').eq('id', user.id).single();
        setUserName(profile?.nome || user.user_metadata?.full_name || 'Gestor');
        if (user.user_metadata?.avatar_url) setUserAvatar(user.user_metadata.avatar_url);

        // 1. Verificar se é Dono
        const { data: salonOwner } = await supabase.from('salons').select('*').eq('dono_id', user.id).single();
        if (salonOwner) {
            setSalonId(salonOwner.id);
            setSalonName(salonOwner.nome_salao);
            setUserRole('owner');
            setLoading(false);
            return;
        }

        // 2. Verificar se é Staff/Gerente na nova tabela
        const { data: staffRecord } = await supabase
            .from('salon_staff')
            .select('id, salon_id, role, status')
            .eq('user_id', user.id)
            .eq('status', 'ativo')
            .single();

        if (staffRecord) {
            const { data: salonDetails } = await supabase.from('salons').select('nome_salao').eq('id', staffRecord.salon_id).single();
            if (salonDetails) {
                setSalonId(staffRecord.salon_id);
                setSalonName(salonDetails.nome_salao);
                setUserRole(staffRecord.role === 'gerente' ? 'owner' : 'staff');
                setMyEmployeeId(staffRecord.id); // Guardamos o ID dele!
                setLoading(false);
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

        let query = supabase
            .from('appointments')
            .select(`status, services (preco)`)
            .eq('salon_id', salonId)
            .gte('data_hora', start.toISOString())
            .lte('data_hora', end.toISOString())
            .neq('status', 'cancelado');

        // LÓGICA DE SEPARAÇÃO AQUI
        if (userRole === 'staff' && myEmployeeId) {
            query = query.eq('employee_id', myEmployeeId);
        }

        const { data } = await query;

        if (data) {
            const validAppointments = data.filter((item: any) =>
                ['confirmado', 'concluido'].includes(item.status)
            );
            const count = validAppointments.length;
            const revenue = validAppointments.reduce((total: number, item: any) => {
                const preco = Array.isArray(item.services) ? item.services[0]?.preco : item.services?.preco;
                return total + (preco || 0);
            }, 0);
            setDailyStats({ count, revenue });
        }
    }

    async function fetchPendingCount() {
        if (!salonId) return;

        let query = supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('salon_id', salonId)
            .eq('status', 'pendente');

        // LÓGICA DE SEPARAÇÃO AQUI TAMBÉM
        if (userRole === 'staff' && myEmployeeId) {
            query = query.eq('employee_id', myEmployeeId);
        }

        const { count } = await query;
        if (count !== null) setPendingCount(count);
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
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F6F8' }}>
            <StatusBar style="dark" backgroundColor="#F4F6F8" />

            {/* CONTAINER SEM SCROLL */}
            <View style={styles.container}>

                {/* --- 1. CABEÇALHO --- */}
                <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.dateText}>{todayStr}</Text>
                        <Text style={styles.greetingText}>{salonName}</Text>
                    </View>

                    <View style={styles.headerRight}>
                        {/* Alterado de TouchableOpacity para View para remover o clique */}
                        <View>
                            {userAvatar ? (
                                <Image source={{ uri: userAvatar }} style={styles.avatar} />
                            ) : (
                                <View style={styles.placeholderAvatar}>
                                    <Ionicons name="person" size={20} color="#666" />
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* --- 2. CARTÃO DE FATURAÇÃO (PREMIUM) --- */}
                <View style={styles.statsCardWrapper}>
                    <View style={styles.statsCard}>
                        <View style={styles.statsTopRow}>
                            <View>
                                <Text style={styles.statsLabel}>
                                    {userRole === 'owner' ? 'FATURAÇÃO DO SALÃO (HOJE)' : 'A MINHA FATURAÇÃO (HOJE)'}
                                </Text>
                                <Text style={styles.statsValue}>
                                    {dailyStats.revenue.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}€
                                </Text>
                            </View>
                            <View style={styles.statsIconContainer}>
                                {/* Substituímos o Ionicons pela Image do logo */}
                                <Image
                                    source={require('../../../assets/images/white_logo.png')}
                                    style={styles.statsLogo}
                                    resizeMode="contain"
                                />
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

                        {/* Ícone de fundo decorativo */}
                        <Ionicons name="stats-chart" size={140} color="white" style={styles.statsBgIcon} />
                    </View>
                </View>

            </View>

            <View style={styles.gridContainer}>

                {/* 1. AGENDA */}
                <GridCard
                    title="Agenda"
                    subtitle="Marcações"
                    icon="calendar"
                    route="/manager/agenda"
                    badge={pendingCount} // Mostra o número de pendentes aqui
                    iconColor="#007AFF"
                    iconBg="#E3F2FD"
                />

                {/* 2. SERVIÇOS */}
                <GridCard
                    title="Serviços"
                    subtitle="Preçário"
                    icon="cut"
                    route="/manager/servicos"
                    disabled={userRole !== 'owner'}
                    iconColor="#9C27B0"
                    iconBg="#F3E5F5"
                />

                {/* 3. EQUIPA */}
                <GridCard
                    title="Equipa"
                    subtitle="Funcionários"
                    icon="people"
                    route="/manager/equipa"
                    disabled={userRole !== 'owner'}
                    iconColor="#FF9800"
                    iconBg="#FFF3E0"
                />

                {/* 4. GALERIA */}
                <GridCard
                    title="Galeria"
                    subtitle="Fotos"
                    icon="images"
                    route="/manager/galeria"
                    disabled={userRole !== 'owner'}
                    iconColor="#E91E63"
                    iconBg="#FCE4EC"
                />

                {/* 5. SUPORTE */}
                <GridCard
                    title="Suporte"
                    subtitle="Assistência"
                    icon="help-buoy"
                    route="/support-ticket"
                    disabled={userRole !== 'owner'}
                    iconColor="#1565C0"
                    iconBg="#E3F2FD"
                />

                {/* 6. DEFINIÇÕES */}
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

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: {
        backgroundColor: '#F4F6F8', // BG_COLOR original
    },
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
    iconBtn: { padding: 4 },

    // --- Stats Card Styles ---
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
        // Apagas o backgroundColor, padding e borderRadius
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Adiciona isto:
    statsLogo: {
        width: 55, // Podes pôr um bocadinho maior já que não tem o padding
        height: 20,
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
});