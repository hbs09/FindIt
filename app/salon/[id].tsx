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
import { useTheme } from '../../context/ThemeContext'; // <-- Importa o ThemeContext
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
    intervalo_minutos: number;
    almoco_inicio?: string;
    almoco_fim?: string;
    telefone?: string;
    email?: string;
};

type PortfolioItem = {
    id: number;
    image_url: string;
    description?: string;
};

type Closure = {
    start_date: string;
    end_date: string;
    motivo: string;
};

type Employee = {
    id: number;
    nome: string;
    foto: string;
    salon_id: number;
};

export default function SalonScreen() {
    // 1. Extrair os dados do Tema
    const { colors, isDarkMode } = useTheme();
    // 2. Gerar os estilos de forma dinâmica
    const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null); // null = "Qualquer um"

    const router = useRouter();
    const [salon, setSalon] = useState<Salon | null>(null);
    const [loading, setLoading] = useState(true);

    const { id, prefillServiceId, prefillServiceName, prefillServicePrice } = useLocalSearchParams();
    const scrollViewRef = useRef<ScrollView>(null);

    const [isFavorite, setIsFavorite] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    const [averageRating, setAverageRating] = useState<string>('--');
    const [totalReviews, setTotalReviews] = useState(0);

    const [selectedDate, setSelectedDate] = useState(new Date());
    const [slots, setSlots] = useState<string[]>([]);
    const [busySlots, setBusySlots] = useState<string[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [displayedMonth, setDisplayedMonth] = useState(new Date());

    const [closures, setClosures] = useState<Closure[]>([]);
    const [isClosedToday, setIsClosedToday] = useState(false);
    const [closureReason, setClosureReason] = useState('');

    const [galleryVisible, setGalleryVisible] = useState(false);
    const [fullImageIndex, setFullImageIndex] = useState(0);
    const [contactModalVisible, setContactModalVisible] = useState(false);

    const galleryMainRef = useRef<FlatList>(null);
    const galleryThumbRef = useRef<FlatList>(null);

    const panY = useRef(new Animated.Value(height)).current;
    const [calendarDays, setCalendarDays] = useState<Date[]>([]);
    const flatListRef = useRef<FlatList>(null);

    const GAP = 10;
    const PADDING = 48;
    const itemWidth = (width - PADDING - (GAP * 3)) / 4;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50
    }).current;

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
        if (!loading && salon && prefillServiceId && scrollViewRef.current) {
            setTimeout(() => {
                scrollViewRef.current?.scrollTo({
                    y: 360,
                    animated: true
                });
            }, 500);
        }
    }, [loading, salon]);

    // Atualiza o teu useEffect inicial para chamar a fetchEmployees
    useEffect(() => {
        if (id) {
            fetchSalonDetails();
            checkUserAndFavorite();
            fetchClosures();
            fetchEmployees(); // <--- NOVA LINHA
        }
    }, [id]);

    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems && viewableItems.length > 0) {
            const firstVisibleItem = viewableItems[0].item;
            setDisplayedMonth(firstVisibleItem);
        }
    }).current;

    const today = new Date();
    const isCurrentMonth = displayedMonth.getMonth() === today.getMonth() &&
        displayedMonth.getFullYear() === today.getFullYear();

    const goToNextMonth = () => {
        const nextMonthDate = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
        const index = calendarDays.findIndex(d =>
            d.getMonth() === nextMonthDate.getMonth() &&
            d.getFullYear() === nextMonthDate.getFullYear()
        );
        if (index !== -1 && flatListRef.current) {
            flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0 });
        }
    };

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

    const goToPrevMonth = () => {
        if (isCurrentMonth) return;

        const prevMonthDate = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);

        if (prevMonthDate.getMonth() === today.getMonth() && prevMonthDate.getFullYear() === today.getFullYear()) {
            flatListRef.current?.scrollToIndex({ index: 0, animated: true, viewPosition: 0 });
            return;
        }

        const index = calendarDays.findIndex(d =>
            d.getMonth() === prevMonthDate.getMonth() &&
            d.getFullYear() === prevMonthDate.getFullYear()
        );

        if (index !== -1 && flatListRef.current) {
            flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0 });
        }
    };

    useEffect(() => {
        const days = [];
        const today = new Date();
        for (let i = 0; i < 365; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            days.push(d);
        }
        setCalendarDays(days);
    }, []);

    useEffect(() => {
        if (salon) {
            const dateStr = selectedDate.toISOString().split('T')[0];
            const closure = closures.find(c => dateStr >= c.start_date && dateStr <= c.end_date);
            const isClosedNow = !!closure;

            setIsClosedToday(isClosedNow);
            setClosureReason(closure ? closure.motivo : '');

            if (isClosedNow) {
                setSlots([]);
                setSelectedSlot(null);
            } else {
                generateTimeSlots();
                fetchAvailability();
            }
        }
        // 👇 É AQUI A MAGIA: Adicionámos o selectedEmployee
    }, [selectedDate, salon, closures, selectedEmployee]);

    useEffect(() => {
        if (calendarDays.length > 0 && flatListRef.current) {
            const index = calendarDays.findIndex(d => isSameDay(d, selectedDate));
            if (index !== -1) {
                flatListRef.current.scrollToIndex({
                    index,
                    animated: true,
                    viewPosition: 0.5
                });
            }
        }
    }, [selectedDate, calendarDays]);

    useEffect(() => {
        if (!id) return;
        const channel = supabase
            .channel('realtime_bookings')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `salon_id=eq.${id}` },
                (payload) => { fetchAvailability(); }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };

    }, [id, selectedDate, selectedEmployee]);

    async function fetchClosures() {
        const { data } = await supabase.from('salon_closures').select('*').eq('salon_id', id);
        if (data) setClosures(data);
    }

    function handleContactMenu() {
        openModal();
    }

    async function fetchEmployees() {
        const { data, error } = await supabase
            .from('salon_staff')
            .select(`
                id, 
                role, 
                salon_id,
                profiles (
                    nome,
                    full_name,
                    avatar_url
                )
            `)
            .eq('salon_id', id)
            .eq('status', 'ativo');
            
        if (data) {
            // Mapeamos os dados para que o design frontend continue a usar 'emp.nome' e 'emp.foto'
            const formattedStaff = data.map((emp: any) => ({
                id: emp.id,
                salon_id: emp.salon_id,
                role: emp.role,
                nome: emp.profiles?.nome || emp.profiles?.full_name || 'Sem Nome',
                foto: emp.profiles?.avatar_url || null
            }));
            setEmployees(formattedStaff);
        } else if (error) {
            console.log("ERRO AO BUSCAR STAFF:", error.message);
        }
    }
    
    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getDate() === d2.getDate() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getFullYear() === d2.getFullYear();
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
                intervalo_minutos: salonData.intervalo_minutos || 30
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

    async function fetchAvailability() {
        setLoadingSlots(true);
        setBusySlots([]);
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Começamos a construir a query
        let query = supabase
            .from('appointments')
            .select('data_hora, employee_id')
            .eq('salon_id', id)
            .gte('data_hora', startOfDay.toISOString())
            .lte('data_hora', endOfDay.toISOString())
            .not('status', 'in', '("cancelado","cancelado_cliente","cancelado_salao","faltou")');

        // Se o cliente escolheu um funcionário específico, filtramos por ele
        if (selectedEmployee) {
            query = query.eq('employee_id', selectedEmployee.id);
        }

        const { data } = await query;

        if (data) {
            if (selectedEmployee) {
                // LÓGICA 1: Profissional Específico
                // Se o funcionário tem marcação àquela hora, a hora bloqueia.
                const occupied = data.map(app => {
                    const d = new Date(app.data_hora);
                    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                });
                setBusySlots(occupied);
            } else {
                // LÓGICA 2: "Qualquer um"
                // Uma hora só bloqueia se TODOS os funcionários estiverem ocupados àquela hora.
                const slotsCount: Record<string, number> = {};
                data.forEach(app => {
                    const time = new Date(app.data_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    slotsCount[time] = (slotsCount[time] || 0) + 1;
                });

                const totalEmployees = employees.length > 0 ? employees.length : 1; // Previne divisão por zero

                // Filtra as horas onde o nº de marcações é igual ou superior ao nº de funcionários
                const occupied = Object.keys(slotsCount).filter(time => slotsCount[time] >= totalEmployees);
                setBusySlots(occupied);
            }
        }
        setLoadingSlots(false);
    }

    function generateTimeSlots() {
        if (!salon) { setSlots([]); return; }
        const timeSlots: string[] = [];
        const fixTime = (t: string) => t && t.includes(':') && t.split(':')[0].length === 1 ? `0${t}` : t;

        const startStr = fixTime(salon.hora_abertura);
        const endStr = fixTime(salon.hora_fecho);

        let current = new Date(`2000-01-01T${startStr}`);
        const end = new Date(`2000-01-01T${endStr}`);

        let lunchStart: Date | null = null;
        let lunchEnd: Date | null = null;

        if (salon.almoco_inicio && salon.almoco_fim) {
            lunchStart = new Date(`2000-01-01T${fixTime(salon.almoco_inicio)}`);
            lunchEnd = new Date(`2000-01-01T${fixTime(salon.almoco_fim)}`);
        }

        const now = new Date();
        const isToday = selectedDate.getDate() === now.getDate() &&
            selectedDate.getMonth() === now.getMonth() &&
            selectedDate.getFullYear() === now.getFullYear();

        if (isNaN(current.getTime()) || isNaN(end.getTime())) { setSlots([]); return; }

        while (current < end) {
            let isLunchTime = false;
            if (lunchStart && lunchEnd) {
                if (current >= lunchStart && current < lunchEnd) {
                    isLunchTime = true;
                }
            }

            if (!isLunchTime) {
                const timeString = current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                let shouldAdd = true;

                if (isToday) {
                    const slotHour = current.getHours();
                    const slotMinute = current.getMinutes();
                    const currentHour = now.getHours();
                    const currentMinute = now.getMinutes();
                    if (slotHour < currentHour || (slotHour === currentHour && slotMinute <= currentMinute)) {
                        shouldAdd = false;
                    }
                }
                if (shouldAdd) timeSlots.push(timeString);
            }
            current.setMinutes(current.getMinutes() + salon.intervalo_minutos);
        }
        setSlots(timeSlots);
    }

    function handleBooking() {
        if (!selectedSlot) return Alert.alert("Selecione um horário", "Por favor escolha uma hora para o corte.");

        const bookingParams: any = {
            salonId: id,
            salonName: salon?.nome_salao,
            date: selectedDate.toISOString(),
            time: selectedSlot,
            employeeId: selectedEmployee ? selectedEmployee.id : 'any', // <--- NOVO
            employeeName: selectedEmployee ? selectedEmployee.nome : 'Qualquer um' // <--- NOVO
        };

        if (prefillServiceId) {
            bookingParams.serviceId = prefillServiceId;
            bookingParams.serviceName = prefillServiceName;
            bookingParams.servicePrice = prefillServicePrice;
        }

        router.push({
            pathname: '/book-confirm',
            params: bookingParams
        });
    }

    const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (!galleryVisible) return;
        const contentOffset = e.nativeEvent.contentOffset.x;
        const viewSize = e.nativeEvent.layoutMeasurement.width;
        const newIndex = Math.floor(contentOffset / viewSize);
        setFullImageIndex(newIndex);
    };

    if (loading || !salon) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

    return (
        <View style={styles.container}>
            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={{ paddingBottom: 0 }}
                showsVerticalScrollIndicator={false}
            >
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

                            <View style={{
                                position: 'absolute',
                                bottom: 55,
                                right: 20,
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 20,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6
                            }}>
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

                        <TouchableOpacity style={styles.headerBtn} onPress={handleContactMenu} activeOpacity={0.8}>
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
                                    <Text style={styles.infoLabel}>Horário de funcionamento</Text>
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

                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Agendamento</Text>
                        {employees.length > 0 && (
                            <View style={{ marginBottom: 16 }}>
                               
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>

                                    {/* Opção: Qualquer um */}
                                    <TouchableOpacity
                                        style={[
                                            styles.employeeCard,
                                            !selectedEmployee && { borderColor: colors.text, backgroundColor: colors.iconBg }
                                        ]}
                                        onPress={() => { setSelectedEmployee(null); setSelectedSlot(null); }}
                                        activeOpacity={0.7}
                                    >
                                        <View style={[styles.employeeAvatarPlaceholder, !selectedEmployee && { backgroundColor: colors.text }]}>
                                            <Ionicons name="people" size={20} color={!selectedEmployee ? colors.bg : colors.text} />
                                        </View>
                                        <Text style={[styles.employeeName, !selectedEmployee && { fontWeight: '700', color: colors.text }]}>
                                            Qualquer um
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Lista de Funcionários */}
                                    {employees.map(emp => (
                                        <TouchableOpacity
                                            key={emp.id}
                                            style={[
                                                styles.employeeCard,
                                                selectedEmployee?.id === emp.id && { borderColor: colors.text, backgroundColor: colors.iconBg }
                                            ]}
                                            onPress={() => { setSelectedEmployee(emp); setSelectedSlot(null); }}
                                            activeOpacity={0.7}
                                        >
                                            <Image source={{ uri: emp.foto || 'https://via.placeholder.com/100' }} style={styles.employeeAvatar} />
                                            <Text style={[styles.employeeName, selectedEmployee?.id === emp.id && { fontWeight: '700', color: colors.text }]}>
                                                {emp.nome.split(' ')[0]} {/* Mostra só o primeiro nome */}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        <View style={styles.scheduleCard}>
                            <View style={styles.calendarHeader}>
                                <TouchableOpacity
                                    onPress={goToPrevMonth}
                                    disabled={isCurrentMonth}
                                    style={[styles.arrowButton, isCurrentMonth && styles.arrowButtonDisabled]}
                                >
                                    <Ionicons name="chevron-back" size={20} color={isCurrentMonth ? colors.subText : colors.text} />
                                </TouchableOpacity>

                                <Text style={styles.currentMonth}>
                                    {displayedMonth.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}
                                </Text>

                                <TouchableOpacity onPress={goToNextMonth} style={styles.arrowButton}>
                                    <Ionicons name="chevron-forward" size={20} color={colors.text} />
                                </TouchableOpacity>
                            </View>

                            <FlatList
                                ref={flatListRef}
                                data={calendarDays}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 10, paddingRight: 20 }}
                                keyExtractor={(item) => item.toISOString()}
                                onViewableItemsChanged={onViewableItemsChanged}
                                viewabilityConfig={viewabilityConfig}
                                getItemLayout={(data, index) => ({ length: 66, offset: 66 * index, index })}
                                renderItem={({ item }) => {
                                    const isSelected = isSameDay(item, selectedDate);
                                    return (
                                        <TouchableOpacity
                                            style={[styles.datePill, isSelected && styles.datePillSelected]}
                                            onPress={() => {
                                                setSelectedDate(item);
                                                setSelectedSlot(null);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
                                                {item.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '').toUpperCase()}
                                            </Text>
                                            <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>
                                                {item.getDate()}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                }}
                            />

                            <View style={styles.scheduleDivider} />

                            <View style={styles.slotsMinHeight}>
                                {isClosedToday ? (
                                    <View style={{ minHeight: 260, justifyContent: 'center', alignItems: 'center' }}>
                                        <View style={styles.closedIconBg}>
                                            <Ionicons name="moon" size={24} color="#FF9500" />
                                        </View>
                                        <Text style={styles.closedText}>Fechado</Text>
                                        <Text style={styles.closedReason}>{closureReason || "Indisponível neste dia."}</Text>
                                    </View>
                                ) : loadingSlots ? (
                                    <View style={{ minHeight: 260, justifyContent: 'center', alignItems: 'center' }}>
                                        <ActivityIndicator size="large" color={colors.primary} />
                                    </View>
                                ) : (
                                    <View style={{ width: '100%' }}>
                                        {(() => {
                                            const cardPadding = 32;
                                            const screenPadding = 48;
                                            const totalGap = 20;
                                            const availableWidth = width - screenPadding - cardPadding - totalGap;
                                            const slotWidth = Math.floor(availableWidth / 3);

                                            const now = new Date();
                                            const isToday = selectedDate.getDate() === now.getDate() &&
                                                selectedDate.getMonth() === now.getMonth() &&
                                                selectedDate.getFullYear() === now.getFullYear();

                                            const currentHour = now.getHours();
                                            const currentMinute = now.getMinutes();

                                            const futureSlots = slots.filter((time) => {
                                                if (!isToday) return true;
                                                const [hStr, mStr] = time.split(':');
                                                const slotHour = parseInt(hStr, 10);
                                                const slotMinute = parseInt(mStr, 10);

                                                return slotHour > currentHour || (slotHour === currentHour && slotMinute >= currentMinute);
                                            });

                                            if (slots.length === 0 || futureSlots.length === 0) {
                                                return (
                                                    <View style={{ minHeight: 260, justifyContent: 'center', alignItems: 'center' }}>
                                                        <Text style={[styles.noSlotsText, { width: '100%', textAlign: 'center' }]}>
                                                            {slots.length === 0 ? "Sem vagas para este dia." : "Já não há horários disponíveis para hoje."}
                                                        </Text>
                                                    </View>
                                                );
                                            }

                                            return (
                                                <View style={styles.slotsGrid}>
                                                    {futureSlots.map((time) => {
                                                        const isBusy = busySlots.includes(time);
                                                        const isSelected = selectedSlot === time;
                                                        return (
                                                            <TouchableOpacity
                                                                key={time}
                                                                disabled={isBusy}
                                                                style={[
                                                                    styles.slotItem,
                                                                    { width: slotWidth },
                                                                    isSelected && styles.slotItemSelected,
                                                                    isBusy && styles.slotItemBusy
                                                                ]}
                                                                onPress={() => setSelectedSlot(time)}
                                                            >
                                                                <Text style={[
                                                                    styles.slotText,
                                                                    isSelected && styles.slotTextSelected,
                                                                    isBusy && styles.slotTextBusy
                                                                ]}>{time}</Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            );
                                        })()}
                                    </View>
                                )}
                            </View>
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
                                    <Text style={styles.mapAddress} numberOfLines={1}>
                                        {salon.morada}
                                    </Text>
                                    <Text style={styles.mapCity}>
                                        {salon.cidade}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.mapArrowIcon}>
                                <Ionicons name="arrow-forward-circle" size={32} color={colors.accent} />
                            </View>
                        </TouchableOpacity>
                    </View>

                </View>
            </ScrollView>

            <View style={styles.footerContainer}>
                <View style={styles.footerContent}>
                    <View>
                        <Text style={styles.footerLabel}>Horário</Text>
                        <Text style={styles.footerTime}>{selectedSlot ? `${selectedSlot}` : '--:--'}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.bookBtn, (!selectedSlot || isClosedToday) && styles.bookBtnDisabled]}
                        disabled={!selectedSlot || isClosedToday}
                        onPress={handleBooking}
                    >
                        <Text style={[
                            styles.bookBtnText,
                            // Lógica de cor dinâmica
                            { color: isDarkMode ? ((!selectedSlot || isClosedToday) ? 'white' : '#000') : 'white' }
                        ]}>
                            Agendar
                        </Text>
                        <Ionicons
                            name="arrow-forward"
                            size={18}
                            // O ícone acompanha exatamente a cor do texto
                            color={isDarkMode ? ((!selectedSlot || isClosedToday) ? 'white' : '#000') : 'white'}
                        />
                    </TouchableOpacity>
                </View>
            </View>
            <Modal
                visible={galleryVisible}
                transparent={true}
                onRequestClose={() => setGalleryVisible(false)}
                animationType="fade"
            >
                <View style={styles.fullScreenContainer}>
                    <StatusBar hidden={galleryVisible} />

                    <TouchableOpacity
                        style={[
                            styles.headerBtn,
                            { position: 'absolute', top: 50, right: 20, zIndex: 10 }
                        ]}
                        onPress={() => setGalleryVisible(false)}
                    >
                        <Ionicons name="close" size={24} color={colors.text} />
                    </TouchableOpacity>

                    <Text style={styles.counterText}>
                        {`${fullImageIndex + 1} / ${portfolio.length}`}
                    </Text>

                    <FlatList
                        ref={galleryMainRef}
                        data={portfolio}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
                                <Image
                                    source={{ uri: item.image_url }}
                                    style={styles.fullScreenImage}
                                />
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
                                        style={[
                                            styles.thumbButton,
                                            isActive && styles.thumbButtonActive
                                        ]}
                                    >
                                        <Image
                                            source={{ uri: item.image_url }}
                                            style={[
                                                styles.thumbImage,
                                                isActive && { opacity: 1 },
                                                !isActive && { opacity: 0.6 }
                                            ]}
                                        />
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </View>
            </Modal>

            <Modal
                visible={contactModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={closeModal}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        activeOpacity={1}
                        onPress={closeModal}
                    />
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
                                    <Ionicons name="call" size={24} color={colors.accent} />
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
    container: { flex: 1, backgroundColor: isDarkMode ? '#000' : '#fff' },

    headerContainer: {
        height: 330,
        width: '100%',
        position: 'relative',
        backgroundColor: colors.iconBg
    },
    coverImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover'
    },

    headerBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },
    backButtonPosition: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 30 : 10,
        left: 20,
        zIndex: 10,
    },
    rightButtonsContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 30 : 10,
        right: 20,
        flexDirection: 'row',
        gap: 10,
        zIndex: 10,
    },

    sheetContent: {
        marginTop: -40,
        backgroundColor: colors.bg,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 24,
        paddingTop: 30,
        paddingBottom: 110,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    salonHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 16,
        lineHeight: 32,
        letterSpacing: -0.5
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
        width: '100%',
    },
    iconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.iconBg,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        flexShrink: 0,
    },
    infoText: {
        color: colors.text,
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
        lineHeight: 20,
    },
    infoLabel: {
        fontSize: 11,
        color: colors.subText,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginBottom: 2
    },
    infoValue: {
        fontSize: 14,
        color: colors.text,
        fontWeight: '600'
    },
    ratingCard: {
        backgroundColor: colors.card,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    ratingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 6
    },
    ratingDivider: {
        width: '100%',
        height: 1,
        backgroundColor: colors.border,
        marginBottom: 6
    },
    ratingNumber: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.text
    },
    reviewCount: {
        fontSize: 11,
        color: colors.subText,
        fontWeight: '500'
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginTop: 12,
        marginBottom: 24
    },

    sectionContainer: { marginBottom: 24 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 },

    scheduleCard: {
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
        borderWidth: 1,
        borderColor: colors.border,
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingHorizontal: 0,
    },
    arrowButton: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: colors.iconBg,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    arrowButtonDisabled: {
        backgroundColor: isDarkMode ? '#1C1C1E' : '#FAFAFA',
        borderColor: colors.border,
        opacity: 0.5,
    },
    currentMonth: {
        fontSize: 15,
        color: colors.text,
        fontWeight: '700',
        textTransform: 'capitalize',
        textAlign: 'center',
        minWidth: 120,
    },
    datePill: {
        width: 56,
        height: 70,
        borderRadius: 16,
        backgroundColor: isDarkMode ? '#2C2C2E' : '#F9FAFB',
        borderWidth: 1,
        borderColor: colors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    datePillSelected: {
        backgroundColor: colors.text,
        borderColor: colors.text,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    dayName: {
        fontSize: 12,
        color: colors.subText,
        fontWeight: '600',
        marginBottom: 4,
    },
    dayNameSelected: {
        color: colors.bg,
    },
    dayNumber: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
    },
    dayNumberSelected: {
        color: colors.bg,
    },

    slotsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    slotItem: {
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: isDarkMode ? '#2C2C2E' : '#F9FAFB',
        borderWidth: 1,
        borderColor: colors.border,
    },
    slotItemSelected: {
        backgroundColor: colors.text,
        borderColor: colors.text,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3,
    },
    slotItemBusy: {
        backgroundColor: 'transparent',
        borderColor: colors.border,
        opacity: 0.5
    },
    scheduleDivider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 20,
    },
    slotText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text
    },
    slotTextSelected: {
        color: colors.bg
    },
    slotTextBusy: {
        color: colors.subText,
        textDecorationLine: 'line-through',
        fontWeight: '400'
    },
    noSlotsText: {
        color: colors.subText,
        textAlign: 'center',
        fontStyle: 'italic',
        marginBottom: 10
    },
    slotsMinHeight: {
        minHeight: 260,
        width: '100%',
    },

    closedIconBg: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: isDarkMode ? '#332700' : '#FFF4E5', justifyContent: 'center', alignItems: 'center',
        marginBottom: 12
    },
    closedText: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
    closedReason: { fontSize: 14, color: colors.subText, textAlign: 'center' },

    mapCard: {
        height: 180,
        backgroundColor: colors.iconBg,
        borderRadius: 20,
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 1,
        borderColor: colors.border,
    },
    mapImage: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%',
    },
    mapBackground: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: isDarkMode ? 'rgba(30, 40, 50, 0.8)' : 'rgba(230, 235, 240, 0.6)',
    },
    mapContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    mapPinCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
    mapCtaText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.accent,
        marginBottom: 8,
    },
    mapAddressContainer: {
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    mapAddress: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
        textAlign: 'center',
    },
    mapCity: {
        fontSize: 13,
        color: colors.subText,
        marginTop: 2,
    },
    mapArrowIcon: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        zIndex: 3,
    },

    footerContainer: {
        position: 'absolute', bottom: 0, width: '100%',
        backgroundColor: colors.card,
        borderTopWidth: 1, borderTopColor: colors.border,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        paddingTop: 20, paddingHorizontal: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 20
    },
    footerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    footerLabel: { fontSize: 12, color: colors.subText, marginBottom: 2 },
    footerTime: { fontSize: 20, fontWeight: '800', color: colors.text },
    bookBtn: {
        backgroundColor: colors.primary,
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 32,
        borderRadius: 50, gap: 8,
        shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
    },
    bookBtnDisabled: { backgroundColor: colors.border, shadowOpacity: 0 },
    bookBtnText: { color: isDarkMode ? '#000' : 'white', fontWeight: '700', fontSize: 16 },

    fullScreenContainer: { flex: 1, backgroundColor: 'black' },
    fullScreenImage: { width: width, height: height * 0.8, resizeMode: 'contain' },
    counterText: { position: 'absolute', top: 60, alignSelf: 'center', color: 'white', fontSize: 16, fontWeight: '600', opacity: 0.8, zIndex: 998 },
    descriptionOverlay: {
        position: 'absolute', bottom: 140, left: 20, right: 20, overflow: 'hidden',
        padding: 16, borderRadius: 16,
    },
    descriptionText: { color: 'white', fontSize: 14, textAlign: 'center', fontWeight: '500', lineHeight: 22 },
    thumbnailsContainer: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        height: 80,
    },
    thumbButton: {
        width: 60,
        height: 60,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    thumbButtonActive: {
        borderColor: 'white',
        transform: [{ scale: 1.1 }]
    },
    thumbImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },

    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalSheet: {
        backgroundColor: colors.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
        width: '100%',
    },
    dragIndicator: {
        width: 40,
        height: 5,
        backgroundColor: colors.border,
        borderRadius: 3,
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: colors.subText,
        marginBottom: 30,
        textAlign: 'center',
    },
    actionsContainer: {
        width: '100%',
        backgroundColor: colors.iconBg,
        borderRadius: 16,
        padding: 8,
        marginBottom: 20,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    actionIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    actionTextContainer: {
        flex: 1,
    },
    actionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 2,
    },
    actionValue: {
        fontSize: 13,
        color: colors.subText,
    },
    actionDivider: {
        height: 1,
        backgroundColor: colors.border,
        marginLeft: 76,
    },
    cancelButton: {
        width: '100%',
        paddingVertical: 16,
        backgroundColor: colors.iconBg,
        borderRadius: 50,
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
    employeeCard: {
        alignItems: 'center',
        padding: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        minWidth: 85,
    },
    employeeAvatar: {
        width: 46,
        height: 46,
        borderRadius: 23,
        marginBottom: 8,
        backgroundColor: colors.border,
    },
    employeeAvatarPlaceholder: {
        width: 46,
        height: 46,
        borderRadius: 23,
        marginBottom: 8,
        backgroundColor: colors.iconBg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    employeeName: {
        fontSize: 12,
        color: colors.subText,
        fontWeight: '500',
        textAlign: 'center',
    },
});