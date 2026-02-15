import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { supabase } from '../../../supabase';

// --- TIPOS ---
type SalonDetails = {
    nome_salao: string;
    morada: string;
    cidade: string;
    hora_abertura: string;
    hora_fecho: string;
    publico: string;
    categoria: string[];
    intervalo_minutos: number;
    imagem: string | null;
    latitude: number | null;
    longitude: number | null;
    almoco_inicio: string | null;
    almoco_fim: string | null;
};

type Closure = {
    id: number;
    start_date: string;
    end_date: string;
    motivo: string;
};

const CATEGORIES = ['Cabeleireiro', 'Barbearia', 'Unhas', 'Estética'];

// Definição das Abas
const TABS = [
    { id: 'geral', label: 'Geral', icon: 'storefront-outline' },
    { id: 'horarios', label: 'Horários', icon: 'time-outline' },
    { id: 'servicos', label: 'Serviços', icon: 'people-outline' },
    { id: 'ausencias', label: 'Ausências', icon: 'calendar-outline' },
];

export default function ManagerSettings() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState('geral');

    // Uploads e Locais
    const [coverUploading, setCoverUploading] = useState(false);

    // Mapa
    const [showMapModal, setShowMapModal] = useState(false);
    const [mapRegion, setMapRegion] = useState<Region>({
        latitude: 38.7223, longitude: -9.1393,
        latitudeDelta: 0.005, longitudeDelta: 0.005,
    });
    const [isGeocoding, setIsGeocoding] = useState(false);
    const addressInputRef = useRef<TextInput>(null);

    // Dados do Formulário
    const [salonDetails, setSalonDetails] = useState<SalonDetails>({
        nome_salao: '',
        morada: '',
        cidade: '',
        hora_abertura: '09:00',
        hora_fecho: '19:00',
        publico: 'Unissexo',
        categoria: ['Cabeleireiro'],
        intervalo_minutos: 30,
        imagem: null,
        latitude: null,
        longitude: null,
        almoco_inicio: null,
        almoco_fim: null
    });

    // Ausências
    const [closures, setClosures] = useState<Closure[]>([]);
    const [deletedClosureIds, setDeletedClosureIds] = useState<number[]>([]);
    const [newClosureStart, setNewClosureStart] = useState(new Date());
    const [newClosureEnd, setNewClosureEnd] = useState(new Date());
    const [newClosureReason, setNewClosureReason] = useState('Férias');
    const [tempClosureDate, setTempClosureDate] = useState(new Date());
    const [showClosureStartPicker, setShowClosureStartPicker] = useState(false);
    const [showClosureEndPicker, setShowClosureEndPicker] = useState(false);

    // Time Pickers
    const [activeTimePicker, setActiveTimePicker] = useState<'opening' | 'closing' | 'lunchStart' | 'lunchEnd' | null>(null);
    const [tempTime, setTempTime] = useState(new Date());

    // --- INICIALIZAÇÃO ---
    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.replace('/login');

            const { data: salonOwner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
            if (salonOwner) {
                setSalonId(salonOwner.id);
            } else {
                const { data: staff } = await supabase.from('salon_staff').select('salon_id, role').eq('user_id', user.id).eq('status', 'ativo').single();
                if (staff && staff.role === 'gerente') {
                    setSalonId(staff.salon_id);
                } else {
                    Alert.alert("Permissão Negada", "Apenas gerentes podem aceder às definições.");
                    router.back();
                }
            }
        }
        init();
    }, []);

    useEffect(() => {
        if (salonId) {
            fetchSalonSettings();
            fetchClosures();
        }
    }, [salonId]);

    // --- FETCH DATA ---
    function formatTimeFromDB(time: string | null) {
        if (!time) return null;
        return time.substring(0, 5);
    }

    async function fetchSalonSettings() {
        if (!salonId) return;
        setLoading(true);
        const { data } = await supabase.from('salons').select('*').eq('id', salonId).single();

        if (data) {
            let categoriasArray: string[] = ['Cabeleireiro'];
            if (data.categoria) {
                if (Array.isArray(data.categoria)) {
                    categoriasArray = data.categoria;
                } else {
                    categoriasArray = data.categoria.split(',').map((c: string) => c.trim());
                }
            }
            setSalonDetails({
                nome_salao: data.nome_salao,
                morada: data.morada,
                cidade: data.cidade,
                hora_abertura: formatTimeFromDB(data.hora_abertura) || '09:00',
                hora_fecho: formatTimeFromDB(data.hora_fecho) || '19:00',
                publico: data.publico || 'Unissexo',
                categoria: categoriasArray,
                intervalo_minutos: data.intervalo_minutos || 30,
                imagem: data.imagem || null,
                latitude: data.latitude,
                longitude: data.longitude,
                almoco_inicio: formatTimeFromDB(data.almoco_inicio),
                almoco_fim: formatTimeFromDB(data.almoco_fim),
            });
        }
        setLoading(false);
    }

    async function fetchClosures() {
        if (!salonId) return;
        const { data } = await supabase.from('salon_closures').select('*').eq('salon_id', salonId).gte('end_date', new Date().toISOString().split('T')[0]).order('start_date', { ascending: true });
        if (data) {
            setClosures(data);
            setDeletedClosureIds([]);
        }
    }

    // --- MAPA & LOCALIZAÇÃO ---
    const openMapPicker = async () => {
        if (salonDetails.latitude && salonDetails.longitude) {
            setMapRegion({
                latitude: salonDetails.latitude, longitude: salonDetails.longitude,
                latitudeDelta: 0.005, longitudeDelta: 0.005,
            });
            setShowMapModal(true);
        } else {
            centerOnUser(true);
        }
    };

    const centerOnUser = async (openMap = false) => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({});
                setMapRegion({
                    latitude: loc.coords.latitude, longitude: loc.coords.longitude,
                    latitudeDelta: 0.005, longitudeDelta: 0.005,
                });
                if (openMap) setShowMapModal(true);
            } else if (openMap) {
                setShowMapModal(true); // Abre mesmo sem permissão (mostra padrão)
            }
        } catch (error) {
            if (openMap) setShowMapModal(true);
        }
    };

    const confirmMapLocation = async () => {
        setIsGeocoding(true);
        try {
            const newDetails = { ...salonDetails, latitude: mapRegion.latitude, longitude: mapRegion.longitude };
            const addressResponse = await Location.reverseGeocodeAsync({ latitude: mapRegion.latitude, longitude: mapRegion.longitude });

            if (addressResponse.length > 0) {
                const item = addressResponse[0];
                const rua = item.street || item.name || '';
                const numero = item.streetNumber || '';
                if (rua) newDetails.morada = `${rua}${numero ? ', ' + numero : ''}`;
                if (item.city || item.subregion) newDetails.cidade = item.city || item.subregion || '';
            }

            setSalonDetails(newDetails);
            setShowMapModal(false);
            Alert.alert("Localização Definida", "A morada e coordenadas foram atualizadas.");
        } catch (error) {
            Alert.alert("Erro", "Não foi possível obter a morada deste local.");
        } finally {
            setIsGeocoding(false);
        }
    };

    // --- AÇÕES ---
    async function saveSettings() {
        if (!salonId) return;
        const temInicio = !!salonDetails.almoco_inicio;
        const temFim = !!salonDetails.almoco_fim;

        if (temInicio !== temFim) return Alert.alert("Horário de Almoço", "Preencha início e fim, ou nenhum.");
        if (temInicio && temFim && salonDetails.almoco_inicio! >= salonDetails.almoco_fim!) return Alert.alert("Horário Inválido", "Fim de almoço deve ser depois do início.");

        setLoading(true);
        try {
            const payload = { ...salonDetails, categoria: salonDetails.categoria.join(', ') };
            const { error: salonError } = await supabase.from('salons').update(payload).eq('id', salonId);
            if (salonError) throw salonError;

            if (deletedClosureIds.length > 0) {
                await supabase.from('salon_closures').delete().in('id', deletedClosureIds);
            }

            const newClosuresData = closures.filter(c => c.id < 0).map(c => ({
                salon_id: salonId, start_date: c.start_date, end_date: c.end_date, motivo: c.motivo
            }));

            if (newClosuresData.length > 0) {
                await supabase.from('salon_closures').insert(newClosuresData);
            }

            Alert.alert("Sucesso", "Definições atualizadas!");
            fetchClosures();
        } catch (error: any) {
            Alert.alert("Erro", error.message || "Falha ao guardar.");
        } finally {
            setLoading(false);
        }
    }

    // --- IMAGEM ---
    async function pickCoverImage() {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.7, base64: true,
        });
        if (!result.canceled) uploadCoverToSupabase(result.assets[0].uri);
    }

    async function uploadCoverToSupabase(uri: string) {
        if (!salonId) return;
        setCoverUploading(true);
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            const fileName = `cover_${salonId}_${Date.now()}.jpg`;
            const { error } = await supabase.storage.from('portfolio').upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(fileName);
            setSalonDetails(prev => ({ ...prev, imagem: publicUrl }));
        } catch (error: any) {
            Alert.alert("Erro", error.message);
        } finally {
            setCoverUploading(false);
        }
    }

    // --- DATE/TIME PICKERS ---
    const openTimePicker = (type: any) => {
        let timeStr = '12:00';
        if (type === 'opening') timeStr = salonDetails.hora_abertura;
        else if (type === 'closing') timeStr = salonDetails.hora_fecho;
        else if (type === 'lunchStart') timeStr = salonDetails.almoco_inicio || '13:00';
        else if (type === 'lunchEnd') timeStr = salonDetails.almoco_fim || '14:00';

        const [h, m] = timeStr ? timeStr.split(':').map(Number) : [12, 0];
        const d = new Date(); d.setHours(h || 0, m || 0, 0, 0);
        setTempTime(d);
        setActiveTimePicker(type);
    };

    const onTimeChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            if (event.type === 'set' && selectedDate) {
                updateTimeState(selectedDate.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }));
            }
            setActiveTimePicker(null);
        } else if (selectedDate) setTempTime(selectedDate);
    };

    const confirmIOSTime = () => {
        updateTimeState(tempTime.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }));
        setActiveTimePicker(null);
    };

    const updateTimeState = (timeStr: string) => {
        if (activeTimePicker === 'opening') setSalonDetails(prev => ({ ...prev, hora_abertura: timeStr }));
        else if (activeTimePicker === 'closing') setSalonDetails(prev => ({ ...prev, hora_fecho: timeStr }));
        else if (activeTimePicker === 'lunchStart') setSalonDetails(prev => ({ ...prev, almoco_inicio: timeStr }));
        else if (activeTimePicker === 'lunchEnd') setSalonDetails(prev => ({ ...prev, almoco_fim: timeStr }));
    };

    // --- AUSÊNCIAS ---
    function addClosure() {
        if (newClosureEnd < newClosureStart) return Alert.alert("Data Inválida", "Fim deve ser depois do início.");
        const tempId = -Date.now();
        setClosures([...closures, { id: tempId, start_date: newClosureStart.toISOString().split('T')[0], end_date: newClosureEnd.toISOString().split('T')[0], motivo: newClosureReason }]);
        setNewClosureStart(new Date()); setNewClosureEnd(new Date()); setNewClosureReason('Férias');
    }

    function deleteClosure(id: number) {
        Alert.alert("Remover", "Remover esta ausência?", [{ text: "Cancelar" }, { text: "Sim", style: 'destructive', onPress: () => { if (id > 0) setDeletedClosureIds(prev => [...prev, id]); setClosures(prev => prev.filter(c => c.id !== id)); } }]);
    }

    const onClosureDateChange = (event: any, selectedDate?: Date, type?: 'start' | 'end') => {
        if (Platform.OS === 'android') {
            if (type === 'start') setShowClosureStartPicker(false); else setShowClosureEndPicker(false);
            if (event.type === 'set' && selectedDate) {
                if (newClosureReason === 'Feriado') { setNewClosureStart(selectedDate); setNewClosureEnd(selectedDate); }
                else { if (type === 'start') setNewClosureStart(selectedDate); else setNewClosureEnd(selectedDate); }
            }
        } else if (selectedDate) setTempClosureDate(selectedDate);
    };

    const confirmIOSClosureDate = (type: 'start' | 'end') => {
        if (newClosureReason === 'Feriado') { setNewClosureStart(tempClosureDate); setNewClosureEnd(tempClosureDate); setShowClosureStartPicker(false); }
        else { if (type === 'start') { setNewClosureStart(tempClosureDate); setShowClosureStartPicker(false); } else { setNewClosureEnd(tempClosureDate); setShowClosureEndPicker(false); } }
    };

    if (loading && !salonDetails.nome_salao) return <View style={styles.center}><ActivityIndicator size="large" color="#1A1A1A" /></View>;

    // --- RENDER CONTENT ---
    const renderContent = () => {
        switch (activeTab) {
            case 'geral':
                return (
                    <View style={styles.cardFade}>

                        {/* IDENTIDADE (Mantém-se igual) */}
                        <Text style={styles.sectionHeader}>IDENTIDADE</Text>
                        <View style={styles.card}>
                            <TouchableOpacity onPress={pickCoverImage} style={styles.coverContainer} activeOpacity={0.9} disabled={coverUploading}>
                                {coverUploading ? (
                                    <ActivityIndicator color="#666" style={{ marginTop: 40 }} />
                                ) : salonDetails.imagem ? (
                                    <>
                                        <Image source={{ uri: salonDetails.imagem }} style={styles.coverImage} />
                                        <View style={styles.editBadge}>
                                            <Ionicons name="pencil" size={14} color="white" />
                                            <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold', marginLeft: 4 }}>EDITAR</Text>
                                        </View>
                                    </>
                                ) : (
                                    <View style={styles.coverPlaceholder}>
                                        <View style={styles.placeholderIconBg}>
                                            <Ionicons name="image-outline" size={32} color="#1A1A1A" />
                                        </View>
                                        <Text style={styles.coverPlaceholderText}>Adicionar Capa</Text>
                                        <Text style={styles.coverSubText}>Recomendado 16:9</Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>NOME DO SALÃO</Text>
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="business" size={20} color="#1A1A1A" style={{ marginRight: 10 }} />
                                    <TextInput
                                        style={styles.cleanInput}
                                        value={salonDetails.nome_salao}
                                        onChangeText={t => setSalonDetails({ ...salonDetails, nome_salao: t })}
                                        placeholder="Ex: Barbearia Central"
                                        placeholderTextColor="#AAA"
                                    />
                                </View>
                            </View>
                        </View>

                        {/* LOCALIZAÇÃO - DESIGN MELHORADO */}
                        <Text style={styles.sectionHeader}>LOCALIZAÇÃO</Text>
                        <View style={styles.card}>

                            {/* 1. Botão Mapa (Estilo Hero) */}
                            <TouchableOpacity
                                onPress={openMapPicker}
                                style={[
                                    styles.mapHeroBtn,
                                    salonDetails.latitude ? styles.mapHeroBtnActive : null
                                ]}
                                activeOpacity={0.8}
                            >
                                {/* Ícone Circular */}
                                <View style={[
                                    styles.mapIconCircle,
                                    salonDetails.latitude ? { backgroundColor: '#E8F5E9' } : { backgroundColor: '#F5F5F5' }
                                ]}>
                                    <Ionicons
                                        name={salonDetails.latitude ? "location" : "map-outline"}
                                        size={24}
                                        color={salonDetails.latitude ? "#4CD964" : "#666"}
                                    />
                                </View>

                                {/* Textos */}
                                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                                    <Text style={[
                                        styles.mapHeroTitle,
                                        salonDetails.latitude ? { color: '#1A1A1A' } : { color: '#666' }
                                    ]}>
                                        {salonDetails.latitude ? "Localização Definida" : "Configurar no Mapa"}
                                    </Text>

                                    <Text style={styles.mapHeroSubtitle} numberOfLines={1}>
                                        {salonDetails.cidade
                                            ? `${salonDetails.cidade} (Toque para alterar)`
                                            : "Toque para abrir o mapa e marcar"}
                                    </Text>
                                </View>

                                {/* Seta */}
                                <Ionicons name="chevron-forward" size={20} color="#CCC" />
                            </TouchableOpacity>

                            {/* 2. Input Morada (Conectado visualmente) */}
                            <View style={{ marginTop: 15 }}>
                                <Text style={styles.inputLabel}>MORADA (TEXTO)</Text>

                                <Pressable
                                    style={styles.addressInputContainer}
                                    onPress={() => addressInputRef.current?.focus()} // <--- Ao clicar na caixa, foca o input
                                >
                                    <TextInput
                                        ref={addressInputRef} // <--- Ligação da referência
                                        style={styles.addressInput}
                                        value={salonDetails.morada}
                                        onChangeText={t => setSalonDetails({ ...salonDetails, morada: t })}
                                        placeholder="Rua, Número, Porta..."
                                        placeholderTextColor="#AAA"
                                        multiline
                                    />
                                    <View style={styles.editIconContainer}>
                                        <Ionicons name="create-outline" size={18} color="#999" />
                                    </View>
                                </Pressable>

                                <Text style={styles.helperText}>
                                    Se o GPS não for exato, corrija o texto da morada aqui.
                                </Text>
                            </View>
                        </View>
                    </View>
                );

            case 'horarios':
                return (
                    <View style={styles.cardFade}>
                        <View style={styles.card}>
                            <Text style={styles.sectionHeader}>Horário de Funcionamento</Text>
                            <View style={styles.hoursContainer}>
                                <View style={styles.hourBlock}>
                                    <Text style={styles.labelCenter}>ABERTURA</Text>
                                    <TouchableOpacity onPress={() => openTimePicker('opening')} style={styles.digitalClock}>
                                        <Text style={styles.digitalText}>{salonDetails.hora_abertura}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.hourSeparator} />
                                <View style={styles.hourBlock}>
                                    <Text style={styles.labelCenter}>FECHO</Text>
                                    <TouchableOpacity onPress={() => openTimePicker('closing')} style={styles.digitalClock}>
                                        <Text style={styles.digitalText}>{salonDetails.hora_fecho}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <View style={styles.divider} />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <Text style={styles.label}>Pausa de Almoço</Text>
                                {(salonDetails.almoco_inicio || salonDetails.almoco_fim) && (
                                    <TouchableOpacity onPress={() => setSalonDetails(prev => ({ ...prev, almoco_inicio: null, almoco_fim: null }))}>
                                        <Text style={styles.clearLink}>Remover</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={styles.lunchContainer}>
                                <TouchableOpacity onPress={() => openTimePicker('lunchStart')} style={styles.lunchBox}>
                                    <Ionicons name="restaurant-outline" size={16} color={salonDetails.almoco_inicio ? "#1A1A1A" : "#999"} />
                                    <Text style={[styles.lunchText, !salonDetails.almoco_inicio && { color: "#999" }]}>{salonDetails.almoco_inicio || 'Início'}</Text>
                                </TouchableOpacity>
                                <View style={{ width: 10 }} />
                                <TouchableOpacity onPress={() => openTimePicker('lunchEnd')} style={styles.lunchBox}>
                                    <Ionicons name="restaurant-outline" size={16} color={salonDetails.almoco_fim ? "#1A1A1A" : "#999"} />
                                    <Text style={[styles.lunchText, !salonDetails.almoco_fim && { color: "#999" }]}>{salonDetails.almoco_fim || 'Fim'}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={[styles.inputRow, { marginTop: 25 }]}>
                                <Ionicons name="hourglass-outline" size={20} color="#666" style={styles.inputIcon} />
                                <Text style={{ fontSize: 14, color: '#333', flex: 1 }}>Duração Média dos Serviços (Min)</Text>
                                <TextInput
                                    style={styles.smallInput}
                                    value={String(salonDetails.intervalo_minutos)}
                                    onChangeText={t => setSalonDetails({ ...salonDetails, intervalo_minutos: Number(t) })}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>
                    </View>
                );

            case 'servicos':
                return (
                    <View style={styles.cardFade}>
                        <View style={styles.card}>
                            <Text style={styles.sectionHeader}>Público Alvo</Text>
                            <View style={styles.segmentWrapper}>
                                {['Homem', 'Mulher', 'Unissexo'].map(opt => (
                                    <TouchableOpacity key={opt} style={[styles.segmentBtn, salonDetails.publico === opt && styles.segmentBtnActive]} onPress={() => setSalonDetails({ ...salonDetails, publico: opt })}>
                                        <Text style={[styles.segmentTxt, salonDetails.publico === opt && styles.segmentTxtActive]}>{opt}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={[styles.sectionHeader, { marginTop: 20 }]}>Categorias do Salão</Text>
                            <View style={styles.tagsWrapper}>
                                {CATEGORIES.map(cat => {
                                    const isSelected = salonDetails.categoria.includes(cat);
                                    return (
                                        <TouchableOpacity key={cat} style={[styles.pillBtn, isSelected && styles.pillBtnActive]} onPress={() => setSalonDetails(prev => { const current = prev.categoria; return current.includes(cat) ? (current.length > 1 ? { ...prev, categoria: current.filter(c => c !== cat) } : prev) : { ...prev, categoria: [...current, cat] }; })}>
                                            <Text style={[styles.pillTxt, isSelected && styles.pillTxtActive]}>{cat}</Text>
                                            {isSelected && <Ionicons name="checkmark" size={14} color="white" style={{ marginLeft: 5 }} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </View>
                );

            case 'ausencias':
                return (
                    <View style={styles.cardFade}>
                        <View style={styles.card}>
                            <Text style={styles.sectionHeader}>Registar Ausência</Text>
                            <View style={styles.closureForm}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -15, marginBottom: 15 }} contentContainerStyle={{ paddingHorizontal: 15, gap: 8 }}>
                                    {['Férias', 'Feriado', 'Manutenção'].map(opt => (
                                        <TouchableOpacity key={opt} style={[styles.miniChip, newClosureReason === opt && styles.miniChipActive]} onPress={() => setNewClosureReason(opt)}>
                                            <Text style={[styles.miniChipText, newClosureReason === opt && styles.miniChipTextActive]}>{opt}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                                <View style={styles.dateRow}>
                                    <TouchableOpacity onPress={() => { setTempClosureDate(newClosureStart); setShowClosureStartPicker(true); }} style={styles.dateField}>
                                        <Text style={styles.dateValue}>{newClosureStart.toLocaleDateString()}</Text>
                                        <Text style={styles.dateLabel}>INÍCIO</Text>
                                    </TouchableOpacity>
                                    <Ionicons name="arrow-forward" size={16} color="#CCC" />
                                    <TouchableOpacity onPress={() => { if (newClosureReason !== 'Feriado') { setTempClosureDate(newClosureEnd); setShowClosureEndPicker(true); } }} style={[styles.dateField, newClosureReason === 'Feriado' && { opacity: 0.5 }]}>
                                        <Text style={styles.dateValue}>{newClosureReason === 'Feriado' ? newClosureStart.toLocaleDateString() : newClosureEnd.toLocaleDateString()}</Text>
                                        <Text style={styles.dateLabel}>FIM</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.addBtnIcon} onPress={addClosure}>
                                        <Ionicons name="add" size={24} color="white" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            {closures.length > 0 && (
                                <View style={styles.closureList}>
                                    <Text style={[styles.fieldLabel, { marginBottom: 10 }]}>FUTURAS AUSÊNCIAS</Text>
                                    {closures.map(c => (
                                        <View key={c.id} style={styles.closureRow}>
                                            <View style={styles.closureColorStrip} />
                                            <View style={{ flex: 1, marginLeft: 10 }}>
                                                <Text style={styles.closureReason}>{c.motivo}</Text>
                                                <Text style={styles.closureDateText}>{new Date(c.start_date).toLocaleDateString()} {c.start_date !== c.end_date && ` → ${new Date(c.end_date).toLocaleDateString()}`}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => deleteClosure(c.id)} style={{ padding: 5 }}>
                                                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    </View>
                );
        }
    };

   return (
        <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
            <SafeAreaView style={{ flex: 1 }}>
                
                {/* 1. HEADER E TABS (Fixos no topo) */}
                <View style={{ zIndex: 1 }}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                            <Ionicons name="arrow-back" size={24} color="#333" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Definições do Salão</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <View style={styles.tabsContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
                            {TABS.map(tab => {
                                const isActive = activeTab === tab.id;
                                return (
                                    <TouchableOpacity key={tab.id} style={[styles.tabBtn, isActive && styles.tabBtnActive]} onPress={() => setActiveTab(tab.id)}>
                                        <Ionicons name={tab.icon as any} size={18} color={isActive ? "white" : "#666"} />
                                        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </ScrollView>
                    </View>
                </View>

                {/* 2. CONTEÚDO (ScrollView Inteligente) */}
                {/* Removemos o KeyboardAvoidingView e usamos props nativas */}
                <ScrollView 
                    contentContainerStyle={{ padding: 20, paddingBottom: 120 }} 
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    automaticallyAdjustKeyboardInsets={true} // <--- A MAGIA NO IOS
                    contentInsetAdjustmentBehavior="automatic"
                >
                    {renderContent()}
                    
                    <TouchableOpacity style={styles.fabSave} onPress={saveSettings} activeOpacity={0.8}>
                        <Text style={styles.fabText}>Guardar Alterações</Text>
                        <Ionicons name="checkmark-circle" size={24} color="white" />
                    </TouchableOpacity>
                </ScrollView>

                {/* MODAL DO MAPA (Mantém-se igual) */}
                <Modal visible={showMapModal} animationType="slide" onRequestClose={() => setShowMapModal(false)}>
                    <View style={{ flex: 1 }}>
                        <MapView style={{ flex: 1 }} region={mapRegion} onRegionChangeComplete={setMapRegion} showsUserLocation={true} showsMyLocationButton={false} />
                        
                        <TouchableOpacity style={styles.myLocationBtn} onPress={() => centerOnUser(false)}>
                            <Ionicons name="locate" size={24} color="#1A1A1A" />
                        </TouchableOpacity>

                        <View style={styles.fixedMarker}>
                            <Ionicons name="location" size={40} color="#FF3B30" />
                        </View>

                        <View style={styles.mapFooter}>
                            <Text style={styles.mapInstruction}>Arraste o mapa para colocar o pino na localização exata.</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                                <TouchableOpacity style={[styles.footerBtn, { backgroundColor: '#F5F5F5' }]} onPress={() => setShowMapModal(false)}>
                                    <Text style={{ color: '#333', fontWeight: 'bold' }}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.footerBtn, { backgroundColor: '#1A1A1A', flex: 1 }]} onPress={confirmMapLocation} disabled={isGeocoding}>
                                    {isGeocoding ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: 'bold' }}>Confirmar Localização</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* DATE/TIME PICKERS (Mantêm-se iguais) */}
                {(activeTimePicker || showClosureStartPicker || showClosureEndPicker) && Platform.OS === 'ios' && (
                    <Modal transparent animationType="fade">
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <View style={styles.modalHeader}>
                                    <TouchableOpacity onPress={() => { setActiveTimePicker(null); setShowClosureStartPicker(false); setShowClosureEndPicker(false); }}>
                                        <Text style={{ color: '#666', fontSize: 16 }}>Cancelar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => { if (activeTimePicker) confirmIOSTime(); else if (showClosureStartPicker) confirmIOSClosureDate('start'); else confirmIOSClosureDate('end'); }}>
                                        <Text style={{ color: '#1A1A1A', fontWeight: 'bold', fontSize: 16 }}>Confirmar</Text>
                                    </TouchableOpacity>
                                </View>
                                <DateTimePicker value={activeTimePicker ? tempTime : tempClosureDate} mode={activeTimePicker ? 'time' : 'date'} display="spinner" onChange={(e, d) => activeTimePicker ? onTimeChange(e, d) : onClosureDateChange(e, d, showClosureStartPicker ? 'start' : 'end')} style={{ height: 200 }} is24Hour={true} locale="pt-PT" textColor="black" />
                            </View>
                        </View>
                    </Modal>
                )}
                {Platform.OS === 'android' && (
                    <>
                        {activeTimePicker && <DateTimePicker value={tempTime} mode="time" is24Hour display="default" onChange={onTimeChange} />}
                        {showClosureStartPicker && <DateTimePicker value={newClosureStart} mode="date" display="default" onChange={(e, d) => onClosureDateChange(e, d, 'start')} />}
                        {showClosureEndPicker && <DateTimePicker value={newClosureEnd} mode="date" display="default" onChange={(e, d) => onClosureDateChange(e, d, 'end')} />}
                    </>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    iconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: '#F5F7FA' },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },

    // Tabs
    tabsContainer: { backgroundColor: 'white', paddingBottom: 10, paddingTop: 10 },
    tabsScroll: { paddingHorizontal: 20, gap: 10 },
    tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#F0F0F0' },
    tabBtnActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#666' },
    tabTextActive: { color: 'white' },

    // Layout
    cardFade: { flex: 1 },
    sectionHeader: { fontSize: 13, fontWeight: '800', color: '#999', marginBottom: 10, marginLeft: 4, letterSpacing: 0.5 },
    card: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
    divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 15 },
    fieldLabel: { fontSize: 11, fontWeight: '700', color: '#999', marginBottom: 8, letterSpacing: 0.5 },

    // Identidade
    coverContainer: { height: 180, backgroundColor: '#F8F9FA', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#F0F0F0' },
    coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    coverPlaceholder: { alignItems: 'center' },
    placeholderIconBg: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EEE', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    coverPlaceholderText: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
    coverSubText: { fontSize: 12, color: '#999', marginTop: 2 },
    editBadge: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.75)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
    cameraIcon: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 },

    // Inputs Limpos
    inputGroup: { marginBottom: 5 },
    inputLabel: { fontSize: 11, fontWeight: '700', color: '#AAA', marginBottom: 8 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 12 : 8, borderWidth: 1, borderColor: '#F0F0F0' },
    cleanInput: { flex: 1, fontSize: 16, color: '#1A1A1A', fontWeight: '500' },
    helperText: { fontSize: 11, color: '#999', marginTop: 6, marginLeft: 2 },

    // Inputs Antigos (Mantidos para compatibilidade com outras abas se necessário)
    formPadding: { gap: 12 },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, paddingHorizontal: 15, height: 50, borderWidth: 1, borderColor: '#F0F0F0' },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 16, color: '#1A1A1A', height: '100%' },
    gpsBtn: { padding: 5 },

    // Botão Mapa Hero
    mapHeroBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#E0E0E0',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        elevation: 2
    },
    mapHeroBtnActive: {
        backgroundColor: 'white',
        borderColor: '#4CD964',
        borderWidth: 1.5, // Borda um pouco mais grossa quando ativo
    },
    mapIconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mapHeroTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2
    },
    mapHeroSubtitle: {
        fontSize: 13,
        color: '#888',
        fontWeight: '500'
    },
    arrowCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    // Estilos do Input de Morada
    addressInputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#F0F0F0',
        minHeight: 80 // Altura fixa para parecer uma caixa de texto maior
    },
    addressInput: {
        flex: 1,
        fontSize: 15,
        color: '#1A1A1A',
        lineHeight: 22,
        paddingTop: 0 // Remove padding extra do topo no Android
    },
    editIconContainer: {
        marginLeft: 8,
        marginTop: 2
    },

    // Horários
    hoursContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    hourBlock: { alignItems: 'center' },
    labelCenter: { fontSize: 12, fontWeight: '700', color: '#999', marginBottom: 8 },
    digitalClock: { backgroundColor: '#1A1A1A', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
    digitalText: { color: 'white', fontSize: 20, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    hourSeparator: { width: 1, height: 40, backgroundColor: '#EEE' },
    label: { fontSize: 14, fontWeight: '600', color: '#333' },
    clearLink: { fontSize: 12, color: '#FF3B30', fontWeight: '600' },
    lunchContainer: { flexDirection: 'row', marginTop: 8 },
    lunchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, gap: 8 },
    lunchText: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
    smallInput: { backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#DDD', width: 60, textAlign: 'center', fontSize: 16, fontWeight: '600', paddingVertical: 5 },

    // Segmentação
    segmentWrapper: { flexDirection: 'row', backgroundColor: '#F5F5F5', padding: 4, borderRadius: 12, marginBottom: 15 },
    segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    segmentBtnActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    segmentTxt: { color: '#888', fontWeight: '600', fontSize: 13 },
    segmentTxtActive: { color: '#1A1A1A', fontWeight: '700' },
    tagsWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pillBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#EEE' },
    pillBtnActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
    pillTxt: { fontSize: 13, color: '#666', fontWeight: '500' },
    pillTxtActive: { color: 'white', fontWeight: '600' },

    // Ausências
    closureForm: { backgroundColor: '#F9FAFB', padding: 15, borderRadius: 16, marginBottom: 20, overflow: 'hidden' },
    miniChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'white', marginRight: 5, borderWidth: 1, borderColor: '#EEE' },
    miniChipActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
    miniChipText: { fontSize: 12, color: '#666' },
    miniChipTextActive: { color: 'white', fontWeight: '600' },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 },
    dateField: { flex: 1, backgroundColor: 'white', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#EEE', alignItems: 'center' },
    dateValue: { fontSize: 14, fontWeight: '700', color: '#333' },
    dateLabel: { fontSize: 10, color: '#999', marginTop: 2 },
    addBtnIcon: { width: 44, height: 44, backgroundColor: '#1A1A1A', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    closureList: { gap: 10 },
    closureRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EEE' },
    closureColorStrip: { width: 4, height: 30, backgroundColor: '#FF9500', borderRadius: 2 },
    closureReason: { fontSize: 14, fontWeight: '700', color: '#333' },
    closureDateText: { fontSize: 12, color: '#666', marginTop: 2 },

    // Save Button
    fabSave: { backgroundColor: '#1A1A1A', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 18, borderRadius: 16, marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
    fabText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },

    // Map Modal Styles
    fixedMarker: { position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -40, zIndex: 10 },
    mapFooter: { backgroundColor: 'white', padding: 20, paddingBottom: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, elevation: 10 },
    mapInstruction: { textAlign: 'center', color: '#666', fontSize: 14 },
    footerBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    myLocationBtn: { position: 'absolute', top: 50, right: 20, backgroundColor: 'white', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, elevation: 5, zIndex: 10 },
});