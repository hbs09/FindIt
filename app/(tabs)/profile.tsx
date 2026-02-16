import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { sendNotification } from '../../utils/notifications';

// --- DESIGN SYSTEM ---
const { width } = Dimensions.get('window');
const SPACING = 20;
const CARD_RADIUS = 20;
const COLUMNS = 2;
const GRID_ITEM_WIDTH = (width - (SPACING * 3)) / COLUMNS;

const COLORS = {
    bg: '#F8F9FA',         // Fundo Off-White Moderno
    card: '#FFFFFF',       // Cartões Brancos
    text: '#1A1A1A',       // Preto Suave
    subText: '#8E8E93',    // Cinza iOS
    primary: '#111827',    // Quase Preto (Ação)
    accent: '#3B82F6',     // Azul Vibrante (Links/Ícones)
    successBg: '#DCFCE7',  // Verde Pastel
    successTxt: '#166534', // Verde Escuro
    warnBg: '#FEF3C7',     // Amarelo Pastel
    warnTxt: '#92400E',    // Laranja Escuro
    dangerBg: '#FEE2E2',   // Vermelho Pastel
    dangerTxt: '#991B1B',  // Vermelho Escuro
    border: '#E5E7EB'
};

// --- TIPOS ---
type Appointment = {
    id: number;
    data_hora: string;
    status: string;
    services: { nome: string; preco: number };
    salons: { nome_salao: string; morada: string; cidade: string; intervalo_minutos: number; dono_id?: string; imagem?: string };
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

    const [activeTab, setActiveTab] = useState<'upcoming' | 'history' | 'favorites'>('upcoming');

    // Definições
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [darkModeEnabled, setDarkModeEnabled] = useState(false);

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
        await Promise.all([getProfile(), checkInvites(), fetchHistory(), fetchFavorites()]);
        setLoadingData(false);
        setLoadingProfile(false);
    }

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
        const { data, error } = await supabase.from('appointments').select(`id, data_hora, status, salon_id, services (nome, preco), salons (dono_id, nome_salao, morada, cidade, intervalo_minutos, imagem)`).eq('cliente_id', user.id).order('data_hora', { ascending: false });
        if (!error && data) {
            const formattedData = data.map((item: any) => ({
                ...item,
                services: Array.isArray(item.services) ? item.services[0] : item.services,
                salons: Array.isArray(item.salons) ? item.salons[0] : item.salons,
            }));
            setAppointments(formattedData);
        }
    }

    async function cancelAppointment(id: number) {
        Alert.alert("Cancelar", "Queres cancelar a marcação?", [
            { text: "Não", style: "cancel" },
            {
                text: "Sim", style: 'destructive', onPress: async () => {
                    try {
                        const appt = appointments.find(a => a.id === id);
                        if (!appt) return;
                        await supabase.from('appointments').update({ status: 'cancelado' }).eq('id', id);
                        const { data: { user } } = await supabase.auth.getUser();
                        if (appt.salons.dono_id) { sendNotification(appt.salons.dono_id, "Cancelamento", `${user?.user_metadata?.full_name || 'Cliente'} cancelou.`, {}); }
                        fetchHistory();
                    } catch (error) { Alert.alert("Erro"); }
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
            endDate.setMinutes(endDate.getMinutes() + (item.salons?.intervalo_minutos || 30));
            const defaultCalendar = Platform.OS === 'ios' ? await Calendar.getDefaultCalendarAsync() : (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).find(c => c.isPrimary) || (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT))[0];
            if (!defaultCalendar) return;
            await Calendar.createEventAsync(defaultCalendar.id, { title: item.salons.nome_salao, startDate, endDate, location: item.salons.morada, notes: item.services.nome });
            setAppointments(prev => prev.map(appt => appt.id === item.id ? { ...appt, calendarAdded: true } : appt));
            Alert.alert("Sucesso", "Adicionado ao calendário.");
        } catch (error) { Alert.alert("Erro"); }
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

    // --- HELPER VISUAL ---
    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'confirmado': return { bg: COLORS.successBg, txt: COLORS.successTxt, label: 'Confirmado' };
            case 'pendente': return { bg: COLORS.warnBg, txt: COLORS.warnTxt, label: 'Pendente' };
            case 'cancelado': return { bg: COLORS.dangerBg, txt: COLORS.dangerTxt, label: 'Cancelado' };
            default: return { bg: '#E5E7EB', txt: '#374151', label: 'Concluído' };
        }
    };

    const now = new Date();
    const upcomingAppointments = appointments.filter(item => { const appDate = new Date(item.data_hora); return appDate >= now && !['cancelado', 'concluido', 'faltou'].includes(item.status); }).sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());
    const historyAppointments = appointments.filter(item => { const appDate = new Date(item.data_hora); return appDate < now || ['cancelado', 'concluido', 'faltou'].includes(item.status); });

    const getDataToShow = () => {
        if (activeTab === 'upcoming') return upcomingAppointments;
        if (activeTab === 'history') return historyAppointments;
        if (activeTab === 'favorites') return favorites;
        return [];
    };

    // --- COMPONENTES ---

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            {/* Top Navigation */}
            <View style={styles.topNav}>
                <View>
                    <Text style={styles.greeting}>Olá,</Text>
                    <Text style={styles.headerTitle} numberOfLines={1}>{profile?.name || 'Visitante'}</Text>
                </View>
                <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModalVisible(true)}>
                    <Ionicons name="settings-outline" size={22} color={COLORS.text} />
                </TouchableOpacity>
            </View>

            {/* Profile Card Main */}
            <View style={styles.profileHero}>
                <TouchableOpacity style={styles.avatarWrapper} onPress={pickImage} disabled={uploading}>
                    {uploading ? <ActivityIndicator color={COLORS.primary} /> : profile?.avatar_url ? (
                        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}><Text style={styles.avatarInitials}>{profile?.name?.charAt(0) || 'U'}</Text></View>
                    )}
                    <View style={styles.cameraBadge}><Ionicons name="camera" size={12} color="white" /></View>
                </TouchableOpacity>

                <View style={styles.heroStats}>
                    <View style={styles.heroStatItem}>
                        <Text style={styles.heroStatNum}>
                            {appointments.filter(a => a.status === 'concluido').length}
                        </Text>
                        <Text style={styles.heroStatLabel}>Visitas</Text>
                    </View>
                    <View style={styles.dividerVertical} />
                    <View style={styles.heroStatItem}>
                        <Text style={styles.heroStatNum}>{favorites.length}</Text>
                        <Text style={styles.heroStatLabel}>Favoritos</Text>
                    </View>
                </View>

                {/* O BOTÃO editBtnSmall FOI REMOVIDO DAQUI */}
            </View>

            {/* Notifications / Admin */}
            {pendingInvites > 0 && (
                <TouchableOpacity style={styles.inviteWidget} onPress={() => router.push('/invites')}>
                    <View style={styles.inviteIcon}><Ionicons name="mail" size={16} color="#FFF" /></View>
                    <Text style={styles.inviteText}>Tens <Text style={{ fontWeight: '800' }}>{pendingInvites}</Text> convite pendente</Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.text} />
                </TouchableOpacity>
            )}

            {isSuperAdmin && (
                <TouchableOpacity style={styles.adminWidget} onPress={() => router.push('/super-admin')}>
                    <Ionicons name="shield-checkmark" size={16} color="white" />
                    <Text style={styles.adminText}>Painel Super Admin</Text>
                </TouchableOpacity>
            )}

            {/* Modern Pill Tabs */}
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
                <Ionicons
                    name={activeTab === 'favorites' ? 'heart-outline' : 'calendar-clear-outline'}
                    size={32} color={COLORS.subText}
                />
            </View>
            <Text style={styles.emptyTitle}>
                {activeTab === 'favorites' ? 'Sem favoritos ainda' : 'Tudo limpo por aqui'}
            </Text>
            <Text style={styles.emptyDesc}>
                {activeTab === 'favorites' ? 'Guarda os salões que mais gostas.' : 'As tuas marcações aparecerão aqui.'}
            </Text>
        </View>
    );

    // Modern "Ticket" Style Appointment Card
    const renderAppointment = ({ item }: { item: Appointment }) => {
        const dateObj = new Date(item.data_hora);
        const dateStr = dateObj.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
        const timeStr = dateObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
        const statusMeta = getStatusStyle(item.status);

        return (
            <View style={styles.cardContainer}>
                <View style={styles.cardMain}>
                    {/* Left: Image */}
                    <Image
                        source={{ uri: item.salons.imagem || 'https://via.placeholder.com/150' }}
                        style={styles.cardImage}
                    />

                    {/* Right: Content */}
                    <View style={styles.cardContent}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardSalonName} numberOfLines={1}>{item.salons.nome_salao}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                                <Text style={[styles.statusText, { color: statusMeta.txt }]}>{statusMeta.label}</Text>
                            </View>
                        </View>

                        <Text style={styles.cardService} numberOfLines={1}>{item.services.nome}</Text>

                        <View style={styles.cardMetaRow}>
                            <View style={styles.metaItem}>
                                <Ionicons name="calendar-outline" size={12} color={COLORS.subText} />
                                <Text style={styles.metaText}>{dateStr}</Text>
                            </View>
                            <View style={styles.metaItem}>
                                <Ionicons name="time-outline" size={12} color={COLORS.subText} />
                                <Text style={styles.metaText}>{timeStr}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Footer Actions (Only for Upcoming) */}
                {activeTab === 'upcoming' && (
                    <View style={styles.cardFooter}>
                        <TouchableOpacity style={styles.footerBtn} onPress={() => router.push(`/salon/${item.salon_id}`)}>
                            <Text style={styles.footerBtnText}>Ver Detalhes</Text>
                        </TouchableOpacity>

                        {item.status === 'pendente' ? (
                            <TouchableOpacity style={styles.footerBtnDestructive} onPress={() => cancelAppointment(item.id)}>
                                <Text style={styles.footerBtnTextDestructive}>Cancelar</Text>
                            </TouchableOpacity>
                        ) : (
                            !item.calendarAdded ? (
                                <TouchableOpacity style={styles.footerBtnSecondary} onPress={() => addToCalendar(item)}>
                                    <Ionicons name="calendar" size={14} color={COLORS.text} />
                                </TouchableOpacity>
                            ) : (
                                <View style={[styles.footerBtnSecondary, { opacity: 0.5 }]}><Ionicons name="checkmark" size={14} color={COLORS.text} /></View>
                            )
                        )}
                    </View>
                )}
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

    if (loadingProfile) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

            <FlatList<any>  // <--- ADICIONA O <any> AQUI
                key={activeTab === 'favorites' ? 'grid' : 'list'}
                data={getDataToShow()}
                renderItem={activeTab === 'favorites' ? renderFavorite : renderAppointment}
                keyExtractor={(item: any) => item.fav_id ? `f-${item.fav_id}` : `a-${item.id}`}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={renderEmpty}

                // Mantém a correção de layout que fizemos antes:
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={activeTab === 'favorites' ? { paddingHorizontal: SPACING } : undefined}

                numColumns={activeTab === 'favorites' ? COLUMNS : 1}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                showsVerticalScrollIndicator={false}
            />

            {/* Edit Name Modal */}
            <Modal animationType="slide" transparent visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
                    <TouchableWithoutFeedback onPress={() => setEditModalVisible(false)}><View style={{ flex: 1 }} /></TouchableWithoutFeedback>
                    <View style={styles.modalCard}>
                        <View style={styles.modalDrag} />
                        <Text style={styles.modalTitle}>Como te chamas?</Text>
                        <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="O teu nome" autoFocus />
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

                                {/* --- NOVA OPÇÃO DE EDITAR NOME --- */}
                                <TouchableOpacity
                                    style={styles.settingRow}
                                    onPress={() => {
                                        setNewName(profile?.name || ''); // Preenche o nome atual
                                        closeSettings(); // Fecha as definições
                                        // Um pequeno timeout para a animação de fechar não colidir com a de abrir
                                        setTimeout(() => setEditModalVisible(true), 300);
                                    }}
                                >
                                    <View style={styles.iconBox}>
                                        <Ionicons name="person-outline" size={20} color={COLORS.text} />
                                    </View>
                                    <Text style={styles.settingLabel}>Editar Nome</Text>
                                    <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
                                </TouchableOpacity>

                                <View style={styles.settingRow}>
                                    <View style={styles.iconBox}><Ionicons name="notifications-outline" size={20} color={COLORS.text} /></View>
                                    <Text style={styles.settingLabel}>Notificações</Text>
                                    <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={{ false: '#EEE', true: COLORS.primary }} />
                                </View>
                                <View style={styles.settingRow}>
                                    <View style={styles.iconBox}><Ionicons name="moon-outline" size={20} color={COLORS.text} /></View>
                                    <Text style={styles.settingLabel}>Modo Escuro</Text>
                                    <Switch value={darkModeEnabled} onValueChange={setDarkModeEnabled} trackColor={{ false: '#EEE', true: COLORS.primary }} />
                                </View>

                                <TouchableOpacity style={styles.logoutRow} onPress={handleLogout}>
                                    <View style={[styles.iconBox, { backgroundColor: COLORS.dangerBg }]}><Ionicons name="log-out-outline" size={20} color={COLORS.dangerTxt} /></View>
                                    <Text style={[styles.settingLabel, { color: COLORS.dangerTxt }]}>Terminar Sessão</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
    listContent: { paddingBottom: 100 },

    // HEADER MODERN
    headerContainer: { paddingHorizontal: SPACING, paddingTop: 10, paddingBottom: 10 },
    topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    greeting: { fontSize: 16, color: COLORS.subText, fontWeight: '500' },
    headerTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginTop: -2 },
    settingsBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F0F0F0' },

    profileHero: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
        padding: 16, borderRadius: 24, marginBottom: 20,
        shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2
    },
    avatarWrapper: { position: 'relative', marginRight: 16 },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F0F0F0' },
    avatarPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },
    avatarInitials: { fontSize: 24, fontWeight: '700', color: '#9CA3AF' },
    cameraBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: COLORS.text, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white' },

    heroStats: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
    heroStatItem: { alignItems: 'center' },
    heroStatNum: { fontSize: 18, fontWeight: '800', color: COLORS.text },
    heroStatLabel: { fontSize: 11, color: COLORS.subText, fontWeight: '600', textTransform: 'uppercase' },
    dividerVertical: { width: 1, height: 24, backgroundColor: '#F0F0F0' },

    editBtnSmall: { backgroundColor: COLORS.primary, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', position: 'absolute', top: 12, right: 12 },

    // WIDGETS
    inviteWidget: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', padding: 12, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#DBEAFE' },
    inviteIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    inviteText: { flex: 1, color: '#1E40AF', fontSize: 13 },

    adminWidget: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.text, padding: 12, borderRadius: 16, marginBottom: 15, gap: 8 },
    adminText: { color: 'white', fontWeight: 'bold', fontSize: 13 },

    // TABS PILL
    tabContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', padding: 4, borderRadius: 25, marginTop: 5 },
    pillTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 22 },
    pillTabActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    pillText: { fontSize: 13, fontWeight: '600', color: COLORS.subText },
    pillTextActive: { color: COLORS.text },

    // APPOINTMENT CARD (TICKET STYLE)
    cardContainer: { backgroundColor: 'white', marginHorizontal: SPACING, marginBottom: 16, borderRadius: 20, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, borderWidth: 1, borderColor: '#F3F4F6' },
    cardMain: { flexDirection: 'row', marginBottom: 12 },
    cardImage: { width: 80, height: 80, borderRadius: 16, backgroundColor: '#F3F4F6' },
    cardContent: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardSalonName: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, flex: 1, marginRight: 8 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    cardService: { fontSize: 13, color: COLORS.subText, marginBottom: 8, fontWeight: '500' },
    cardMetaRow: { flexDirection: 'row', gap: 12 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F9FAFB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    metaText: { fontSize: 11, color: COLORS.text, fontWeight: '600' },

    cardFooter: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    footerBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    footerBtnText: { color: 'white', fontWeight: '700', fontSize: 12 },
    footerBtnSecondary: { width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
    footerBtnDestructive: { flex: 0.4, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    footerBtnTextDestructive: { color: COLORS.dangerTxt, fontSize: 12, fontWeight: '700' },

    // FAVORITE CARD (GRID)
    gridCard: { width: GRID_ITEM_WIDTH, marginBottom: SPACING, backgroundColor: 'white', borderRadius: 20, padding: 8, marginRight: SPACING, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    gridImage: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#F3F4F6', marginBottom: 8 },
    ratingPill: { position: 'absolute', top: 14, left: 14, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
    ratingText: { fontSize: 10, fontWeight: 'bold' },
    removeFavBtn: { position: 'absolute', top: 14, right: 14, backgroundColor: 'white', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
    gridInfo: { paddingHorizontal: 4, paddingBottom: 4 },
    gridTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, marginBottom: 2 },
    gridSub: { fontSize: 11, color: COLORS.subText },

    // EMPTY STATES
    emptyWrapper: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
    emptyIconBg: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 6 },
    emptyDesc: { fontSize: 13, color: COLORS.subText, textAlign: 'center', lineHeight: 20 },

    // MODALS / SHEETS
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    modalDrag: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: COLORS.text },
    input: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
    primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    primaryBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },

    sheet: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 50 },
    sheetHeader: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 24 },
    settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    settingLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.text },
    logoutRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 12 },
});