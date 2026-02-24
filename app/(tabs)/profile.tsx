import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    RefreshControl,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext'; // <-- O teu hook de tema!
import { supabase } from '../../supabase';
import { sendNotification } from '../../utils/notifications';

// --- DESIGN SYSTEM ---
const { width } = Dimensions.get('window');
const SPACING = 20;
const CARD_RADIUS = 20;
const COLUMNS = 2;
const GRID_ITEM_WIDTH = (width - (SPACING * 3)) / COLUMNS;

// --- TIPOS ---
type Appointment = {
    id: string; // Agora é uma string porque vai ser um ID de grupo (ex: "salonId_data")
    data_hora: string;
    status: string;
    services: { nome: string; preco: number; service_id: number }[]; // Array de serviços!
    apptIds: number[]; // Guarda os IDs originais para podermos cancelar todos juntos
    totalPrice: number; // O preço somado de todos
    salons: { dono_id: string; nome_salao: string; morada: string; cidade: string; intervalo_minutos: number; imagem: string };
    salon_id: number;
    calendarAdded?: boolean;
};

type Favorite = {
    fav_id: number;
    id: number;
    nome_salao: string;
    cidade: string;
    imagem: string;
    categoria: string;
    publico: string;
    morada: string;
    averageRating: number | string;
};

