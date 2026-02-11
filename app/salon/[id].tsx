import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
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

    const [closures, setClosures] = useState<Closure[]>([]);
    const [isClosedToday, setIsClosedToday] = useState(false);
    const [closureReason, setClosureReason] = useState('');

    const [fullImageIndex, setFullImageIndex] = useState<number | null>(null);
    const flatListRef = useRef<FlatList>(null);

    const [contactModalVisible, setContactModalVisible] = useState(false);
    // Variável animada para a posição Y (vertical)
    // Começa fora do ecrã (height)
    const panY = useRef(new Animated.Value(height)).current;

    useEffect(() => {
        if (id) {
            fetchSalonDetails();
            checkUserAndFavorite();
            fetchClosures();
        }
    }, [id]);

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
            .neq('status', 'cancelado')
            .neq('status', 'faltou');

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
        const contentOffset = e.nativeEvent.contentOffset.x;
        const viewSize = e.nativeEvent.layoutMeasurement.width;
        const newIndex = Math.floor(contentOffset / viewSize);
        setFullImageIndex(newIndex);
    };

    if (loading || !salon) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY_COLOR} /></View>;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

                {/* HEADER COM OS 3 BOTÕES */}
                <View style={styles.headerContainer}>
                    <Image source={{ uri: salon.imagem || 'https://via.placeholder.com/600x400' }} style={styles.coverImage} />

                    {/* Botão Esquerdo: Voltar */}
                    <TouchableOpacity style={styles.backButtonContainer} onPress={() => router.back()}>
                        <BlurView intensity={30} tint="dark" style={styles.blurButton}>
                            <Ionicons name="arrow-back" size={24} color="white" />
                        </BlurView>
                    </TouchableOpacity>

                    {/* Botões Direitos: Partilhar + Favorito + Menu */}
                    <View style={styles.rightButtonsContainer}>
                        {/* 1. Partilhar */}
                        <TouchableOpacity onPress={handleShare}>
                            <BlurView intensity={30} tint="dark" style={styles.blurButton}>
                                <Ionicons name="share-outline" size={22} color="white" />
                            </BlurView>
                        </TouchableOpacity>

                        {/* 2. Favorito (só se logado) */}
                        {isLoggedIn && (
                            <TouchableOpacity onPress={toggleFavorite}>
                                <BlurView intensity={30} tint="dark" style={styles.blurButton}>
                                    <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={22} color={isFavorite ? "#FF3B30" : "white"} />
                                </BlurView>
                            </TouchableOpacity>
                        )}

                        {/* 3. Menu (3 Pontinhos) - NOVO */}
                        <TouchableOpacity onPress={handleContactMenu}>
                            <BlurView intensity={30} tint="dark" style={styles.blurButton}>
                                <Ionicons name="ellipsis-horizontal" size={22} color="white" />
                            </BlurView>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* SHEET CONTENT (MANTIDO IGUAL) */}
                <View style={styles.sheetContent}>

                    {/* Cabeçalho do Salão - Preto & Branco e Texto Ajustado */}
                    <View style={styles.salonHeader}>
                        <View style={{ flex: 1, paddingRight: 12 }}>

                            {/* Título Principal */}
                            <Text style={styles.title}>
                                {salon.nome_salao}
                            </Text>

                            {/* Localização (Sem cortar texto) */}
                            <View style={styles.infoRow}>
                                <View style={styles.iconCircle}>
                                    <Ionicons name="location-sharp" size={18} color="#000" />
                                </View>
                                {/* Removemos numberOfLines para permitir quebra de linha */}
                                <Text style={styles.infoText}>
                                    {salon.morada}, {salon.cidade}
                                </Text>
                            </View>

                            {/* Horário */}
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

                        {/* Cartão de Avaliação (Monocromático) */}
                        <View style={styles.ratingCard}>
                            <View style={styles.ratingHeader}>
                                <Text style={styles.ratingNumber}>{averageRating}</Text>
                                {/* Estrela preta para design consistente */}
                                <Ionicons name="star" size={16} color="#000" />
                            </View>
                            <View style={styles.ratingDivider} />
                            <Text style={styles.reviewCount}>
                                {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    {portfolio.length > 0 && (
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>Portfólio</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryContainer}>
                                {portfolio.map((img, index) => (
                                    <TouchableOpacity key={img.id} onPress={() => setFullImageIndex(index)} activeOpacity={0.8}>
                                        <Image source={{ uri: img.image_url }} style={styles.galleryImage} />
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Selecione a Data</Text>
                        <View style={styles.dateControlWrapper}>
                            <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}>
                                <Ionicons name="chevron-back" size={22} color={PRIMARY_COLOR} />
                            </TouchableOpacity>
                            <View style={styles.dateDisplay}>
                                <Ionicons name="calendar-outline" size={18} color="#666" style={{ marginBottom: 4 }} />
                                <Text style={styles.dateTextMain}>
                                    {selectedDate.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}
                                </Text>
                                <Text style={styles.dateTextWeek}>
                                    {selectedDate.toLocaleDateString('pt-PT', { weekday: 'long' })}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrow}>
                                <Ionicons name="chevron-forward" size={22} color={PRIMARY_COLOR} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Horários Disponíveis</Text>

                        {isClosedToday ? (
                            <View style={styles.closedContainer}>
                                <View style={styles.closedIconBg}>
                                    <Ionicons name="moon" size={24} color="#FF9500" />
                                </View>
                                <Text style={styles.closedText}>Estamos Fechados</Text>
                                <Text style={styles.closedReason}>{closureReason || "O salão não está disponível hoje."}</Text>
                            </View>
                        ) : (
                            loadingSlots ? (
                                <ActivityIndicator color={PRIMARY_COLOR} style={{ marginTop: 20 }} />
                            ) : slots.length === 0 ? (
                                <Text style={styles.noSlotsText}>Não existem vagas para este dia.</Text>
                            ) : (
                                <View style={styles.slotsGrid}>
                                    {slots.map((time) => {
                                        const isBusy = busySlots.includes(time);
                                        const isSelected = selectedSlot === time;
                                        return (
                                            <TouchableOpacity
                                                key={time}
                                                disabled={isBusy}
                                                style={[
                                                    styles.slotItem,
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
                            )
                        )}
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
                        <Text style={styles.bookBtnText}>Agendar</Text>
                        <Ionicons name="arrow-forward" size={18} color="white" />
                    </TouchableOpacity>
                </View>
            </View>

            <Modal
                visible={fullImageIndex !== null}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setFullImageIndex(null)}
            >
                <View style={styles.fullScreenContainer}>
                    <TouchableOpacity style={styles.closeButton} onPress={() => setFullImageIndex(null)}>
                        <BlurView intensity={20} tint="light" style={styles.closeButtonBlur}>
                            <Ionicons name="close" size={28} color="white" />
                        </BlurView>
                    </TouchableOpacity>

                    {fullImageIndex !== null && (
                        <Text style={styles.counterText}>
                            {fullImageIndex + 1} / {portfolio.length}
                        </Text>
                    )}

                    {fullImageIndex !== null && (
                        <FlatList
                            ref={flatListRef}
                            data={portfolio}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={item => item.id.toString()}
                            initialScrollIndex={fullImageIndex}
                            getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
                            onMomentumScrollEnd={onScrollEnd}
                            renderItem={({ item }) => (
                                <View style={{ width: width, height: height, justifyContent: 'center', alignItems: 'center' }}>
                                    <Image
                                        source={{ uri: item.image_url }}
                                        style={styles.fullScreenImage}
                                        resizeMode="contain"
                                    />
                                    {item.description ? (
                                        <BlurView intensity={50} tint="dark" style={styles.descriptionOverlay}>
                                            <Text style={styles.descriptionText}>{item.description}</Text>
                                        </BlurView>
                                    ) : null}
                                </View>
                            )}
                        />
                    )}
                </View>
            </Modal>

            {/* --- MODAL DE CONTACTO (INTERATIVO) --- */}
            <Modal
                visible={contactModalVisible}
                transparent={true}
                animationType="fade" // O fade afeta apenas o fundo escuro
                onRequestClose={closeModal}
            >
                <View style={styles.modalOverlay}>
                    {/* Fundo clicável para fechar */}
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        activeOpacity={1}
                        onPress={closeModal}
                    />

                    {/* Folha Animada */}
                    <Animated.View
                        style={[
                            styles.modalSheet,
                            {
                                transform: [{
                                    translateY: panY.interpolate({
                                        inputRange: [-100, 0, height],
                                        outputRange: [0, 0, height], // Impede que suba mais que o limite
                                        extrapolate: 'clamp'
                                    })
                                }]
                            }
                        ]}
                        {...panResponder.panHandlers} // <--- Ativa os gestos nesta View
                    >
                        {/* Indicador visual de arrasto */}
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
        height: 250, // Reduzido de 320 para 250 (diminui o efeito de zoom)
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
        top: Platform.OS === 'ios' ? 35 : 20, // Reduzido (era 50/40)
        left: 20,
        overflow: 'hidden',
        borderRadius: 20,
        zIndex: 10 // Garante que fica acima de tudo
    },

    // Botões Direita - Mais para cima
    rightButtonsContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 35 : 20, // Reduzido (era 50/40)
        right: 20,
        flexDirection: 'row',
        gap: 8,
        zIndex: 10
    },

    blurButton: {
        width: 36,  // Reduzi ligeiramente de 40 para 36 (opcional, se achares grande)
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 18,
        overflow: 'hidden'
    },
    // --- Sheet Content ---
    sheetContent: {
        marginTop: -40,
        backgroundColor: 'white',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 24,
        paddingTop: 30,
        minHeight: 500,
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

    // --- Date Selector ---
    dateControlWrapper: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#F7F7F7',
        padding: 6,
        borderRadius: 16
    },
    dateArrow: { backgroundColor: 'white', width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    dateDisplay: { alignItems: 'center' },
    dateTextMain: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
    dateTextWeek: { fontSize: 12, color: '#888', textTransform: 'uppercase', fontWeight: '600' },

    // --- Slots ---
    slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    slotItem: {
        width: '30%',
        paddingVertical: 14,
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#EEE',
        backgroundColor: 'white'
    },
    slotItemSelected: { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR },
    slotItemBusy: { backgroundColor: '#FAFAFA', borderColor: '#F0F0F0', opacity: 0.6 },
    slotText: { fontWeight: '600', color: '#333' },
    slotTextSelected: { color: 'white' },
    slotTextBusy: { color: '#CCC', textDecorationLine: 'line-through' },
    noSlotsText: { color: '#999', fontStyle: 'italic', textAlign: 'center', width: '100%', marginTop: 10 },

    // --- Closed State ---
    closedContainer: { alignItems: 'center', padding: 24, backgroundColor: '#FFFBF5', borderRadius: 20, borderWidth: 1, borderColor: '#FFE5B4' },
    closedIconBg: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFF0D6', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    closedText: { fontSize: 16, fontWeight: '700', color: '#FF9500' },
    closedReason: { fontSize: 14, color: '#888', marginTop: 4, textAlign: 'center' },

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
        position: 'absolute', bottom: 50, left: 20, right: 20, overflow: 'hidden',
        padding: 16, borderRadius: 16,
    },
    descriptionText: { color: 'white', fontSize: 14, textAlign: 'center', fontWeight: '500', lineHeight: 22 }
});