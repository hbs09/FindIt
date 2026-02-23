import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Linking,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    PanResponder,
    Platform,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../supabase';

const { width, height } = Dimensions.get('window');

type Salon = {
    id: number;
    nome_salao: string;
    imagem: string;
    morada: string;
    cidade: string;
    hora_abertura: string;
    hora_fecho: string;
    telefone?: string;
    email?: string;
};

type PortfolioItem = {
    id: number;
    image_url: string;
    description?: string;
};

export default function SalonScreen() {
    const { colors, isDarkMode } = useTheme();
    const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);

    const router = useRouter();
    const { id } = useLocalSearchParams();

    const [salon, setSalon] = useState<Salon | null>(null);
    const [loading, setLoading] = useState(true);

    const [isFavorite, setIsFavorite] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    const [averageRating, setAverageRating] = useState<string>('--');
    const [totalReviews, setTotalReviews] = useState(0);

    const [galleryVisible, setGalleryVisible] = useState(false);
    const [fullImageIndex, setFullImageIndex] = useState(0);
    const [contactModalVisible, setContactModalVisible] = useState(false);

    const galleryMainRef = useRef<FlatList>(null);
    const galleryThumbRef = useRef<FlatList>(null);
    const panY = useRef(new Animated.Value(height)).current;

    useEffect(() => {
        if (galleryVisible && galleryThumbRef.current && portfolio.length > 0) {
            if (fullImageIndex >= 0 && fullImageIndex < portfolio.length) {
                setTimeout(() => {
                    galleryThumbRef.current?.scrollToIndex({
                        index: fullImageIndex,
                        animated: true,
                        viewPosition: 0.5
                    });
                }, 100);
            }
        }
    }, [fullImageIndex, galleryVisible]);

    useEffect(() => {
        if (id) {
            fetchSalonDetails();
            checkUserAndFavorite();
        }
    }, [id]);

    const handleOpenMap = () => {
        if (!salon) return;
        const query = encodeURIComponent(`${salon.morada}, ${salon.cidade}`);
        const url = Platform.select({
            ios: `maps:0,0?q=${query}`,
            android: `geo:0,0?q=${query}`
        });
        if (url) {
            Linking.openURL(url).catch(() => {
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
            });
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 0,
            onPanResponderMove: Animated.event(
                [null, { dy: panY }],
                { useNativeDriver: false }
            ),
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 150 || gestureState.vy > 0.5) {
                    closeModal();
                } else {
                    Animated.spring(panY, {
                        toValue: 0,
                        bounciness: 4,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    function openModal() {
        setContactModalVisible(true);
        panY.setValue(height);
        Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4
        }).start();
    }

    function closeModal() {
        Animated.timing(panY, {
            toValue: height,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setContactModalVisible(false));
    }

    function performContactAction(type: 'phone' | 'email') {
        closeModal();
        setTimeout(() => {
            if (type === 'phone') {
                if (salon?.telefone) Linking.openURL(`tel:${salon.telefone}`);
                else Alert.alert("Indisponível", "Telefone não disponível.");
            } else if (type === 'email') {
                if (salon?.email) Linking.openURL(`mailto:${salon.email}`);
                else Alert.alert("Indisponível", "Email não disponível.");
            }
        }, 300);
    }

    async function fetchSalonDetails() {
        setLoading(true);
        const { data: salonData } = await supabase.from('salons').select('*').eq('id', id).single();
        if (salonData) {
            setSalon({
                ...salonData,
                hora_abertura: salonData.hora_abertura || '09:00',
                hora_fecho: salonData.hora_fecho || '19:00',
            });
        }

        const { data: reviewsData } = await supabase.from('reviews').select('rating').eq('salon_id', id);
        if (reviewsData && reviewsData.length > 0) {
            const total = reviewsData.length;
            const sum = reviewsData.reduce((acc, curr) => acc + curr.rating, 0);
            const avg = (sum / total).toFixed(1);
            setAverageRating(avg);
            setTotalReviews(total);
        } else {
            setAverageRating('Novo');
            setTotalReviews(0);
        }

        const { data: portfolioData } = await supabase
            .from('portfolio_images')
            .select('*')
            .eq('salon_id', id)
            .order('position', { ascending: true });

        if (portfolioData) setPortfolio(portfolioData);
        setLoading(false);
    }

    async function checkUserAndFavorite() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setIsLoggedIn(true);
            const { data } = await supabase.from('favorites').select('id').eq('salon_id', id).eq('user_id', user.id).single();
            if (data) setIsFavorite(true);
        } else { setIsLoggedIn(false); }
    }

    async function toggleFavorite() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (isFavorite) {
            await supabase.from('favorites').delete().eq('salon_id', id).eq('user_id', user.id);
            setIsFavorite(false);
        } else {
            await supabase.from('favorites').insert({ salon_id: Number(id), user_id: user.id });
            setIsFavorite(true);
        }
    }

    const handleShare = async () => {
        try {
            await Share.share({
                message: `Olha este salão que encontrei no FindIt: ${salon?.nome_salao} em ${salon?.cidade}!`,
            });
        } catch (error: any) {
            Alert.alert(error.message);
        }
    };

    // --- NOVA FUNÇÃO DE NAVEGAÇÃO DIRETA PARA O BOOK-CONFIRM ---
    function handleStartBooking() {
        router.push({
            pathname: '/book-confirm',
            params: {
                salonId: id,
                salonName: salon?.nome_salao,
            }
        });
    }

    const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (!galleryVisible) return;
        const contentOffset = e.nativeEvent.contentOffset.x;
        const viewSize = e.nativeEvent.layoutMeasurement.width;
        const newIndex = Math.floor(contentOffset / viewSize);
        setFullImageIndex(newIndex);
    };

    if (loading || !salon) return <View style={styles.center}><ActivityIndicator size="large" color={colors.text} /></View>;

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                <View style={styles.headerContainer}>
                    {portfolio.length > 0 ? (
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => { setFullImageIndex(0); setGalleryVisible(true); }}
                            style={{ width: '100%', height: '100%' }}
                        >
                            <Image
                                source={{ uri: salon.imagem || 'https://via.placeholder.com/600x400' }}
                                style={styles.coverImage}
                            />
                            <View style={styles.photoCountBadge}>
                                <Ionicons name="images-outline" size={16} color="white" />
                                <Text style={{ color: 'white', fontWeight: '600', fontSize: 12 }}>
                                    {portfolio.length}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ) : (
                        <Image
                            source={{ uri: salon.imagem || 'https://via.placeholder.com/600x400' }}
                            style={styles.coverImage}
                        />
                    )}

                    <TouchableOpacity
                        style={[styles.headerBtn, styles.backButtonPosition]}
                        onPress={() => router.back()}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </TouchableOpacity>

                    <View style={styles.rightButtonsContainer}>
                        <TouchableOpacity style={styles.headerBtn} onPress={handleShare} activeOpacity={0.8}>
                            <Ionicons name="share-outline" size={22} color={colors.text} />
                        </TouchableOpacity>

                        {isLoggedIn && (
                            <TouchableOpacity style={styles.headerBtn} onPress={toggleFavorite} activeOpacity={0.8}>
                                <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={22} color={isFavorite ? colors.dangerTxt : colors.text} />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.headerBtn} onPress={openModal} activeOpacity={0.8}>
                            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.sheetContent}>
                    <View style={styles.salonHeader}>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={styles.title}>{salon.nome_salao}</Text>

                            <View style={styles.infoRow}>
                                <View style={styles.iconCircle}>
                                    <Ionicons name="location-sharp" size={18} color={colors.text} />
                                </View>
                                <Text style={styles.infoText}>
                                    {salon.morada}, {salon.cidade}
                                </Text>
                            </View>

                            <View style={[styles.infoRow, { marginBottom: 0 }]}>
                                <View style={styles.iconCircle}>
                                    <Ionicons name="time-sharp" size={18} color={colors.text} />
                                </View>
                                <View>
                                    <Text style={styles.infoLabel}>Horário</Text>
                                    <Text style={styles.infoValue}>
                                        {salon.hora_abertura} - {salon.hora_fecho}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.ratingCard}>
                            <View style={styles.ratingHeader}>
                                <Text style={styles.ratingNumber}>{averageRating}</Text>
                                <Ionicons name="star" size={16} color={colors.text} />
                            </View>
                            <View style={styles.ratingDivider} />
                            <Text style={styles.reviewCount}>
                                {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={[styles.sectionContainer, { marginBottom: 0 }]}>
                        <Text style={styles.sectionTitle}>Localização</Text>

                        <TouchableOpacity
                            style={styles.mapCard}
                            onPress={handleOpenMap}
                            activeOpacity={0.9}
                        >
                            <Image
                                source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Google_Maps_Logo_2020.svg/2275px-Google_Maps_Logo_2020.svg.png' }}
                                style={[styles.mapImage, { opacity: 0.1 }]}
                                resizeMode="cover"
                            />
                            <View style={styles.mapBackground} />

                            <View style={styles.mapContent}>
                                <View style={styles.mapPinCircle}>
                                    <Ionicons name="location" size={28} color="#FF3B30" />
                                </View>
                                <Text style={styles.mapCtaText}>Ver no mapa</Text>
                                <View style={styles.mapAddressContainer}>
                                    <Text style={styles.mapAddress} numberOfLines={1}>{salon.morada}</Text>
                                    <Text style={styles.mapCity}>{salon.cidade}</Text>
                                </View>
                            </View>

                            <View style={styles.mapArrowIcon}>
                                <Ionicons name="arrow-forward-circle" size={32} color={colors.text} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            {/* --- NOVO FOOTER COM BOTÃO GIGANTE --- */}
            <View style={styles.footerContainer}>
                <TouchableOpacity
                    style={[
                        styles.bookBtnFull,
                        // No Dark mode o fundo é Branco, no Light mode usa a cor principal
                        { backgroundColor: isDarkMode ? '#FFFFFF' : colors.text }
                    ]}
                    onPress={handleStartBooking}
                    activeOpacity={0.8}
                >
                    <Text
                        style={[
                            styles.bookBtnTextFull,
                            // No Dark mode as letras são Pretas, no Light mode são a cor do fundo (Branco)
                            { color: isDarkMode ? '#000000' : colors.bg }
                        ]}
                    >
                        Agendar Marcação
                    </Text>
                </TouchableOpacity>
            </View>

            {/* MODAIS (GALERIA E CONTACTOS MANTIDOS) */}
            <Modal visible={galleryVisible} transparent={true} onRequestClose={() => setGalleryVisible(false)} animationType="fade">
                <View style={styles.fullScreenContainer}>
                    <StatusBar hidden={galleryVisible} />
                    <TouchableOpacity style={[styles.headerBtn, { position: 'absolute', top: 50, right: 20, zIndex: 10 }]} onPress={() => setGalleryVisible(false)}>
                        <Ionicons name="close" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.counterText}>{`${fullImageIndex + 1} / ${portfolio.length}`}</Text>

                    <FlatList
                        ref={galleryMainRef}
                        data={portfolio}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
                                <Image source={{ uri: item.image_url }} style={styles.fullScreenImage} />
                                {item.description && (
                                    <View style={styles.descriptionOverlay}>
                                        <Text style={styles.descriptionText}>{item.description}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                        onMomentumScrollEnd={onScrollEnd}
                        initialScrollIndex={fullImageIndex}
                        onLayout={() => {
                            if (galleryMainRef.current && fullImageIndex > 0) {
                                galleryMainRef.current.scrollToIndex({ index: fullImageIndex, animated: false });
                            }
                        }}
                        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
                    />

                    <View style={styles.thumbnailsContainer}>
                        <FlatList
                            ref={galleryThumbRef}
                            data={portfolio}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={(item) => item.id.toString()}
                            contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
                            getItemLayout={(_, index) => ({ length: 70, offset: 70 * index, index })}
                            renderItem={({ item, index }) => {
                                const isActive = index === fullImageIndex;
                                return (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            setFullImageIndex(index);
                                            galleryMainRef.current?.scrollToIndex({ index, animated: true });
                                        }}
                                        style={[styles.thumbButton, isActive && styles.thumbButtonActive]}
                                    >
                                        <Image
                                            source={{ uri: item.image_url }}
                                            style={[styles.thumbImage, isActive && { opacity: 1 }, !isActive && { opacity: 0.6 }]}
                                        />
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </View>
            </Modal>

            <Modal visible={contactModalVisible} transparent={true} animationType="fade" onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeModal} />
                    <Animated.View
                        style={[
                            styles.modalSheet,
                            {
                                transform: [{
                                    translateY: panY.interpolate({
                                        inputRange: [-100, 0, height],
                                        outputRange: [0, 0, height],
                                        extrapolate: 'clamp'
                                    })
                                }]
                            }
                        ]}
                        {...panResponder.panHandlers}
                    >
                        <View style={styles.dragIndicator} />
                        <Text style={styles.modalTitle}>Entrar em contacto</Text>
                        <Text style={styles.modalSubtitle}>Escolha como quer falar com {salon?.nome_salao}</Text>

                        <View style={styles.actionsContainer}>
                            <TouchableOpacity style={styles.actionButton} onPress={() => performContactAction('phone')}>
                                <View style={[styles.actionIcon, { backgroundColor: isDarkMode ? '#1E3A5F' : '#E3F2FD' }]}>
                                    <Ionicons name="call" size={24} color="#2196F3" />
                                </View>
                                <View style={styles.actionTextContainer}>
                                    <Text style={styles.actionTitle}>Ligar</Text>
                                    <Text style={styles.actionValue}>{salon?.telefone || 'Indisponível'}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={colors.subText} />
                            </TouchableOpacity>

                            <View style={styles.actionDivider} />

                            <TouchableOpacity style={styles.actionButton} onPress={() => performContactAction('email')}>
                                <View style={[styles.actionIcon, { backgroundColor: isDarkMode ? '#4A255A' : '#F3E5F5' }]}>
                                    <Ionicons name="mail" size={24} color="#9C27B0" />
                                </View>
                                <View style={styles.actionTextContainer}>
                                    <Text style={styles.actionTitle}>Enviar Email</Text>
                                    <Text style={styles.actionValue}>{salon?.email || 'Indisponível'}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={colors.subText} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                            <Text style={styles.cancelButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

const createStyles = (colors: any, isDarkMode: boolean) => StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
    container: { flex: 1, backgroundColor: colors.bg },

    headerContainer: { height: 330, width: '100%', position: 'relative', backgroundColor: colors.iconBg },
    coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    photoCountBadge: { position: 'absolute', bottom: 55, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },

    headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
    backButtonPosition: { position: 'absolute', top: Platform.OS === 'ios' ? 30 : 10, left: 20, zIndex: 10 },
    rightButtonsContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 30 : 10, right: 20, flexDirection: 'row', gap: 10, zIndex: 10 },

    sheetContent: { marginTop: -40, backgroundColor: colors.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingTop: 30, paddingBottom: 110, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
    salonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 16, lineHeight: 32, letterSpacing: -0.5 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, width: '100%' },
    iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.iconBg, justifyContent: 'center', alignItems: 'center', marginRight: 12, flexShrink: 0 },
    infoText: { color: colors.text, fontSize: 15, fontWeight: '500', flex: 1, lineHeight: 20 },
    infoLabel: { fontSize: 11, color: colors.subText, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
    infoValue: { fontSize: 14, color: colors.text, fontWeight: '600' },

    ratingCard: { backgroundColor: colors.card, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    ratingHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    ratingDivider: { width: '100%', height: 1, backgroundColor: colors.border, marginBottom: 6 },
    ratingNumber: { fontSize: 22, fontWeight: '800', color: colors.text },
    reviewCount: { fontSize: 11, color: colors.subText, fontWeight: '500' },
    divider: { height: 1, backgroundColor: colors.border, marginTop: 12, marginBottom: 24 },

    sectionContainer: { marginBottom: 24 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 },

    mapCard: { height: 180, backgroundColor: colors.iconBg, borderRadius: 20, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: colors.border },
    mapImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    mapBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: isDarkMode ? 'rgba(30, 40, 50, 0.8)' : 'rgba(230, 235, 240, 0.6)' },
    mapContent: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
    mapPinCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
    mapCtaText: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 8 },
    mapAddressContainer: { alignItems: 'center', paddingHorizontal: 20 },
    mapAddress: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' },
    mapCity: { fontSize: 13, color: colors.subText, marginTop: 2 },
    mapArrowIcon: { position: 'absolute', bottom: 12, right: 12, zIndex: 3 },

    // --- FOOTER NOVO ---
    footerContainer: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Platform.OS === 'ios' ? 34 : 20, paddingTop: 16, paddingHorizontal: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 15 },
    bookBtnFull: { width: '100%', backgroundColor: colors.text, paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: colors.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
    bookBtnTextFull: { color: colors.bg, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

    fullScreenContainer: { flex: 1, backgroundColor: 'black' },
    fullScreenImage: { width: width, height: height * 0.8, resizeMode: 'contain' },
    counterText: { position: 'absolute', top: 60, alignSelf: 'center', color: 'white', fontSize: 16, fontWeight: '600', opacity: 0.8, zIndex: 998 },
    descriptionOverlay: { position: 'absolute', bottom: 140, left: 20, right: 20, overflow: 'hidden', padding: 16, borderRadius: 16 },
    descriptionText: { color: 'white', fontSize: 14, textAlign: 'center', fontWeight: '500', lineHeight: 22 },
    thumbnailsContainer: { position: 'absolute', bottom: 40, left: 0, right: 0, height: 80 },
    thumbButton: { width: 60, height: 60, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
    thumbButtonActive: { borderColor: 'white', transform: [{ scale: 1.1 }] },
    thumbImage: { width: '100%', height: '100%', resizeMode: 'cover' },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject },
    modalSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10, width: '100%' },
    dragIndicator: { width: 40, height: 5, backgroundColor: colors.border, borderRadius: 3, marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
    modalSubtitle: { fontSize: 14, color: colors.subText, marginBottom: 30, textAlign: 'center' },
    actionsContainer: { width: '100%', backgroundColor: colors.iconBg, borderRadius: 16, padding: 8, marginBottom: 20 },
    actionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 },
    actionIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    actionTextContainer: { flex: 1 },
    actionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
    actionValue: { fontSize: 13, color: colors.subText },
    actionDivider: { height: 1, backgroundColor: colors.border, marginLeft: 76 },
    cancelButton: { width: '100%', paddingVertical: 16, backgroundColor: colors.iconBg, borderRadius: 50, alignItems: 'center' },
    cancelButtonText: { fontSize: 16, fontWeight: '700', color: colors.text },
});