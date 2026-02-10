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
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    RefreshControl,
    ScrollView, // Importante: Adicionado ScrollView
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    UIManager,
    View
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
const BTN_SIZE = 40;
const LIST_TOP_PADDING = 150; // AUMENTADO para caber o carrossel

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

    const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;

    const [locationModalVisible, setLocationModalVisible] = useState(false);
    const [manualLocationText, setManualLocationText] = useState('');
    const [isLocating, setIsLocating] = useState(false);

    // --- ESTADO DE LOCALIZAÇÃO ---
    const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
    const [address, setAddress] = useState<{ street: string; city: string } | null>(null);

    const locationRef = useRef<Location.LocationObject | null>(null);
    const scrollY = useRef(new Animated.Value(0)).current;

    const [searchExpanded, setSearchExpanded] = useState(false);
    const searchInputRef = useRef<TextInput>(null);

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

    useEffect(() => {
        locationRef.current = userLocation;
    }, [userLocation]);

    // [CONFIGURAÇÃO DO GESTO REFINADA]
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,

            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 0;
            },

            onPanResponderGrant: () => {
                slideAnim.extractOffset();
            },

            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    slideAnim.setValue(gestureState.dy);
                }
            },

            onPanResponderRelease: (_, gestureState) => {
                slideAnim.flattenOffset();

                if (gestureState.dy > 100 || gestureState.vy > 0.5) {
                    closeLocationModal();
                } else {
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        bounciness: 0,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    const openLocationModal = () => {
        setLocationModalVisible(true);
        slideAnim.setValue(Dimensions.get('window').height);
        Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    };

    const closeLocationModal = () => {
        Keyboard.dismiss(); // Garante que o teclado fecha ao fechar o modal
        Animated.timing(slideAnim, {
            toValue: Dimensions.get('window').height,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            setLocationModalVisible(false);
            slideAnim.setValue(Dimensions.get('window').height);
        });
    };

    async function getCurrentLocation() {
        setIsLocating(true);
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permissão negada', 'Precisamos da localização para encontrar salões perto de ti.');
                setAddress({ street: 'Localização indisponível', city: '' });
                return;
            }

            let location = await Location.getCurrentPositionAsync({});
            setUserLocation(location);

            let geocode = await Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude
            });

            if (geocode.length > 0) {
                const place = geocode[0];
                setAddress({
                    street: place.street || place.name || 'Minha Localização',
                    city: place.city || place.subregion || place.region || ''
                });
            }
        } catch (error) {
            console.log("Erro ao obter GPS:", error);
            Alert.alert("Erro", "Não foi possível obter a localização GPS.");
        } finally {
            setIsLocating(false);
            closeLocationModal();
        }
    }

    async function handleManualLocationSubmit() {
        if (manualLocationText.trim() === '') return;

        setIsLocating(true);
        try {
            let geocodeResult = await Location.geocodeAsync(manualLocationText);

            if (geocodeResult.length > 0) {
                const { latitude, longitude } = geocodeResult[0];

                setUserLocation({
                    coords: {
                        latitude,
                        longitude,
                        altitude: null,
                        accuracy: null,
                        altitudeAccuracy: null,
                        heading: null,
                        speed: null
                    },
                    timestamp: Date.now()
                });

                let reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
                if (reverseGeocode.length > 0) {
                    const place = reverseGeocode[0];
                    setAddress({
                        street: place.street || place.name || manualLocationText,
                        city: place.city || place.subregion || place.region || ''
                    });
                } else {
                    setAddress({ street: manualLocationText, city: '' });
                }

                setManualLocationText('');
                closeLocationModal();
            } else {
                Alert.alert("Não encontrado", "Não conseguimos encontrar essa localização.");
            }
        } catch (error) {
            Alert.alert("Erro", "Falha ao pesquisar localização.");
        } finally {
            setIsLocating(false);
        }
    }

    useEffect(() => {
        getCurrentLocation();
        checkUserGenderAndFetch();

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchSalons();
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
            .eq('read', false);
        setNotificationCount(count || 0);
    }

    useFocusEffect(
        useCallback(() => {
            fetchNotificationCount();
        }, [])
    );

    useEffect(() => {
        let channel: any;
        async function setupRealtimeBadge() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            channel = supabase
                .channel('client_home_badge')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'notifications'
                    },
                    (payload: any) => {
                        const userId = payload.new?.user_id || payload.old?.user_id;
                        if (userId === user.id) {
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
            setRating(0);
        }
    }

    async function submitReview() {
        if (rating === 0) return;
        setSubmittingReview(true);
        try {
            const { error: reviewError } = await supabase.from('reviews').insert({
                salon_id: appointmentToReview.salon_id,
                user_id: session?.user.id,
                rating: rating,
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
            setRating(0);
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
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            const getRatingVal = (r: any) => (r === 'Novo' || !r) ? 2.5 : Number(r);
            const ratingA = getRatingVal(a.averageRating);
            const ratingB = getRatingVal(b.averageRating);
            const scoreA = a.distance + (5 - ratingA);
            const scoreB = b.distance + (5 - ratingB);
            return scoreA - scoreB;
        });
    }

    async function fetchSalons() {
        const { data } = await supabase
            .from('salons')
            .select('*, reviews(rating), salon_closures(start_date, end_date, motivo)')
            .eq('is_visible', true);

        if (data) {
            let processedSalons = data.map((salon: any) => {
                const reviews = salon.reviews || [];
                let avg: number | string = "Novo";
                if (reviews.length > 0) {
                    const total = reviews.reduce((acc: number, r: any) => acc + r.rating, 0);
                    avg = (total / reviews.length).toFixed(1);
                }
                const today = new Date().toISOString().split('T')[0];
                const activeClosure = salon.salon_closures?.find((c: any) => today >= c.start_date && today <= c.end_date);
                const isClosed = !!activeClosure;
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
        if (selectedCategory !== 'Todos') {
            result = result.filter(s => s.categoria && s.categoria.includes(selectedCategory));
        }
        if (!selectedAudiences.includes('Todos')) {
            result = result.filter(s => selectedAudiences.includes(s.publico));
        }
        if (searchText !== '') {
            const lowerText = searchText.toLowerCase();
            result = result.filter(s => s.nome_salao.toLowerCase().includes(lowerText) || s.cidade.toLowerCase().includes(lowerText));
        }
        if (minRating > 0) {
            result = result.filter(s => {
                if (s.averageRating === 'Novo' || !s.averageRating) return false;
                return parseFloat(s.averageRating) >= minRating;
            });
        }
        setFilteredSalons(result);
        setVisibleLimit(10);
    }

    const hasActiveFilters = selectedCategory !== 'Todos' || !selectedAudiences.includes('Todos') || minRating > 0;

    const headerTextOpacity = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE * 0.4],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    const headerTextTranslateY = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [0, -30],
        extrapolate: 'clamp',
    });

    const searchContainerTranslateY = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [0, -80],
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

            {item.isClosed && (
                <View style={styles.closedBadge}>
                    <Text style={styles.closedBadgeText}>{item.closureReason || 'FECHADO'}</Text>
                </View>
            )}

            {item.distance !== null && item.distance !== undefined && (
                <View style={[
                    styles.distanceBadge,
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

                    {searchExpanded ? (
                        /* --- MODO 1: BARRA DE PESQUISA EXPANDIDA (Ocupa toda a largura) --- */
                        <View style={styles.searchBarExpanded}>
                            <Ionicons name="search" size={20} color="#1a1a1a" />
                            <TextInput
                                ref={searchInputRef}
                                placeholder="Pesquisar salão ou serviço..."
                                placeholderTextColor="#999"
                                style={styles.searchInput}
                                value={searchText}
                                onChangeText={setSearchText}
                            />
                            <TouchableOpacity onPress={() => {
                                setSearchExpanded(false);
                                setSearchText('');
                                Keyboard.dismiss();
                            }}>
                                <View style={styles.closeBtnSmall}>
                                    <Ionicons name="close" size={20} color="#666" />
                                </View>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        /* --- MODO 2: LOCALIZAÇÃO (Esq) + BOTÕES (Dir) --- */
                        <View style={styles.headerRow}>

                            {/* LADO ESQUERDO: INFORMAÇÃO DE LOCALIZAÇÃO */}
                            <Animated.View
                                style={[
                                    styles.locationColumn,
                                    {
                                        opacity: headerTextOpacity,
                                        transform: [{ translateY: headerTextTranslateY }]
                                    }
                                ]}
                            >
                                <TouchableOpacity
                                    activeOpacity={0.6}
                                    onPress={openLocationModal}
                                    style={styles.locationLabelRow}
                                >
                                    <Text style={styles.headerLocationLabel}>Localização atual</Text>
                                    <Ionicons name="chevron-down" size={10} color="#666" />
                                </TouchableOpacity>

                                <View style={styles.addressRow}>
                                    <Ionicons name="location" size={18} color="#1a1a1a" />
                                    <Text
                                        style={styles.headerTitleAddress}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                    >
                                        {address?.street || 'A localizar...'}
                                    </Text>
                                </View>
                                <Text style={styles.cityText} numberOfLines={1}>{address?.city}</Text>
                            </Animated.View>

                            {/* LADO DIREITO: 3 BOTÕES AGRUPADOS */}
                            <View style={styles.rightButtonsRow}>
                                {/* Pesquisa */}
                                <TouchableOpacity
                                    style={styles.miniButton}
                                    onPress={() => {
                                        setSearchExpanded(true);
                                        setTimeout(() => searchInputRef.current?.focus(), 100);
                                    }}
                                >
                                    <Ionicons name="search" size={20} color="#1a1a1a" />
                                </TouchableOpacity>

                                {/* Filtros */}
                                <TouchableOpacity
                                    style={[styles.miniButton, hasActiveFilters && styles.miniButtonActive]}
                                    onPress={() => setFilterModalVisible(true)}
                                >
                                    <Ionicons name="options-outline" size={20} color={hasActiveFilters ? "white" : "#1a1a1a"} />
                                </TouchableOpacity>

                                {/* Notificações */}
                                <TouchableOpacity
                                    style={styles.miniButton}
                                    onPress={() => router.push('/notifications')}
                                >
                                    <Ionicons name="notifications-outline" size={20} color="#1a1a1a" />
                                    {notificationCount > 0 && (
                                        <View style={styles.badgeCommon}>
                                            <Text style={styles.badgeTextCommon}>
                                                {notificationCount > 9 ? '9+' : notificationCount}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* --- NOVO: CARROSSEL DE CATEGORIAS --- */}
                    <View style={styles.categoriesWrapper}>
                        <ScrollView 
                            horizontal 
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.categoriesScroll}
                        >
                            {CATEGORIES.map((cat) => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[
                                        styles.categoryChip,
                                        selectedCategory === cat && styles.categoryChipActive
                                    ]}
                                    onPress={() => setSelectedCategory(cat)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.categoryChipText,
                                        selectedCategory === cat && styles.categoryChipTextActive
                                    ]}>
                                        {cat}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

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

            {/* MODAL FILTROS */}
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
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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

            {/* MODAL REVIEW */}
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
                        <View style={styles.starsContainer}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <TouchableOpacity
                                    key={star}
                                    onPress={() => setRating(star)}
                                    activeOpacity={0.7}
                                    style={{ padding: 5 }}
                                >
                                    <Ionicons
                                        name={star <= rating ? "star" : "star-outline"}
                                        size={42}
                                        color="#FFD700"
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>
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

            {/* --- MODAL DE ALTERAR LOCALIZAÇÃO (ACTION SHEET) --- */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={locationModalVisible}
                onRequestClose={closeLocationModal}
            >
                <View style={styles.actionSheetContainer}>
                    <TouchableWithoutFeedback onPress={closeLocationModal}>
                        <View style={styles.actionSheetOverlay} />
                    </TouchableWithoutFeedback>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "padding"}
                        style={{ width: '100%', justifyContent: 'flex-end', flex: 1, pointerEvents: 'box-none' }}
                        keyboardVerticalOffset={0}
                    >
                        <Animated.View
                            style={[
                                styles.actionSheetWrapper,
                                {
                                    transform: [{ translateY: slideAnim }]
                                }
                            ]}
                        >
                            <View style={styles.actionSheetContent}>

                                {/* CABEÇALHO ARRASTÁVEL */}
                                <View
                                    {...panResponder.panHandlers}
                                    style={styles.draggableHeader}
                                >
                                    <View style={styles.sheetHandle} />
                                    <Text style={styles.sheetTitle}>Alterar localização</Text>
                                    <Text style={styles.sheetSubtitle}>Vê salões numa área diferente</Text>
                                </View>

                                {/* CORPO */}
                                <View style={styles.contentBody}>
                                    <TouchableOpacity
                                        style={styles.gpsButton}
                                        onPress={getCurrentLocation}
                                        disabled={isLocating}
                                    >
                                        <View style={styles.gpsIconContainer}>
                                            <Ionicons name="navigate" size={20} color="#007AFF" />
                                        </View>
                                        <View>
                                            <Text style={styles.gpsButtonText}>Usar localização atual</Text>
                                            <Text style={styles.gpsButtonSubText}>Ativar GPS</Text>
                                        </View>
                                        {isLocating && <ActivityIndicator size="small" color="#007AFF" style={{ marginLeft: 'auto' }} />}
                                    </TouchableOpacity>

                                    <View style={styles.divider}>
                                        <Text style={styles.dividerText}>OU</Text>
                                    </View>

                                    <View style={styles.locationInputContainer}>
                                        <Ionicons name="search" size={20} color="#999" style={{ marginLeft: 10 }} />
                                        <TextInput
                                            placeholder="Rua, Cidade ou Código Postal"
                                            style={styles.locationInput}
                                            placeholderTextColor="#999"
                                            value={manualLocationText}
                                            onChangeText={setManualLocationText}
                                            onSubmitEditing={handleManualLocationSubmit}
                                            returnKeyType="search"
                                        />
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.applyButton, { marginTop: 15, opacity: manualLocationText ? 1 : 0.5 }]}
                                        onPress={handleManualLocationSubmit}
                                        disabled={!manualLocationText || isLocating}
                                    >
                                        {isLocating ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <Text style={styles.applyButtonText}>Pesquisar Área</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </Animated.View>
                    </KeyboardAvoidingView>
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
    headerContent: {
        paddingHorizontal: 20,
        paddingBottom: 10,
        paddingTop: 55, // Espaço para a StatusBar
        minHeight: 110, // Garante altura mínima estável
        justifyContent: 'flex-end'
    },

    headerLocationLabel: { fontSize: 11, color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    headerTitleAddress: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1a1a1a',
        flex: 1 // Garante que trunca se for muito grande
    },
    headerSubtitleCity: { fontSize: 14, color: '#666', marginLeft: 26, fontWeight: '500' },

    headerTitle: { fontSize: 32, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 16, color: '#666', marginTop: 2 },

    // --- NOVOS ESTILOS PARA ACTION ROW UNIFICADA ---
    actionRow: {
        marginTop: 10,
        height: 50,
        justifyContent: 'center'
    },

    toolsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 4
    },

    iconButton: {
        width: 44,
        height: 44,
        backgroundColor: 'white',
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
    },

    iconButtonActive: {
        backgroundColor: '#1a1a1a',
    },

    searchBarExpanded: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 16,
        paddingHorizontal: 12,
        height: 46, // Altura confortável
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
    },

    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#1a1a1a',
        marginLeft: 10,
        height: '100%'
    },

    closeBtnSmall: {
        backgroundColor: '#f0f0f0',
        padding: 4,
        borderRadius: 12,
    },

    badgeCommon: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#FF3B30',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#f8f9fa'
    },
    badgeTextCommon: {
        color: 'white',
        fontSize: 9,
        fontWeight: 'bold'
    },

    // --- ESTILOS DE MODAIS E OUTROS COMPONENTES ---

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

    // ACTION SHEET STYLES
    actionSheetContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    actionSheetOverlay: {
        position: 'absolute',
        top: 0, bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    rightButtonsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8, // Espaço entre os botões
    },
    actionSheetWrapper: {
        width: '100%',
        justifyContent: 'flex-end',
    },
    actionSheetContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 25,
        borderTopRightRadius: 25,
        // SEM PADDING GLOBAL AQUI
        padding: 0,
        paddingBottom: 40,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
        overflow: 'hidden'
    },

    draggableHeader: {
        width: '100%',
        backgroundColor: 'white',
        padding: 24,
        paddingBottom: 10,
        alignItems: 'center',
    },

    contentBody: {
        paddingHorizontal: 24,
        paddingBottom: 10,
    },

    sheetHandle: {
        width: 40,
        height: 5,
        backgroundColor: '#e0e0e0',
        borderRadius: 3,
        marginBottom: 20,
    },
    sheetTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginBottom: 4,
    },
    sheetSubtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 24,
    },
    locationLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 2
    },
    miniButton: {
        width: 40,
        height: 40,
        backgroundColor: 'white',
        borderRadius: 14, // Quadrado arredondado (squircle) fica mais moderno que circulo aqui
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#f0f0f0'
    },
    miniButtonActive: {
        backgroundColor: '#1a1a1a',
        borderColor: '#1a1a1a',
    },
    gpsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#f0f8ff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#d0e8ff',
        marginBottom: 20,
    },
    gpsIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },
    gpsButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#007AFF',
    },
    gpsButtonSubText: {
        fontSize: 12,
        color: '#5ac8fa',
        marginTop: 2,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 10
    },
    locationColumn: {
        flex: 1, // Ocupa o espaço disponível
        marginRight: 15, // Afasta dos botões
        justifyContent: 'center',
    },
    dividerText: {
        color: '#999',
        fontSize: 12,
        fontWeight: '600',
        width: '100%',
        textAlign: 'center'
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    locationInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 16,
        height: 54,
        borderWidth: 1,
        borderColor: '#eeeeee',
    },
    cityText: {
        fontSize: 12,
        color: '#888',
        fontWeight: '500',
        marginLeft: 22, // Alinha com o texto da rua (ignora o icon)
        marginTop: 1
    },
    locationInput: {
        flex: 1,
        height: '100%',
        paddingHorizontal: 12,
        fontSize: 16,
        color: '#1a1a1a',
    },

    // --- ESTILOS DO CARROSSEL DE CATEGORIAS ---
    categoriesWrapper: {
        marginTop: 15,
        marginHorizontal: -20, // Compensa o padding do pai para ir até à borda
    },
    categoriesScroll: {
        paddingHorizontal: 20, // Devolve o padding ao conteúdo interno
        paddingBottom: 10,     // Espaço para a sombra não cortar
        gap: 10,               // Espaço entre as pílulas
    },
    categoryChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#e5e5e5',
        // Sombra suave
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    categoryChipActive: {
        backgroundColor: '#1a1a1a',
        borderColor: '#1a1a1a',
    },
    categoryChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },
    categoryChipTextActive: {
        color: 'white',
    },
});