import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../supabase';

// --- TIPOS ---
type ServiceItem = {
    id: number;
    nome: string;
    preco: number;
    position?: number;
};

// Cores do Tema
const THEME_COLOR = '#1A1A1A';
const BG_COLOR = '#F9FAFB';
const ACCENT_GREEN = '#059669';
const ACCENT_GREEN_BG = '#ECFDF5';

export default function ManagerServices() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);
    const [services, setServices] = useState<ServiceItem[]>([]);

    // Estados de Edição
    const [newServiceName, setNewServiceName] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');
    const [addingService, setAddingService] = useState(false);
    const [editingService, setEditingService] = useState<ServiceItem | null>(null);
    const [isReordering, setIsReordering] = useState(false);

    // --- INICIALIZAÇÃO ---
    useEffect(() => { checkPermission(); }, []);
    useEffect(() => { if (salonId) fetchServices(); }, [salonId]);

    // --- LÓGICA ---
    async function checkPermission() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.replace('/login');
            const { data: salonOwner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
            if (salonOwner) { setSalonId(salonOwner.id); return; }
            const { data: staff } = await supabase.from('salon_staff').select('salon_id, role').eq('user_id', user.id).eq('status', 'ativo').single();
            if (staff && staff.role === 'gerente') { setSalonId(staff.salon_id); }
            else { Alert.alert("Acesso Negado", "Apenas gerentes podem gerir os serviços."); router.back(); }
        } catch (error) { console.error(error); router.back(); } finally { setLoading(false); }
    }

    async function fetchServices() {
        if (!salonId) return;
        setLoading(true);
        const { data, error } = await supabase.from('services').select('*').eq('salon_id', salonId).order('position', { ascending: true });
        if (error) {
            const { data: dataFallback } = await supabase.from('services').select('*').eq('salon_id', salonId).order('nome', { ascending: true });
            if (dataFallback) setServices(dataFallback);
        } else { if (data) setServices(data); }
        setLoading(false);
    }

    function handleEditService(item: ServiceItem) {
        setEditingService(item);
        setNewServiceName(item.nome);
        setNewServicePrice(item.preco.toString());
    }

    function cancelEditService() {
        setEditingService(null);
        setNewServiceName('');
        setNewServicePrice('');
    }

    async function saveService() {
        if (!newServiceName.trim() || !newServicePrice.trim()) return Alert.alert("Atenção", "Preencha o nome e o preço.");
        
        const nameNormalized = newServiceName.trim();
        const duplicate = services.find(s => s.nome.trim().toLowerCase() === nameNormalized.toLowerCase() && s.id !== (editingService?.id ?? -1));
        if (duplicate) return Alert.alert("Duplicado", "Já existe um serviço com este nome.");

        const priceClean = newServicePrice.replace(',', '.');
        const priceValue = parseFloat(priceClean);
        if (isNaN(priceValue)) return Alert.alert("Erro", "O preço inserido não é válido.");

        setAddingService(true);
        try {
            if (editingService) {
                const { error } = await supabase.from('services').update({ nome: newServiceName, preco: priceValue }).eq('id', editingService.id);
                if (error) throw error;
                Alert.alert("Sucesso", "Serviço atualizado!");
            } else {
                const nextPosition = services.length > 0 ? services.length + 1 : 0;
                const payload: any = { salon_id: salonId, nome: newServiceName, preco: priceValue };
                if (services.length > 0 && services[0].position !== undefined) payload.position = nextPosition;
                const { error } = await supabase.from('services').insert(payload);
                if (error) throw error;
                Alert.alert("Sucesso", "Serviço adicionado!");
            }
            cancelEditService();
            fetchServices();
        } catch (error: any) { Alert.alert("Erro", error.message); } finally { setAddingService(false); }
    }

    async function deleteService(id: number) {
        Alert.alert("Eliminar", "Tem a certeza?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Eliminar", style: 'destructive', onPress: async () => {
                const { error } = await supabase.from('services').delete().eq('id', id);
                if (!error) fetchServices();
            }}
        ]);
    }

    const handleDragEnd = async ({ data }: { data: ServiceItem[] }) => {
        setServices(data);
        const updates = data.map((item, index) => ({ id: item.id, position: index }));
        try { for (const item of updates) await supabase.from('services').update({ position: item.position }).eq('id', item.id); }
        catch (e) { console.log("Erro ao reordenar"); }
    };

    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: BG_COLOR }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                
                {/* --- HEADER --- */}
                <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
                    <View style={styles.topBar}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                            <Ionicons name="arrow-back" size={22} color={THEME_COLOR} />
                        </TouchableOpacity>
                        <Text style={styles.pageTitle}>Gerir Serviços</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <View style={styles.statsRow}>
                        <View style={styles.statsItem}>
                            <Text style={styles.statsValue}>{services.length}</Text>
                            <Text style={styles.statsLabel}>Serviços</Text>
                        </View>
                        
                        {services.length > 1 && (
                            <TouchableOpacity
                                style={[styles.reorderBtn, isReordering && styles.reorderBtnActive]}
                                onPress={() => setIsReordering(!isReordering)}
                            >
                                <Ionicons name={isReordering ? "checkmark" : "swap-vertical"} size={16} color={isReordering ? "white" : THEME_COLOR} />
                                <Text style={[styles.reorderBtnText, isReordering && { color: 'white' }]}>
                                    {isReordering ? "Concluir" : "Organizar"}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* --- LISTA E FORMULÁRIO --- */}
                <View style={{ flex: 1 }}>
                    <DraggableFlatList
                        data={services}
                        onDragEnd={handleDragEnd}
                        keyExtractor={(item) => item.id.toString()}
                        contentContainerStyle={{ 
                            paddingHorizontal: 20, 
                            paddingBottom: 100,
                            paddingTop: 10 
                        }}
                        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchServices} tintColor={THEME_COLOR} />}
                        
                        // O Formulário é passado diretamente como JSX, não como componente
                        ListHeaderComponent={
                            <View style={styles.formContainer}>
                                <Text style={styles.formHeader}>
                                    {editingService ? `Editar "${editingService.nome}"` : 'Novo Serviço'}
                                </Text>
                                
                                <View style={styles.inputGroup}>
                                    <View style={[styles.inputWrapper, { flex: 1.5 }]}>
                                        <Ionicons name="pricetag-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.textInput}
                                            placeholder="Nome do serviço"
                                            placeholderTextColor="#9CA3AF"
                                            value={newServiceName}
                                            onChangeText={setNewServiceName}
                                        />
                                    </View>

                                    <View style={[styles.inputWrapper, { flex: 1 }]}>
                                        <Text style={styles.currencySymbol}>€</Text>
                                        <TextInput
                                            style={[styles.textInput, { paddingLeft: 30 }]}
                                            placeholder="0.00"
                                            placeholderTextColor="#9CA3AF"
                                            keyboardType="numeric"
                                            value={newServicePrice}
                                            onChangeText={setNewServicePrice}
                                        />
                                    </View>
                                </View>

                                <View style={styles.formActions}>
                                    {editingService && (
                                        <TouchableOpacity onPress={cancelEditService} style={styles.cancelButton}>
                                            <Text style={styles.cancelButtonText}>Cancelar</Text>
                                        </TouchableOpacity>
                                    )}
                                    
                                    <TouchableOpacity 
                                        style={[styles.saveButton, addingService && { opacity: 0.7 }]} 
                                        onPress={saveService}
                                        disabled={addingService}
                                    >
                                        {addingService ? (
                                            <ActivityIndicator color="white" size="small" />
                                        ) : (
                                            <>
                                                <Ionicons name={editingService ? "save-outline" : "add"} size={18} color="white" style={{ marginRight: 6 }} />
                                                <Text style={styles.saveButtonText}>
                                                    {editingService ? 'Guardar' : 'Adicionar'}
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        }
                        
                        ListEmptyComponent={
                            !loading ? (
                                <View style={styles.emptyState}>
                                    <View style={styles.emptyIconCircle}>
                                        <Ionicons name="cut-outline" size={32} color="#D1D5DB" />
                                    </View>
                                    <Text style={styles.emptyText}>Sem serviços registados.</Text>
                                    <Text style={styles.emptySubText}>Adicione o seu primeiro serviço acima.</Text>
                                </View>
                            ) : null
                        }

                        renderItem={({ item, drag, isActive }: RenderItemParams<ServiceItem>) => (
                            <ScaleDecorator>
                                <TouchableOpacity
                                    activeOpacity={1}
                                    onLongPress={isReordering ? drag : undefined}
                                    disabled={!isReordering}
                                    style={[
                                        styles.card,
                                        isActive && styles.cardActive,
                                        isReordering && styles.cardReordering
                                    ]}
                                >
                                    <View style={styles.cardContent}>
                                        {/* Lado Esquerdo: Nome (+ Drag Handle se estiver a reordenar) */}
                                        <View style={styles.cardLeft}>
                                            {isReordering && (
                                                <TouchableOpacity onPressIn={drag} style={styles.dragHandle}>
                                                    <Ionicons name="reorder-two" size={24} color="#9CA3AF" />
                                                </TouchableOpacity>
                                            )}
                                            
                                            <View style={{ flex: 1, marginLeft: isReordering ? 4 : 0 }}>
                                                <Text style={styles.serviceName} numberOfLines={1}>{item.nome}</Text>
                                            </View>
                                        </View>

                                        {/* Lado Direito: Preço + Ações */}
                                        <View style={styles.cardRight}>
                                            <View style={styles.priceTag}>
                                                <Text style={styles.priceText}>{item.preco.toFixed(2)}€</Text>
                                            </View>

                                            {!isReordering && (
                                                <View style={styles.cardActions}>
                                                    <TouchableOpacity onPress={() => handleEditService(item)} style={styles.actionIconBtn}>
                                                        <Ionicons name="pencil" size={16} color="#4B5563" />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => deleteService(item.id)} style={[styles.actionIconBtn, { backgroundColor: '#FEF2F2' }]}>
                                                        <Ionicons name="trash" size={16} color="#EF4444" />
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </ScaleDecorator>
                        )}
                    />
                </View>
            </KeyboardAvoidingView>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    // --- Header ---
    headerContainer: {
        backgroundColor: 'white',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 5,
        zIndex: 10,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 10,
        marginBottom: 15,
    },
    pageTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: THEME_COLOR,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 25,
    },
    statsItem: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
    },
    statsValue: { fontSize: 24, fontWeight: '800', color: THEME_COLOR },
    statsLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    
    reorderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        gap: 6,
    },
    reorderBtnActive: { backgroundColor: THEME_COLOR },
    reorderBtnText: { fontSize: 13, fontWeight: '600', color: THEME_COLOR },

    // --- Form ---
    formContainer: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
        borderWidth: 1, borderColor: '#F3F4F6'
    },
    formHeader: {
        fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5
    },
    inputGroup: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    inputWrapper: { position: 'relative', justifyContent: 'center' },
    textInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        paddingLeft: 38,
        fontSize: 15,
        color: '#111827',
    },
    inputIcon: { position: 'absolute', left: 12, zIndex: 1 },
    currencySymbol: { position: 'absolute', left: 14, zIndex: 1, fontSize: 16, fontWeight: '600', color: '#9CA3AF' },
    
    formActions: { flexDirection: 'row', gap: 10 },
    saveButton: {
        flex: 1,
        backgroundColor: THEME_COLOR,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        shadowColor: THEME_COLOR, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3
    },
    saveButtonText: { color: 'white', fontSize: 15, fontWeight: '700' },
    cancelButton: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
    },
    cancelButtonText: { color: '#4B5563', fontWeight: '600', fontSize: 14 },

    // --- Card Lista ---
    card: {
        backgroundColor: 'white',
        borderRadius: 16,
        marginBottom: 12,
        padding: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
        borderWidth: 1, borderColor: 'transparent'
    },
    cardActive: {
        borderColor: THEME_COLOR,
        shadowOpacity: 0.1,
        transform: [{ scale: 1.02 }],
        zIndex: 999
    },
    cardReordering: {
        borderColor: '#E5E7EB',
        backgroundColor: '#FCFCFD'
    },
    cardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    
    cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    
    dragHandle: {
        width: 30,
        height: 36, 
        justifyContent: 'center', 
        alignItems: 'flex-start',
        marginRight: 4
    },
    serviceName: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    
    cardRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    priceTag: {
        backgroundColor: ACCENT_GREEN_BG,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    priceText: { fontSize: 14, fontWeight: '700', color: ACCENT_GREEN },
    
    cardActions: { flexDirection: 'row', gap: 8 },
    actionIconBtn: {
        width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center'
    },

    // --- Empty State ---
    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyIconCircle: {
        width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 16
    },
    emptyText: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 4 },
    emptySubText: { fontSize: 14, color: '#9CA3AF' },
});