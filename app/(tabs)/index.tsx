import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Image,
    Modal,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- CONSTANTES ---
const CATEGORIES = ['Todos', 'Cabeleireiro', 'Barbearia', 'Unhas', 'Estética'];
const AUDIENCES = ['Todos', 'Homem', 'Mulher', 'Unissexo'];
const RATING_OPTIONS = [
    { label: 'Qualquer', value: 0 },
    { label: '3.0 +', value: 3.0 },
    { label: '4.0 +', value: 4.0 },
    { label: '4.5 +', value: 4.5 },
];

// --- CALIBRAÇÃO ---
const SCROLL_DISTANCE = 100;
const HEADER_INITIAL_HEIGHT = 80;
const BTN_SIZE = 50;
const NOTIF_BTN_TOP = 80;
const LIST_TOP_PADDING = 100;

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

export default function HomeScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<Session | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);

    // --- ESTADO DE LOCALIZAÇÃO (COM REF PARA EVITAR PROBLEMAS DE UPDATE) ---
    const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
    const locationRef = useRef<Location.LocationObject | null>(null);

    const scrollY = useRef(new Animated.Value(0)).current;

    const [salons, setSalons] = useState<any[]>([]);
    const [filteredSalons, setFilteredSalons] = useState<any[]>([]);
    const [visibleLimit, setVisibleLimit] = useState(10);

    const [minRating, setMinRating] = useState(0);

    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todos');

    const [selectedAudiences, setSelectedAudiences] = useState<string[]>(['Todos']);

    const [filterModalVisible, setFilterModalVisible] = useState(false);

    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [appointmentToReview, setAppointmentToReview] = useState<any>(null);
    const [rating, setRating] = useState(0);
    const [submittingReview, setSubmittingReview] = useState(false);
    const [notificationCount, setNotificationCount] = useState(0);

    // Atualiza a ref sempre que o estado muda
    useEffect(() => {
        locationRef.current = userLocation;
    }, [userLocation]);

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                let location = await Location.getCurrentPositionAsync({});
                setUserLocation(location); // Isto dispara o useEffect acima
            }
            await checkUserGenderAndFetch();
        })();

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Atualiza a lista se a localização mudar depois do fetch inicial
    useEffect(() => {
        if (userLocation && salons.length > 0) {
            const sorted = calculateDistancesAndSort(salons, userLocation);
            setSalons(sorted);
            setVisibleLimit(10); // [NOVO] Reset ao reordenar
        }
    }, [userLocation, salons.length]);

    // --- RECARREGA DADOS AO ENTRAR NA PÁGINA ---
    useFocusEffect(
        useCallback(() => {
            fetchSalons(); // Recarrega os salões (e verifica ausências removidas)

            if (session?.user) {
                fetchUnreadCount(session.user.id);
                checkPendingReview(session.user.id);
            }
        }, [session])
    );

    useEffect(() => {
        filterData();
    }, [searchText, selectedCategory, selectedAudiences, salons, minRating]);

    async function checkUserGenderAndFetch() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (user?.user_metadata?.gender) {
            const userGender = user.user_metadata.gender;

            if (AUDIENCES.includes(userGender)) {
                if (userGender !== 'Todos' && userGender !== 'Unissexo') {
                    setSelectedAudiences([userGender, 'Unissexo']);
                } else {
                    setSelectedAudiences([userGender]);
                }
            }
        }

        await fetchSalons();
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
            .eq('read', false); // Apenas as não lidas

        setNotificationCount(count || 0);
    }

    // 2. Atualizar ao entrar na página (Foco)
    useFocusEffect(
        useCallback(() => {
            fetchNotificationCount();
        }, [])
    );

    // 3. Atualização em Tempo Real (Realtime)
    useEffect(() => {
        let channel: any;

        async function setupRealtimeBadge() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Cria um canal único para o cliente
            channel = supabase
                .channel('client_home_badge')
                .on(
                    'postgres_changes',
                    {
                        event: '*', // Escuta tudo: INSERT, UPDATE, DELETE
                        schema: 'public',
                        table: 'notifications'
                    },
                    (payload: any) => {
                        // Verifica se a notificação é para este utilizador
                        const userId = payload.new?.user_id || payload.old?.user_id;
                        if (userId === user.id) {
                            fetchNotificationCount(); // Reconta
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

    function toggleAudience(audience: string) {
        if (audience === 'Todos') {
            setSelectedAudiences(['Todos']);
            return;
        }

        let newSelection = [...selectedAudiences];

        if (newSelection.includes('Todos')) {
            newSelection = [];
        }

        if (newSelection.includes(audience)) {
            newSelection = newSelection.filter(a => a !== audience);
        } else {
            newSelection.push(audience);
        }

        if (newSelection.length === 0) {
            setSelectedAudiences(['Todos']);
        } else {
            setSelectedAudiences(newSelection);
        }
    }

    async function checkPendingReview(userId: string) {
        const { data, error } = await supabase
            .from('appointments')
            .select('*, salons(nome_salao), services(nome)')
            .eq('cliente_id', userId)
            .eq('status', 'concluido')
            .eq('avaliado', false)
            .order('data_hora', { ascending: false })
            .limit(1)
            .single();

        if (data && !error) {
            setAppointmentToReview(data);
            setRating(0);
            setReviewModalVisible(true);
        }
    }

    // ... dentro do componente HomeScreen ...

    async function handleDismissReview() {
        if (!appointmentToReview) return;
        try {
            await supabase
                .from('appointments')
                .update({ avaliado: true })
                .eq('id', appointmentToReview.id);
        } catch (err) {
            console.error(err);
        } finally {
            setReviewModalVisible(false);
            setAppointmentToReview(null);
            setRating(0); // Reset da nota
        }
    }

    // Função de submissão (Volta a usar o estado 'rating' global do componente)
    async function submitReview() {
        if (rating === 0) return; // Proteção extra

        setSubmittingReview(true);
        try {
            const { error: reviewError } = await supabase.from('reviews').insert({
                salon_id: appointmentToReview.salon_id,
                user_id: session?.user.id,
                rating: rating, // Usa o estado visual selecionado
            });
            if (reviewError) throw reviewError;

            const { error: updateError } = await supabase
                .from('appointments')
                .update({ avaliado: true })
                .eq('id', appointmentToReview.id);

            if (updateError) throw updateError;

            Alert.alert("Obrigado!", "A tua avaliação foi registada.");
            fetchSalons();

        } catch (error: any) {
            Alert.alert("Erro", "Não foi possível enviar: " + error.message);
        } finally {
            setSubmittingReview(false);
            setReviewModalVisible(false);
            setAppointmentToReview(null);
            setRating(0); // Reset da nota
        }
    }

    async function fetchUnreadCount(userId: string) {
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('read', false);

        if (!error && count !== null) {
            setUnreadCount(count);
        }
    }

    function calculateDistancesAndSort(salonsData: any[], location: Location.LocationObject) {
        return salonsData.map((salon) => {
            let distance = null;
            if (salon.latitude && salon.longitude && location) {
                distance = getDistanceFromLatLonInKm(
                    location.coords.latitude,
                    location.coords.longitude,
                    salon.latitude,
                    salon.longitude
                );
            }
            return { ...salon, distance };
        }).sort((a, b) => {
            // Se algum não tiver distância (erro de GPS), vai para o fim
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;

            // --- LÓGICA DE SCORE COMBINADO ---
            // Objetivo: Menor Score = Melhor Posição

            // 1. Tratamento da Avaliação (Converter "Novo" para 0 ou uma média baixa para não passar à frente injustamente)
            const getRatingVal = (r: any) => (r === 'Novo' || !r) ? 2.5 : Number(r); // Assumimos 2.5 para novos para não ficarem em último absoluto

            const ratingA = getRatingVal(a.averageRating);
            const ratingB = getRatingVal(b.averageRating);

            // 2. Fórmula: Distância + (Penalização por má avaliação)
            // A penalização é: (5 - rating). 
            // - Um salão 5 estrelas tem penalização 0. A sua distância real conta.
            // - Um salão 1 estrela tem penalização 4. É como se estivesse 4km mais longe.
            const scoreA = a.distance + (5 - ratingA);
            const scoreB = b.distance + (5 - ratingB);

            return scoreA - scoreB;
        });
    }

    // --- FETCH SALONS (CORRIGIDO PARA CAPTURAR O MOTIVO) ---
    async function fetchSalons() {
        // --- ALTERADO: Adicionado .eq('is_visible', true) ---
        const { data } = await supabase
            .from('salons')
            .select('*, reviews(rating), salon_closures(start_date, end_date, motivo)')
            .eq('is_visible', true); // <--- ESTA LINHA FILTRA OS INVISÍVEIS

        if (data) {
            // ... (resto do código mantém-se igual)
            let processedSalons = data.map((salon: any) => {
                const reviews = salon.reviews || [];
                let avg: number | string = "Novo";
                if (reviews.length > 0) {
                    const total = reviews.reduce((acc: number, r: any) => acc + r.rating, 0);
                    avg = (total / reviews.length).toFixed(1);
                }

                // --- LÓGICA ATUALIZADA ---
                const today = new Date().toISOString().split('T')[0];

                // Procura especificamente o fecho ativo hoje
                const activeClosure = salon.salon_closures?.find((c: any) => today >= c.start_date && today <= c.end_date);

                const isClosed = !!activeClosure; // True se encontrou, False se não
                // Guarda o motivo em maiúsculas (Ex: "FÉRIAS", "FERIADOS") ou vazio
                const closureReason = activeClosure ? activeClosure.motivo.toUpperCase() : '';

                return { ...salon, averageRating: avg, isClosed, closureReason };
            });

            if (locationRef.current) {
                processedSalons = calculateDistancesAndSort(processedSalons, locationRef.current);
            }

            setSalons(processedSalons);
        }
        setLoading(false);
    }

  function filterData() {
        let result = salons;

        // Filtro Categoria
        if (selectedCategory !== 'Todos') {
            result = result.filter(s => s.categoria && s.categoria.includes(selectedCategory));
        }

        // Filtro Público
        if (!selectedAudiences.includes('Todos')) {
            result = result.filter(s => selectedAudiences.includes(s.publico));
        }
        
        // Filtro Texto
        if (searchText !== '') {
            const lowerText = searchText.toLowerCase();
            result = result.filter(s => s.nome_salao.toLowerCase().includes(lowerText) || s.cidade.toLowerCase().includes(lowerText));
        }

        // [NOVO] Filtro Avaliação
        if (minRating > 0) {
            result = result.filter(s => {
                // Se for "Novo", assumimos que não passa no filtro de "Melhores"
                if (s.averageRating === 'Novo' || !s.averageRating) return false;
                
                // Converte string "4.8" para número 4.8 e compara
                return parseFloat(s.averageRating) >= minRating;
            });
        }
        
        setFilteredSalons(result);
        setVisibleLimit(10); // Reset da paginação
    }

    // [ATUALIZADO] Verifica se há algum filtro ativo (incluindo rating)
    const hasActiveFilters = selectedCategory !== 'Todos' || !selectedAudiences.includes('Todos') || minRating > 0;

    const headerTextOpacity = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE * 0.5],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    const headerTextTranslateY = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [0, -30],
        extrapolate: 'clamp',
    });

    const FINAL_SEARCH_WIDTH = SCREEN_WIDTH - 40 - BTN_SIZE - 15;
    const searchBarWidth = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [SCREEN_WIDTH - 40, FINAL_SEARCH_WIDTH],
        extrapolate: 'clamp',
    });

    const searchContainerTranslateY = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [0, -75],
        extrapolate: 'clamp',
    });

    const headerBgColor = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: ['rgba(248, 249, 250, 1)', 'rgba(248, 249, 250, 0)'],
        extrapolate: 'clamp',
    });

    const renderSalonItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/salon/${item.id}`)}
            activeOpacity={0.95}
        >
            <Image source={{ uri: item.imagem || 'https://via.placeholder.com/400x300' }} style={styles.cardImage} />

            <View style={styles.badgesContainer}>
                {item.categoria && item.categoria.split(',').map((cat: string, index: number) => (
                    <View key={index} style={styles.categoryPill}>
                        <Text style={styles.categoryPillText}>{cat.trim()}</Text>
                    </View>
                ))}
            </View>

            <View style={styles.ratingBadge}>
                <Ionicons name="star" size={12} color="#FFD700" />
                <Text style={styles.ratingText}>{item.averageRating}</Text>
            </View>

            {/* --- BADGE DE AUSÊNCIA DINÂMICO --- */}
            {item.isClosed && (
                <View style={styles.closedBadge}>
                    {/* Mostra o motivo guardado (Ex: FERIADOS) ou FECHADO por defeito */}
                    <Text style={styles.closedBadgeText}>{item.closureReason || 'FECHADO'}</Text>
                </View>
            )}

            {/* --- BADGE DE DISTÂNCIA --- */}
            {item.distance !== null && item.distance !== undefined && (
                <View style={[
                    styles.distanceBadge,
                    // Empurra para baixo se tiver o badge de ausência
                    item.isClosed && { top: 80 }
                ]}>
                    <Ionicons name="navigate" size={10} color="white" />
                    <Text style={styles.distanceText}>~{item.distance.toFixed(1)} km</Text>
                </View>
            )}

            <View style={styles.cardContent}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={styles.cardTitle}>{item.nome_salao}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </View>
                <View style={styles.locationRow}>
                    <Ionicons name="location-sharp" size={14} color="#666" />
                    <Text style={styles.cardLocation}>{item.cidade}</Text>
                    <Text style={[styles.cardLocation, { color: '#999', fontWeight: '400' }]}> • {item.publico}</Text>
                </View>
                <Text style={styles.cardAddress} numberOfLines={1}>{item.morada}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>

            <StatusBar style="dark" />

            <Animated.View style={[styles.headerWrapper, { backgroundColor: headerBgColor }]}>
                <View style={styles.headerContent}>

                    <Animated.View
                        style={{
                            opacity: headerTextOpacity,
                            transform: [{ translateY: headerTextTranslateY }],
                            height: HEADER_INITIAL_HEIGHT,
                            justifyContent: 'center',
                            marginTop: 55,
                            marginBottom: 10
                        }}
                    >
                        <Text style={styles.headerTitle} numberOfLines={1}>Explorar</Text>
                        <Text style={styles.headerSubtitle} numberOfLines={1}>Encontra o melhor profissional.</Text>
                    </Animated.View>

                    <View style={styles.absoluteNotifBtn}>
                        {session ? (
                            <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.notificationBtn}>
                                <Ionicons name="notifications-outline" size={24} color="#333" />

                                {/* --- INÍCIO DO CÓDIGO DA BADGE --- */}
                                {notificationCount > 0 && (
                                    <View style={{
                                        position: 'absolute',
                                        top: -5,
                                        right: -5,
                                        backgroundColor: '#FF3B30',
                                        borderRadius: 10,
                                        minWidth: 18,
                                        height: 18,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        borderWidth: 1.5,
                                        borderColor: 'white'
                                    }}>
                                        <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                                            {notificationCount > 9 ? '9+' : notificationCount}
                                        </Text>
                                    </View>
                                )}
                                {/* --- FIM DO CÓDIGO DA BADGE --- */}
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/login')}>
                                <Text style={styles.loginText}>Entrar</Text>
                                <Ionicons name="log-in-outline" size={20} color="white" />
                            </TouchableOpacity>
                        )}
                    </View>

                    <Animated.View
                        style={[
                            styles.searchRow,
                            {
                                width: searchBarWidth,
                                transform: [{ translateY: searchContainerTranslateY }]
                            }
                        ]}
                    >
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={20} color="#666" style={{ marginRight: 8 }} />
                            <TextInput
                                placeholder="Pesquisar..."
                                placeholderTextColor="#999"
                                style={styles.searchInput}
                                value={searchText}
                                onChangeText={setSearchText}
                            />
                            {searchText.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchText('')}>
                                    <Ionicons name="close-circle" size={18} color="#ccc" />
                                </TouchableOpacity>
                            )}
                        </View>

                        <TouchableOpacity
                            style={[styles.filterButton, (hasActiveFilters) && styles.filterButtonActive]}
                            onPress={() => setFilterModalVisible(true)}
                        >
                            <Ionicons name="options-outline" size={22} color={(hasActiveFilters) ? "white" : "#333"} />
                        </TouchableOpacity>
                    </Animated.View>

                </View>
            </Animated.View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color="#333" /></View>
            ) : (
                <Animated.FlatList
                    data={filteredSalons.slice(0, visibleLimit)}
                    keyExtractor={(item: any) => item.id.toString()}
                    renderItem={renderSalonItem}
                    contentContainerStyle={{ padding: 20, paddingTop: HEADER_INITIAL_HEIGHT + LIST_TOP_PADDING, paddingBottom: 120 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSalons} progressViewOffset={HEADER_INITIAL_HEIGHT + LIST_TOP_PADDING} />}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    onEndReached={() => {
                        if (visibleLimit < filteredSalons.length) {
                            setVisibleLimit(prev => prev + 10);
                        }
                    }}
                    onEndReachedThreshold={0.5}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="search-outline" size={50} color="#ddd" />
                            <Text style={{ color: '#999', marginTop: 10 }}>Nenhum salão encontrado.</Text>
                        </View>
                    }
                />
            )}

            <Modal
                animationType="fade"
                transparent={true}
                visible={filterModalVisible}
                onRequestClose={() => setFilterModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Filtros</Text>
                            <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>
                        <View style={{ paddingVertical: 10 }}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.filterSectionTitle}>Categoria</Text>
                                {selectedCategory !== 'Todos' && (
                                    <TouchableOpacity onPress={() => setSelectedCategory('Todos')}>
                                        <Text style={styles.clearBtnText}>Limpar</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={styles.chipsContainer}>
                                {CATEGORIES.map((cat) => (
                                    <TouchableOpacity key={cat} style={[styles.chip, selectedCategory === cat && styles.chipActive]} onPress={() => setSelectedCategory(cat)}>
                                        <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* --- NOVA SECÇÃO AVALIAÇÃO --- */}
                            <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                                <Text style={styles.filterSectionTitle}>Avaliação Mínima</Text>
                                {minRating > 0 && (
                                    <TouchableOpacity onPress={() => setMinRating(0)}>
                                        <Text style={styles.clearBtnText}>Limpar</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={styles.chipsContainer}>
                                {RATING_OPTIONS.map((opt) => (
                                    <TouchableOpacity 
                                        key={opt.value} 
                                        style={[styles.chip, minRating === opt.value && styles.chipActive]} 
                                        onPress={() => setMinRating(opt.value)}
                                    >
                                        {/* Adiciona uma estrela visual nos items que não são "Qualquer" */}
                                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                                            {opt.value > 0 && (
                                                <Ionicons 
                                                    name="star" 
                                                    size={12} 
                                                    color={minRating === opt.value ? "white" : "#FFD700"} 
                                                />
                                            )}
                                            <Text style={[styles.chipText, minRating === opt.value && styles.chipTextActive]}>
                                                {opt.label}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                                <Text style={styles.filterSectionTitle}>Público</Text>
                                {!selectedAudiences.includes('Todos') && (
                                    <TouchableOpacity onPress={() => setSelectedAudiences(['Todos'])}>
                                        <Text style={styles.clearBtnText}>Limpar</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={styles.chipsContainer}>
                                {AUDIENCES.map((aud) => {
                                    const isSelected = selectedAudiences.includes(aud);
                                    return (
                                        <TouchableOpacity
                                            key={aud}
                                            style={[
                                                styles.chip,
                                                isSelected && styles.chipAudienceActive
                                            ]}
                                            onPress={() => toggleAudience(aud)}
                                        >
                                            <Text style={[
                                                styles.chipText,
                                                isSelected && styles.chipTextActive
                                            ]}>
                                                {aud}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                        <TouchableOpacity style={styles.applyButton} onPress={() => setFilterModalVisible(false)}>
                            <Text style={styles.applyButtonText}>Ver Resultados</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ... código do Modal ... */}

            <Modal
                animationType="slide"
                transparent={true}
                visible={reviewModalVisible}
                onRequestClose={handleDismissReview}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.reviewModalContent}>
                        <Text style={styles.reviewTitle}>Como foi a experiência?</Text>

                        {appointmentToReview && (
                            <View style={{ alignItems: 'center', marginBottom: 20 }}>
                                <Text style={styles.reviewSalonName}>{appointmentToReview.salons?.nome_salao}</Text>
                                <Text style={styles.reviewServiceName}>{appointmentToReview.services?.nome}</Text>
                            </View>
                        )}

                        {/* ESTRELAS: Preenchem visualmente ao clicar */}
                        <View style={styles.starsContainer}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <TouchableOpacity
                                    key={star}
                                    onPress={() => setRating(star)}
                                    activeOpacity={0.7}
                                    style={{ padding: 5 }}
                                >
                                    {/* Lógica visual: Se a estrela for menor ou igual à nota atual, fica preenchida */}
                                    <Ionicons
                                        name={star <= rating ? "star" : "star-outline"}
                                        size={42}
                                        color="#FFD700"
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* BOTÃO ENVIAR: Só aparece se houver uma nota (rating > 0) */}
                        {rating > 0 && (
                            <TouchableOpacity
                                style={[styles.applyButton, { marginTop: 25, width: '100%' }]}
                                onPress={submitReview}
                                disabled={submittingReview}
                            >
                                {submittingReview ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.applyButtonText}>Enviar</Text>
                                )}
                            </TouchableOpacity>
                        )}

                        {/* BOTÃO NÃO AVALIAR */}
                        <TouchableOpacity
                            style={{ marginTop: rating > 0 ? 15 : 30, padding: 10 }}
                            onPress={handleDismissReview}
                        >
                            <Text style={{ color: '#999', fontWeight: '600', fontSize: 14 }}>
                                Não avaliar
                            </Text>
                        </TouchableOpacity>

                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },

    headerWrapper: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
        backgroundColor: '#f8f9fa',
        overflow: 'hidden'
    },
    headerContent: { paddingHorizontal: 20, paddingBottom: 10 },

    absoluteNotifBtn: {
        position: 'absolute',
        top: NOTIF_BTN_TOP,
        right: 20,
        zIndex: 20,
    },

    headerTitle: { fontSize: 32, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 16, color: '#666', marginTop: 2 },

    loginBtn: {
        backgroundColor: '#1a1a1a',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 30,
        gap: 6,
        height: BTN_SIZE
    },
    loginText: { color: 'white', fontWeight: '600', fontSize: 13 },

    notificationBtn: {
        width: BTN_SIZE, height: BTN_SIZE,
        backgroundColor: 'white',
        borderRadius: BTN_SIZE / 2,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
    },
    badge: {
        position: 'absolute', top: -2, right: -2,
        backgroundColor: '#FF3B30', minWidth: 18, height: 18, borderRadius: 9,
        justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#f8f9fa'
    },
    badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },

    searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 10 },
    searchBar: {
        flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
        borderRadius: 25, paddingHorizontal: 16, height: BTN_SIZE,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    searchInput: { flex: 1, fontSize: 15, color: '#1a1a1a', marginLeft: 5 },

    filterButton: {
        width: BTN_SIZE, height: BTN_SIZE, backgroundColor: 'white', borderRadius: 25,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    filterButtonActive: { backgroundColor: '#1a1a1a', shadowOpacity: 0.2 },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: 'white',
        width: '100%',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },

    chipsContainer: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8
    },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    filterSectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
    clearBtnText: { color: '#FF3B30', fontSize: 12, fontWeight: '600' },

    chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#f0f0f0' },
    chipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
    chipAudienceActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
    chipText: { fontWeight: '600', color: '#666', fontSize: 13 },
    chipTextActive: { color: 'white' },

    applyButton: {
        backgroundColor: '#1a1a1a', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 25
    },
    applyButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    card: { backgroundColor: 'white', borderRadius: 20, marginBottom: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
    cardImage: { width: '100%', height: 190, resizeMode: 'cover' },
    cardContent: { padding: 18 },
    cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 6 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    cardLocation: { fontSize: 14, fontWeight: '600', color: '#666' },
    cardAddress: { fontSize: 13, color: '#999' },

    badgesContainer: {
        position: 'absolute',
        top: 15,
        left: 15,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        maxWidth: '75%',
        zIndex: 10
    },
    categoryPill: {
        backgroundColor: 'rgba(0,0,0,0.85)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    categoryPillText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },

    ratingBadge: { position: 'absolute', top: 15, right: 15, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.15, elevation: 3 },
    ratingText: { fontWeight: '800', fontSize: 12, color: '#1a1a1a' },

    // --- POSIÇÃO DAS ETIQUETAS ---
    closedBadge: {
        position: 'absolute', top: 50, right: 15,
        backgroundColor: '#FF3B30',
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 8,
        shadowColor: '#000', shadowOpacity: 0.2, elevation: 3
    },
    closedBadgeText: { fontWeight: 'bold', fontSize: 10, color: 'white' },

    distanceBadge: {
        position: 'absolute', top: 48, right: 15,
        backgroundColor: '#1a1a1a',
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
        shadowColor: '#000', shadowOpacity: 0.2, elevation: 3
    },
    distanceText: { fontWeight: '600', fontSize: 10, color: 'white' },

    reviewModalContent: {
        backgroundColor: 'white',
        width: '90%',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10
    },
    reviewTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 15, textAlign: 'center' },
    reviewSalonName: { fontSize: 16, fontWeight: '600', color: '#333' },
    reviewServiceName: { fontSize: 14, color: '#666', marginTop: 2 },
    starsContainer: { flexDirection: 'row', gap: 8, marginVertical: 10 },
});