export default function ProfileScreen() {
    // 1. Extrair os dados dinâmicos do Tema
    const { colors, isDarkMode, toggleTheme } = useTheme();

    // 2. Gerar os estilos de forma dinâmica
    const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);

    const router = useRouter();

    // --- ESTADOS ---
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);
    const [isStaff, setIsStaff] = useState(false);
    const [pendingInvites, setPendingInvites] = useState(0);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [savingName, setSavingName] = useState(false);

    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [favorites, setFavorites] = useState<Favorite[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [notificationCount, setNotificationCount] = useState(0);

    const [activeTab, setActiveTab] = useState<'upcoming' | 'history' | 'favorites'>('upcoming');

    // Definições
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);

    // --- ANIMAÇÕES ---
    const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;

    const onModalShow = useCallback(() => {
        slideAnim.setValue(Dimensions.get('window').height);
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 90 }).start();
    }, []);

    const closeSettings = useCallback(() => {
        Animated.timing(slideAnim, { toValue: Dimensions.get('window').height, duration: 250, useNativeDriver: true }).start(() => setSettingsModalVisible(false));
    }, []);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
            onPanResponderMove: (_, gestureState) => { if (gestureState.dy > 0) slideAnim.setValue(gestureState.dy); },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 100 || gestureState.vy > 0.5) closeSettings();
                else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
            },
        })
    ).current;

    useFocusEffect(
        useCallback(() => {
            refreshAllData();
        }, [])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refreshAllData();
        setRefreshing(false);
    }, []);

    async function refreshAllData() {
        setLoadingData(true);
        await Promise.all([getProfile(), checkInvites(), fetchHistory(), fetchFavorites(), fetchNotificationCount()]);
        setLoadingData(false);
        setLoadingProfile(false);
    }

    async function fetchNotificationCount() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setNotificationCount(0);
            return;
        }
        const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('read', false);
        setNotificationCount(count || 0);
    }

    useEffect(() => {
        let channel: any;
        async function setupRealtimeBadge() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            channel = supabase
                .channel('client_profile_badge')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'notifications' },
                    (payload: any) => {
                        if (payload.new?.user_id === user.id || payload.old?.user_id === user.id) {
                            fetchNotificationCount();
                        }
                    }
                )
                .subscribe();
        }
        setupRealtimeBadge();
        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    // --- LÓGICA DE DADOS ---
    async function checkInvites() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) return;
        const { count } = await supabase.from('salon_staff').select('*', { count: 'exact', head: true }).eq('email', user.email).eq('status', 'pendente');
        if (count !== null) setPendingInvites(count);
    }

    async function getProfile() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profileData } = await supabase.from('profiles').select('is_super_admin, nome').eq('id', user.id).single();
            setProfile({
                email: user.email,
                name: profileData?.nome || user.user_metadata?.full_name || 'Utilizador',
                avatar_url: user.user_metadata?.avatar_url,
                id: user.id
            });
            setIsSuperAdmin(profileData?.is_super_admin === true);
            let isUserAManager = false;
            const { count: ownerCount } = await supabase.from('salons').select('*', { count: 'exact', head: true }).eq('dono_id', user.id);
            if (ownerCount && ownerCount > 0) isUserAManager = true;
            const { data: staffRecord } = await supabase.from('salon_staff').select('role, status').eq('email', user.email).eq('status', 'ativo').maybeSingle();
            if (staffRecord) {
                setIsStaff(true);
                if (staffRecord.role === 'gerente') isUserAManager = true;
            } else { setIsStaff(false); }
            setIsManager(isUserAManager);
        } catch (error) { console.log("Erro perfil:", error); }
    }

    async function pickImage() {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
            if (!result.canceled && result.assets && result.assets.length > 0) uploadAvatar(result.assets[0].uri);
        } catch (error) { Alert.alert("Erro", "Galeria indisponível."); }
    }

    async function uploadAvatar(uri: string) {
        setUploading(true);
        try {
            const response = await fetch(uri);
            const arrayBuffer = await response.arrayBuffer();
            const fileExt = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, arrayBuffer, { contentType: `image/${fileExt}`, upsert: true });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
            await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
            setProfile((prev: any) => ({ ...prev, avatar_url: publicUrl }));
        } catch (error) { Alert.alert("Erro", "Falha no upload."); } finally { setUploading(false); }
    }

    async function saveName() {
        if (!newName.trim()) return;
        setSavingName(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Erro");
            await supabase.from('profiles').update({ nome: newName.trim() }).eq('id', user.id);
            await supabase.auth.updateUser({ data: { full_name: newName.trim() } });
            setProfile((prev: any) => ({ ...prev, name: newName.trim() }));
            setEditModalVisible(false);
        } catch (error) { Alert.alert("Erro", "Falha ao guardar."); } finally { setSavingName(false); }
    }

    async function handleLogout() {
        setSettingsModalVisible(false);
        Alert.alert("Sair", "Tens a certeza?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Sair", style: "destructive", onPress: async () => { await supabase.auth.signOut(); router.replace('/login'); } }
        ]);
    }

    async function fetchHistory() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('appointments')
            // AQUI: Adicionámos o 'created_at' para sabermos quem foi marcado junto!
            .select(`id, data_hora, created_at, status, salon_id, service_id, services (nome, preco), salons (dono_id, nome_salao, morada, cidade, intervalo_minutos, imagem)`)
            .eq('cliente_id', user.id)
            .order('data_hora', { ascending: false });

        if (data && !error) {
            const groupedMap = new Map<string, any>();

            data.forEach((appt: any) => {
                // NOVA LÓGICA: Agrupa pelo momento exato em que o cliente clicou em "Confirmar"
                // Cortamos os milissegundos (substring 0,19) para garantir que agrupam na perfeição
                const groupKey = appt.created_at ? appt.created_at.substring(0, 19) : `${appt.salon_id}_${appt.data_hora}`;

                if (!groupedMap.has(groupKey)) {
                    groupedMap.set(groupKey, {
                        id: groupKey,
                        salon_id: appt.salon_id,
                        salons: appt.salons,
                        data_hora: appt.data_hora, // Vai guardar a hora do 1º serviço
                        status: appt.status,
                        services: [],
                        apptIds: [],
                        totalPrice: 0,
                        calendarAdded: false
                    });
                }

                const group = groupedMap.get(groupKey);
                
                // Adiciona o serviço ao grupo
                group.services.push({
                    nome: appt.services?.nome || 'Serviço',
                    preco: appt.services?.preco || 0,
                    service_id: appt.service_id
                });
                
                // Guarda o ID real e soma o preço
                group.apptIds.push(appt.id);
                group.totalPrice += (appt.services?.preco || 0);

                // Garante que a hora mostrada no cartão é a hora de início do PRIMEIRO serviço
                if (new Date(appt.data_hora) < new Date(group.data_hora)) {
                    group.data_hora = appt.data_hora;
                }

                // Lógica de Estado
                if (appt.status === 'pendente') group.status = 'pendente';
                else if (group.status !== 'pendente' && appt.status === 'confirmado') group.status = 'confirmado';
            });

            // Converte o Mapa num Array e ordena da data mais recente para a mais antiga
            const groupedArray = Array.from(groupedMap.values());
            groupedArray.sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());

            setAppointments(groupedArray as Appointment[]);
        }
    }
    
    async function cancelAppointment(apptIds: number[]) {
        Alert.alert("Cancelar", "Queres cancelar todos os serviços desta marcação?", [
            { text: "Não", style: "cancel" },
            {
                text: "Sim", style: 'destructive', onPress: async () => {
                    try {
                        // O .in() cancela todos os IDs de uma só vez na Base de Dados
                        await supabase.from('appointments').update({ status: 'cancelado' }).in('id', apptIds);

                        const appt = appointments.find(a => a.apptIds.includes(apptIds[0]));
                        if (appt && appt.salons.dono_id) {
                            const { data: { user } } = await supabase.auth.getUser();
                            sendNotification(appt.salons.dono_id, "Cancelamento", `${user?.user_metadata?.full_name || 'Cliente'} cancelou a marcação.`, {});
                        }
                        fetchHistory();
                    } catch (error) { Alert.alert("Erro ao cancelar"); }
                }
            }
        ]);
    }

    async function addToCalendar(item: Appointment) {
        try {
            const { status } = await Calendar.requestCalendarPermissionsAsync();
            if (status !== 'granted') return Alert.alert('Permissão', 'Acesso ao calendário negado.');

            const startDate = new Date(item.data_hora);
            const endDate = new Date(item.data_hora);
            // Continua a adicionar o intervalo do salão ou podes usar a duração total se a tiveres calculada
            endDate.setMinutes(endDate.getMinutes() + (item.salons?.intervalo_minutos || 30));

            const defaultCalendar = Platform.OS === 'ios'
                ? await Calendar.getDefaultCalendarAsync()
                : (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).find(c => c.isPrimary) || (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT))[0];

            if (!defaultCalendar) return;

            // A CORREÇÃO ESTÁ AQUI: Mapeia todos os nomes e junta-os com vírgula
            const servicosNomes = item.services.map(s => s.nome).join(', ');

            await Calendar.createEventAsync(defaultCalendar.id, {
                title: item.salons.nome_salao,
                startDate,
                endDate,
                location: item.salons.morada,
                notes: servicosNomes // Usa a variável nova com os nomes todos
            });

            setAppointments(prev => prev.map(appt => appt.id === item.id ? { ...appt, calendarAdded: true } : appt));
            Alert.alert("Sucesso", "Adicionado ao calendário.");
        } catch (error) {
            Alert.alert("Erro", "Não foi possível adicionar ao calendário.");
        }
    }

    async function fetchFavorites() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from('favorites').select(`id, salon_id, salons (id, nome_salao, cidade, imagem, categoria, publico, morada, reviews (rating))`).eq('user_id', user.id);
        if (!error && data) {
            const processed = data.map((fav: any) => {
                const salon = fav.salons;
                const reviews = salon.reviews || [];
                let avg: number | string = "Novo";
                if (reviews.length > 0) {
                    const total = reviews.reduce((acc: number, r: any) => acc + r.rating, 0);
                    avg = (total / reviews.length).toFixed(1);
                }
                return { ...salon, averageRating: avg, fav_id: fav.id };
            });
            setFavorites(processed);
        }
    }

    async function removeFavorite(favId: number) {
        setFavorites(prev => prev.filter(item => item.fav_id !== favId));
        await supabase.from('favorites').delete().eq('id', favId);
    }

    // --- HELPER VISUAL (Usando Cores Dinâmicas) ---
    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'confirmado': return { bg: colors.successBg, txt: colors.successTxt, label: 'Confirmado' };
            case 'pendente': return { bg: colors.warnBg, txt: colors.warnTxt, label: 'Pendente' };
            case 'cancelado': return { bg: colors.dangerBg, txt: colors.dangerTxt, label: 'Cancelado' };
            default: return { bg: isDarkMode ? '#2C2C2E' : '#E5E7EB', txt: isDarkMode ? '#E5E7EB' : '#374151', label: 'Concluído' };
        }
    };

    const now = new Date();

    const upcomingAppointments = appointments
        .filter(item => {
            const appDate = new Date(item.data_hora);
            const isActive = ['confirmado', 'pendente'].includes(item.status);
            return appDate >= now && isActive;
        })
        .sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());

    const historyAppointments = appointments
        .filter(item => {
            const appDate = new Date(item.data_hora);
            const isFinished = ['cancelado', 'concluido', 'faltou'].includes(item.status);
            return appDate < now || isFinished;
        })
        .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());

    const getDataToShow = () => {
        if (activeTab === 'upcoming') return upcomingAppointments;
        if (activeTab === 'history') return historyAppointments;
        if (activeTab === 'favorites') return favorites;
        return [];
    };

    // --- COMPONENTES ---

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            <View style={styles.topNav}>
                <View>
                    <Text style={styles.greeting}>Olá,</Text>
                    <Text style={styles.headerTitle} numberOfLines={1}>{profile?.name || 'Visitante'}</Text>
                </View>

                <View style={styles.headerRightButtons}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')}>
                        <Ionicons name="notifications-outline" size={22} color={colors.text} />
                        {notificationCount > 0 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.iconBtn} onPress={() => setSettingsModalVisible(true)}>
                        <Ionicons name="settings-outline" size={22} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.profileHero}>
                <TouchableOpacity style={styles.avatarWrapper} onPress={pickImage} disabled={uploading}>
                    {uploading ? <ActivityIndicator color={colors.primary} /> : profile?.avatar_url ? (
                        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}><Text style={styles.avatarInitials}>{profile?.name?.charAt(0) || 'U'}</Text></View>
                    )}
                    <View style={styles.cameraBadge}><Ionicons name="camera" size={12} color={isDarkMode ? '#000' : 'white'} /></View>
                </TouchableOpacity>

                <View style={styles.heroStats}>
                    <View style={styles.heroStatItem}>
                        <Text style={styles.heroStatNum}>{appointments.filter(a => a.status === 'concluido').length}</Text>
                        <Text style={styles.heroStatLabel}>Visitas</Text>
                    </View>
                    <View style={styles.dividerVertical} />
                    <View style={styles.heroStatItem}>
                        <Text style={styles.heroStatNum}>{favorites.length}</Text>
                        <Text style={styles.heroStatLabel}>Favoritos</Text>
                    </View>
                </View>
            </View>

            {pendingInvites > 0 && (
                <TouchableOpacity style={styles.inviteWidget} onPress={() => router.push('/invites')}>
                    <View style={styles.inviteIcon}><Ionicons name="mail" size={16} color="#FFF" /></View>
                    <Text style={styles.inviteText}>Tens <Text style={{ fontWeight: '800' }}>{pendingInvites}</Text> convite pendente</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.text} />
                </TouchableOpacity>
            )}

            {isSuperAdmin && (
                <TouchableOpacity style={styles.adminWidget} onPress={() => router.push('/super-admin')}>
                    <Ionicons name="shield-checkmark" size={16} color={colors.bg} />
                    <Text style={styles.adminText}>Painel Super Admin</Text>
                </TouchableOpacity>
            )}

            <View style={styles.tabContainer}>
                {['upcoming', 'history', 'favorites'].map((t) => {
                    const isActive = activeTab === t;
                    const labels: any = { upcoming: 'Agendado', history: 'Histórico', favorites: 'Favoritos' };
                    return (
                        <TouchableOpacity
                            key={t}
                            style={[styles.pillTab, isActive && styles.pillTabActive]}
                            onPress={() => setActiveTab(t as any)}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{labels[t]}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );

    const renderEmpty = () => (
        <View style={styles.emptyWrapper}>
            <View style={styles.emptyIconBg}>
                <Ionicons name={activeTab === 'favorites' ? 'heart-outline' : 'calendar-clear-outline'} size={32} color={colors.subText} />
            </View>
            <Text style={styles.emptyTitle}>{activeTab === 'favorites' ? 'Sem favoritos ainda' : 'Tudo limpo por aqui'}</Text>
            <Text style={styles.emptyDesc}>{activeTab === 'favorites' ? 'Guarda os salões que mais gostas.' : 'As tuas marcações aparecerão aqui.'}</Text>
        </View>
    );

    const renderAppointment = ({ item }: { item: Appointment }) => {
        const dateObj = new Date(item.data_hora);
        const dateStr = dateObj.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
        const timeStr = dateObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
        const statusMeta = getStatusStyle(item.status);

        return (
            <View style={styles.cardContainer}>
                <View style={styles.cardMain}>
                    <Image source={{ uri: item.salons.imagem || 'https://via.placeholder.com/150' }} style={styles.cardImage} />

                    <View style={styles.cardContent}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardSalonName} numberOfLines={1}>{item.salons.nome_salao}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                                <Text style={[styles.statusText, { color: statusMeta.txt }]}>{statusMeta.label}</Text>
                            </View>
                        </View>

                        {/* LISTA DINÂMICA DE SERVIÇOS */}
                        <View style={{ marginBottom: 10 }}>
                            {item.services.map((s, idx) => (
                                <Text key={idx} style={styles.cardService} numberOfLines={1}>• {s.nome}</Text>
                            ))}
                        </View>

                        <View style={styles.cardMetaRow}>
                            <View style={styles.metaItem}>
                                <Ionicons name="calendar-outline" size={12} color={colors.subText} />
                                <Text style={styles.metaText}>{dateStr}</Text>
                            </View>
                            <View style={styles.metaItem}>
                                <Ionicons name="time-outline" size={12} color={colors.subText} />
                                <Text style={styles.metaText}>{timeStr}</Text>
                            </View>
                            {/* VALOR TOTAL */}
                            <View style={[styles.metaItem, { backgroundColor: 'transparent', paddingHorizontal: 0, marginLeft: 'auto' }]}>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>{item.totalPrice}€</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.cardFooter}>
                    {activeTab === 'upcoming' ? (
                        <>
                            <TouchableOpacity style={styles.footerBtn} onPress={() => router.push(`/salon/${item.salon_id}`)}>
                                <Text style={styles.footerBtnText}>Ver Detalhes</Text>
                            </TouchableOpacity>

                            {item.status === 'pendente' ? (
                                // Passamos o array de IDs para cancelar tudo!
                                <TouchableOpacity style={styles.footerBtnDestructive} onPress={() => cancelAppointment(item.apptIds)}>
                                    <Text style={styles.footerBtnTextDestructive}>Cancelar</Text>
                                </TouchableOpacity>
                            ) : (
                                !item.calendarAdded ? (
                                    <TouchableOpacity style={styles.footerBtnSecondary} onPress={() => addToCalendar(item)}>
                                        <Ionicons name="calendar" size={14} color={colors.text} />
                                    </TouchableOpacity>
                                ) : (
                                    <View style={[styles.footerBtnSecondary, { opacity: 0.5 }]}><Ionicons name="checkmark" size={14} color={colors.text} /></View>
                                )
                            )}
                        </>
                    ) : (
                        <TouchableOpacity
                            style={[styles.footerBtn, { flexDirection: 'row', justifyContent: 'center', gap: 6 }]}
                            onPress={() => router.push({
                                pathname: '/book-confirm',
                                params: {
                                    salonId: item.salon_id,
                                    salonName: item.salons.nome_salao,
                                    serviceId: item.services[0].service_id // Pega no ID do primeiro serviço para o "Marcar Novamente"
                                }
                            })}
                        >
                            <Ionicons name="refresh-outline" size={16} color={isDarkMode ? '#000' : 'white'} />
                            <Text style={styles.footerBtnText}>Marcar Novamente</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    const renderFavorite = ({ item }: { item: Favorite }) => (
        <TouchableOpacity style={styles.gridCard} onPress={() => router.push(`/salon/${item.id}`)} activeOpacity={0.9}>
            <Image source={{ uri: item.imagem || 'https://via.placeholder.com/300' }} style={styles.gridImage} />
            <View style={styles.ratingPill}>
                <Ionicons name="star" size={10} color="#FFD700" />
                <Text style={styles.ratingText}>{item.averageRating}</Text>
            </View>
            <TouchableOpacity style={styles.removeFavBtn} onPress={(e) => { e.stopPropagation(); removeFavorite(item.fav_id); }}>
                <Ionicons name="heart" size={16} color="#FF3B30" />
            </TouchableOpacity>

            <View style={styles.gridInfo}>
                <Text style={styles.gridTitle} numberOfLines={1}>{item.nome_salao}</Text>
                <Text style={styles.gridSub} numberOfLines={1}>{item.cidade}</Text>
            </View>
        </TouchableOpacity>
    );

    if (loadingProfile) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <FlatList<any>
                key={activeTab === 'favorites' ? 'grid' : 'list'}
                data={getDataToShow()}
                renderItem={activeTab === 'favorites' ? renderFavorite : renderAppointment}
                keyExtractor={(item: any) => item.fav_id ? `f-${item.fav_id}` : `a-${item.id}`}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={renderEmpty}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={activeTab === 'favorites' ? { paddingHorizontal: SPACING } : undefined}
                numColumns={activeTab === 'favorites' ? COLUMNS : 1}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                showsVerticalScrollIndicator={false}
            />

            {/* Edit Name Modal */}
            <Modal animationType="slide" transparent visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
                    <TouchableWithoutFeedback onPress={() => setEditModalVisible(false)}><View style={{ flex: 1 }} /></TouchableWithoutFeedback>
                    <View style={styles.modalCard}>
                        <View style={styles.modalDrag} />
                        <Text style={styles.modalTitle}>Como te chamas?</Text>
                        <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="O teu nome" placeholderTextColor={colors.subText} autoFocus />
                        <TouchableOpacity style={styles.primaryBtn} onPress={saveName} disabled={savingName}>
                            {savingName ? <ActivityIndicator color="white" /> : <Text style={styles.primaryBtnText}>Guardar Alterações</Text>}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Settings Sheet */}
            <Modal animationType="none" transparent visible={settingsModalVisible} onRequestClose={closeSettings} onShow={onModalShow}>
                <TouchableWithoutFeedback onPress={closeSettings}>
                    <View style={styles.modalBackdrop}>
                        <TouchableWithoutFeedback>
                            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]} {...panResponder.panHandlers}>
                                <View style={styles.modalDrag} />
                                <Text style={styles.sheetHeader}>Definições</Text>

                                <TouchableOpacity
                                    style={styles.settingRow}
                                    onPress={() => {
                                        setNewName(profile?.name || '');
                                        closeSettings();
                                        setTimeout(() => setEditModalVisible(true), 300);
                                    }}
                                >
                                    <View style={styles.iconBox}>
                                        <Ionicons name="person-outline" size={20} color={colors.text} />
                                    </View>
                                    <Text style={styles.settingLabel}>Editar Nome</Text>
                                    <Ionicons name="chevron-forward" size={20} color={colors.subText} />
                                </TouchableOpacity>

                                <View style={styles.settingRow}>
                                    <View style={styles.iconBox}>
                                        <Ionicons name="notifications-outline" size={20} color={colors.text} />
                                    </View>
                                    <Text style={styles.settingLabel}>Notificações</Text>
                                    <Switch
                                        value={notificationsEnabled}
                                        onValueChange={setNotificationsEnabled}
                                        trackColor={{ false: isDarkMode ? '#39393D' : '#E5E5EA', true: colors.text }}
                                        // Se estiver ligado E em Dark Mode, usa o preto suave. Caso contrário, mantém-se branco.
                                        thumbColor={notificationsEnabled && isDarkMode ? '#1A1A1A' : '#FFFFFF'}
                                    />
                                </View>
                                <View style={styles.settingRow}>
                                    <View style={styles.iconBox}>
                                        <Ionicons name="moon-outline" size={20} color={colors.text} />
                                    </View>
                                    <Text style={styles.settingLabel}>Modo Escuro</Text>
                                    <Switch
                                        value={isDarkMode}
                                        onValueChange={toggleTheme}
                                        trackColor={{ false: isDarkMode ? '#39393D' : '#E5E5EA', true: colors.text }}
                                        // Como este botão ativa o Dark Mode, a lógica é ainda mais simples:
                                        thumbColor={isDarkMode ? '#1A1A1A' : '#FFFFFF'}
                                    />
                                </View>

                                <TouchableOpacity style={styles.logoutRow} onPress={handleLogout}>
                                    <View style={[styles.iconBox, { backgroundColor: colors.dangerBg }]}>
                                        <Ionicons name="log-out-outline" size={20} color={colors.dangerTxt} />
                                    </View>
                                    <Text style={[styles.settingLabel, { color: colors.dangerTxt }]}>Terminar Sessão</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </SafeAreaView>
    );
}

