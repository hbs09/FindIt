import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
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
    const navigation = useNavigation();

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
    const [isAddressEditable, setIsAddressEditable] = useState(false);

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
    const [hasChanges, setHasChanges] = useState(false);

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

    // NOVO: Intercetor de Saída (O Guarda)
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            // Se não houver alterações, deixa sair normalmente
            if (!hasChanges) {
                return;
            }

            // Impede a ação padrão (voltar para trás)
            e.preventDefault();

            // Mostra o alerta
            Alert.alert(
                'Descartar alterações?',
                'Tens alterações por guardar. Queres mesmo sair?',
                [
                    { text: 'Ficar', style: 'cancel', onPress: () => { } },
                    {
                        text: 'Sair sem guardar',
                        style: 'destructive',
                        // Se o user confirmar, forçamos a saída
                        onPress: () => navigation.dispatch(e.data.action),
                    },
                ]
            );
        });

        return unsubscribe;
    }, [navigation, hasChanges]);

    // NOVA HELPER: Função para atualizar dados e marcar como alterado
    const updateDetails = (field: keyof SalonDetails, value: any) => {
        setSalonDetails(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

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
            setHasChanges(false);
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
            setHasChanges(true);
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
        Keyboard.dismiss();

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

            setHasChanges(false);

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
        if (activeTimePicker === 'opening') updateDetails('hora_abertura', timeStr); // Usar updateDetails aqui também simplifica
        else if (activeTimePicker === 'closing') updateDetails('hora_fecho', timeStr);
        else if (activeTimePicker === 'lunchStart') setSalonDetails(prev => ({ ...prev, almoco_inicio: timeStr }));
        else if (activeTimePicker === 'lunchEnd') setSalonDetails(prev => ({ ...prev, almoco_fim: timeStr }));
    };

    // --- AUSÊNCIAS ---
   // --- AUSÊNCIAS ---
    function addClosure() {
        // 1. Validação Básica: Fim antes do Início
        // Normalizamos as datas para garantir que comparamos apenas o dia (YYYY-MM-DD)
        const startStr = newClosureStart.toISOString().split('T')[0];
        const endStr = newClosureEnd.toISOString().split('T')[0];

        if (endStr < startStr) {
            return Alert.alert("Data Inválida", "A data de fim deve ser igual ou posterior ao início.");
        }

        // 2. VERIFICAÇÃO DE SOBREPOSIÇÃO (NOVO)
        const hasConflict = closures.some(c => {
            // Ignora ausências que o utilizador acabou de apagar (mas ainda não guardou)
            if (deletedClosureIds.includes(c.id)) return false;

            // Lógica de Sobreposição:
            // (NovoInicio <= ExistenteFim) && (NovoFim >= ExistenteInicio)
            return startStr <= c.end_date && endStr >= c.start_date;
        });

        if (hasConflict) {
            return Alert.alert(
                "Conflito de Datas", 
                "Já existe uma ausência registada neste período. Remova a anterior ou escolha outras datas."
            );
        }

        // 3. Adicionar se estiver tudo OK
        const tempId = -Date.now(); // ID temporário negativo
        setClosures([...closures, { 
            id: tempId, 
            start_date: startStr, 
            end_date: endStr, 
            motivo: newClosureReason 
        }]);
        
        setHasChanges(true);
        
        // Reset inputs
        setNewClosureStart(new Date()); 
        setNewClosureEnd(new Date()); 
        setNewClosureReason('Férias');
    }

    function deleteClosure(id: number) {
        Alert.alert("Remover", "Remover esta ausência?", [{ text: "Cancelar" }, { text: "Sim", style: 'destructive', onPress: () => { if (id > 0) setDeletedClosureIds(prev => [...prev, id]); setClosures(prev => prev.filter(c => c.id !== id)); } }]);
        setHasChanges(true);
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

                        {/* IDENTIDADE */}
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
                                        onChangeText={t => updateDetails('nome_salao', t)}
                                        placeholder="Ex: Barbearia Central"
                                        placeholderTextColor="#AAA"
                                    />
                                </View>
                            </View>
                        </View>

                        {/* LOCALIZAÇÃO */}
                        <Text style={styles.sectionHeader}>LOCALIZAÇÃO</Text>
                        <View style={styles.card}>

                            {/* 1. Botão Mapa */}
                            <TouchableOpacity
                                onPress={openMapPicker}
                                style={[
                                    styles.mapHeroBtn,
                                    salonDetails.latitude ? styles.mapHeroBtnActive : null
                                ]}
                                activeOpacity={0.8}
                            >
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

                                <Ionicons name="chevron-forward" size={20} color="#CCC" />
                            </TouchableOpacity>

                            {/* 2. Input Morada (Com bloqueio de segurança) */}
                            <View style={{ marginTop: 15 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={styles.inputLabel}>MORADA (TEXTO)</Text>
                                    {isAddressEditable && <Text style={{ fontSize: 10, color: '#FF9500', fontWeight: '700' }}>EDIÇÃO MANUAL</Text>}
                                </View>

                                <Pressable
                                    style={[
                                        styles.addressInputContainer,
                                        !isAddressEditable && { backgroundColor: '#F0F0F0', borderColor: 'transparent' } // Visual de "Trancado"
                                    ]}
                                    onPress={() => {
                                        if (isAddressEditable) {
                                            addressInputRef.current?.focus();
                                        } else {
                                            Alert.alert("Editar Manualmente?", "Recomendamos usar o MAPA para garantir a localização exata. Deseja editar o texto mesmo assim?", [
                                                { text: "Cancelar", style: "cancel" },
                                                {
                                                    text: "Sim, editar", onPress: () => {
                                                        setIsAddressEditable(true);
                                                        setTimeout(() => addressInputRef.current?.focus(), 100);
                                                    }
                                                }
                                            ]);
                                        }
                                    }}
                                >
                                    <TextInput
                                        ref={addressInputRef}
                                        style={[
                                            styles.addressInput,
                                            !isAddressEditable && { color: '#888' } // Texto mais claro quando trancado
                                        ]}
                                        value={salonDetails.morada}
                                        onChangeText={t => updateDetails('morada', t)}
                                        placeholder="Rua, Número, Porta..."
                                        placeholderTextColor="#AAA"
                                        multiline
                                        editable={isAddressEditable}
                                    />

                                    {/* Botão de Destrancar/Trancar */}
                                    <TouchableOpacity
                                        style={styles.editIconContainer}
                                        onPress={() => {
                                            if (isAddressEditable) {
                                                // Se já está a editar, clica para fechar/guardar
                                                setIsAddressEditable(false);
                                                Keyboard.dismiss();
                                            } else {
                                                // Se está trancado, clica para abrir (com aviso)
                                                Alert.alert("Modo Manual", "Se alterar a morada aqui, certifique-se que o pino no mapa continua no sítio certo.", [
                                                    { text: "Cancelar", style: 'cancel' },
                                                    {
                                                        text: "Entendido", onPress: () => {
                                                            setIsAddressEditable(true);
                                                            setTimeout(() => addressInputRef.current?.focus(), 100);
                                                        }
                                                    }
                                                ]);
                                            }
                                        }}
                                    >
                                        <View style={[
                                            styles.iconCircleSmall,
                                            isAddressEditable ? { backgroundColor: '#E8F5E9' } : { backgroundColor: 'white' }
                                        ]}>
                                            <Ionicons
                                                name={isAddressEditable ? "checkmark" : "pencil"}
                                                size={16}
                                                color={isAddressEditable ? "#4CD964" : "#1A1A1A"}
                                            />
                                        </View>
                                    </TouchableOpacity>
                                </Pressable>

                                <Text style={styles.helperText}>
                                    {isAddressEditable
                                        ? "⚠️ Atenção: Editar o texto não muda o pino no mapa."
                                        : "Para alterar, use o Mapa acima ou toque no lápis para editar o texto manualmente."}
                                </Text>
                            </View>
                        </View>
                    </View>
                );
                
            case 'horarios':
                return (
                    <View style={styles.cardFade}>

                        {/* BLOCO 1: HORÁRIO PRINCIPAL */}
                        <Text style={styles.sectionHeader}>FUNCIONAMENTO GERAL</Text>
                        <View style={styles.card}>
                            <View style={styles.hoursRow}>
                                {/* Cartão Abertura */}
                                <TouchableOpacity onPress={() => openTimePicker('opening')} style={styles.timeCard} activeOpacity={0.8}>
                                    <View style={[styles.iconCircle, { backgroundColor: '#E3F2FD' }]}>
                                        <Ionicons name="sunny" size={20} color="#1565C0" />
                                    </View>
                                    <Text style={styles.timeLabel}>Abertura</Text>
                                    <Text style={styles.timeValue}>{salonDetails.hora_abertura}</Text>
                                </TouchableOpacity>

                                {/* Seta no meio */}
                                <Ionicons name="arrow-forward" size={20} color="#DDD" style={{ marginTop: 30 }} />

                                {/* Cartão Fecho */}
                                <TouchableOpacity onPress={() => openTimePicker('closing')} style={styles.timeCard} activeOpacity={0.8}>
                                    <View style={[styles.iconCircle, { backgroundColor: '#FFF3E0' }]}>
                                        <Ionicons name="moon" size={20} color="#EF6C00" />
                                    </View>
                                    <Text style={styles.timeLabel}>Fecho</Text>
                                    <Text style={styles.timeValue}>{salonDetails.hora_fecho}</Text>
                                </TouchableOpacity>
                            </View>

                            {/* NOVO: Texto de ajuda aqui */}
                            <Text style={styles.helperTextCentered}>
                                Toque nos cartões para definir a abertura e o fecho.
                            </Text>
                        </View>

                        {/* BLOCO 2: PAUSA DE ALMOÇO */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 5 }}>
                            <Text style={styles.sectionHeader}>PAUSA DE ALMOÇO</Text>
                            {(salonDetails.almoco_inicio || salonDetails.almoco_fim) && (
                                <TouchableOpacity onPress={() => {
                                    setSalonDetails(prev => ({ ...prev, almoco_inicio: null, almoco_fim: null }));
                                    setHasChanges(true);
                                }}>
                                    <Text style={styles.clearLink}>Limpar Horário</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.card}>
                            <View style={styles.lunchRow}>
                                <TouchableOpacity onPress={() => openTimePicker('lunchStart')} style={styles.lunchInput} activeOpacity={0.7}>
                                    <Text style={styles.lunchLabel}>INÍCIO</Text>
                                    <Text style={[styles.lunchValue, !salonDetails.almoco_inicio && { color: '#CCC' }]}>
                                        {salonDetails.almoco_inicio || '--:--'}
                                    </Text>
                                </TouchableOpacity>

                                <View style={styles.lunchDivider} />

                                <TouchableOpacity onPress={() => openTimePicker('lunchEnd')} style={styles.lunchInput} activeOpacity={0.7}>
                                    <Text style={styles.lunchLabel}>FIM</Text>
                                    <Text style={[styles.lunchValue, !salonDetails.almoco_fim && { color: '#CCC' }]}>
                                        {salonDetails.almoco_fim || '--:--'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Texto de ajuda do almoço (aparece se estiver vazio) */}
                            {!salonDetails.almoco_inicio && (
                                <Text style={styles.helperTextCentered}>
                                    Toque nos tempos acima para definir a pausa.
                                </Text>
                            )}
                        </View>

                        {/* BLOCO 3: DURAÇÃO SERVIÇOS */}
                        <Text style={[styles.sectionHeader, { marginTop: 10 }]}>CONFIGURAÇÃO DE SERVIÇO</Text>
                        <View style={styles.card}>
                            <View style={styles.durationRow}>
                                <View style={styles.durationIconBg}>
                                    <Ionicons name="hourglass" size={22} color="#1A1A1A" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 15 }}>
                                    <Text style={styles.durationTitle}>Duração Média</Text>
                                    <Text style={styles.durationSubtitle}>Tempo base p/ cálculo da agenda</Text>
                                </View>
                                <View style={styles.durationInputWrapper}>
                                    <TextInput
                                        style={styles.durationInput}
                                        // Se for 0, mostra vazio para facilitar a escrita
                                        value={salonDetails.intervalo_minutos === 0 ? '' : String(salonDetails.intervalo_minutos)}
                                        onChangeText={(text) => {
                                            // 1. Remove tudo o que NÃO for número (vírgulas, pontos, espaços)
                                            const cleanText = text.replace(/[^0-9]/g, '');

                                            // 2. Converte para inteiro (ou 0 se estiver vazio)
                                            const numValue = cleanText ? parseInt(cleanText, 10) : 0;

                                            // 3. Atualiza o estado
                                            updateDetails('intervalo_minutos', numValue);
                                        }}
                                        keyboardType="number-pad" // Teclado numérico sem pontos (iOS/Android)
                                        maxLength={3}
                                        placeholder="0"
                                        placeholderTextColor="#CCC"
                                    />
                                    <Text style={styles.durationUnit}>min</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                );

            case 'servicos':
                return (
                    <View style={styles.cardFade}>
                        
                        {/* BLOCO 1: PÚBLICO ALVO */}
                        <Text style={styles.sectionHeader}>QUEM ATENDEMOS?</Text>
                        <View style={styles.card}>
                            <Text style={styles.helperDescription}>
                                Escolha o público principal do seu salão. Isto ajuda os clientes certos o encontrem.
                            </Text>
                            
                            <View style={styles.genderRow}>
                                {/* Opção: Mulher */}
                                <TouchableOpacity 
                                    onPress={() => updateDetails('publico', 'Mulher')} 
                                    style={[
                                        styles.genderCard, 
                                        salonDetails.publico === 'Mulher' && styles.genderCardActive
                                    ]}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons 
                                        name="woman" 
                                        size={24} 
                                        color={salonDetails.publico === 'Mulher' ? "white" : "#666"} 
                                    />
                                    <Text style={[
                                        styles.genderText, 
                                        salonDetails.publico === 'Mulher' && styles.genderTextActive
                                    ]}>Mulher</Text>
                                </TouchableOpacity>

                                {/* Opção: Homem */}
                                <TouchableOpacity 
                                    onPress={() => updateDetails('publico', 'Homem')} 
                                    style={[
                                        styles.genderCard, 
                                        salonDetails.publico === 'Homem' && styles.genderCardActive
                                    ]}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons 
                                        name="man" 
                                        size={24} 
                                        color={salonDetails.publico === 'Homem' ? "white" : "#666"} 
                                    />
                                    <Text style={[
                                        styles.genderText, 
                                        salonDetails.publico === 'Homem' && styles.genderTextActive
                                    ]}>Homem</Text>
                                </TouchableOpacity>

                                {/* Opção: Unissexo */}
                                <TouchableOpacity 
                                    onPress={() => updateDetails('publico', 'Unissexo')} 
                                    style={[
                                        styles.genderCard, 
                                        salonDetails.publico === 'Unissexo' && styles.genderCardActive
                                    ]}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons 
                                        name="people" 
                                        size={24} 
                                        color={salonDetails.publico === 'Unissexo' ? "white" : "#666"} 
                                    />
                                    <Text style={[
                                        styles.genderText, 
                                        salonDetails.publico === 'Unissexo' && styles.genderTextActive
                                    ]}>Unissexo</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* BLOCO 2: CATEGORIAS */}
                        <Text style={styles.sectionHeader}>ESPECIALIDADES</Text>
                        <View style={styles.card}>
                            <Text style={styles.helperDescription}>
                                Selecione todas as categorias que se aplicam. O salão aparecerá nestes filtros de pesquisa.
                            </Text>

                            <View style={styles.tagsContainer}>
                                {CATEGORIES.map(cat => {
                                    const isSelected = salonDetails.categoria.includes(cat);
                                    return (
                                        <TouchableOpacity 
                                            key={cat} 
                                            style={[styles.tagChip, isSelected && styles.tagChipActive]} 
                                            onPress={() => {
                                                const current = salonDetails.categoria;
                                                const newValue = current.includes(cat) 
                                                    ? (current.length > 1 ? current.filter(c => c !== cat) : current) // Impede remover a última
                                                    : [...current, cat];
                                                updateDetails('categoria', newValue);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.tagText, isSelected && styles.tagTextActive]}>{cat}</Text>
                                            {isSelected && (
                                                <View style={styles.checkCircle}>
                                                    <Ionicons name="checkmark" size={10} color="#1A1A1A" />
                                                </View>
                                            )}
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
                        
                        {/* BLOCO 1: NOVA AUSÊNCIA */}
                        <Text style={styles.sectionHeader}>REGISTAR NOVA</Text>
                        <View style={styles.card}>
                            
                            {/* Seleção de Motivo */}
                            <Text style={styles.inputLabel}>MOTIVO DO BLOQUEIO</Text>
                            <View style={styles.reasonRow}>
                                {['Férias', 'Feriado', 'Manutenção'].map(opt => {
                                    const isActive = newClosureReason === opt;
                                    let iconName: any = 'airplane';
                                    if (opt === 'Feriado') iconName = 'calendar';
                                    if (opt === 'Manutenção') iconName = 'construct';

                                    return (
                                        <TouchableOpacity 
                                            key={opt} 
                                            style={[styles.reasonCard, isActive && styles.reasonCardActive]} 
                                            onPress={() => setNewClosureReason(opt)}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons 
                                                name={iconName} 
                                                size={20} 
                                                color={isActive ? "white" : "#666"} 
                                            />
                                            <Text style={[styles.reasonText, isActive && styles.reasonTextActive]}>
                                                {opt}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Seleção de Datas */}
                            <Text style={[styles.inputLabel, {marginTop: 15}]}>DURAÇÃO</Text>
                            <View style={styles.datesContainer}>
                                {/* Data Início */}
                                <TouchableOpacity 
                                    onPress={() => { setTempClosureDate(newClosureStart); setShowClosureStartPicker(true); }} 
                                    style={styles.dateBlock}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.dateIconBg}>
                                        <Ionicons name="log-in-outline" size={18} color="#1A1A1A" />
                                    </View>
                                    <View>
                                        <Text style={styles.dateLabelSmall}>DE (INÍCIO)</Text>
                                        <Text style={styles.dateValueLarge}>{newClosureStart.toLocaleDateString('pt-PT')}</Text>
                                    </View>
                                </TouchableOpacity>

                                {/* Data Fim */}
                                <TouchableOpacity 
                                    onPress={() => { 
                                        if (newClosureReason !== 'Feriado') { 
                                            setTempClosureDate(newClosureEnd); 
                                            setShowClosureEndPicker(true); 
                                        } 
                                    }} 
                                    style={[styles.dateBlock, newClosureReason === 'Feriado' && {opacity: 0.5, backgroundColor: '#F5F5F5'}]}
                                    activeOpacity={0.7}
                                    disabled={newClosureReason === 'Feriado'}
                                >
                                    <View style={styles.dateIconBg}>
                                        <Ionicons name="log-out-outline" size={18} color="#1A1A1A" />
                                    </View>
                                    <View>
                                        <Text style={styles.dateLabelSmall}>ATÉ (FIM)</Text>
                                        <Text style={styles.dateValueLarge}>
                                            {newClosureReason === 'Feriado' ? newClosureStart.toLocaleDateString('pt-PT') : newClosureEnd.toLocaleDateString('pt-PT')}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            {/* Botão Adicionar */}
                            <TouchableOpacity onPress={addClosure} style={styles.btnAddClosure} activeOpacity={0.8}>
                                <Ionicons name="add-circle" size={20} color="white" />
                                <Text style={styles.btnAddText}>Adicionar Bloqueio</Text>
                            </TouchableOpacity>

                        </View>

                       {/* BLOCO 2: LISTA DE AUSÊNCIAS */}
                        {closures.length > 0 && (
                            <>
                                <Text style={styles.sectionHeader}>AGENDADAS ({closures.length})</Text>
                                <View style={styles.card}>
                                    <View style={styles.closureList}>
                                        {closures.map((c, index) => {
                                            const isRange = c.start_date !== c.end_date;
                                            const startDay = new Date(c.start_date).getDate();
                                            const startMonth = new Date(c.start_date).toLocaleDateString('pt-PT', { month: 'short' }).toUpperCase().replace('.', '');
                                            
                                            const endDay = new Date(c.end_date).getDate();
                                            const endMonth = new Date(c.end_date).toLocaleDateString('pt-PT', { month: 'short' }).toUpperCase().replace('.', '');

                                            return (
                                                <View key={c.id} style={[
                                                    styles.closureItem, 
                                                    index !== closures.length - 1 && {borderBottomWidth: 1, borderBottomColor: '#F0F0F0'}
                                                ]}>
                                                    
                                                    {/* CONTAINER DE DATAS (O Visual Novo) */}
                                                    <View style={styles.dateRangeWrapper}>
                                                        
                                                        {/* Quadrado 1: INÍCIO */}
                                                        <View style={styles.miniDateBox}>
                                                            <Text style={styles.miniDay}>{startDay}</Text>
                                                            <Text style={styles.miniMonth}>{startMonth}</Text>
                                                        </View>

                                                        {/* Conector e Quadrado 2 (Só se for intervalo) */}
                                                        {isRange && (
                                                            <>
                                                                <View style={styles.rangeConnector}>
                                                                    <Ionicons name="arrow-forward" size={14} color="#CCC" />
                                                                </View>
                                                                
                                                                <View style={[styles.miniDateBox, {backgroundColor: '#FFF8E1', borderColor: '#FFE0B2'}]}>
                                                                    <Text style={[styles.miniDay, {color:'#F57C00'}]}>{endDay}</Text>
                                                                    <Text style={[styles.miniMonth, {color:'#FFB74D'}]}>{endMonth}</Text>
                                                                </View>
                                                            </>
                                                        )}
                                                    </View>

                                                    {/* Detalhes (Centro) */}
                                                    <View style={{flex: 1, paddingHorizontal: 12}}>
                                                        <Text style={styles.closureTitle}>{c.motivo}</Text>
                                                        <Text style={styles.closureSubtitle}>
                                                            {isRange ? 'Período de ausência' : 'Dia único'}
                                                        </Text>
                                                    </View>

                                                    {/* Botão Apagar (Direita) */}
                                                    <TouchableOpacity onPress={() => deleteClosure(c.id)} style={styles.trashBtn}>
                                                        <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            </>
                        )}
                    </View>
                );
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: 'white' }}>
            <SafeAreaView style={{ flex: 1 }}>

                {/* 1. HEADER E TABS (Fixos no topo) */}
                <View style={{ zIndex: 1, backgroundColor: 'white' }}>
                    <View style={styles.header}>

                        {/* LADO ESQUERDO */}
                        <View style={styles.headerLeft}>
                            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                                <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
                            </TouchableOpacity>
                        </View>

                        {/* CENTRO */}
                        <Text style={styles.headerTitle}>Definições</Text>

                        {/* LADO DIREITO (O Botão Guardar está AQUI) */}
                        <View style={styles.headerRight}>
                            <TouchableOpacity
                                onPress={saveSettings}
                                disabled={loading}
                                style={styles.blackSaveBtn}
                            >
                                {loading ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <Text style={styles.blackSaveText}>Guardar</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* TABS */}
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

                {/* 2. CONTEÚDO (ScrollView Inteligente com Barra de Scroll) */}
                <ScrollView
                    contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
                    showsVerticalScrollIndicator={true} // <--- Barra de scroll ativa
                    keyboardShouldPersistTaps="handled"
                    automaticallyAdjustKeyboardInsets={true} // <--- Correção do teclado iOS
                    contentInsetAdjustmentBehavior="automatic"
                >
                    {renderContent()}
                </ScrollView>

                {/* 3. MODAIS (Mapa e Datas) */}
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

                {/* DATE/TIME PICKERS */}
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
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 12,
        backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0'
    },
    headerLeft: {
        flex: 1,
        alignItems: 'flex-start'
    },
    headerRight: { flex: 1, alignItems: 'flex-end' }, // Importante para o botão aparecer na direita
    iconBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: '#F5F7FA'
    },
    // Novo Botão Preto e Branco
    blackSaveBtn: {
        backgroundColor: '#1A1A1A', paddingVertical: 8, paddingHorizontal: 16,
        borderRadius: 30, minWidth: 80, alignItems: 'center', justifyContent: 'center'
    },
    blackSaveText: { color: 'white', fontWeight: '600', fontSize: 13 },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A1A1A',
        textAlign: 'center'
    },


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

    // Estilos HORÁRIOS
    hoursRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center', // Alinha a seta verticalmente
    },
    timeCard: {
        width: '42%',
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 15,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F0F0F0'
    },
    iconCircle: {
        width: 40, height: 40, borderRadius: 20,
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 10
    },
    timeLabel: {
        fontSize: 12, fontWeight: '700', color: '#888',
        marginBottom: 4, textTransform: 'uppercase'
    },
    timeValue: {
        fontSize: 22, fontWeight: '700', color: '#1A1A1A',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'
    },

    // Estilos ALMOÇO
    lunchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 5,
        borderWidth: 1, borderColor: '#F0F0F0'
    },
    lunchInput: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12
    },
    lunchDivider: {
        width: 1, height: 30, backgroundColor: '#DDD'
    },
    lunchLabel: {
        fontSize: 10, fontWeight: '700', color: '#999', marginBottom: 2
    },
    lunchValue: {
        fontSize: 18, fontWeight: '600', color: '#1A1A1A'
    },
    helperTextCentered: {
        fontSize: 11, color: '#999', textAlign: 'center', marginTop: 10
    },
    clearLink: { fontSize: 11, color: '#FF3B30', fontWeight: '600', marginRight: 4 },

    // Estilos DURAÇÃO
    durationRow: {
        flexDirection: 'row', alignItems: 'center'
    },
    durationIconBg: {
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: '#F5F5F5',
        justifyContent: 'center', alignItems: 'center'
    },
    durationTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
    durationSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },

    durationInputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderWidth: 1, borderColor: '#EEE'
    },
    durationInput: {
        fontSize: 16, fontWeight: '700', color: '#1A1A1A',
        textAlign: 'right', minWidth: 30
    },
    durationUnit: { fontSize: 13, color: '#888', marginLeft: 4, fontWeight: '600' },

    // Estilos Gerais de Texto
    helperDescription: {
        fontSize: 13,
        color: '#888',
        marginBottom: 15,
        lineHeight: 18
    },

    // Estilos PÚBLICO ALVO (Cards)
    genderRow: {
        flexDirection: 'row',
        gap: 10,
    },
    genderCard: {
        flex: 1,
        backgroundColor: '#F5F7FA',
        paddingVertical: 15,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#F0F0F0'
    },
    genderCardActive: {
        backgroundColor: '#1A1A1A',
        borderColor: '#1A1A1A',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        elevation: 3
    },
    genderText: {
        marginTop: 8,
        fontSize: 12,
        fontWeight: '600',
        color: '#666'
    },
    genderTextActive: {
        color: 'white',
        fontWeight: '700'
    },

    // Estilos CATEGORIAS (Chips)
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10
    },
    tagChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 25,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#E0E0E0'
    },
    tagChipActive: {
        backgroundColor: '#1A1A1A', // Fundo preto
        borderColor: '#1A1A1A',
        paddingRight: 12 // Ajuste para o ícone de check
    },
    tagText: {
        fontSize: 14,
        color: '#666',
        fontWeight: '500'
    },
    tagTextActive: {
        color: 'white',
        fontWeight: '600'
    },
    checkCircle: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8
    },
    // Estilos NOVA AUSÊNCIA
    reasonRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 5
    },
    reasonCard: {
        flex: 1,
        backgroundColor: '#F5F7FA',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#EEE'
    },
    reasonCardActive: {
        backgroundColor: '#1A1A1A',
        borderColor: '#1A1A1A'
    },
    reasonText: {
        fontSize: 11, fontWeight: '600', color: '#666', marginTop: 4
    },
    reasonTextActive: {
        color: 'white'
    },

    // Dates
    datesContainer: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20
    },
    dateBlock: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderWidth: 1, borderColor: '#E0E0E0',
        padding: 10,
        borderRadius: 12
    },
    dateIconBg: {
        width: 32, height: 32, borderRadius: 8, backgroundColor: '#F5F5F5',
        justifyContent: 'center', alignItems: 'center', marginRight: 10
    },
    dateLabelSmall: { fontSize: 9, fontWeight: '700', color: '#999', marginBottom: 2 },
    dateValueLarge: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },

    // Add Button
    btnAddClosure: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1A1A1A',
        paddingVertical: 12,
        borderRadius: 12,
        gap: 8
    },
    btnAddText: { color: 'white', fontWeight: '700', fontSize: 14 },

    // LISTA (Design Limpo)
    closureList: { gap: 0 },
    closureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    closureDateBox: {
        width: 44, height: 44,
        borderRadius: 10,
        backgroundColor: '#F5F7FA',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#F0F0F0'
    },
    closureDay: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', lineHeight: 18 },
    closureMonth: { fontSize: 10, fontWeight: '600', color: '#888' },
    
    closureTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
    closureSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
    
    trashBtn: {
        padding: 8,
        backgroundColor: '#FFF0F0',
        borderRadius: 8
    },
    // Estilos Específicos para a Lista de Datas (Ranges)
    dateRangeWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    miniDateBox: {
        width: 40, 
        height: 40,
        borderRadius: 8,
        backgroundColor: '#F5F7FA',
        justifyContent: 'center', 
        alignItems: 'center',
        borderWidth: 1, 
        borderColor: '#E0E0E0'
    },
    rangeConnector: {
        paddingHorizontal: 6,
        justifyContent: 'center',
        alignItems: 'center'
    },
    miniDay: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1A1A1A',
        lineHeight: 16
    },
    miniMonth: {
        fontSize: 9,
        fontWeight: '700',
        color: '#999',
        textTransform: 'uppercase'
    },
    iconCircleSmall: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        elevation: 1
    },
});