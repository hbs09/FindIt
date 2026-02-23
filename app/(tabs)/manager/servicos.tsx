import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../supabase';

// --- TIPOS ---
type CategoryItem = {
    id: number;
    nome: string;
};

type ServiceItem = {
    id: number;
    nome: string;
    preco: number;
    category_id: number | null;
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

    // Dados
    const [services, setServices] = useState<ServiceItem[]>([]);
    const [categories, setCategories] = useState<CategoryItem[]>([]);

    // Estados de Edição do Serviço
    const [newServiceName, setNewServiceName] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [addingService, setAddingService] = useState(false);
    const [editingService, setEditingService] = useState<ServiceItem | null>(null);

    // Estados de Edição de Categoria
    const [isAddingCat, setIsAddingCat] = useState(false);
    const [newCatName, setNewCatName] = useState('');

    const categoryScrollRef = useRef<ScrollView>(null);

    // Função para abrir o input e fazer scroll automático para o fim
    function handleOpenAddCategory() {
        setIsAddingCat(true);
        // O setTimeout dá 100ms para o React renderizar o input antes de rolar a página
        setTimeout(() => {
            categoryScrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }

    // --- INICIALIZAÇÃO ---
    useEffect(() => { checkPermission(); }, []);
    useEffect(() => {
        if (salonId) {
            fetchCategories();
            fetchServices();
        }
    }, [salonId]);

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

    async function fetchCategories() {
        if (!salonId) return;
        const { data } = await supabase.from('service_categories').select('*').eq('salon_id', salonId).order('nome');
        if (data) {
            setCategories(data);
            if (data.length > 0 && !selectedCategoryId) {
                setSelectedCategoryId(data[0].id); // Seleciona a primeira por defeito
            }
        }
    }

    async function fetchServices() {
        if (!salonId) return;
        setLoading(true);
        const { data, error } = await supabase.from('services').select('*').eq('salon_id', salonId).order('nome', { ascending: true });
        if (data) setServices(data);
        setLoading(false);
    }

    async function handleAddCategory() {
        if (!newCatName.trim()) { setIsAddingCat(false); return; }
        const { data, error } = await supabase
            .from('service_categories')
            .insert({ salon_id: salonId, nome: newCatName.trim() })
            .select()
            .single();

        if (data) {
            setCategories([...categories, data]);
            setSelectedCategoryId(data.id);
        }
        setNewCatName('');
        setIsAddingCat(false);
    }

    function handleEditService(item: ServiceItem) {
        setEditingService(item);
        setNewServiceName(item.nome);
        setNewServicePrice(item.preco.toString());
        setSelectedCategoryId(item.category_id);
    }

    function cancelEditService() {
        setEditingService(null);
        setNewServiceName('');
        setNewServicePrice('');
    }

    async function saveService() {
        if (!newServiceName.trim() || !newServicePrice.trim() || !selectedCategoryId) {
            return Alert.alert("Atenção", "Preencha o nome, o preço e selecione uma categoria.");
        }

       const nameNormalized = newServiceName.trim();
        
        // Agora verifica se o nome existe MAS SÓ dentro da mesma categoria!
        const duplicate = services.find(s => 
            s.nome.trim().toLowerCase() === nameNormalized.toLowerCase() && 
            s.category_id === selectedCategoryId && // <-- ESTA É A MAGIA
            s.id !== (editingService?.id ?? -1)
        );
        
        if (duplicate) return Alert.alert("Duplicado", "Já existe um serviço com este nome nesta categoria.");

        const priceClean = newServicePrice.replace(',', '.');
        const priceValue = parseFloat(priceClean);
        if (isNaN(priceValue)) return Alert.alert("Erro", "O preço inserido não é válido.");

        setAddingService(true);
        try {
            if (editingService) {
                const { error } = await supabase.from('services')
                    .update({ nome: newServiceName, preco: priceValue, category_id: selectedCategoryId })
                    .eq('id', editingService.id);
                if (error) throw error;
                Alert.alert("Sucesso", "Serviço atualizado!");
            } else {
                const payload: any = {
                    salon_id: salonId,
                    nome: newServiceName,
                    preco: priceValue,
                    category_id: selectedCategoryId
                };
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
            {
                text: "Eliminar", style: 'destructive', onPress: async () => {
                    const { error } = await supabase.from('services').delete().eq('id', id);
                    if (!error) fetchServices();
                }
            }
        ]);
    }

    async function deleteCategory(id: number) {
        const cat = categories.find(c => c.id === id);
        if (!cat) return;

        const servicesInCat = services.filter(s => s.category_id === id);
        const message = servicesInCat.length > 0
            ? `Esta categoria tem ${servicesInCat.length} serviço(s). Se a eliminar, os serviços ficarão "Sem Categoria". Tem a certeza?`
            : `Tem a certeza que deseja eliminar a categoria "${cat.nome}"?`;

        Alert.alert("Eliminar Categoria", message, [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Eliminar", style: 'destructive', onPress: async () => {
                    const { error } = await supabase.from('service_categories').delete().eq('id', id);
                    if (!error) {
                        if (selectedCategoryId === id) setSelectedCategoryId(null);
                        fetchCategories();
                        fetchServices();
                    } else {
                        Alert.alert("Erro", "Não foi possível eliminar a categoria.");
                    }
                }
            }
        ]);
    }

    // Função para agrupar os serviços por categoria na interface
    let groupedServices = categories.map(cat => ({
        ...cat,
        data: services.filter(s => s.category_id === cat.id)
    })).filter(cat => cat.data.length > 0);

    // Salva os serviços que ficaram sem categoria (órfãos)
    const uncategorizedServices = services.filter(s => !s.category_id);
    if (uncategorizedServices.length > 0) {
        groupedServices.push({
            id: -1,
            nome: "⚠️ Sem Categoria (Ocultos)",
            data: uncategorizedServices
        });
    }

    return (
        <View style={{ flex: 1, backgroundColor: BG_COLOR }}>
            <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>

                {/* --- HEADER --- */}
                <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
                    <View style={styles.topBar}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                            <Ionicons name="arrow-back" size={24} color={THEME_COLOR} />
                        </TouchableOpacity>
                        <Text style={styles.pageTitle}>Gerir Serviços</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <View style={styles.statsRow}>
                        <View style={styles.statsItem}>
                            <Text style={styles.statsValue}>{services.length}</Text>
                            <Text style={styles.statsLabel}>Serviços em {categories.length} Categorias</Text>
                        </View>
                    </View>
                </View>

                {/* --- CONTEÚDO SCROLLÁVEL --- */}
                <ScrollView
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { fetchCategories(); fetchServices(); }} tintColor={THEME_COLOR} />}
                >
                    {/* --- FORMULÁRIO --- */}
                    <View style={styles.formContainer}>
                        <Text style={styles.formHeader}>
                            {editingService ? `Editar "${editingService.nome}"` : 'Novo Serviço'}
                        </Text>

                        {/* Nova Secção: Categorias com Botão Eliminar */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Text style={[styles.subLabel, { marginBottom: 0 }]}>1. Escolha a Categoria</Text>

                            {selectedCategoryId && (
                                <TouchableOpacity onPress={() => deleteCategory(selectedCategoryId)}>
                                    <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700', textTransform: 'uppercase' }}>
                                        Eliminar Categoria
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <ScrollView
                            ref={categoryScrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={{ marginBottom: 16 }}
                        >
                            {categories.map(cat => (
                                <TouchableOpacity
                                    key={cat.id}
                                    style={[styles.catChip, selectedCategoryId === cat.id && styles.catChipActive]}
                                    onPress={() => setSelectedCategoryId(cat.id)}
                                >
                                    <Text style={[styles.catChipText, selectedCategoryId === cat.id && styles.catChipTextActive]}>
                                        {cat.nome}
                                    </Text>
                                </TouchableOpacity>
                            ))}

                            {/* Chip de Adicionar Nova Categoria */}
                            {isAddingCat ? (
                                <View style={styles.addCatInputWrapper}>
                                    <TextInput
                                        style={styles.addCatInput}
                                        placeholder="Nome..."
                                        autoFocus
                                        value={newCatName}
                                        onChangeText={setNewCatName}
                                        onSubmitEditing={handleAddCategory}
                                    />
                                    <TouchableOpacity onPress={handleAddCategory} style={styles.addCatSaveBtn}>
                                        <Ionicons name="checkmark" size={16} color="white" />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity style={styles.catChipAdd} onPress={handleOpenAddCategory}>
                                    <Ionicons name="add" size={14} color="#6B7280" />
                                    <Text style={styles.catChipAddText}>Nova</Text>
                                </TouchableOpacity>
                            )}
                        </ScrollView>

                        {/* Nome e Preço */}
                        <Text style={styles.subLabel}>2. Detalhes do Serviço</Text>
                        <View style={styles.inputGroup}>
                            <View style={[styles.inputWrapper, { flex: 1.5 }]}>
                                <Ionicons name="pricetag-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Ex: Corte Degradê"
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
                                style={[styles.saveButton, (addingService || !selectedCategoryId) && { opacity: 0.7 }]}
                                onPress={saveService}
                                disabled={addingService || !selectedCategoryId}
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

                    {/* --- LISTA AGRUPADA POR CATEGORIA --- */}
                    {!loading && services.length === 0 ? (
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconCircle}>
                                <Ionicons name="cut-outline" size={32} color="#D1D5DB" />
                            </View>
                            <Text style={styles.emptyText}>Sem serviços registados.</Text>
                            <Text style={styles.emptySubText}>Crie o seu primeiro serviço acima.</Text>
                        </View>
                    ) : (
                        groupedServices.map((group) => (
                            <View key={group.id} style={{ marginBottom: 24 }}>
                                <View style={styles.groupHeader}>
                                    <Text style={styles.groupTitle}>{group.nome}</Text>
                                    <Text style={styles.groupCount}>{group.data.length} serviços</Text>
                                </View>

                                {group.data.map((item) => (
                                    <View key={item.id} style={styles.card}>
                                        <View style={styles.cardContent}>
                                            <View style={styles.cardLeft}>
                                                <Text style={styles.serviceName} numberOfLines={1}>{item.nome}</Text>
                                            </View>

                                            <View style={styles.cardRight}>
                                                <View style={styles.priceTag}>
                                                    <Text style={styles.priceText}>{item.preco.toFixed(2)}€</Text>
                                                </View>

                                                <View style={styles.cardActions}>
                                                    <TouchableOpacity onPress={() => handleEditService(item)} style={styles.actionIconBtn}>
                                                        <Ionicons name="pencil" size={16} color="#4B5563" />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => deleteService(item.id)} style={[styles.actionIconBtn, { backgroundColor: '#FEF2F2' }]}>
                                                        <Ionicons name="trash" size={16} color="#EF4444" />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ))
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    headerContainer: { backgroundColor: 'white', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 5, zIndex: 10 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, marginBottom: 15 },
    pageTitle: { fontSize: 18, fontWeight: '800', color: THEME_COLOR },
    iconButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25 },
    statsItem: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    statsValue: { fontSize: 24, fontWeight: '800', color: THEME_COLOR },
    statsLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },

    // --- Form ---
    formContainer: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#F3F4F6' },
    formHeader: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 16 },
    subLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },

    // Categorias Chips
    catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', marginRight: 8, borderWidth: 1, borderColor: 'transparent' },
    catChipActive: { backgroundColor: THEME_COLOR, borderColor: THEME_COLOR },
    catChipText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
    catChipTextActive: { color: 'white' },

    catChipAdd: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#D1D5DB', marginRight: 8, borderStyle: 'dashed' },
    catChipAddText: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginLeft: 4 },

    addCatInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 20, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, marginRight: 8, borderWidth: 1, borderColor: THEME_COLOR },
    addCatInput: { fontSize: 13, width: 80, color: '#111827' },
    addCatSaveBtn: { backgroundColor: THEME_COLOR, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

    inputGroup: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    inputWrapper: { position: 'relative', justifyContent: 'center' },
    textInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, paddingLeft: 38, fontSize: 15, color: '#111827' },
    inputIcon: { position: 'absolute', left: 12, zIndex: 1 },
    currencySymbol: { position: 'absolute', left: 14, zIndex: 1, fontSize: 16, fontWeight: '600', color: '#9CA3AF' },

    formActions: { flexDirection: 'row', gap: 10 },
    saveButton: { flex: 1, backgroundColor: THEME_COLOR, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, shadowColor: THEME_COLOR, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
    saveButtonText: { color: 'white', fontSize: 15, fontWeight: '700' },
    cancelButton: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#F3F4F6', justifyContent: 'center' },
    cancelButtonText: { color: '#4B5563', fontWeight: '600', fontSize: 14 },

    // --- Lista Agrupada ---
    groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
    groupTitle: { fontSize: 16, fontWeight: '800', color: '#374151', textTransform: 'capitalize' },
    groupCount: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },

    card: { backgroundColor: 'white', borderRadius: 16, marginBottom: 8, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, borderWidth: 1, borderColor: '#F3F4F6' },
    cardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    serviceName: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    cardRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    priceTag: { backgroundColor: ACCENT_GREEN_BG, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    priceText: { fontSize: 14, fontWeight: '700', color: ACCENT_GREEN },
    cardActions: { flexDirection: 'row', gap: 8 },
    actionIconBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },

    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    emptyText: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 4 },
    emptySubText: { fontSize: 14, color: '#9CA3AF' },
});