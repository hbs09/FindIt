import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
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

export default function ManagerSettings() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);

    // Uploads e Locais
    const [coverUploading, setCoverUploading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);

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

    // Ausências (Closures)
    const [closures, setClosures] = useState<Closure[]>([]);
    const [deletedClosureIds, setDeletedClosureIds] = useState<number[]>([]);
    const [newClosureStart, setNewClosureStart] = useState(new Date());
    const [newClosureEnd, setNewClosureEnd] = useState(new Date());
    const [newClosureReason, setNewClosureReason] = useState('Férias');
    const [tempClosureDate, setTempClosureDate] = useState(new Date());
    const [showClosureStartPicker, setShowClosureStartPicker] = useState(false);
    const [showClosureEndPicker, setShowClosureEndPicker] = useState(false);

    // Time Pickers (Horários Gerais)
    const [activeTimePicker, setActiveTimePicker] = useState<'opening' | 'closing' | 'lunchStart' | 'lunchEnd' | null>(null);
    const [tempTime, setTempTime] = useState(new Date());

    // --- INICIALIZAÇÃO ---
    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.replace('/login');

            // Verifica se é dono
            const { data: salonOwner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
            
            if (salonOwner) {
                setSalonId(salonOwner.id);
            } else {
                // Se não for dono, verifica se é staff com permissão (ex: gerente)
                // Nota: Apenas donos e gerentes deveriam ter acesso a esta página
                const { data: staff } = await supabase
                    .from('salon_staff')
                    .select('salon_id, role')
                    .eq('user_id', user.id)
                    .eq('status', 'ativo')
                    .single();

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
        return time.substring(0, 5); // "13:00:00" -> "13:00"
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
        const { data } = await supabase
            .from('salon_closures')
            .select('*')
            .eq('salon_id', salonId)
            .gte('end_date', new Date().toISOString().split('T')[0])
            .order('start_date', { ascending: true });

        if (data) {
            setClosures(data);
            setDeletedClosureIds([]); 
        }
    }

    // --- AÇÕES PRINCIPAIS ---

    async function saveSettings() {
        if (!salonId) return;

        // Validações de Almoço
        const temInicio = !!salonDetails.almoco_inicio;
        const temFim = !!salonDetails.almoco_fim;

        if (temInicio !== temFim) {
            return Alert.alert("Horário de Almoço Incompleto", "Preencha o início e o fim, ou remova ambos.");
        }
        if (temInicio && temFim && salonDetails.almoco_inicio! >= salonDetails.almoco_fim!) {
            return Alert.alert("Horário Inválido", "O fim de almoço deve ser depois do início.");
        }

        setLoading(true);
        try {
            // 1. Atualizar Salão
            const payload = {
                ...salonDetails,
                categoria: salonDetails.categoria.join(', ')
            };
            const { error: salonError } = await supabase.from('salons').update(payload).eq('id', salonId);
            if (salonError) throw salonError;

            // 2. Apagar Closures removidos
            if (deletedClosureIds.length > 0) {
                const { error: deleteError } = await supabase.from('salon_closures').delete().in('id', deletedClosureIds);
                if (deleteError) throw deleteError;
            }

            // 3. Inserir novos Closures (IDs negativos)
            const newClosuresData = closures.filter(c => c.id < 0).map(c => ({
                salon_id: salonId,
                start_date: c.start_date,
                end_date: c.end_date,
                motivo: c.motivo
            }));

            if (newClosuresData.length > 0) {
                const { error: insertError } = await supabase.from('salon_closures').insert(newClosuresData);
                if (insertError) throw insertError;
            }

            Alert.alert("Sucesso", "Definições atualizadas!");
            fetchClosures(); // Recarrega para obter IDs reais

        } catch (error: any) {
            console.error(error);
            Alert.alert("Erro", error.message || "Falha ao guardar.");
        } finally {
            setLoading(false);
        }
    }

    // --- IMAGEM DE CAPA ---
    async function pickCoverImage() {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.7,
            base64: true,
        });

        if (!result.canceled) {
            uploadCoverToSupabase(result.assets[0].uri);
        }
    }

    async function uploadCoverToSupabase(uri: string) {
        if (!salonId) return;
        setCoverUploading(true);
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            const fileName = `cover_${salonId}_${Date.now()}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('portfolio')
                .upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(fileName);
            setSalonDetails(prev => ({ ...prev, imagem: publicUrl }));

        } catch (error: any) {
            Alert.alert("Erro no Upload", error.message);
        } finally {
            setCoverUploading(false);
        }
    }

    // --- LOCALIZAÇÃO ---
    async function handleGetLocation() {
        setLocationLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permissão negada', 'Precisamos de acesso à localização.');
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;
            const addressResponse = await Location.reverseGeocodeAsync({ latitude, longitude });

            let newMorada = salonDetails.morada;
            let newCidade = salonDetails.cidade;

            if (addressResponse.length > 0) {
                const item = addressResponse[0];
                const rua = item.street || item.name || '';
                const numero = item.streetNumber || '';
                if (rua) newMorada = `${rua}${numero ? ', ' + numero : ''}`;
                if (item.city || item.subregion || item.region) newCidade = item.city || item.subregion || item.region || '';
            }

            setSalonDetails(prev => ({ ...prev, latitude, longitude, morada: newMorada, cidade: newCidade }));
            Alert.alert("Localização Atualizada", "Coordenadas e morada preenchidas.");

        } catch (error) {
            Alert.alert("Erro", "Não foi possível obter a localização.");
        } finally {
            setLocationLoading(false);
        }
    }

    // --- PICKERS DE HORÁRIO ---
    const openTimePicker = (type: 'opening' | 'closing' | 'lunchStart' | 'lunchEnd') => {
        let timeStr = '12:00';
        if (type === 'opening') timeStr = salonDetails.hora_abertura;
        else if (type === 'closing') timeStr = salonDetails.hora_fecho;
        else if (type === 'lunchStart') timeStr = salonDetails.almoco_inicio || '13:00';
        else if (type === 'lunchEnd') timeStr = salonDetails.almoco_fim || '14:00';

        const [hours, minutes] = timeStr ? timeStr.split(':').map(Number) : [12, 0];
        const d = new Date(); d.setHours(hours || 0, minutes || 0, 0, 0);
        setTempTime(d);
        setActiveTimePicker(type);
    };

    const onTimeChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            if (event.type === 'set' && selectedDate) {
                const timeStr = selectedDate.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                updateTimeState(timeStr);
            }
            setActiveTimePicker(null);
        } else if (selectedDate) {
            setTempTime(selectedDate);
        }
    };

    const confirmIOSTime = () => {
        const timeStr = tempTime.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
        updateTimeState(timeStr);
        setActiveTimePicker(null);
    };

    const updateTimeState = (timeStr: string) => {
        if (activeTimePicker === 'opening') setSalonDetails(prev => ({ ...prev, hora_abertura: timeStr }));
        else if (activeTimePicker === 'closing') setSalonDetails(prev => ({ ...prev, hora_fecho: timeStr }));
        else if (activeTimePicker === 'lunchStart') setSalonDetails(prev => ({ ...prev, almoco_inicio: timeStr }));
        else if (activeTimePicker === 'lunchEnd') setSalonDetails(prev => ({ ...prev, almoco_fim: timeStr }));
    };

    // --- LÓGICA DE AUSÊNCIAS (Closures) ---
    function addClosure() {
        if (newClosureEnd < newClosureStart) {
            return Alert.alert("Data Inválida", "A data de fim tem de ser depois da de início.");
        }
        const tempId = -Date.now();
        const newClosureItem: Closure = {
            id: tempId,
            start_date: newClosureStart.toISOString().split('T')[0],
            end_date: newClosureEnd.toISOString().split('T')[0],
            motivo: newClosureReason
        };
        setClosures([...closures, newClosureItem]);
        // Reset
        setNewClosureStart(new Date()); setNewClosureEnd(new Date()); setNewClosureReason('Férias');
    }

    function deleteClosure(id: number) {
        Alert.alert("Remover", "Remover esta ausência?", [
            { text: "Cancelar" },
            {
                text: "Sim", style: 'destructive', onPress: () => {
                    if (id > 0) setDeletedClosureIds(prev => [...prev, id]);
                    setClosures(prev => prev.filter(c => c.id !== id));
                }
            }
        ]);
    }

    const onClosureDateChange = (event: any, selectedDate?: Date, type?: 'start' | 'end') => {
        if (Platform.OS === 'android') {
            if (type === 'start') setShowClosureStartPicker(false); else setShowClosureEndPicker(false);
            if (event.type === 'set' && selectedDate) {
                if (newClosureReason === 'Feriado') {
                    setNewClosureStart(selectedDate); setNewClosureEnd(selectedDate);
                } else {
                    if (type === 'start') setNewClosureStart(selectedDate); else setNewClosureEnd(selectedDate);
                }
            }
        } else if (selectedDate) setTempClosureDate(selectedDate);
    };

    const confirmIOSClosureDate = (type: 'start' | 'end') => {
        if (newClosureReason === 'Feriado') {
            setNewClosureStart(tempClosureDate); setNewClosureEnd(tempClosureDate); setShowClosureStartPicker(false);
        } else {
            if (type === 'start') { setNewClosureStart(tempClosureDate); setShowClosureStartPicker(false); }
            else { setNewClosureEnd(tempClosureDate); setShowClosureEndPicker(false); }
        }
    };

    if (loading && !salonDetails.nome_salao) return <View style={styles.center}><ActivityIndicator size="large" color="#1A1A1A" /></View>;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                
                {/* HEADER */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Definições</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
                    
                    {/* IMAGEM DE CAPA */}
                    <View style={styles.settingsCard}>
                        <Text style={styles.settingsSectionTitle}>Imagem de Capa</Text>
                        <TouchableOpacity onPress={pickCoverImage} style={styles.coverUploadBtn} activeOpacity={0.9} disabled={coverUploading}>
                            {coverUploading ? (
                                <ActivityIndicator color="#666" />
                            ) : salonDetails.imagem ? (
                                <>
                                    <Image source={{ uri: salonDetails.imagem }} style={styles.coverImagePreview} />
                                    <View style={styles.editIconBadge}><Ionicons name="camera" size={16} color="white" /></View>
                                </>
                            ) : (
                                <View style={styles.coverPlaceholder}>
                                    <Ionicons name="image-outline" size={40} color="#CCC" />
                                    <Text style={styles.coverPlaceholderText}>Adicionar Capa (16:9)</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* INFORMAÇÃO DO SALÃO */}
                    <View style={styles.settingsCard}>
                        <Text style={styles.settingsSectionTitle}>Informação do Salão</Text>
                        
                        <View style={styles.settingsInputGroup}>
                            <Text style={styles.settingsInputLabel}>NOME</Text>
                            <TextInput style={styles.settingsInputField} value={salonDetails.nome_salao} onChangeText={t => setSalonDetails({ ...salonDetails, nome_salao: t })} />
                        </View>

                        <View style={styles.settingsInputGroup}>
                            <Text style={styles.settingsInputLabel}>MORADA</Text>
                            <TextInput style={styles.settingsInputField} value={salonDetails.morada} onChangeText={t => setSalonDetails({ ...salonDetails, morada: t })} />
                        </View>

                        <View style={styles.settingsInputGroup}>
                            <Text style={styles.settingsInputLabel}>CIDADE</Text>
                            <TextInput style={styles.settingsInputField} value={salonDetails.cidade} onChangeText={t => setSalonDetails({ ...salonDetails, cidade: t })} />
                        </View>

                        <View style={{ marginTop: 10 }}>
                            <TouchableOpacity onPress={handleGetLocation} style={styles.locationBtn} disabled={locationLoading}>
                                {locationLoading ? <ActivityIndicator color="white" /> : <><Ionicons name="location" size={20} color="white" /><Text style={styles.locationBtnText}>Obter GPS Atual</Text></>}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* OPERAÇÃO E HORÁRIOS */}
                    <View style={styles.settingsCard}>
                        <Text style={styles.settingsSectionTitle}>Horários</Text>

                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingsInputLabel}>ABERTURA</Text>
                                <TouchableOpacity onPress={() => openTimePicker('opening')} style={styles.timeInput}>
                                    <Text>{salonDetails.hora_abertura}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingsInputLabel}>FECHO</Text>
                                <TouchableOpacity onPress={() => openTimePicker('closing')} style={styles.timeInput}>
                                    <Text>{salonDetails.hora_fecho}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={{ marginTop: 16 }}>
                            <Text style={styles.settingsInputLabel}>ALMOÇO (OPCIONAL)</Text>
                            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                                <TouchableOpacity onPress={() => openTimePicker('lunchStart')} style={[styles.timeInput, { flex: 1 }]}>
                                    <Text>{salonDetails.almoco_inicio || '--:--'}</Text>
                                </TouchableOpacity>
                                <Text>-</Text>
                                <TouchableOpacity onPress={() => openTimePicker('lunchEnd')} style={[styles.timeInput, { flex: 1 }]}>
                                    <Text>{salonDetails.almoco_fim || '--:--'}</Text>
                                </TouchableOpacity>
                                {(salonDetails.almoco_inicio || salonDetails.almoco_fim) && (
                                    <TouchableOpacity onPress={() => setSalonDetails(prev => ({ ...prev, almoco_inicio: null, almoco_fim: null }))}>
                                        <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        <View style={{ marginTop: 16 }}>
                            <Text style={styles.settingsInputLabel}>INTERVALO (MIN)</Text>
                            <TextInput
                                style={styles.settingsInputField}
                                value={String(salonDetails.intervalo_minutos)}
                                onChangeText={t => setSalonDetails({ ...salonDetails, intervalo_minutos: Number(t) })}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>

                    {/* PÚBLICO E CATEGORIA */}
                    <View style={styles.settingsCard}>
                        <Text style={styles.settingsSectionTitle}>Detalhes</Text>
                        
                        <Text style={styles.settingsInputLabel}>PÚBLICO</Text>
                        <View style={styles.segmentContainer}>
                            {['Homem', 'Mulher', 'Unissexo'].map(opt => (
                                <TouchableOpacity key={opt} style={[styles.segmentBtn, salonDetails.publico === opt && styles.segmentBtnActive]} onPress={() => setSalonDetails({ ...salonDetails, publico: opt })}>
                                    <Text style={[styles.segmentTxt, salonDetails.publico === opt && styles.segmentTxtActive]}>{opt}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={[styles.settingsInputLabel, { marginTop: 15 }]}>CATEGORIA</Text>
                        <View style={[styles.segmentContainer, { flexWrap: 'wrap' }]}>
                            {CATEGORIES.map(cat => {
                                const isSelected = salonDetails.categoria.includes(cat);
                                return (
                                    <TouchableOpacity
                                        key={cat}
                                        style={[styles.segmentBtn, isSelected && styles.segmentBtnActive, { minWidth: '48%', marginVertical: 2 }]}
                                        onPress={() => {
                                            setSalonDetails(prev => {
                                                const current = prev.categoria;
                                                if (current.includes(cat)) return current.length > 1 ? { ...prev, categoria: current.filter(c => c !== cat) } : prev;
                                                return { ...prev, categoria: [...current, cat] };
                                            });
                                        }}
                                    >
                                        <Text style={[styles.segmentTxt, isSelected && styles.segmentTxtActive]}>{cat}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* AUSÊNCIAS */}
                    <View style={styles.settingsCard}>
                        <Text style={styles.settingsSectionTitle}>Gestão de Ausências</Text>
                        
                        <View style={styles.segmentContainer}>
                            {['Férias', 'Feriado', 'Manutenção'].map(opt => (
                                <TouchableOpacity key={opt} style={[styles.segmentBtn, newClosureReason === opt && styles.segmentBtnActive]} onPress={() => setNewClosureReason(opt)}>
                                    <Text style={[styles.segmentTxt, newClosureReason === opt && styles.segmentTxtActive]}>{opt}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10, marginVertical: 15 }}>
                            <TouchableOpacity onPress={() => { setTempClosureDate(newClosureStart); setShowClosureStartPicker(true); }} style={[styles.timeInput, { flex: 1 }]}>
                                <Text>{newClosureStart.toLocaleDateString()}</Text>
                            </TouchableOpacity>
                            {newClosureReason !== 'Feriado' && (
                                <TouchableOpacity onPress={() => { setTempClosureDate(newClosureEnd); setShowClosureEndPicker(true); }} style={[styles.timeInput, { flex: 1 }]}>
                                    <Text>{newClosureEnd.toLocaleDateString()}</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <TouchableOpacity style={styles.addClosureBtn} onPress={addClosure}>
                            <Ionicons name="add-circle" size={18} color="white" />
                            <Text style={{ color: 'white', fontWeight: 'bold' }}>Adicionar</Text>
                        </TouchableOpacity>

                        {closures.length > 0 && (
                            <View style={{ marginTop: 15, borderTopWidth: 1, borderColor: '#EEE' }}>
                                {closures.map(c => (
                                    <View key={c.id} style={styles.closureItem}>
                                        <View>
                                            <Text style={{ fontWeight: '600' }}>{c.motivo}</Text>
                                            <Text style={{ fontSize: 12, color: '#666' }}>{new Date(c.start_date).toLocaleDateString()} {c.start_date !== c.end_date && `- ${new Date(c.end_date).toLocaleDateString()}`}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => deleteClosure(c.id)}>
                                            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* BOTÃO GUARDAR */}
                    <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
                        <Text style={styles.saveButtonText}>Guardar Alterações</Text>
                        <Ionicons name="checkmark-circle" size={22} color="white" />
                    </TouchableOpacity>

                </ScrollView>

                {/* MODAIS (TimePicker & DatePicker) */}
                {(activeTimePicker || showClosureStartPicker || showClosureEndPicker) && Platform.OS === 'ios' && (
                    <Modal transparent animationType="fade">
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <View style={styles.modalHeader}>
                                    <TouchableOpacity onPress={() => { setActiveTimePicker(null); setShowClosureStartPicker(false); setShowClosureEndPicker(false); }}>
                                        <Text style={{ color: '#666' }}>Cancelar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => {
                                        if (activeTimePicker) confirmIOSTime();
                                        else if (showClosureStartPicker) confirmIOSClosureDate('start');
                                        else confirmIOSClosureDate('end');
                                    }}>
                                        <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Confirmar</Text>
                                    </TouchableOpacity>
                                </View>
                                <DateTimePicker
                                    value={activeTimePicker ? tempTime : tempClosureDate}
                                    mode={activeTimePicker ? 'time' : 'date'}
                                    display="spinner"
                                    onChange={(e, d) => activeTimePicker ? onTimeChange(e, d) : onClosureDateChange(e, d, showClosureStartPicker ? 'start' : 'end')}
                                    style={{ height: 200 }}
                                    is24Hour={true}
                                    locale="pt-PT"
                                />
                            </View>
                        </View>
                    </Modal>
                )}

                {/* DatePickers Android (Invisíveis, ativados por função) */}
                {Platform.OS === 'android' && (
                    <>
                        {activeTimePicker && <DateTimePicker value={tempTime} mode="time" is24Hour display="default" onChange={onTimeChange} />}
                        {showClosureStartPicker && <DateTimePicker value={newClosureStart} mode="date" display="default" onChange={(e, d) => onClosureDateChange(e, d, 'start')} />}
                        {showClosureEndPicker && <DateTimePicker value={newClosureEnd} mode="date" display="default" onChange={(e, d) => onClosureDateChange(e, d, 'end')} />}
                    </>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: '#F5F7FA' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },
    
    settingsCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, elevation: 3 },
    settingsSectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 20 },
    settingsInputGroup: { marginBottom: 16 },
    settingsInputLabel: { fontSize: 11, fontWeight: '700', color: '#999', marginBottom: 8, textTransform: 'uppercase' },
    settingsInputField: { backgroundColor: '#F5F7FA', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#EEE', fontSize: 15 },
    
    coverUploadBtn: { height: 180, backgroundColor: '#F5F7FA', borderRadius: 12, borderWidth: 1, borderColor: '#EEE', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    coverPlaceholder: { alignItems: 'center', gap: 8 },
    coverPlaceholderText: { color: '#999', fontWeight: '600' },
    coverImagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
    editIconBadge: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 },

    locationBtn: { backgroundColor: '#1A1A1A', padding: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', gap: 8, alignItems: 'center' },
    locationBtnText: { color: 'white', fontWeight: 'bold' },

    timeInput: { backgroundColor: '#F5F7FA', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#EEE', alignItems: 'center' },
    
    segmentContainer: { flexDirection: 'row', backgroundColor: '#F5F7FA', padding: 4, borderRadius: 12 },
    segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    segmentBtnActive: { backgroundColor: '#1A1A1A' },
    segmentTxt: { color: '#999', fontWeight: '600' },
    segmentTxtActive: { color: 'white' },

    addClosureBtn: { backgroundColor: '#1A1A1A', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
    closureItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F7FA' },

    saveButton: { backgroundColor: '#4CD964', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 18, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.2, elevation: 4 },
    saveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
    modalContent: { backgroundColor: 'white', width: '90%', borderRadius: 15, padding: 20, alignSelf: 'center' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
});