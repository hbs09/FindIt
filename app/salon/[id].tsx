import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
    NativeSyntheticEvent, // <--- NOVO
    PanResponder,
    Platform,
    ScrollView,
    Share, // <--- IMPORTANTE: Adicionado para partilha
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../supabase';

const { width, height } = Dimensions.get('window');
const PRIMARY_COLOR = '#111';
const ACCENT_COLOR = '#0a7ea4';

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
    // --- NOVOS CAMPOS ---
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

export default function SalonScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [salon, setSalon] = useState<Salon | null>(null);
    const [loading, setLoading] = useState(true);

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

    // NOVOS REFS PARA A GALERIA
    const galleryMainRef = useRef<FlatList>(null);
    const galleryThumbRef = useRef<FlatList>(null);

    // Variável animada para a posição Y (vertical)
    // Começa fora do ecrã (height)
    const panY = useRef(new Animated.Value(height)).current;
    const [calendarDays, setCalendarDays] = useState<Date[]>([]);
    const flatListRef = useRef<FlatList>(null); // <--- Para controlar o scroll
    // Cálculo para 4 colunas perfeitas
    // width - (paddingHorizontal * 2) - (gap * 3) / 4
    const GAP = 10;
    const PADDING = 48; // 24 de cada lado
    const itemWidth = (width - PADDING - (GAP * 3)) / 4;

    // 1. Configuração: Item conta como visível se 50% estiver no ecrã
    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50
    }).current;

    // Sincronizar a miniatura ativa quando a imagem grande muda
    useEffect(() => {
        if (galleryVisible && galleryThumbRef.current && portfolio.length > 0) {
            if (fullImageIndex >= 0 && fullImageIndex < portfolio.length) {
                // ALTERAÇÃO: setTimeout para garantir que a lista já existe antes de fazer scroll
                setTimeout(() => {
                    galleryThumbRef.current?.scrollToIndex({
                        index: fullImageIndex,
                        animated: true,
                        viewPosition: 0.5 // Mantém a miniatura centrada
                    });
                }, 100); // 100ms é suficiente para o Modal renderizar
            }
        }
    }, [fullImageIndex, galleryVisible]);

    useEffect(() => {
        if (id) {
            fetchSalonDetails();
            checkUserAndFavorite();
            fetchClosures();
        }
    }, [id]);

    // 2. Callback: Atualiza o mês quando os itens visíveis mudam
    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems && viewableItems.length > 0) {
            // Pega a data do primeiro item visível na lista
            const firstVisibleItem = viewableItems[0].item;
            setDisplayedMonth(firstVisibleItem);
        }
    }).current;

    const today = new Date();
    const isCurrentMonth = displayedMonth.getMonth() === today.getMonth() &&
        displayedMonth.getFullYear() === today.getFullYear();

    const goToNextMonth = () => {
        // Calcula o 1º dia do próximo mês
        const nextMonthDate = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);

        // Procura esse dia na lista
        const index = calendarDays.findIndex(d =>
            d.getMonth() === nextMonthDate.getMonth() &&
            d.getFullYear() === nextMonthDate.getFullYear()
        );

        // Faz o scroll se encontrar
        if (index !== -1 && flatListRef.current) {
            flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0 });
        }
    };

    const handleOpenMap = () => {
        // --- CORREÇÃO: Se o salão não existir, pára a função aqui ---
        if (!salon) return;

        const query = encodeURIComponent(`${salon.morada}, ${salon.cidade}`);

        const url = Platform.select({
            ios: `maps:0,0?q=${query}`,
            android: `geo:0,0?q=${query}`
        });

        if (url) {
            Linking.openURL(url).catch(() => {
                // Fallback para browser se a app falhar
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
            });
        }
    };

    const goToPrevMonth = () => {
        if (isCurrentMonth) return; // Segurança extra

        // Calcula o 1º dia do mês anterior ao que está a ser mostrado
        const prevMonthDate = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);

        // Se o mês anterior for o mês atual (onde estamos hoje), vai para o início da lista (Hoje)
        // Isto é necessário porque os dias 1, 2, 3... do mês atual podem já ter passado e não existem na lista
        if (prevMonthDate.getMonth() === today.getMonth() && prevMonthDate.getFullYear() === today.getFullYear()) {
            flatListRef.current?.scrollToIndex({ index: 0, animated: true, viewPosition: 0 });
            return;
        }

        // Caso contrário (meses futuros), procura o dia 1
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
        // Gera dias para os próximos 12 meses (365 dias)
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
    }, [selectedDate, salon, closures]);

    useEffect(() => {
        if (calendarDays.length > 0 && flatListRef.current) {
            // Procura o índice do dia selecionado
            const index = calendarDays.findIndex(d => isSameDay(d, selectedDate));
            if (index !== -1) {
                // Scroll suave até ao dia
                flatListRef.current.scrollToIndex({
                    index,
                    animated: true,
                    viewPosition: 0.5 // Centra o dia na lista
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
    }, [id, selectedDate]);

    // ... (MANTENHA AS FUNÇÕES FETCH AQUI) ...
    async function fetchClosures() {
        const { data } = await supabase.from('salon_closures').select('*').eq('salon_id', id);
        if (data) setClosures(data);
    }

    function handleContactMenu() {
        openModal();
    }

    // Função auxiliar para verificar se duas datas são o mesmo dia
    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getDate() === d2.getDate() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getFullYear() === d2.getFullYear();
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 0, // Só ativa se arrastar para baixo
            onPanResponderMove: Animated.event(
                [null, { dy: panY }], // Conecta o movimento do dedo à variável panY
                { useNativeDriver: false }
            ),
            onPanResponderRelease: (_, gestureState) => {
                // Se arrastou mais de 150px ou foi rápido -> Fecha
                if (gestureState.dy > 150 || gestureState.vy > 0.5) {
                    closeModal();
                } else {
                    // Senão -> Volta à posição original (0)
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
        // Reinicia a posição para 0 (mas começamos a animar de baixo)
        panY.setValue(0);
        // Pequeno truque: animamos a transição de entrada usando translateY
        // Mas para o PanResponder funcionar bem, vamos usar uma animação simples de entrada:
        // Na verdade, o melhor é inicializar em 'height' e animar para 0
        panY.setValue(height);
        Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4
        }).start();
    }

    function closeModal() {
        Animated.timing(panY, {
            toValue: height, // Envia para baixo (fora do ecrã)
            duration: 250,
            useNativeDriver: true,
        }).start(() => setContactModalVisible(false)); // Só esconde o modal no fim da animação
    }

    function performContactAction(type: 'phone' | 'email') {
        closeModal(); // Fecha com animação

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

    // --- NOVA FUNÇÃO DE PARTILHA ---
    const handleShare = async () => {
        try {
            const result = await Share.share({
                message: `Olha este salão que encontrei no FindIt: ${salon?.nome_salao} em ${salon?.cidade}!`,
                // url: 'https://findit.app/salon/' + id // Se tiveres deep linking configurado
            });
        } catch (error: any) {
            Alert.alert(error.message);
        }
    };

    // ... (MANTENHA AS FUNÇÕES DE HORÁRIO E DATA) ...
    async function fetchAvailability() {
        setLoadingSlots(true);
        setBusySlots([]);
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const { data } = await supabase
            .from('appointments')
            .select('data_hora')
            .eq('salon_id', id)
            .gte('data_hora', startOfDay.toISOString())
            .lte('data_hora', endOfDay.toISOString())
            // CORREÇÃO: Exclui todos os tipos de cancelamento e faltas de uma só vez
            .not('status', 'in', '("cancelado","cancelado_cliente","cancelado_salao","faltou")');

        if (data) {
            const occupied = data.map(app => {
                const d = new Date(app.data_hora);
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            });
            setBusySlots(occupied);
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

    function changeDate(days: number) {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + days);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (newDate >= today) { setSelectedDate(newDate); setSelectedSlot(null); }
    }

    function handleBooking() {
        if (!selectedSlot) return Alert.alert("Selecione um horário", "Por favor escolha uma hora para o corte.");
        router.push({
            pathname: '/book-confirm',
            params: { salonId: id, salonName: salon?.nome_salao, date: selectedDate.toISOString(), time: selectedSlot }
        });
    }

    const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        // Se a galeria não estiver visível, ignoramos eventos de scroll (evita reabrir ao fechar)
        if (!galleryVisible) return;

        const contentOffset = e.nativeEvent.contentOffset.x;
        const viewSize = e.nativeEvent.layoutMeasurement.width;
        const newIndex = Math.floor(contentOffset / viewSize);
        setFullImageIndex(newIndex);
    };

    if (loading || !salon) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY_COLOR} /></View>;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={{ paddingBottom: 0 }} showsVerticalScrollIndicator={false}>

                {/* HEADER ATUALIZADO */}
                <View style={styles.headerContainer}>
                    {/* Lógica: Se tiver fotos no portfólio, torna a imagem clicável e mostra contador */}
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

                            {/* Badge com contador de fotos */}
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
                        // Se não tiver fotos extra, mostra apenas a imagem estática
                        <Image
                            source={{ uri: salon.imagem || 'https://via.placeholder.com/600x400' }}
                            style={styles.coverImage}
                        />
                    )}

                    {/* Botão Esquerdo: Voltar (Estilo Uniformizado) */}
                    <TouchableOpacity
                        style={[styles.headerBtn, styles.backButtonPosition]}
                        onPress={() => router.back()}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
                    </TouchableOpacity>

                    {/* Botões Direitos (Estilo Uniformizado) */}
                    <View style={styles.rightButtonsContainer}>
                        <TouchableOpacity style={styles.headerBtn} onPress={handleShare} activeOpacity={0.8}>
                            <Ionicons name="share-outline" size={22} color="#1A1A1A" />
                        </TouchableOpacity>

                        {isLoggedIn && (
                            <TouchableOpacity style={styles.headerBtn} onPress={toggleFavorite} activeOpacity={0.8}>
                                <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={22} color={isFavorite ? "#FF3B30" : "#1A1A1A"} />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.headerBtn} onPress={handleContactMenu} activeOpacity={0.8}>
                            <Ionicons name="ellipsis-horizontal" size={22} color="#1A1A1A" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* SHEET CONTENT */}
                <View style={styles.sheetContent}>

                    {/* 1. Cabeçalho do Salão (Info + Rating) */}
                    <View style={styles.salonHeader}>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={styles.title}>{salon.nome_salao}</Text>

                            <View style={styles.infoRow}>
                                <View style={styles.iconCircle}>
                                    <Ionicons name="location-sharp" size={18} color="#000" />
                                </View>
                                <Text style={styles.infoText}>
                                    {salon.morada}, {salon.cidade}
                                </Text>
                            </View>

                            <View style={[styles.infoRow, { marginBottom: 0 }]}>
                                <View style={styles.iconCircle}>
                                    <Ionicons name="time-sharp" size={18} color="#000" />
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
                                <Ionicons name="star" size={16} color="#000" />
                            </View>
                            <View style={styles.ratingDivider} />
                            <Text style={styles.reviewCount}>
                                {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
                            </Text>
                        </View>
                    </View>

                    {/* LINHA DE SEPARAÇÃO */}
                    <View style={styles.divider} />

                    {/* 2. CARTÃO DE AGENDAMENTO */}
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Agendamento</Text>

                        <View style={styles.scheduleCard}>
                            {/* Cabeçalho Calendário */}
                            <View style={styles.calendarHeader}>
                                <TouchableOpacity
                                    onPress={goToPrevMonth}
                                    disabled={isCurrentMonth}
                                    style={[styles.arrowButton, isCurrentMonth && styles.arrowButtonDisabled]}
                                >
                                    <Ionicons name="chevron-back" size={20} color={isCurrentMonth ? "#E5E5EA" : "#1a1a1a"} />
                                </TouchableOpacity>

                                <Text style={styles.currentMonth}>
                                    {displayedMonth.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}
                                </Text>

                                <TouchableOpacity onPress={goToNextMonth} style={styles.arrowButton}>
                                    <Ionicons name="chevron-forward" size={20} color="#1a1a1a" />
                                </TouchableOpacity>
                            </View>

                            {/* Carrossel Dias */}
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

                            {/* Slots Horários */}
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
                                        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
                                    </View>
                                ) : (
                                    <View style={{ width: '100%' }}>
                                        {(() => {
                                            const cardPadding = 32;
                                            const screenPadding = 48;
                                            const totalGap = 20;
                                            const availableWidth = width - screenPadding - cardPadding - totalGap;
                                            const slotWidth = Math.floor(availableWidth / 3);

                                            // Lógica do tempo
                                            const now = new Date();
                                            const isToday = selectedDate.getDate() === now.getDate() &&
                                                selectedDate.getMonth() === now.getMonth() &&
                                                selectedDate.getFullYear() === now.getFullYear();

                                            const currentHour = now.getHours();
                                            const currentMinute = now.getMinutes();

                                            // Retira os horários que já passaram
                                            const futureSlots = slots.filter((time) => {
                                                if (!isToday) return true;
                                                const [hStr, mStr] = time.split(':');
                                                const slotHour = parseInt(hStr, 10);
                                                const slotMinute = parseInt(mStr, 10);
                                                
                                                return slotHour > currentHour || (slotHour === currentHour && slotMinute >= currentMinute);
                                            });

                                            // Se estiver tudo apagado, mostra mensagem centrada
                                            if (slots.length === 0 || futureSlots.length === 0) {
                                                return (
                                                    <View style={{ minHeight: 260, justifyContent: 'center', alignItems: 'center' }}>
                                                        <Text style={[styles.noSlotsText, { width: '100%', textAlign: 'center' }]}>
                                                            {slots.length === 0 ? "Sem vagas para este dia." : "Já não há horários disponíveis para hoje."}
                                                        </Text>
                                                    </View>
                                                );
                                            }

                                            // Renderiza o grid perfeitamente alinhado ao topo
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

                    {/* 3. SECÇÃO LOCALIZAÇÃO (MAPA) */}
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
                                <Ionicons name="arrow-forward-circle" size={32} color="#007AFF" />
                            </View>
                        </TouchableOpacity>
                    </View>

                </View>
            </ScrollView>

            {/* Sticky Footer */}
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
                        <Text style={styles.bookBtnText}>Agendar</Text>
                        <Ionicons name="arrow-forward" size={18} color="white" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* MODAL DE GALERIA FULL SCREEN COM THUMBNAILS */}
            <Modal
                visible={galleryVisible}
                transparent={true}
                onRequestClose={() => setGalleryVisible(false)}
                animationType="fade"
            >
                <View style={styles.fullScreenContainer}>
                    <StatusBar hidden={galleryVisible} />

                    {/* Botão Fechar (Com o design HeaderBtn) */}
                    <TouchableOpacity
                        style={[
                            styles.headerBtn,
                            { position: 'absolute', top: 50, right: 20, zIndex: 10 }
                        ]}
                        onPress={() => setGalleryVisible(false)}
                    >
                        <Ionicons name="close" size={24} color="#1A1A1A" />
                    </TouchableOpacity>

                    {/* Contador */}
                    <Text style={styles.counterText}>
                        {`${fullImageIndex + 1} / ${portfolio.length}`}
                    </Text>

                    {/* LISTA PRINCIPAL (IMAGENS GRANDES) */}
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
                            // Garante que abre na imagem certa
                            if (galleryMainRef.current && fullImageIndex > 0) {
                                galleryMainRef.current.scrollToIndex({ index: fullImageIndex, animated: false });
                            }
                        }}
                        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
                    />

                    {/* CARROSSEL DE MINIATURAS (NOVO) */}
                    <View style={styles.thumbnailsContainer}>
                        <FlatList
                            ref={galleryThumbRef}
                            data={portfolio}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={(item) => item.id.toString()}
                            contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
                            getItemLayout={(_, index) => ({ length: 70, offset: 70 * index, index })} // 60 width + 10 gap
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

            {/* MODAL DE CONTACTO (Mantido) */}
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
                                <View style={[styles.actionIcon, { backgroundColor: '#E3F2FD' }]}>
                                    <Ionicons name="call" size={24} color="#007AFF" />
                                </View>
                                <View style={styles.actionTextContainer}>
                                    <Text style={styles.actionTitle}>Ligar</Text>
                                    <Text style={styles.actionValue}>{salon?.telefone || 'Indisponível'}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#CCC" />
                            </TouchableOpacity>

                            <View style={styles.actionDivider} />

                            <TouchableOpacity style={styles.actionButton} onPress={() => performContactAction('email')}>
                                <View style={[styles.actionIcon, { backgroundColor: '#F3E5F5' }]}>
                                    <Ionicons name="mail" size={24} color="#9C27B0" />
                                </View>
                                <View style={styles.actionTextContainer}>
                                    <Text style={styles.actionTitle}>Enviar Email</Text>
                                    <Text style={styles.actionValue}>{salon?.email || 'Indisponível'}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#CCC" />
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

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1, backgroundColor: '#fff' },

    // --- Header ---
    headerContainer: {
        height: 330, // Reduzido de 320 para 250 (diminui o efeito de zoom)
        width: '100%',
        position: 'relative',
        backgroundColor: '#f0f0f0' // Cor de fundo caso a imagem demore a carregar
    },

    coverImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover' // Garante que preenche sem "esticar" (distorcer)
    },

    // Botão Voltar (Esquerda)
    backButtonContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 30 : 10,
        left: 20,
        overflow: 'hidden',
        borderRadius: 20,
        zIndex: 10 // Garante que fica acima de tudo
    },

    // --- Estilos do Preview do Portfólio ---
    portfolioCard: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 12,
        borderWidth: 1,
        borderColor: '#F2F4F7',
        // Sombra suave
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    previewImagesRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
        height: 100, // Altura das miniaturas
    },
    previewImageContainer: {
        flex: 1, // Divide o espaço igualmente por 3
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    previewImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    moreImagesOverlay: {
        ...StyleSheet.absoluteFillObject, // Cobre a imagem toda
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    moreImagesText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 18,
    },
    portfolioButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F9FAFB',
        paddingVertical: 12,
        borderRadius: 12,
        gap: 8,
    },
    portfolioButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1A1A1A',
    },

    // --- Estilos do Modal da Galeria ---
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F2F4F7',
    },
    closeModalButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F2F4F7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalHeaderTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1A1A1A',
    },
    gridImageContainer: {
        flex: 1 / 3, // 33% de largura
        aspectRatio: 1, // Quadrado
        padding: 2,
    },
    gridImage: {
        flex: 1,
        borderRadius: 8,
        backgroundColor: '#F2F4F7',
    },

    // --- Sheet Content ---
    sheetContent: {
        marginTop: -40,
        backgroundColor: 'white',
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
    // --- Salon Info ---
    salonHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8 // Reduzido (era 10 ou mais)
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: '#000',
        marginBottom: 16, // Aumentei um pouco para separar dos ícones
        lineHeight: 32,
        letterSpacing: -0.5
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center', // <--- ALTERADO: Alinha sempre ao centro verticalmente
        marginBottom: 14,
        width: '100%', // Garante que usa a largura toda
    },
    iconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F5F5F5',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        flexShrink: 0, // <--- NOVO: Impede o ícone de ser "esmagado" se o texto for grande
    },
    infoText: {
        color: '#333',
        fontSize: 15,
        fontWeight: '500',
        flex: 1, // Ocupa o espaço restante
        lineHeight: 20,
        // marginTop: 8  <--- REMOVIDO: Não é necessário com alignItems: 'center'
    },
    infoLabel: {
        fontSize: 11,
        color: '#666',
        fontWeight: '700',
        textTransform: 'uppercase',
        marginBottom: 2
    },
    infoValue: {
        fontSize: 14,
        color: '#000',
        fontWeight: '600'
    },
    ratingCard: {
        backgroundColor: 'white',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5E5E5',
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
        backgroundColor: '#E5E5E5',
        marginBottom: 6
    },
    ratingBox: { alignItems: 'center', backgroundColor: '#F9F9F9', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EEE' },
    ratingNumber: {
        fontSize: 22, // Maior destaque
        fontWeight: '800',
        color: '#000'
    },
    reviewCount: {
        fontSize: 11,
        color: '#666',
        fontWeight: '500'
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E5E5',
        marginTop: 12,    // <--- IMPORTANTE: Define o espaço logo abaixo do horário (reduz este valor se quiseres ainda menos)
        marginBottom: 24  // Mantém espaço para a secção seguinte (Portfólio)
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)', // Fundo escurecido
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4, // Espaçamento vertical suave
        marginBottom: 0,
    },
    menuTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1A1A1A',
    },
    menuSubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    // ...
    modalSheet: {
        backgroundColor: 'white',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        alignItems: 'center',
        // Sombra para destacar
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
        width: '100%', // Garantir largura total
    },

    mapCard: {
        height: 180, // Altura do quadrado do mapa
        backgroundColor: '#F2F4F7', // Cor de fundo tipo mapa
        borderRadius: 20,
        overflow: 'hidden', // Importante para a imagem não sair das bordas
        position: 'relative',
        borderWidth: 1,
        borderColor: '#E4E7EC',
    },
    mapImage: {
        ...StyleSheet.absoluteFillObject, // Preenche todo o cartão
        width: '100%',
        height: '100%',
    },
    mapBackground: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(230, 235, 240, 0.6)', // Dá um tom azulado de mapa
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
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        // Sombra do pin
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
    mapCtaText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#007AFF',
        marginBottom: 8,
    },
    mapAddressContainer: {
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    mapAddress: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1A1A1A',
        textAlign: 'center',
    },
    mapCity: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    mapArrowIcon: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        zIndex: 3,
    },
    // ...
    dragIndicator: {
        width: 40,
        height: 5,
        backgroundColor: '#E0E0E0',
        borderRadius: 3,
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1A1A1A',
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 30,
        textAlign: 'center',
    },
    actionsContainer: {
        width: '100%',
        backgroundColor: '#F9FAFB',
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
        color: '#1A1A1A',
        marginBottom: 2,
    },
    actionValue: {
        fontSize: 13,
        color: '#888',
    },
    actionDivider: {
        height: 1,
        backgroundColor: '#EEE',
        marginLeft: 76, // Alinha com o texto, ignorando o ícone
    },
    cancelButton: {
        width: '100%',
        paddingVertical: 16,
        backgroundColor: '#F2F4F7',
        borderRadius: 50,
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    sectionContainer: { marginBottom: 24 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },

    // --- Gallery ---
    galleryContainer: { paddingRight: 20 },
    galleryImage: { width: 100, height: 100, borderRadius: 16, marginRight: 12, backgroundColor: '#F0F0F0' },

    // --- Estilos do Calendário Minimalista ---
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between', // Separa as setas e o texto
        alignItems: 'center',
        marginBottom: 16,
        paddingHorizontal: 0, // Removi o padding interno para alinhar com as bordas
    },
    arrowButton: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: '#F2F2F7', // Fundo cinza suave
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5E5EA',
    },
    arrowButtonDisabled: {
        backgroundColor: '#FAFAFA', // Mais claro quando desativado
        borderColor: '#F2F2F7',
        opacity: 0.5,
    },
    // ESTILO COPIADO DO INDEX.TSX
    miniButton: {
        width: 40,
        height: 40,
        backgroundColor: 'white',
        borderRadius: 14, // Squircle (quadrado arredondado)
        justifyContent: 'center',
        alignItems: 'center',
        // Sombra suave igual ao index
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#f0f0f0'
    },
    currentMonth: {
        fontSize: 15,
        color: '#1D2939',
        fontWeight: '700', // Um pouco mais bold para destaque
        textTransform: 'capitalize',
        textAlign: 'center',
        minWidth: 120, // Garante que o texto não "dança" muito ao mudar de mês
    },
    datePill: {
        width: 56, // Ligeiramente menor para caber melhor no cartão
        height: 70,
        borderRadius: 16,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#F2F4F7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    datePillSelected: {
        backgroundColor: '#111', // Preto (Cor Primária)
        borderColor: '#111',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    dayName: {
        fontSize: 12,
        color: '#98A2B3', // Cinza médio
        fontWeight: '600',
        marginBottom: 4,
    },
    dayNameSelected: {
        color: 'rgba(255,255,255,0.6)', // Branco com transparência
    },
    dayNumber: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1D2939', // Cinza escuro quase preto
    },
    dayNumberSelected: {
        color: 'white',
    },
    // --- Slots ---
    slotsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10, // Espaço entre os itens
    },
    slotItem: {
        paddingVertical: 10, // Um pouco mais compacto
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#F2F4F7',
    },
    slotItemSelected: {
        backgroundColor: '#111',
        borderColor: '#111',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3,
    },
    slotItemBusy: {
        backgroundColor: 'transparent',
        borderColor: '#EEE',
        opacity: 0.5
    },
    scheduleDivider: {
        height: 1,
        backgroundColor: '#F2F4F7', // Linha muito subtil
        marginVertical: 20,
    },
    slotText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1D2939' // Cinza escuro
    },
    slotTextSelected: {
        color: 'white'
    },
    slotTextBusy: {
        color: '#CCC',
        textDecorationLine: 'line-through',
        fontWeight: '400'
    },
    noSlotsText: {
        color: '#98A2B3',
        textAlign: 'center',
        fontStyle: 'italic',
        marginBottom: 10
    },

    scheduleCard: {
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 16,
        // Sombra suave para destacar o cartão do fundo
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#F2F4F7',
    },

    calendarIconButton: {
        width: 36,
        height: 36,
        borderRadius: 18, // Circular
        backgroundColor: '#F0F9FF', // Azul muito claro
        justifyContent: 'center',
        alignItems: 'center',
        // Sombra suave (opcional)
        shadowColor: "#007AFF",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
    },

    // Estilos específicos para o DatePicker no iOS
    datePickerSheet: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 40,
        width: '100%',
    },
    datePickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },

    slotsMinHeight: {
        minHeight: 260,       // <--- O SEGREDO: Força a altura a manter-se
        width: '100%',
    },

    // --- Closed State ---
    closedContainer: { alignItems: 'center', justifyContent: 'center' },
    closedIconBg: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: '#FFF4E5', justifyContent: 'center', alignItems: 'center',
        marginBottom: 12
    },
    closedText: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
    closedReason: { fontSize: 14, color: '#666', textAlign: 'center' },

    // --- Footer ---
    footerContainer: {
        position: 'absolute', bottom: 0, width: '100%',
        backgroundColor: 'white',
        borderTopWidth: 1, borderTopColor: '#F0F0F0',
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        paddingTop: 20, paddingHorizontal: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 20
    },
    footerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    footerLabel: { fontSize: 12, color: '#888', marginBottom: 2 },
    footerTime: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
    bookBtn: {
        backgroundColor: PRIMARY_COLOR,
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 32,
        borderRadius: 50, gap: 8,
        shadowColor: PRIMARY_COLOR, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
    },
    bookBtnDisabled: { backgroundColor: '#CCC', shadowOpacity: 0 },
    bookBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },

    // --- Full Screen Modal ---
    fullScreenContainer: { flex: 1, backgroundColor: 'black' },
    fullScreenImage: { width: width, height: height * 0.8, resizeMode: 'contain' },
    closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 999 },
    closeButtonBlur: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    counterText: { position: 'absolute', top: 60, alignSelf: 'center', color: 'white', fontSize: 16, fontWeight: '600', opacity: 0.8, zIndex: 998 },
    descriptionOverlay: {
        position: 'absolute', bottom: 140, left: 20, right: 20, overflow: 'hidden',
        padding: 16, borderRadius: 16,
    },
    descriptionText: { color: 'white', fontSize: 14, textAlign: 'center', fontWeight: '500', lineHeight: 22 },


    // HEADER BUTTONS UNIFORMIZADOS
    headerBtn: {
        width: 40,
        height: 40,
        borderRadius: 12, // Squircle (igual às notificações)
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        // Sombra consistente
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },

    // Posicionamento específico do botão voltar
    backButtonPosition: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 30 : 10, // Ajuste para ficar seguro na StatusBar
        left: 20,
        zIndex: 10,
    },

    // Posicionamento dos botões da direita
    rightButtonsContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 30 : 10,
        right: 20,
        flexDirection: 'row',
        gap: 10, // Mais espaçamento entre botões
        zIndex: 10,
    },
    // Estilos das Miniaturas da Galeria
    thumbnailsContainer: {
        position: 'absolute',
        bottom: 40, // Ajuste conforme necessário (acima da safe area)
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
        borderColor: 'transparent', // Borda invisível por defeito
    },
    thumbButtonActive: {
        borderColor: 'white', // Borda branca quando selecionado
        transform: [{ scale: 1.1 }] // Ligeiro zoom no item ativo
    },
    thumbImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
});