import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useTheme } from '../../context/ThemeContext'; // <-- Importa o ThemeContext
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
    // 1. Extrair os dados do Tema
    const { colors, isDarkMode } = useTheme();
    // 2. Gerar os estilos de forma dinâmica
    const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);

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

    const [showScrollTop, setShowScrollTop] = useState(false);
    const fabOpacity = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef<any>(null);

    const reviewAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

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
            if (value > threshold && !showScrollTop) {
                setShowScrollTop(true);
            } else if (value <= threshold && showScrollTop) {
                setShowScrollTop(false);
            }
        });

        return () => {
            scrollY.removeListener(listenerId);
        };
    }, [showScrollTop]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,

            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
            },

            onPanResponderGrant: () => {
                slideAnim.stopAnimation();
                slideAnim.setOffset(0);
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
        outputRange: [48, 0],
        extrapolate: 'clamp',
    });

    const carouselOpacity = scrollY.interpolate({
        inputRange: [0, 30],
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
            const searchQuery = manualLocationText.toLowerCase().includes('portugal')
                ? manualLocationText
                : `${manualLocationText}, Portugal`;

            let geocodeResult = await Location.geocodeAsync(searchQuery);

            if (geocodeResult.length > 0) {
                const { latitude, longitude } = geocodeResult[0];

                setUserLocation({
                    coords: {
                        latitude, longitude, altitude: null, accuracy: null,
                        altitudeAccuracy: null, heading: null, speed: null
                    },
                    timestamp: Date.now()
                });

                let reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });

                if (reverseGeocode.length > 0) {
                    const place = reverseGeocode[0];
                    const cityDetected = place.city || place.subregion || place.region || place.name || '';

                    setAddress({
                        street: cityDetected || manualLocationText,
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
            console.log(error);
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

    const reviewPanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,

            onPanResponderGrant: () => {
                reviewAnim.extractOffset();
            },

            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy < 0) {
                    reviewAnim.setValue(gestureState.dy / 3);
                } else {
                    reviewAnim.setValue(gestureState.dy);
                }
            },

            onPanResponderRelease: (_, gestureState) => {
                reviewAnim.flattenOffset();
                if (gestureState.dy > 150 || gestureState.vy > 0.5) {
                    closeReviewModal();
                } else {
                    Animated.spring(reviewAnim, {
                        toValue: 0,
                        useNativeDriver: true,
                        bounciness: 4
                    }).start();
                }
            },
        })
    ).current;

    function closeReviewModal() {
        Animated.timing(reviewAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setReviewModalVisible(false);
            setAppointmentToReview(null);
            setRating(0);
        });
    }

    useEffect(() => {
        if (reviewModalVisible) {
            reviewAnim.setValue(SCREEN_HEIGHT);
            Animated.spring(reviewAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
                stiffness: 90
            }).start();
        }
    }, [reviewModalVisible]);

    function toggleAudience(audience: string) {
        if (selectedAudiences.includes(audience)) {
            setSelectedAudiences([]);
        } else {
            setSelectedAudiences([audience]);
        }
    }

    async function checkPendingReview(userId: string) {
        const { data, error } = await supabase
            .from('appointments')
            .select('*, salons(nome_salao, imagem, morada, cidade), services(nome, preco)')
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
            closeReviewModal();
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
            closeReviewModal();
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

    function normalizeText(text: string) {
        return text
            ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
            : "";
    }

    function filterData() {
        let result = salons;

        if (address?.city) {
            const userCity = normalizeText(address.city);
            result = result.filter(s => {
                if (!s.cidade) return false;
                const salonCity = normalizeText(s.cidade);
                return salonCity === userCity || salonCity.includes(userCity) || userCity.includes(salonCity);
            });
        }

        if (selectedCategory !== 'Todos') {
            result = result.filter(s => s.categoria && s.categoria.includes(selectedCategory));
        }

        result = result.filter(s => {
            if (selectedAudiences.length === 0) return true;
            if (s.publico === 'Unissexo') return true;
            return selectedAudiences.includes(s.publico);
        });

        if (searchText !== '') {
            const lowerText = normalizeText(searchText);
            result = result.filter(s => {
                const name = normalizeText(s.nome_salao);
                return name.startsWith(lowerText) || name.includes(' ' + lowerText);
            });
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

    const hasActiveFilters =
        selectedCategory !== 'Todos' ||
        minRating > 0 ||
        selectedAudiences.length > 0;

    const renderEmptyComponent = () => {
        if (hasActiveFilters) {
            return (
                <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyStateIconContainer}>
                        <Ionicons name="filter-circle-outline" size={48} color={colors.subText} />
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
                            setSelectedAudiences([]);
                        }}
                    >
                        <Text style={styles.emptyStateButtonTextSecondary}>Limpar Filtros</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <View style={styles.emptyStateContainer}>
                <View style={styles.inviteIconContainer}>
                    <Ionicons name="rocket" size={32} color={colors.text} />
                </View>

                <Text style={styles.emptyStateTitle}>
                    {address?.city ? `Ainda não chegámos a ${address.city}!` : 'Ainda não chegámos aqui!'}
                </Text>

                <Text style={styles.emptyStateDescription}>
                    Não encontrámos parceiros nesta zona, mas tu podes mudar isso. Recomenda a app ao teu salão favorito!
                </Text>

                <TouchableOpacity
                    style={styles.emptyStateButtonPrimary}
                    onPress={handleShareInvite}
                >
                    <Text style={styles.emptyStateButtonTextPrimary}>Partilhar com o meu Salão</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={{ marginTop: 24, padding: 8 }}
                    onPress={openLocationModal}
                >
                    <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>
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
            <View style={styles.imageContainer}>
                <Image
                    source={{ uri: item.imagem || 'https://via.placeholder.com/400x300' }}
                    style={styles.cardImage}
                />

                <View style={styles.imageOverlay} />

                <View style={styles.cardHeaderBadges}>
                    <View style={styles.badgesLeftContainer}>
                        {item.distance !== null && item.distance !== undefined && (
                            <View style={styles.distanceBadge}>
                                <Ionicons name="location-sharp" size={10} color={isDarkMode ? colors.text : "white"} />
                                <Text style={styles.distanceText}>{item.distance.toFixed(1)} km</Text>
                            </View>
                        )}

                        {item.isClosed && (
                            <View style={styles.closedBadge}>
                                <Text style={styles.closedBadgeText}>{item.closureReason || 'FECHADO'}</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.ratingBadge}>
                        <Ionicons name="star" size={12} color="#FFD700" />
                        <Text style={styles.ratingText}>{item.averageRating}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.cardContent}>
                <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.nome_salao}</Text>
                    <Ionicons name="arrow-forward-circle-outline" size={24} color={colors.text} style={{ opacity: 0.1 }} />
                </View>

                <View style={styles.locationRow}>
                    <Ionicons name="map-outline" size={14} color={colors.subText} />
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
            {/* Status bar ajusta a cor dependendo do tema */}
            <Animated.View
                style={[
                    styles.headerWrapper,
                    { transform: [{ translateY: headerTranslateY }] }
                ]}
            >
                <View style={styles.headerContent}>

                    {searchExpanded ? (
                        <View style={styles.searchBarExpanded}>
                            <Ionicons name="search" size={20} color={colors.text} />
                            <TextInput
                                ref={searchInputRef}
                                placeholder="Nome do Salão"
                                placeholderTextColor={colors.subText}
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
                                    <Ionicons name="close" size={20} color={colors.subText} />
                                </View>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.headerRow}>
                            <TouchableOpacity
                                style={styles.locationColumn}
                                onPress={openLocationModal}
                                activeOpacity={0.6}
                            >
                                <View style={styles.locationLabelRow}>
                                    <Text style={styles.headerLocationLabel}>Localização atual</Text>
                                    <Ionicons name="chevron-down" size={12} color={colors.text} />
                                </View>

                                <View style={styles.addressRow}>
                                    <Text
                                        style={styles.headerTitleAddress}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                    >
                                        {address?.street || 'A localizar...'}
                                    </Text>
                                </View>

                                {address?.city && address?.street !== address?.city && (
                                    <Text style={styles.cityText} numberOfLines={1}>
                                        {address?.city}
                                    </Text>
                                )}
                            </TouchableOpacity>

                            <View style={styles.rightButtonsRow}>
                                <TouchableOpacity
                                    style={styles.miniButton}
                                    onPress={() => {
                                        setSearchExpanded(true);
                                        setTimeout(() => searchInputRef.current?.focus(), 100);
                                    }}
                                >
                                    <Ionicons name="search" size={20} color={colors.text} />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.miniButton, hasActiveFilters && styles.miniButtonActive]}
                                    onPress={openFilterModal}
                                >
                                    <Ionicons name="options-outline" size={20} color={hasActiveFilters ? colors.bg : colors.text} />
                                </TouchableOpacity>

                            </View>
                        </View>
                    )}

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
                            decelerationRate="normal"
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
                <View style={styles.center}><ActivityIndicator size="large" color={colors.text} /></View>
            ) : (
                <Animated.FlatList
                    ref={flatListRef}
                    data={filteredSalons.slice(0, visibleLimit)}
                    keyExtractor={(item: any) => item.id.toString()}
                    renderItem={renderSalonItem}
                    contentContainerStyle={{
                        padding: 20,
                        paddingTop: HEADER_INITIAL_HEIGHT + LIST_TOP_PADDING,
                        paddingBottom: 80
                    }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSalons} progressViewOffset={HEADER_INITIAL_HEIGHT + LIST_TOP_PADDING} tintColor={colors.text} />}
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

            <Animated.View
                style={[
                    styles.scrollTopWrapper,
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
                pointerEvents={showScrollTop ? 'auto' : 'none'}
            >
                <TouchableOpacity
                    style={styles.scrollTopButton}
                    onPress={scrollToTop}
                    activeOpacity={0.8}
                >
                    <Ionicons name="arrow-up" size={24} color={isDarkMode ? '#000' : 'white'} />
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
                                <View style={styles.filterSection}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.filterSectionTitle}>Avaliação</Text>
                                    </View>

                                    <View style={styles.modernChipsContainer}>
                                        {RATING_OPTIONS.map((opt) => (
                                            <TouchableOpacity
                                                key={opt.value}
                                                style={[
                                                    styles.modernChip,
                                                    minRating === opt.value && styles.modernChipActive
                                                ]}
                                                onPress={() => {
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
                                                    color={minRating === opt.value ? colors.bg : "#FFD700"}
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
                                                        color={isSelected ? colors.bg : colors.subText}
                                                    />
                                                    <Text style={[styles.modernChipText, isSelected && styles.modernChipTextActive]}>
                                                        {aud}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                                <TouchableOpacity
                                    style={styles.mainApplyButton}
                                    onPress={closeFilterModal}
                                >
                                    <Text style={styles.mainApplyButtonText}>Ver resultados</Text>
                                    <Ionicons name="arrow-forward" size={20} color={isDarkMode ? '#000' : 'white'} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Animated.View>
                </View>
            </Modal>

            {/* MODAL REVIEW */}
            <Modal
                animationType="none"
                transparent={true}
                visible={reviewModalVisible}
                onRequestClose={() => closeReviewModal()}
            >
                <View style={styles.reviewOverlay}>
                    <TouchableWithoutFeedback onPress={handleDismissReview}>
                        <Animated.View
                            style={[
                                styles.reviewBackdrop,
                                {
                                    opacity: reviewAnim.interpolate({
                                        inputRange: [0, SCREEN_HEIGHT],
                                        outputRange: [1, 0],
                                        extrapolate: 'clamp'
                                    })
                                }
                            ]}
                        />
                    </TouchableWithoutFeedback>
                    <Animated.View
                        style={[
                            styles.reviewSheet,
                            { transform: [{ translateY: reviewAnim }] }
                        ]}
                    >
                        <View
                            style={{ width: '100%', alignItems: 'center', paddingBottom: 10, paddingTop: 10, marginTop: -10 }}
                            {...reviewPanResponder.panHandlers}
                        >
                            <View style={styles.sheetHandle} />
                            <Text style={styles.reviewSheetTitle}>Avaliar Experiência</Text>
                        </View>

                        <Text style={styles.reviewSheetSubtitle}>Como correu o teu serviço?</Text>

                        {appointmentToReview && (
                            <View style={styles.reviewCardSummary}>
                                <Image
                                    source={{ uri: appointmentToReview.salons?.imagem || 'https://via.placeholder.com/100' }}
                                    style={styles.reviewSalonImage}
                                />
                                <View style={styles.reviewInfoColumn}>
                                    <Text style={styles.reviewSalonName} numberOfLines={1}>
                                        {appointmentToReview.salons?.nome_salao}
                                    </Text>
                                    <Text style={styles.reviewServiceName} numberOfLines={1}>
                                        {appointmentToReview.services?.nome} • {appointmentToReview.services?.preco}€
                                    </Text>
                                    <View style={styles.reviewDateBadge}>
                                        <Ionicons name="calendar-outline" size={12} color={colors.subText} />
                                        <Text style={styles.reviewDateText}>
                                            {new Date(appointmentToReview.data_hora).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        <View style={styles.starsContainerBig}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <TouchableOpacity
                                    key={star}
                                    onPress={() => setRating(star)}
                                    activeOpacity={0.7}
                                    style={styles.starButton}
                                >
                                    <Ionicons
                                        name={star <= rating ? "star" : "star-outline"}
                                        size={46}
                                        color={star <= rating ? "#FFD700" : colors.border}
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.ratingFeedbackText}>
                            {rating === 5 ? 'Excelente!' :
                                rating === 4 ? 'Muito Bom' :
                                    rating === 3 ? 'Razoável' :
                                        rating > 0 ? 'Pode melhorar' : 'Toque para classificar'}
                        </Text>

                        <View style={styles.reviewFooter}>
                            <TouchableOpacity
                                style={[styles.mainApplyButton, { width: '100%', opacity: rating > 0 ? 1 : 0.5 }]}
                                onPress={submitReview}
                                disabled={submittingReview || rating === 0}
                            >
                                {submittingReview ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.mainApplyButtonText}>Enviar Avaliação</Text>}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.skipButton}
                                onPress={handleDismissReview}
                            >
                                <Text style={styles.skipButtonText}>Saltar este passo</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </View>
            </Modal>

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
                                    {address && (
                                        <View style={styles.currentLocationDisplay}>
                                            <Text style={styles.currentLocationLabel}>Selecionada atualmente</Text>
                                            <View style={styles.currentLocationCard}>
                                                <View style={styles.currentIconBox}>
                                                    <Ionicons name="location" size={24} color={colors.text} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.currentLocationStreet} numberOfLines={1}>
                                                        {address.street}
                                                    </Text>
                                                    {address.city ? (
                                                        <Text style={styles.currentLocationCity}>{address.city}</Text>
                                                    ) : null}
                                                </View>
                                                <Ionicons name="checkmark-circle" size={20} color={colors.successTxt} />
                                            </View>
                                        </View>
                                    )}

                                    <TouchableOpacity
                                        style={styles.gpsButton}
                                        onPress={getCurrentLocation}
                                        disabled={isLocating}
                                    >
                                        <View style={styles.gpsIconContainer}>
                                            <Ionicons name="navigate" size={20} color={colors.accent} />
                                        </View>
                                        <View>
                                            <Text style={styles.gpsButtonText}>Usar localização atual</Text>
                                            <Text style={styles.gpsButtonSubText}>Ativar GPS</Text>
                                        </View>
                                        {isLocating && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 'auto' }} />}
                                    </TouchableOpacity>

                                    <View style={styles.divider}>
                                        <Text style={styles.dividerText}>OU</Text>
                                    </View>
                                    <View style={styles.locationInputContainer}>
                                        <Ionicons name="search" size={20} color={colors.subText} style={{ marginLeft: 10 }} />
                                        <TextInput
                                            placeholder="Pesquisar Localidade"
                                            style={styles.locationInput}
                                            placeholderTextColor={colors.subText}
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
                                        {isLocating ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.applyButtonText}>Pesquisar Área</Text>}
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

// 3. Função para gerar estilos baseados nas cores
const createStyles = (colors: any, isDarkMode: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },

    cardTitle: {
        fontSize: 19,
        fontWeight: '800',
        color: colors.text,
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
        color: colors.subText,
    },
    dotSeparator: {
        color: colors.border,
    },
    cardAddress: {
        fontSize: 13,
        color: colors.subText,
        fontWeight: '500',
        marginLeft: 20,
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
        gap: 6,
        alignItems: 'center',
    },
    headerWrapper: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
        backgroundColor: colors.bg,
        overflow: 'hidden'
    },
    headerContent: {
        paddingHorizontal: 20,
        paddingBottom: 10,
        paddingTop: 55,
        minHeight: 110,
        justifyContent: 'flex-end'
    },

    headerLocationLabel: { fontSize: 11, color: colors.subText, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    headerTitleAddress: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
        flex: 1
    },
    headerSubtitleCity: { fontSize: 14, color: colors.subText, marginLeft: 26, fontWeight: '500' },
    headerTitle: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 16, color: colors.subText, marginTop: 2 },

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
        backgroundColor: colors.iconBg,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 8,
    },
    modernChipActive: {
        backgroundColor: colors.text,
        borderColor: colors.text,
    },
    modernChipActivePrimary: {
        backgroundColor: colors.text,
        borderColor: colors.text,
    },
    modernChipText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
    },
    modernChipTextActive: {
        color: colors.bg,
    },
    mainApplyButton: {
        backgroundColor: colors.primary,
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
        color: isDarkMode ? '#000' : 'white',
        fontSize: 16,
        fontWeight: '700',
    },

    searchBarExpanded: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: 16,
        paddingHorizontal: 12,
        height: 46,
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
        color: colors.text,
        marginLeft: 10,
        height: '100%'
    },
    closeBtnSmall: {
        backgroundColor: colors.iconBg,
        padding: 4,
        borderRadius: 12,
    },

    filterSectionTitle: { fontSize: 12, fontWeight: '700', color: colors.subText, textTransform: 'uppercase', letterSpacing: 0.5 },
    filterSection: {
        marginBottom: 30,
    },

    applyButton: {
        backgroundColor: colors.primary, padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 25
    },
    applyButtonText: { color: isDarkMode ? '#000' : 'white', fontWeight: 'bold', fontSize: 16 },

    card: {
        backgroundColor: colors.card,
        borderRadius: 24,
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 15,
        elevation: 4,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cardImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    cardContent: {
        padding: 18,
    },

    ratingBadge: {
        backgroundColor: colors.card,
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
        color: colors.text,
    },
    closedBadge: {
        backgroundColor: colors.dangerTxt,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    closedBadgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    distanceBadge: {
        backgroundColor: colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    distanceText: {
        color: isDarkMode ? colors.text : 'white',
        fontSize: 11,
        fontWeight: '700',
    },

    imageContainer: {
        height: 200,
        width: '100%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: colors.iconBg,
    },

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
        gap: 8,
    },
    actionSheetWrapper: {
        width: '100%',
        justifyContent: 'flex-end',
    },
    actionSheetContent: {
        backgroundColor: colors.card,
        borderTopLeftRadius: 25,
        borderTopRightRadius: 25,
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
    imageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.03)',
    },
    sheetTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 4,
    },
    sheetSubtitle: {
        fontSize: 14,
        color: colors.subText,
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
        backgroundColor: colors.card,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
        borderWidth: 1,
        borderColor: colors.border
    },
    miniButtonActive: {
        backgroundColor: colors.text,
        borderColor: colors.text,
    },
    gpsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: isDarkMode ? '#1A2A3A' : '#f0f8ff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDarkMode ? '#2A4A6A' : '#d0e8ff',
        marginBottom: 20,
    },
    gpsIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.card,
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
        color: colors.accent,
    },
    gpsButtonSubText: {
        fontSize: 12,
        color: colors.accent,
        marginTop: 2,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 10
    },
    locationColumn: {
        flex: 1,
        marginRight: 15,
        justifyContent: 'center',
    },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    dividerText: {
        color: colors.subText,
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
        backgroundColor: colors.iconBg,
        borderRadius: 16,
        height: 54,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cityText: {
        fontSize: 12,
        color: colors.subText,
        fontWeight: '500',
        marginLeft: 0,
        marginTop: 2
    },
    currentLocationDisplay: {
        marginBottom: 20,
    },
    currentLocationLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.subText,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginLeft: 4,
    },
    currentLocationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: colors.iconBg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 12,
    },
    currentIconBox: {
        width: 36,
        height: 36,
        backgroundColor: colors.card,
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
        color: colors.text,
    },
    currentLocationCity: {
        fontSize: 12,
        color: colors.subText,
        marginTop: 1,
        fontWeight: '500',
    },
    locationInput: {
        flex: 1,
        height: '100%',
        paddingHorizontal: 12,
        fontSize: 16,
        color: colors.text,
    },

    categoriesWrapper: {
        marginHorizontal: -20,
    },
    categoriesScroll: {
        paddingHorizontal: 20,
        paddingBottom: 10,
        gap: 12,
    },
    categoryChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        minWidth: 90,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    categoryChipActive: {
        backgroundColor: colors.text,
        borderColor: colors.text,
    },
    categoryChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.subText,
        lineHeight: 18,
        includeFontPadding: false,
        textAlignVertical: 'center'
    },
    categoryChipTextActive: {
        color: colors.bg,
    },
    scrollTopButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    scrollTopWrapper: {
        position: 'absolute',
        bottom: 100,
        left: '50%',
        marginLeft: -25,
        zIndex: 1000,
    },
    emptyStateContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyStateIconContainer: {
        width: 80,
        height: 80,
        backgroundColor: colors.iconBg,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyStateTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 10,
        textAlign: 'center',
        letterSpacing: -0.5
    },
    emptyStateDescription: {
        fontSize: 15,
        color: colors.subText,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    emptyStateButtonPrimary: {
        backgroundColor: colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    emptyStateButtonTextPrimary: {
        color: isDarkMode ? '#000' : 'white',
        fontWeight: '700',
        fontSize: 15,
    },
    emptyStateButtonSecondary: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginTop: 10
    },
    emptyStateButtonTextSecondary: {
        color: colors.text,
        fontWeight: '600',
        fontSize: 14,
    },
    inviteIconContainer: {
        width: 70,
        height: 70,
        backgroundColor: colors.iconBg,
        borderRadius: 35,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: colors.border
    },
    reviewOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        zIndex: 1000,
    },
    reviewBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    reviewSheet: {
        backgroundColor: colors.card,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 10,
    },
    sheetHandle: {
        width: 40,
        height: 5,
        backgroundColor: colors.border,
        borderRadius: 3,
        marginBottom: 20,
    },
    reviewSheetTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 4,
    },
    reviewSheetSubtitle: {
        fontSize: 14,
        color: colors.subText,
        marginBottom: 24,
    },
    reviewCardSummary: {
        flexDirection: 'row',
        width: '100%',
        backgroundColor: colors.bg,
        padding: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 24,
        alignItems: 'center',
    },
    reviewSalonImage: {
        width: 60,
        height: 60,
        borderRadius: 16,
        backgroundColor: colors.iconBg,
    },
    reviewInfoColumn: {
        flex: 1,
        marginLeft: 12,
    },
    reviewSalonName: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 2,
    },
    reviewServiceName: {
        fontSize: 13,
        color: colors.subText,
        fontWeight: '500',
        marginBottom: 6,
    },
    reviewDateBadge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 4,
    },
    reviewDateText: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.subText,
        textTransform: 'capitalize',
    },
    starsContainerBig: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 10,
    },
    starButton: {
        padding: 4,
    },
    ratingFeedbackText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFD700',
        marginBottom: 24,
        height: 20,
    },
    reviewFooter: {
        width: '100%',
        gap: 12,
    },
    skipButton: {
        padding: 12,
        alignItems: 'center',
        marginTop: 4,
    },
    skipButtonText: {
        color: colors.subText,
        fontSize: 14,
        fontWeight: '600',
    },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
});