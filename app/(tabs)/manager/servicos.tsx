import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist'; //
import { GestureHandlerRootView } from 'react-native-gesture-handler'; //
import { supabase } from '../../../supabase'; //

// --- TIPOS ---
type ServiceItem = {
    id: number;
    nome: string;
    preco: number;
    position?: number;
};

export default function ManagerServices() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);

    // Dados
    const [services, setServices] = useState<ServiceItem[]>([]);

    // Estados de Edição
    const [newServiceName, setNewServiceName] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');
    const [addingService, setAddingService] = useState(false);
    const [editingService, setEditingService] = useState<ServiceItem | null>(null);
    const [isReordering, setIsReordering] = useState(false);

    // --- INICIALIZAÇÃO ---
    useEffect(() => {
        checkPermission();
    }, []);

    useEffect(() => {
        if (salonId) {
            fetchServices();
        }
    }, [salonId]);

    // --- VERIFICAÇÃO DE PERMISSÕES ---
    async function checkPermission() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.replace('/login');

            // 1. Verifica se é DONO
            const { data: salonOwner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
            
            if (salonOwner) {
                setSalonId(salonOwner.id);
                return;
            }

            // 2. Verifica se é GERENTE (Staff com role 'gerente')
            const { data: staff } = await supabase
                .from('salon_staff')
                .select('salon_id, role')
                .eq('user_id', user.id)
                .eq('status', 'ativo')
                .single();

            if (staff && staff.role === 'gerente') {
                setSalonId(staff.salon_id);
            } else {
                Alert.alert("Acesso Negado", "Apenas gerentes podem gerir os serviços.");
                router.back();
            }
        } catch (error) {
            console.error(error);
            router.back();
        } finally {
            setLoading(false);
        }
    }

    // --- FETCH DATA ---
    async function fetchServices() {
        if (!salonId) return;
        setLoading(true);

        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('salon_id', salonId)
            .order('position', { ascending: true }); //

        if (error) {
            // Fallback se não existir coluna position
            const { data: dataFallback } = await supabase
                .from('services')
                .select('*')
                .eq('salon_id', salonId)
                .order('nome', { ascending: true });

            if (dataFallback) setServices(dataFallback);
        } else {
            if (data) setServices(data);
        }
        setLoading(false);
    }

    // --- LÓGICA DE CRUD ---
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
        if (!newServiceName.trim() || !newServicePrice.trim()) {
            return Alert.alert("Atenção", "Preencha o nome e o preço do serviço.");
        }

        const nameNormalized = newServiceName.trim();
        const duplicate = services.find(s =>
            s.nome.trim().toLowerCase() === nameNormalized.toLowerCase() &&
            s.id !== (editingService?.id ?? -1)
        );

        if (duplicate) {
            return Alert.alert("Duplicado", "Já existe um serviço com este nome.");
        }

        const priceClean = newServicePrice.replace(',', '.');
        const priceValue = parseFloat(priceClean);

        if (isNaN(priceValue)) {
            return Alert.alert("Erro", "O preço inserido não é válido.");
        }

        setAddingService(true);

        try {
            if (editingService) {
                // ATUALIZAR
                const { error } = await supabase
                    .from('services')
                    .update({ nome: newServiceName, preco: priceValue })
                    .eq('id', editingService.id);

                if (error) throw error;
                Alert.alert("Sucesso", "Serviço atualizado!");
            } else {
                // CRIAR NOVO
                const nextPosition = services.length > 0 ? services.length + 1 : 0;
                
                const payload: any = {
                    salon_id: salonId,
                    nome: newServiceName,
                    preco: priceValue
                };
                
                // Tenta adicionar posição se possível
                if (services.length > 0 && services[0].position !== undefined) {
                    payload.position = nextPosition;
                }

                const { error } = await supabase.from('services').insert(payload);
                if (error) throw error;
                Alert.alert("Sucesso", "Serviço adicionado!");
            }

            // Reset
            setEditingService(null);
            setNewServiceName('');
            setNewServicePrice('');
            fetchServices();

        } catch (error: any) {
            Alert.alert("Erro", error.message);
        } finally {
            setAddingService(false);
        }
    }

    async function deleteService(id: number) {
        Alert.alert(
            "Eliminar Serviço",
            "Tens a certeza que queres remover este serviço?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Eliminar",
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase.from('services').delete().eq('id', id);
                        if (error) {
                            Alert.alert("Erro", "Não foi possível apagar: " + error.message);
                        } else {
                            fetchServices();
                        }
                    }
                }
            ]
        );
    }

    // --- REORDENAÇÃO (DRAG & DROP) ---
    const handleDragEnd = async ({ data }: { data: ServiceItem[] }) => {
        setServices(data);
        const updates = data.map((item, index) => ({ id: item.id, position: index }));
        try {
            for (const item of updates) {
                await supabase.from('services').update({ position: item.position }).eq('id', item.id);
            }
        } catch (e) {
            console.log("Erro ao reordenar");
        }
    };

    // --- RENDER ---
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                    
                    {/* HEADER */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color="#333" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Serviços</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
                        
                        {/* FORMULÁRIO */}
                        <View style={styles.addServiceForm}>
                            <Text style={styles.formTitle}>{editingService ? 'Editar Serviço' : 'Adicionar Novo'}</Text>
                            <View style={styles.inputRow}>
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="cut-outline" size={20} color="#999" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.inputStyled}
                                        placeholder="Nome"
                                        value={newServiceName}
                                        onChangeText={setNewServiceName}
                                        placeholderTextColor="#999"
                                    />
                                </View>
                                <View style={[styles.inputWrapper, { flex: 0.6 }]}>
                                    <Text style={styles.currencyPrefix}>€</Text>
                                    <TextInput
                                        style={[styles.inputStyled, { paddingLeft: 25 }]}
                                        placeholder="Preço"
                                        keyboardType="numeric"
                                        value={newServicePrice}
                                        onChangeText={setNewServicePrice}
                                        placeholderTextColor="#999"
                                    />
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {editingService && (
                                    <TouchableOpacity
                                        style={[styles.addServiceBtn, { backgroundColor: '#EEE', flex: 1 }]}
                                        onPress={cancelEditService}
                                    >
                                        <Text style={[styles.addServiceBtnText, { color: '#666' }]}>Cancelar</Text>
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity
                                    style={[styles.addServiceBtn, { flex: 2 }]}
                                    onPress={saveService}
                                    disabled={addingService}
                                >
                                    {addingService ? (
                                        <ActivityIndicator color="white" size="small" />
                                    ) : (
                                        <Text style={styles.addServiceBtnText}>
                                            {editingService ? 'Guardar Alterações' : 'Adicionar Serviço'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* CONTROLOS DA LISTA */}
                        {services.length > 0 && (
                            <View style={styles.listControlRow}>
                                <Text style={styles.listCountText}>{services.length} Serviços</Text>

                                <TouchableOpacity
                                    style={[styles.reorderBtn, isReordering && styles.reorderBtnActive]}
                                    onPress={() => setIsReordering(!isReordering)}
                                >
                                    <Ionicons
                                        name={isReordering ? "checkmark" : "swap-vertical"}
                                        size={14}
                                        color={isReordering ? "white" : "#666"}
                                    />
                                    <Text style={[styles.reorderBtnText, isReordering && { color: 'white' }]}>
                                        {isReordering ? 'Concluir' : 'Organizar'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* LISTA DRAGGABLE */}
                        <DraggableFlatList
                            data={services}
                            onDragEnd={handleDragEnd}
                            keyExtractor={(item) => item.id.toString()}
                            contentContainerStyle={{ padding: 20, paddingTop: 5, paddingBottom: 100 }}
                            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchServices} />}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <View style={[styles.emptyIconBg, { backgroundColor: '#FFF5F5' }]}>
                                        <Ionicons name="cut" size={32} color="#FF3B30" />
                                    </View>
                                    <Text style={styles.emptyText}>Ainda não tens serviços.</Text>
                                </View>
                            }
                            renderItem={({ item, drag, isActive }: RenderItemParams<ServiceItem>) => (
                                <ScaleDecorator>
                                    <View
                                        style={[
                                            styles.serviceCard,
                                            isActive && { backgroundColor: '#F0F0F0', elevation: 5, shadowOpacity: 0.2 }
                                        ]}
                                    >
                                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                            {isReordering && (
                                                <TouchableOpacity
                                                    onLongPress={drag}
                                                    delayLongPress={200}
                                                    hitSlop={20}
                                                    style={{ marginRight: 8 }}
                                                >
                                                    <Ionicons name="reorder-two-outline" size={24} color="#333" />
                                                </TouchableOpacity>
                                            )}

                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.serviceCardName} numberOfLines={2}>
                                                    {item.nome}
                                                </Text>
                                                {isReordering && (
                                                    <Text style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                                                        Arraste para mover
                                                    </Text>
                                                )}
                                            </View>
                                        </View>

                                        <View style={styles.serviceRight}>
                                            <View style={styles.priceBadge}>
                                                <Text style={styles.priceBadgeText}>{item.preco.toFixed(2)}€</Text>
                                            </View>

                                            <View style={styles.actionButtonsContainer}>
                                                <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditService(item)}>
                                                    <Ionicons name="pencil-outline" size={18} color="#007AFF" />
                                                </TouchableOpacity>

                                                <TouchableOpacity style={styles.actionBtn} onPress={() => deleteService(item.id)}>
                                                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                </ScaleDecorator>
                            )}
                        />
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: '#F5F7FA' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },

    addServiceForm: {
        margin: 20, marginBottom: 15,
        backgroundColor: 'white', borderRadius: 16, padding: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, elevation: 2
    },
    formTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 12, textTransform: 'uppercase' },
    inputRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
    inputWrapper: { flex: 1, position: 'relative', justifyContent: 'center' },
    inputStyled: {
        backgroundColor: '#F5F7FA', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, paddingLeft: 40,
        fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#EEE'
    },
    inputIcon: { position: 'absolute', left: 10, zIndex: 1 },
    currencyPrefix: { position: 'absolute', left: 12, zIndex: 1, fontSize: 16, fontWeight: 'bold', color: '#999' },
    addServiceBtn: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    addServiceBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

    listControlRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 25, paddingBottom: 5, marginBottom: 5
    },
    listCountText: { fontSize: 12, fontWeight: '600', color: '#999', textTransform: 'uppercase' },
    reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#EEE' },
    reorderBtnActive: { backgroundColor: '#333' },
    reorderBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },

    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyText: { color: '#CCC', marginTop: 10 },

    serviceCard: {
        backgroundColor: 'white', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15, marginBottom: 10,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.03, elevation: 1
    },
    serviceCardName: { fontSize: 15, fontWeight: '600', color: '#333' },
    serviceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    priceBadge: { backgroundColor: '#F0F9F4', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E8F5E9', marginRight: 5 },
    priceBadgeText: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
    actionButtonsContainer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionBtn: { padding: 5 }
});