// 3. Função Isolada para gerar Estilos baseados nas Cores Dinâmicas
const createStyles = (colors: any, isDarkMode: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
    listContent: { paddingBottom: 100 },

    headerContainer: { paddingHorizontal: SPACING, paddingTop: 10, paddingBottom: 10 },
    greeting: { fontSize: 16, color: colors.subText, fontWeight: '500' },
    headerTitle: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: -2 },

    topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerRightButtons: { flexDirection: 'row', gap: 12 },
    iconBtn: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card,
        justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border
    },
    badge: {
        position: 'absolute', top: -2, right: -2, backgroundColor: colors.dangerTxt,
        minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: colors.card
    },
    badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold', textAlign: 'center' },

    profileHero: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
        padding: 16, borderRadius: 24, marginBottom: 20,
        shadowColor: isDarkMode ? '#FFF' : '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2
    },
    avatarWrapper: { position: 'relative', marginRight: 16 },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.iconBg },
    avatarPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.iconBg, justifyContent: 'center', alignItems: 'center' },
    avatarInitials: { fontSize: 24, fontWeight: '700', color: colors.subText },
    cameraBadge: {
        position: 'absolute', bottom: -2, right: -2, backgroundColor: colors.primary,
        width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: colors.card
    },

    heroStats: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
    heroStatItem: { alignItems: 'center' },
    heroStatNum: { fontSize: 18, fontWeight: '800', color: colors.text },
    heroStatLabel: { fontSize: 11, color: colors.subText, fontWeight: '600', textTransform: 'uppercase' },
    dividerVertical: { width: 1, height: 24, backgroundColor: colors.border },

    inviteWidget: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent + '20', padding: 12, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: colors.accent + '40' },
    inviteIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    inviteText: { flex: 1, color: colors.accent, fontSize: 13 },

    adminWidget: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, padding: 12, borderRadius: 16, marginBottom: 15, gap: 8 },
    adminText: { color: colors.bg, fontWeight: 'bold', fontSize: 13 },

    tabContainer: { flexDirection: 'row', backgroundColor: isDarkMode ? colors.iconBg : '#E5E7EB', padding: 4, borderRadius: 25, marginTop: 5 },
    pillTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 22 },
    pillTabActive: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    pillText: { fontSize: 13, fontWeight: '600', color: colors.subText },
    pillTextActive: { color: colors.text },

    cardContainer: { backgroundColor: colors.card, marginHorizontal: SPACING, marginBottom: 16, borderRadius: 20, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, borderWidth: 1, borderColor: colors.border },
    cardMain: { flexDirection: 'row', marginBottom: 12 },
    cardImage: { width: 80, height: 80, borderRadius: 16, backgroundColor: colors.iconBg },
    cardContent: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardSalonName: { fontSize: 16, fontWeight: 'bold', color: colors.text, flex: 1, marginRight: 8 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    cardService: { fontSize: 13, color: colors.subText, marginBottom: 2, fontWeight: '500' },
    cardMetaRow: { flexDirection: 'row', gap: 12 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDarkMode ? '#2C2C2E' : '#F9FAFB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    metaText: { fontSize: 11, color: colors.text, fontWeight: '600' },

    cardFooter: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    footerBtn: { flex: 1, backgroundColor: colors.text, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    footerBtnText: { color: colors.bg, fontWeight: '700', fontSize: 12 },
    footerBtnSecondary: { width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    footerBtnDestructive: { flex: 0.4, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    footerBtnTextDestructive: { color: colors.dangerTxt, fontSize: 12, fontWeight: '700' },

    gridCard: { width: GRID_ITEM_WIDTH, marginBottom: SPACING, backgroundColor: colors.card, borderRadius: 20, padding: 8, marginRight: SPACING, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    gridImage: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: colors.iconBg, marginBottom: 8 },
    ratingPill: { position: 'absolute', top: 14, left: 14, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
    ratingText: { fontSize: 10, fontWeight: 'bold', color: colors.text },
    removeFavBtn: { position: 'absolute', top: 14, right: 14, backgroundColor: colors.card, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
    gridInfo: { paddingHorizontal: 4, paddingBottom: 4 },
    gridTitle: { fontSize: 14, fontWeight: 'bold', color: colors.text, marginBottom: 2 },
    gridSub: { fontSize: 11, color: colors.subText },

    emptyWrapper: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
    emptyIconBg: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.iconBg, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 6 },
    emptyDesc: { fontSize: 13, color: colors.subText, textAlign: 'center', lineHeight: 20 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    modalDrag: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: colors.text },
    input: { backgroundColor: colors.iconBg, color: colors.text, borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
    primaryBtn: { backgroundColor: colors.text, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    primaryBtnText: { color: colors.bg, fontWeight: 'bold', fontSize: 15 },

    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 50 },
    sheetHeader: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 24 },
    settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.iconBg, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    settingLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
    logoutRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 12 },
});