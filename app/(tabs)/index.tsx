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
    ScrollView,
    Share,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// --- CONSTANTES ---
const CATEGORIES = ['Todos', 'Cabeleireiro', 'Barbearia', 'Unhas', 'Estética'];
const AUDIENCES = ['Homem', 'Mulher'];
const RATING_OPTIONS = [
    { label: '3.0 +', value: 3.0 },
    { label: '4.0 +', value: 4.0 },
    { label: '4.5 +', value: 4.5 },
];

// --- CALIBRAÇÃO ---
const SCROLL_DISTANCE = 100;
const HEADER_INITIAL_HEIGHT = 80;
const BTN_SIZE = 40;
const LIST_TOP_PADDING = 50;

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

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

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
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('Todos');
    const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [appointmentToReview, setAppointmentToReview] = useState<any>(null);
    const [rating, setRating] = useState(0);
    const [submittingReview, setSubmittingReview] = useState(false);
    const [notificationCount, setNotificationCount] = useState(0);

    const [showScrollTop, setShowScrollTop] = useState(false);
    const fabOpacity = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef<any>(null);



    const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

    // Ref para controlar qual modal está ativo para o PanResponder
    const activeModal = useRef<'location' | 'filter' | null>(null);

    useEffect(() => {
        locationRef.current = userLocation;
    }, [userLocation]);

    useEffect(() => {
        Animated.timing(fabOpacity, {
            toValue: showScrollTop ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [showScrollTop]);

    // Animação da opacidade do overlay
    const overlayOpacity = slideAnim.interpolate({
        inputRange: [0, SCREEN_HEIGHT],
        outputRange: [1, 0],
        extrapolate: 'clamp'
    });

    const headerTranslateY = scrollY.interpolate({
        inputRange: [0, 140],
        outputRange: [0, -140],
        extrapolate: 'clamp',
    });

    const scrollToTop = () => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    };

    useEffect(() => {
        const listenerId = scrollY.addListener(({ value }) => {
            const threshold = 300;
            // Correção de performance: verifica o estado atual antes de alterar
            if (value > threshold && !showScrollTop) {
                setShowScrollTop(true);
            } else if (value <= threshold && showScrollTop) {
                setShowScrollTop(false);
            }
        });

        return () => {
            scrollY.removeListener(listenerId);
        };
    }, [showScrollTop]); // Dependência importante

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,

            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
            },

            onPanResponderGrant: () => {
                slideAnim.stopAnimation();
                slideAnim.setOffset(0);
                // Não definimos valor aqui para evitar saltos visuais se a animação estiver a meio
            },

            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    slideAnim.setValue(gestureState.dy);
                } else {
                    slideAnim.setValue(gestureState.dy * 0.1);
                }
            },

            onPanResponderRelease: (_, gestureState) => {
                slideAnim.flattenOffset();

                const shouldClose = gestureState.dy > SCREEN_HEIGHT * 0.25 || gestureState.vy > 0.5;

                if (shouldClose) {
                    if (activeModal.current === 'location') closeLocationModal();
                    else if (activeModal.current === 'filter') closeFilterModal();
                } else {
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        bounciness: 4,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    const openLocationModal = () => {
        activeModal.current = 'location';
        setLocationModalVisible(true);
        slideAnim.setValue(SCREEN_HEIGHT);
        Animated.spring(slideAnim, {
            toValue: 0,
            bounciness: 4,
            useNativeDriver: true,
        }).start();
    };

    const closeLocationModal = () => {
        Keyboard.dismiss();
        Animated.timing(slideAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setLocationModalVisible(false);
            activeModal.current = null;
        });
    };

    const openFilterModal = () => {
        activeModal.current = 'filter';
        setFilterModalVisible(true);
        slideAnim.setValue(SCREEN_HEIGHT);
        Animated.spring(slideAnim, {
            toValue: 0,
            bounciness: 4,
            useNativeDriver: true,
        }).start();
    };

    const closeFilterModal = () => {
        Animated.timing(slideAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setFilterModalVisible(false);
            activeModal.current = null;
        });
    };

    const carouselHeight = scrollY.interpolate({
        inputRange: [0, 50],
        outputRange: [48, 0], // <--- Mude para 48 (Compromisso perfeito entre Clean e Funcional)
        extrapolate: 'clamp',
    });

    const carouselOpacity = scrollY.interpolate({
        inputRange: [0, 30], // Desaparece um pouco mais rápido que a altura
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

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


    const handleShareInvite = async () => {
        try {
            await Share.share({
                message:
                    'Olá! Gostava muito de ver o vosso salão na FindIt para poder agendar online. É a melhor app de agendamentos! 🚀\n\nDescarreguem aqui: https://findit.pt (Link Simulado)',
            });
        } catch (error: any) {
            Alert.alert(error.message);
        }
    };

    async function handleManualLocationSubmit() {
        if (manualLocationText.trim() === '') return;

        setIsLocating(true);
        try {
            // --- CORREÇÃO AQUI ---
            // Adicionamos ", Portugal" para forçar o contexto geográfico.
            // Isto resolve o problema de "Avis" (que confundia com a marca)
            // e ajuda em nomes repetidos noutros países (ex: Braga).
            const searchQuery = manualLocationText.toLowerCase().includes('portugal')
                ? manualLocationText
                : `${manualLocationText}, Portugal`;

            // Usamos a searchQuery em vez do texto original
            let geocodeResult = await Location.geocodeAsync(searchQuery);

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

                // Aqui continuamos a usar as coordenadas para obter o nome "bonito"
                let reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });

                if (reverseGeocode.length > 0) {
                    const place = reverseGeocode[0];
                    const cityDetected = place.city || place.subregion || place.region || place.name || '';

                    setAddress({
                        street: cityDetected || manualLocationText, // Usa o nome oficial devolvido (ex: Avis)
                        city: cityDetected
                    });
                } else {
                    setAddress({ street: manualLocationText, city: '' });
                }

                setManualLocationText('');
                closeLocationModal();
            } else {
                Alert.alert("Não encontrado", "Não conseguimos encontrar essa localidade. Tente adicionar 'Portugal' ou verificar o nome.");
            }
        } catch (error) {
            console.log(error); // Bom para debug
            Alert.alert("Erro", "Falha ao pesquisar localização.");
        } finally {
            setIsLocating(false);
        }
    }

    useEffect(() => {
        getCurrentLocation();

        fetchSalons();

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
    }, [searchText, selectedCategory, selectedAudiences, salons, minRating, address]);

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
        // Se já estiver selecionado, desmarca (volta a mostrar todos)
        if (selectedAudiences.includes(audience)) {
            setSelectedAudiences([]);
        } else {
            // Se não estiver, seleciona APENAS este (substitui qualquer outro)
            setSelectedAudiences([audience]);
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

    // Função auxiliar para limpar texto (remove acentos, espaços extra e põe minúsculas)
    function normalizeText(text: string) {
        return text
            ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
            : "";
    }

    function filterData() {
        let result = salons;

        // --- 1. FILTRO DE CIDADE (PRIORITÁRIO) ---
        // Mantemos a lógica: só mostra salões da cidade onde o utilizador está
        if (address?.city) {
            const userCity = normalizeText(address.city);

            result = result.filter(s => {
                if (!s.cidade) return false;
                const salonCity = normalizeText(s.cidade);
                // Verificação flexível de cidade
                return salonCity === userCity || salonCity.includes(userCity) || userCity.includes(salonCity);
            });
        }

        // Filtro de Categoria
        if (selectedCategory !== 'Todos') {
            result = result.filter(s => s.categoria && s.categoria.includes(selectedCategory));
        }

        // Filtro de Público
        result = result.filter(s => {
            // 1. Se nada estiver selecionado, mostra TODOS (Homem, Mulher e Unissexo)
            if (selectedAudiences.length === 0) return true;

            // 2. Se for Unissexo, aparece sempre que há algum filtro de género ativo
            if (s.publico === 'Unissexo') return true;

            // 3. Caso contrário, tem de corresponder exatamente ao género selecionado
            return selectedAudiences.includes(s.publico);
        });

        // --- PESQUISA DE NOME (LÓGICA "START-OF-WORD") ---
        if (searchText !== '') {
            const lowerText = normalizeText(searchText);

            result = result.filter(s => {
                const name = normalizeText(s.nome_salao);

                // REGRA DE OURO: 
                // 1. O nome começa exatamente com o texto (ex: "Barbearia" -> "Barb")
                // 2. OU o texto aparece depois de um espaço (ex: "Barbearia Cortes" -> "Cort")
                // Isto evita que "ortes" encontre "Cortes"
                return name.startsWith(lowerText) || name.includes(' ' + lowerText);
            });
        }

        // Filtro de Rating
        if (minRating > 0) {
            result = result.filter(s => {
                if (s.averageRating === 'Novo' || !s.averageRating) return false;
                return parseFloat(s.averageRating) >= minRating;
            });
        }

        setFilteredSalons(result);
        setVisibleLimit(10);
    }

    // O filtro está ativo se tivermos uma categoria, um rating OU um género específico selecionado
    const hasActiveFilters =
        selectedCategory !== 'Todos' ||
        minRating > 0 ||
        selectedAudiences.length > 0; // <--- ALTERADO: Se > 0, é porque filtrou Homem ou Mulher

    const renderEmptyComponent = () => {
        // CENÁRIO 1: O utilizador tem filtros ativos (ex: Categoria, Rating)
        if (hasActiveFilters) {
            return (
                <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyStateIconContainer}>
                        <Ionicons name="filter-circle-outline" size={48} color="#999" />
                    </View>

                    <Text style={styles.emptyStateTitle}>Sem resultados com estes filtros</Text>
                    <Text style={styles.emptyStateDescription}>
                        Tenta reduzir os filtros ou mudar a categoria para encontrar o que procuras.
                    </Text>

                    <TouchableOpacity
                        style={styles.emptyStateButtonSecondary}
                        onPress={() => {
                            setSearchText('');
                            setSelectedCategory('Todos');
                            setMinRating(0);
                            setSelectedAudiences([]); // <--- ALTERADO: Volta a vazio (Todos)
                        }}
                    >
                        <Text style={styles.emptyStateButtonTextSecondary}>Limpar Filtros</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        // CENÁRIO 2: Growth Hacking (Sem resultados na zona geográfica)
        return (
            <View style={styles.emptyStateContainer}>
                {/* Ícone de Foguetão */}
                <View style={styles.inviteIconContainer}>
                    <Ionicons name="rocket" size={32} color="#1a1a1a" />
                </View>

                <Text style={styles.emptyStateTitle}>
                    {address?.city ? `Ainda não chegámos a ${address.city}!` : 'Ainda não chegámos aqui!'}
                </Text>

                <Text style={styles.emptyStateDescription}>
                    Não encontrámos parceiros nesta zona, mas tu podes mudar isso. Recomenda a app ao teu salão favorito!
                </Text>

                {/* Botão de Partilha Nativa */}
                <TouchableOpacity
                    style={styles.emptyStateButtonPrimary}
                    onPress={handleShareInvite}
                >
                    <Text style={styles.emptyStateButtonTextPrimary}>Partilhar com o meu Salão</Text>
                </TouchableOpacity>

                {/* Link para mudar localização */}
                <TouchableOpacity
                    style={{ marginTop: 24, padding: 8 }}
                    onPress={openLocationModal}
                >
                    <Text style={{ color: '#007AFF', fontWeight: '600', fontSize: 14 }}>
                        Procurar noutra localização
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderSalonItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/salon/${item.id}`)}
            activeOpacity={0.92}
        >
            {/* Imagem Principal */}
            <View style={styles.imageContainer}>
                <Image
                    source={{ uri: item.imagem || 'https://via.placeholder.com/400x300' }}
                    style={styles.cardImage}
                />

                <View style={styles.imageOverlay} />

                {/* Badges Superiores */}
                <View style={styles.cardHeaderBadges}>

                    {/* ESQUERDA: Container para Distância E Status */}
                    <View style={styles.badgesLeftContainer}>

                        {/* 1. Distância */}
                        {item.distance !== null && item.distance !== undefined && (
                            <View style={styles.distanceBadge}>
                                <Ionicons name="location-sharp" size={10} color="white" />
                                <Text style={styles.distanceText}>{item.distance.toFixed(1)} km</Text>
                            </View>
                        )}

                        {/* 2. Fechado/Ausência */}
                        {item.isClosed && (
                            <View style={styles.closedBadge}>
                                <Text style={styles.closedBadgeText}>{item.closureReason || 'FECHADO'}</Text>
                            </View>
                        )}
                    </View>

                    {/* DIREITA: Rating */}
                    <View style={styles.ratingBadge}>
                        {/* MUDANÇA AQUI: color="#FFD700" (Amarelo Ouro) */}
                        <Ionicons name="star" size={12} color="#FFD700" />
                        <Text style={styles.ratingText}>{item.averageRating}</Text>
                    </View>
                </View>
            </View>

            {/* Conteúdo do Card */}
            <View style={styles.cardContent}>
                <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.nome_salao}</Text>
                    <Ionicons name="arrow-forward-circle-outline" size={24} color="#1a1a1a" style={{ opacity: 0.1 }} />
                </View>

                <View style={styles.locationRow}>
                    <Ionicons name="map-outline" size={14} color="#666" />
                    <Text style={styles.cardLocation} numberOfLines={1}>
                        {item.cidade} <Text style={styles.dotSeparator}>•</Text> {item.publico}
                    </Text>
                </View>

                <Text style={styles.cardAddress} numberOfLines={1}>{item.morada}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>

            <StatusBar style="dark" />

            <Animated.View
                style={[
                    styles.headerWrapper,
                    {
                        backgroundColor: '#ffffff',
                        transform: [{ translateY: headerTranslateY }]
                    }
                ]}
            >
                <View style={styles.headerContent}>

                    {searchExpanded ? (
                        <View style={styles.searchBarExpanded}>
                            <Ionicons name="search" size={20} color="#1a1a1a" />
                            <TextInput
                                ref={searchInputRef}
                                placeholder="Nome do Salão"
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
                        <View style={styles.headerRow}>
                            {/* ALTERAÇÃO: Transformei a View 'locationColumn' num TouchableOpacity */}
                            {/* Agora clicares em QUALQUER parte (Label ou Morada) abre o modal */}
                            <TouchableOpacity
                                style={styles.locationColumn}
                                onPress={openLocationModal}
                                activeOpacity={0.6}
                            >
                                {/* Linha Superior: "Localização Atual v" */}
                                <View style={styles.locationLabelRow}>
                                    <Text style={styles.headerLocationLabel}>Localização atual</Text>
                                    <Ionicons name="chevron-down" size={12} color="#1a1a1a" />
                                </View>

                                {/* Linha da Morada (SEM O PINO) */}
                                <View style={styles.addressRow}>
                                    {/* REMOVIDO: <Ionicons name="location" ... /> */}
                                    <Text
                                        style={styles.headerTitleAddress}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                    >
                                        {address?.street || 'A localizar...'}
                                    </Text>
                                </View>

                                {/* Cidade (se diferente da rua) */}
                                {address?.city && address?.street !== address?.city && (
                                    <Text style={styles.cityText} numberOfLines={1}>
                                        {address?.city}
                                    </Text>
                                )}
                            </TouchableOpacity>

                            {/* Botões da Direita (Mantidos iguais) */}
                            <View style={styles.rightButtonsRow}>
                                <TouchableOpacity
                                    style={styles.miniButton}
                                    onPress={() => {
                                        setSearchExpanded(true);
                                        setTimeout(() => searchInputRef.current?.focus(), 100);
                                    }}
                                >
                                    <Ionicons name="search" size={20} color="#1a1a1a" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.miniButton, hasActiveFilters && styles.miniButtonActive]}
                                    onPress={openFilterModal}
                                >
                                    <Ionicons name="options-outline" size={20} color={hasActiveFilters ? "white" : "#1a1a1a"} />
                                </TouchableOpacity>

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

                    {/* --- CARROSSEL DE CATEGORIAS (ANIMADO) --- */}
                    <Animated.View
                        style={[
                            styles.categoriesWrapper,
                            {
                                height: carouselHeight,
                                opacity: carouselOpacity,
                                overflow: 'hidden',
                                marginTop: carouselOpacity.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 15]
                                })
                            }
                        ]}
                    >
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.categoriesScroll}
                            decelerationRate="normal" // <--- Adiciona isto para um scroll mais "preso" e rápido
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
                    </Animated.View>
                </View>
            </Animated.View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color="#333" /></View>
            ) : (
                <Animated.FlatList
                    ref={flatListRef}
                    data={filteredSalons.slice(0, visibleLimit)}
                    keyExtractor={(item: any) => item.id.toString()}
                    renderItem={renderSalonItem}

                    // ALTERAÇÃO AQUI: paddingBottom reduzido de 120 para 80
                    contentContainerStyle={{
                        padding: 20,
                        paddingTop: HEADER_INITIAL_HEIGHT + LIST_TOP_PADDING,
                        paddingBottom: 80
                    }}

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
                    ListEmptyComponent={renderEmptyComponent}
                />
            )}

            {/* --- BOTÃO FLUTUANTE CORRIGIDO --- */}
            <Animated.View
                style={[
                    styles.scrollTopWrapper, // Novo estilo para posição
                    {
                        opacity: fabOpacity,
                        transform: [{
                            scale: fabOpacity.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.8, 1]
                            })
                        }]
                    }
                ]}
                // pointerEvents funciona nativamente na View
                pointerEvents={showScrollTop ? 'auto' : 'none'}
            >
                <TouchableOpacity
                    style={styles.scrollTopButton} // Estilo apenas visual do botão
                    onPress={scrollToTop}
                    activeOpacity={0.8}
                >
                    <Ionicons name="arrow-up" size={24} color="white" />
                </TouchableOpacity>
            </Animated.View>
            {/* MODAL FILTROS */}
            <Modal
                animationType="none"
                transparent={true}
                visible={filterModalVisible}
                onRequestClose={closeFilterModal}
            >
                <View style={styles.actionSheetContainer}>
                    <Animated.View style={[styles.actionSheetOverlay, { opacity: overlayOpacity }]}>
                        <TouchableWithoutFeedback onPress={closeFilterModal}>
                            <View style={{ flex: 1 }} />
                        </TouchableWithoutFeedback>
                    </Animated.View>

                    <Animated.View
                        style={[
                            styles.actionSheetWrapper,
                            { transform: [{ translateY: slideAnim }] }
                        ]}
                    >
                        <View style={styles.actionSheetContent}>
                            <View {...panResponder.panHandlers} style={styles.draggableHeader}>
                                <View style={styles.sheetHandle} />
                                <Text style={styles.sheetTitle}>Filtros</Text>
                                <Text style={styles.sheetSubtitle}>Personaliza a tua pesquisa</Text>
                            </View>

                            <View style={styles.contentBody}>

                                {/* SECÇÃO: AVALIAÇÃO */}
                                {/* SECÇÃO: AVALIAÇÃO */}
                                <View style={styles.filterSection}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.filterSectionTitle}>Público-alvo</Text>
                                    </View>

                                    <View style={styles.modernChipsContainer}>
                                        {RATING_OPTIONS.map((opt) => (
                                            <TouchableOpacity
                                                key={opt.value}
                                                style={[
                                                    styles.modernChip,
                                                    minRating === opt.value && styles.modernChipActive // Estilo Ativo
                                                ]}
                                                onPress={() => {
                                                    // Lógica Toggle: Se já estiver selecionado, volta a 0. Se não, define o valor.
                                                    if (minRating === opt.value) {
                                                        setMinRating(0);
                                                    } else {
                                                        setMinRating(opt.value);
                                                    }
                                                }}
                                            >
                                                <Ionicons
                                                    name="star"
                                                    size={16}
                                                    color={minRating === opt.value ? "white" : "#FFD700"}
                                                />
                                                <Text style={[
                                                    styles.modernChipText,
                                                    minRating === opt.value && styles.modernChipTextActive
                                                ]}>
                                                    {opt.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                {/* SECÇÃO: PÚBLICO (COM ICONS) */}
                                <View style={styles.filterSection}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.filterSectionTitle}>Público-alvo</Text>
                                    </View>
                                    <View style={styles.modernChipsContainer}>
                                        {AUDIENCES.map((aud) => {
                                            const isSelected = selectedAudiences.includes(aud);
                                            let iconName: any = "people-outline";
                                            if (aud === 'Homem') iconName = "male-outline";
                                            if (aud === 'Mulher') iconName = "female-outline";

                                            return (
                                                <TouchableOpacity
                                                    key={aud}
                                                    style={[styles.modernChip, isSelected && styles.modernChipActivePrimary]}
                                                    onPress={() => toggleAudience(aud)}
                                                >
                                                    <Ionicons
                                                        name={iconName}
                                                        size={18}
                                                        color={isSelected ? "white" : "#666"}
                                                    />
                                                    <Text style={[styles.modernChipText, isSelected && styles.modernChipTextActive]}>
                                                        {aud}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                                {/* BOTÃO APLICAR */}
                                <TouchableOpacity
                                    style={styles.mainApplyButton}
                                    onPress={closeFilterModal}
                                >
                                    <Text style={styles.mainApplyButtonText}>Ver resultados</Text>
                                    <Ionicons name="arrow-forward" size={20} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Animated.View>
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
                                    <Ionicons name={star <= rating ? "star" : "star-outline"} size={42} color="#FFD700" />
                                </TouchableOpacity>
                            ))}
                        </View>
                        {rating > 0 && (
                            <TouchableOpacity
                                style={[styles.applyButton, { marginTop: 25, width: '100%' }]}
                                onPress={submitReview}
                                disabled={submittingReview}
                            >
                                {submittingReview ? <ActivityIndicator color="white" /> : <Text style={styles.applyButtonText}>Enviar</Text>}
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={{ marginTop: rating > 0 ? 15 : 30, padding: 10 }}
                            onPress={handleDismissReview}
                        >
                            <Text style={{ color: '#999', fontWeight: '600', fontSize: 14 }}>Não avaliar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* MODAL LOCATION */}
            {/* MODAL LOCATION */}
            <Modal
                animationType="none"
                transparent={true}
                visible={locationModalVisible}
                onRequestClose={closeLocationModal}
            >
                <View style={styles.actionSheetContainer}>
                    <Animated.View style={[styles.actionSheetOverlay, { opacity: overlayOpacity }]}>
                        <TouchableWithoutFeedback onPress={closeLocationModal}>
                            <View style={{ flex: 1 }} />
                        </TouchableWithoutFeedback>
                    </Animated.View>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "padding"}
                        style={{ width: '100%', justifyContent: 'flex-end', flex: 1, pointerEvents: 'box-none' }}
                        keyboardVerticalOffset={0}
                    >
                        <Animated.View
                            style={[
                                styles.actionSheetWrapper,
                                { transform: [{ translateY: slideAnim }] }
                            ]}
                        >
                            <View style={styles.actionSheetContent}>
                                <View {...panResponder.panHandlers} style={styles.draggableHeader}>
                                    <View style={styles.sheetHandle} />
                                    <Text style={styles.sheetTitle}>Alterar localização</Text>
                                    <Text style={styles.sheetSubtitle}>Vê salões numa área diferente</Text>
                                </View>

                                <View style={styles.contentBody}>

                                    {/* --- NOVO: MOSTRAR LOCALIZAÇÃO ATUAL --- */}
                                    {address && (
                                        <View style={styles.currentLocationDisplay}>
                                            <Text style={styles.currentLocationLabel}>Selecionada atualmente</Text>
                                            <View style={styles.currentLocationCard}>
                                                <View style={styles.currentIconBox}>
                                                    <Ionicons name="location" size={24} color="#1a1a1a" />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.currentLocationStreet} numberOfLines={1}>
                                                        {address.street}
                                                    </Text>
                                                    {address.city ? (
                                                        <Text style={styles.currentLocationCity}>{address.city}</Text>
                                                    ) : null}
                                                </View>
                                                <Ionicons name="checkmark-circle" size={20} color="#4CD964" />
                                            </View>
                                        </View>
                                    )}
                                    {/* --------------------------------------- */}

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
                                            placeholder="Pesquisar Localidade" // <--- ALTERADO
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
                                        {isLocating ? <ActivityIndicator color="white" /> : <Text style={styles.applyButtonText}>Pesquisar Área</Text>}
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
    container: { flex: 1, backgroundColor: 'white' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },

    cardTitle: {
        fontSize: 19,
        fontWeight: '800', // Extra bold
        color: '#1a1a1a',
        letterSpacing: -0.5,
        flex: 1,
        marginRight: 10,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    cardLocation: {
        fontSize: 14,
        fontWeight: '600',
        color: '#555',
    },
    dotSeparator: {
        color: '#ccc',
    },
    cardAddress: {
        fontSize: 13,
        color: '#999',
        fontWeight: '500',
        marginLeft: 20, // Alinhar com o texto da localização (indenta o icon)
    },
    cardHeaderBadges: {
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    badgesLeftContainer: {
        flexDirection: 'row',
        gap: 6, // Espaço entre a etiqueta de km e a de 'Férias'
        alignItems: 'center',
    },
    badgesLeft: {
        flexDirection: 'row',
        gap: 8,
    },
    cardFooterBadges: {
        position: 'absolute',
        bottom: 16,
        right: 16,
        flexDirection: 'row',
        gap: 8,
    },

    headerWrapper: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
        backgroundColor: 'white',
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

    modernChipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 12,
    },
    modernChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: '#F2F2F7',
        borderWidth: 1,
        borderColor: '#E5E5EA',
        gap: 8,
    },
    modernChipActive: {
        backgroundColor: '#1a1a1a',
        borderColor: '#1a1a1a',
    },
    modernChipActivePrimary: {
        backgroundColor: '#1a1a1a', // ALTERADO: De #007AFF (Azul) para #1a1a1a (Preto)
        borderColor: '#1a1a1a',     // ALTERADO: De #007AFF para #1a1a1a
    },
    modernChipText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#3A3A3C',
    },
    modernChipTextActive: {
        color: 'white',
    },
    mainApplyButton: {
        backgroundColor: '#1a1a1a',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        borderRadius: 20,
        gap: 10,
        marginTop: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },
    mainApplyButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
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
    filterSection: {
        marginBottom: 30,
    },

    chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#f0f0f0' },
    chipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
    chipAudienceActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
    chipText: { fontWeight: '600', color: '#666', fontSize: 13 },
    chipTextActive: { color: 'white' },

    applyButton: {
        backgroundColor: '#1a1a1a', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 25
    },
    applyButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // --- CARTÕES (AJUSTADOS PARA SEREM MENORES) ---
    card: {
        backgroundColor: 'white',
        borderRadius: 24, // Cantos mais arredondados
        marginBottom: 24, // Mais espaço entre cards
        // Sombra muito suave (estilo iOS moderno)
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 15,
        elevation: 4, // Android
        borderWidth: 1,
        borderColor: '#f0f0f0', // Borda subtil para definição
    },
    cardImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    cardContent: {
        padding: 18,
    },

    badgesContainer: {
        position: 'absolute',
        top: 10,
        left: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        maxWidth: '75%',
        zIndex: 10
    },
    categoryPill: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)', // Branco quase opaco
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100, // Forma de pílula perfeita
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    categoryPillText: {
        color: '#1a1a1a',
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },

    ratingBadge: {
        backgroundColor: 'white',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 3,
    },
    ratingText: {
        fontWeight: '800',
        fontSize: 12,
        color: '#1a1a1a',
    },
    closedBadge: {
        backgroundColor: '#FF3B30', // Vermelho para destacar
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        // Removemos posicionamento absoluto antigo se existisse, agora é relativo ao container
    },
    closedBadgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    distanceBadge: {
        backgroundColor: 'rgba(26, 26, 26, 0.9)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    distanceText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '700',
    },
    reviewModalContent: {
        backgroundColor: 'white',
        width: '90%',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10
    },
    imageContainer: {
        height: 200, // Imagem mais alta
        width: '100%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#f0f0f0',
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
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 24,
    },

    contentBody: {
        paddingHorizontal: 24,
        paddingBottom: 10,
    },

    sheetHandle: {
        width: 36,
        height: 5,
        backgroundColor: '#E5E5EA',
        borderRadius: 2.5,
        marginBottom: 20,
    },
    imageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.03)',
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
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
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
        marginLeft: 0, // <--- ALTERADO: Era 22, agora é 0 porque já não há ícone em cima a empurrar
        marginTop: 2
    },
    currentLocationDisplay: {
        marginBottom: 20,
    },
    currentLocationLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#999',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginLeft: 4,
    },
    currentLocationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#F2F2F7',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E5EA',
        gap: 12,
    },
    currentIconBox: {
        width: 36,
        height: 36,
        backgroundColor: 'white',
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    currentLocationStreet: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1a1a1a',
    },
    currentLocationCity: {
        fontSize: 12,
        color: '#666',
        marginTop: 1,
        fontWeight: '500',
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
        marginHorizontal: -20, // Compensa o padding do pai para ir até à borda
    },
    categoriesScroll: {
        paddingHorizontal: 20, // Mantém o espaço nas pontas
        paddingBottom: 10,
        gap: 12,               // Aumentei ligeiramente de 10 para 12 para separar mais
    },
    categoryChip: {
        paddingHorizontal: 16,
        paddingVertical: 8, // <--- REDUZIR DE 10 PARA 8 (Mantém o botão fino)
        borderRadius: 10,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#e5e5e5',

        // --- O SEGREDO ESTÁ AQUI ---
        minWidth: 90,          // Força uma largura mínima. 
        // Isto garante que a lista fica larga o suficiente 
        // para o último item ficar cortado no ecrã.
        alignItems: 'center',  // Centra o texto dentro da largura mínima
        justifyContent: 'center',

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

        lineHeight: 18,             // Define altura fixa da linha
        includeFontPadding: false,  // REMOVE o espaço extra nativo do Android (Crucial)
        textAlignVertical: 'center' // Garante que fica no meio exato
    },
    categoryChipTextActive: {
        color: 'white',
    },
    scrollTopButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
        // Sombras
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    scrollTopWrapper: {
        position: 'absolute',
        bottom: 100,    // Mantém a altura que definiste antes
        left: '50%',    // Move o início do botão para o meio do ecrã
        marginLeft: -25, // Recua metade da largura (50px / 2) para centrar perfeitamente
        zIndex: 1000,
    },
    emptyStateContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40, // Mais margem lateral para o texto não esticar muito
    },
    emptyStateIconContainer: {
        width: 80,
        height: 80,
        backgroundColor: '#F2F2F7', // Cinza muito claro
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyStateBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#FF3B30', // Vermelho alerta
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyStateTitle: {
        fontSize: 20,
        fontWeight: '800', // Extra bold para impacto
        color: '#1a1a1a',
        marginBottom: 10,
        textAlign: 'center',
        letterSpacing: -0.5
    },
    emptyStateDescription: {
        fontSize: 15,
        color: '#666',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    emptyButtonsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    emptyStateButtonPrimary: {
        backgroundColor: '#1a1a1a',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        // Sombra para destacar o CTA (Call to Action)
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    emptyStateButtonTextPrimary: {
        color: 'white',
        fontWeight: '700',
        fontSize: 15,
    },
    emptyStateButtonSecondary: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E5EA',
        marginTop: 10
    },
    emptyStateButtonTextSecondary: {
        color: '#1a1a1a',
        fontWeight: '600',
        fontSize: 14,
    },
    inviteIconContainer: {
        width: 70,
        height: 70,
        backgroundColor: '#F2F2F7', // Cinza suave
        borderRadius: 35,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E5E5EA'
    },
});