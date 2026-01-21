import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
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
};

type PortfolioItem = {
    id: number;
    image_url: string;
    description?: string; // <--- NOVO
};

// --- NOVO TIPO ---
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

    // --- NOVOS ESTADOS PARA FÉRIAS ---
    const [closures, setClosures] = useState<Closure[]>([]);
    const [isClosedToday, setIsClosedToday] = useState(false);
    const [closureReason, setClosureReason] = useState('');

    const [fullImageIndex, setFullImageIndex] = useState<number | null>(null);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        if (id) {
            fetchSalonDetails();
            checkUserAndFavorite();
            fetchClosures(); // Fetch Ausências
        }
    }, [id]);

    useEffect(() => {
        if (salon) {
            // 1. Verificar Sincronamente se está fechado (sem depender do delay do useState)
            const dateStr = selectedDate.toISOString().split('T')[0];
            const closure = closures.find(c => dateStr >= c.start_date && dateStr <= c.end_date);
            const isClosedNow = !!closure;

            // 2. Atualizar os estados visuais
            setIsClosedToday(isClosedNow);
            setClosureReason(closure ? closure.motivo : '');

            // 3. Decidir o que fazer com base no valor calculado AGORA
            if (isClosedNow) {
                setSlots([]);
                setSelectedSlot(null);
            } else {
                // Se estiver aberto, gera slots e procura disponibilidade
                generateTimeSlots();
                fetchAvailability();
            }
        }
    }, [selectedDate, salon, closures]);

    async function fetchClosures() {
        const { data } = await supabase.from('salon_closures').select('*').eq('salon_id', id);
        if (data) setClosures(data);
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
            .order('created_at', { ascending: false });

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

    async function fetchAvailability() {
        // REMOVIDO: if (isClosedToday) return; 
        // (O useEffect já controla isto, evitando ler estado antigo)

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

        // Função auxiliar para garantir formato HH:mm (ex: 9:00 -> 09:00)
        const fixTime = (t: string) => t && t.includes(':') && t.split(':')[0].length === 1 ? `0${t}` : t;

        const startStr = fixTime(salon.hora_abertura);
        const endStr = fixTime(salon.hora_fecho);

        // Data base para cálculos de horas (o dia não importa, desde que seja igual para todos)
        let current = new Date(`2000-01-01T${startStr}`);
        const end = new Date(`2000-01-01T${endStr}`);

        // --- LÓGICA DE ALMOÇO (NOVO) ---
        let lunchStart: Date | null = null;
        let lunchEnd: Date | null = null;

        if (salon.almoco_inicio && salon.almoco_fim) {
            lunchStart = new Date(`2000-01-01T${fixTime(salon.almoco_inicio)}`);
            lunchEnd = new Date(`2000-01-01T${fixTime(salon.almoco_fim)}`);
        }
        // -------------------------------

        const now = new Date();
        const isToday = selectedDate.getDate() === now.getDate() &&
            selectedDate.getMonth() === now.getMonth() &&
            selectedDate.getFullYear() === now.getFullYear();

        if (isNaN(current.getTime()) || isNaN(end.getTime())) { setSlots([]); return; }

        while (current < end) {
            // 1. Verificar se o horário atual cai dentro do almoço
            let isLunchTime = false;
            if (lunchStart && lunchEnd) {
                // Se for igual ou depois do início E antes do fim do almoço, bloqueia
                if (current >= lunchStart && current < lunchEnd) {
                    isLunchTime = true;
                }
            }

            // Só adiciona se NÃO for hora de almoço
            if (!isLunchTime) {
                const timeString = current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                let shouldAdd = true;

                // 2. Verificar se o horário já passou (apenas se for o dia de hoje)
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

            // Avança para o próximo slot
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

    function openGallery(index: number) { setFullImageIndex(index); }

    const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const contentOffset = e.nativeEvent.contentOffset.x;
        const viewSize = e.nativeEvent.layoutMeasurement.width;
        const newIndex = Math.floor(contentOffset / viewSize);
        setFullImageIndex(newIndex);
    };

    if (loading || !salon) return <View style={styles.center}><ActivityIndicator size="large" color="#333" /></View>;

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>

                <View style={{ position: 'relative' }}>
                    <Image source={{ uri: salon.imagem || 'https://via.placeholder.com/400x300' }} style={styles.coverImage} />
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>
                    {isLoggedIn && (
                        <TouchableOpacity style={styles.favButton} onPress={toggleFavorite}>
                            <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={26} color={isFavorite ? "#FF3B30" : "white"} />
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.content}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{salon.nome_salao}</Text>
                            <View style={styles.infoRow}><Ionicons name="location-sharp" size={16} color="#666" /><Text style={styles.infoText}>{salon.morada}, {salon.cidade}</Text></View>
                        </View>
                        <View style={styles.ratingBadge}><Ionicons name="star" size={16} color="white" /><Text style={styles.ratingText}>{averageRating}</Text></View>
                    </View>

                    <View style={styles.infoRow}><Ionicons name="time-outline" size={16} color="#666" /><Text style={styles.infoText}>Aberto: {salon.hora_abertura} - {salon.hora_fecho}</Text></View>
                    <Text style={{ color: '#999', fontSize: 12, marginTop: 5 }}>Baseado em {totalReviews} avaliações</Text>
                    <View style={styles.divider} />

                    <Text style={styles.sectionTitle}>Escolha o Dia</Text>
                    <View style={styles.dateSelector}>
                        <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#333" /></TouchableOpacity>
                        <Text style={styles.dateText}>{selectedDate.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
                        <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#333" /></TouchableOpacity>
                    </View>

                    <Text style={styles.sectionTitle}>Horários</Text>

                    {/* --- VISUALIZAÇÃO DE FECHO / FÉRIAS --- */}
                    {isClosedToday ? (
                        <View style={styles.closedContainer}>
                            <Ionicons name="warning-outline" size={32} color="#FF9500" />
                            <Text style={styles.closedText}>Fechado</Text>
                            <Text style={styles.closedReason}>{closureReason || "O salão não está disponível neste dia."}</Text>
                        </View>
                    ) : (
                        loadingSlots ? (
                            <ActivityIndicator color="#333" style={{ marginTop: 20 }} />
                        ) : slots.length === 0 ? (
                            <Text style={styles.noSlotsText}>Não há vagas para este dia.</Text>
                        ) : (
                            <View style={styles.slotsGrid}>
                                {slots.map((time) => {
                                    const isBusy = busySlots.includes(time);
                                    return (
                                        <TouchableOpacity
                                            key={time}
                                            disabled={isBusy}
                                            style={[styles.slotItem, selectedSlot === time && styles.slotItemSelected, isBusy && styles.slotItemBusy]}
                                            onPress={() => setSelectedSlot(time)}
                                        >
                                            <Text style={[styles.slotText, selectedSlot === time && styles.slotTextSelected, isBusy && styles.slotTextBusy]}>{time}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )
                    )}

                    {portfolio.length > 0 && (
                        <View style={{ marginTop: 30 }}>
                            <Text style={styles.sectionTitle}>Galeria ({portfolio.length})</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -5 }}>
                                {portfolio.map((img, index) => (
                                    <TouchableOpacity key={img.id} onPress={() => openGallery(index)}><Image source={{ uri: img.image_url }} style={styles.galleryImage} /></TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                </View>
            </ScrollView>

            <View style={styles.footer}>
                <View>
                    <Text style={{ color: '#666', fontSize: 12 }}>Horário Selecionado</Text>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{selectedSlot || '--:--'}</Text>
                </View>
                <TouchableOpacity style={[styles.bookBtn, (!selectedSlot || isClosedToday) && { backgroundColor: '#ccc' }]} disabled={!selectedSlot || isClosedToday} onPress={handleBooking}>
                    <Text style={styles.bookBtnText}>Continuar</Text>
                    <Ionicons name="arrow-forward" size={20} color="white" />
                </TouchableOpacity>
            </View>

            <Modal
                visible={fullImageIndex !== null}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setFullImageIndex(null)}
            >
                <View style={styles.fullScreenContainer}>
                    {/* Botão Fechar */}
                    <TouchableOpacity style={styles.closeButton} onPress={() => setFullImageIndex(null)}>
                        <Ionicons name="close-circle" size={40} color="white" />
                    </TouchableOpacity>

                    {/* Contador (Ex: 1 / 5) */}
                    {fullImageIndex !== null && (
                        <Text style={styles.counterText}>
                            {fullImageIndex + 1} / {portfolio.length}
                        </Text>
                    )}

                    {/* Lista de Imagens */}
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
                                        resizeMode="contain" // Garante que a imagem se ajusta sem cortar
                                    />

                                    {/* --- MOSTRAR DESCRIÇÃO (SE EXISTIR) --- */}
                                    {item.description ? (
                                        <View style={styles.descriptionOverlay}>
                                            <Text style={styles.descriptionText}>{item.description}</Text>
                                        </View>
                                    ) : null}
                                </View>
                            )}
                        />
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1, backgroundColor: 'white' },
    coverImage: { width: '100%', height: 250, resizeMode: 'cover' },
    backButton: { position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20 },
    favButton: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20 },
    content: { padding: 20 },
    title: { fontSize: 26, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
    infoText: { color: '#666', fontSize: 14 },
    ratingBadge: { flexDirection: 'row', backgroundColor: '#333', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, alignItems: 'center', gap: 5 },
    ratingText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15 },
    dateSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 15, borderRadius: 12, marginBottom: 20 },
    dateText: { fontSize: 16, fontWeight: 'bold', textTransform: 'capitalize' },
    slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    slotItem: { width: '30%', paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#eee', backgroundColor: 'white' },
    slotItemSelected: { backgroundColor: '#333', borderColor: '#333' },
    slotItemBusy: { backgroundColor: '#f5f5f5', borderColor: '#f0f0f0' },
    slotText: { fontWeight: '600', color: '#333' },
    slotTextSelected: { color: 'white' },
    slotTextBusy: { color: '#ccc', textDecorationLine: 'line-through' },
    noSlotsText: { color: '#999', fontStyle: 'italic' },
    footer: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'white', padding: 20, paddingBottom: 40, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    bookBtn: { backgroundColor: '#333', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 30, gap: 8 },
    bookBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    galleryImage: { width: 120, height: 120, borderRadius: 12, marginRight: 10, backgroundColor: '#f0f0f0' },
    fullScreenContainer: { flex: 1, backgroundColor: 'black' },
    fullScreenImage: { width: width, height: height * 0.8, resizeMode: 'contain' },
    closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 999, padding: 10 },
    counterText: { position: 'absolute', top: 60, alignSelf: 'center', color: 'white', fontSize: 18, fontWeight: 'bold', zIndex: 998 },

    closedContainer: { alignItems: 'center', padding: 20, backgroundColor: '#FFF5E5', borderRadius: 12, marginBottom: 20 },
    closedText: { fontSize: 18, fontWeight: 'bold', color: '#FF9500', marginTop: 8 },
    closedReason: { fontSize: 14, color: '#666', marginTop: 4, textAlign: 'center' },
    descriptionOverlay: {
        position: 'absolute',
        bottom: 50, // Ajuste conforme necessário para não ficar cima do footer
        left: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.6)', // Fundo escuro transparente
        padding: 15,
        borderRadius: 12,
    },
    descriptionText: {
        color: 'white',
        fontSize: 14,
        textAlign: 'center',
        fontWeight: '500',
        lineHeight: 20
    }
});