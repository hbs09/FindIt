import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../../../supabase';

// --- TIPOS ---
type PortfolioItem = {
    id: number;
    image_url: string;
    description?: string;
    position?: number;
};

const MAX_PHOTOS = 12;
const { width, height } = Dimensions.get('window');
const COLUMNS = 3;
const GAP = 10;
const ITEM_SIZE = (width - 40 - (GAP * (COLUMNS - 1))) / COLUMNS; // 40 é o padding horizontal total

export default function ManagerGallery() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);

    // Dados
    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    
    // Estados de Upload
    const [uploading, setUploading] = useState(false);
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [tempImageUri, setTempImageUri] = useState<string | null>(null);
    const [newImageDescription, setNewImageDescription] = useState('');

    // Estados de Visualização/Reordenação
    const [isReordering, setIsReordering] = useState(false);
    const [fullImageIndex, setFullImageIndex] = useState<number | null>(null);
    const flatListRef = useRef<FlatList>(null);

    // --- INICIALIZAÇÃO ---
    useEffect(() => {
        checkPermission();
    }, []);

    useEffect(() => {
        if (salonId) {
            fetchPortfolio();
        }
    }, [salonId]);

    // --- PERMISSÕES ---
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

            // 2. Verifica se é GERENTE
            const { data: staff } = await supabase
                .from('salon_staff')
                .select('salon_id, role')
                .eq('user_id', user.id)
                .eq('status', 'ativo')
                .single();

            if (staff && staff.role === 'gerente') {
                setSalonId(staff.salon_id);
            } else {
                Alert.alert("Acesso Negado", "Apenas a gerência pode editar o portfólio.");
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
    async function fetchPortfolio() {
        if (!salonId) return;
        setLoading(true);

        const { data } = await supabase
            .from('portfolio_images')
            .select('*')
            .eq('salon_id', salonId)
            .order('position', { ascending: true });

        if (data) setPortfolio(data);
        setLoading(false);
    }

    // --- UPLOAD (CORRIGIDO COM FETCH) ---
    async function pickAndUploadImage() {
        if (portfolio.length >= MAX_PHOTOS) {
            return Alert.alert(
                "Limite Atingido",
                `Já atingiste o limite de ${MAX_PHOTOS} fotos. Apaga algumas antigas para poderes adicionar novas.`
            );
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 5], // Formato vertical estilo Instagram
            quality: 0.7,
        });

        if (!result.canceled) {
            setTempImageUri(result.assets[0].uri);
            setNewImageDescription('');
            setUploadModalVisible(true);
        }
    }

    async function confirmUpload() {
        if (!tempImageUri || !salonId) return;
        
        setUploadModalVisible(false);
        setUploading(true);

        try {
            // CORREÇÃO: Fetch + ArrayBuffer (substitui FileSystem deprecated)
            const response = await fetch(tempImageUri);
            const arrayBuffer = await response.arrayBuffer();
            
            const fileName = `${salonId}_${Date.now()}.jpg`;

            // 1. Upload para Storage
            const { error: uploadError } = await supabase.storage
                .from('portfolio')
                .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

            if (uploadError) throw uploadError;

            // 2. Obter URL Público
            const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(fileName);

            // 3. Inserir na Tabela
            await supabase.from('portfolio_images').insert({
                salon_id: salonId,
                image_url: publicUrl,
                description: newImageDescription,
                position: portfolio.length // Adiciona no fim
            });

            Alert.alert("Sucesso", "Foto publicada!");
            fetchPortfolio();

        } catch (error: any) {
            Alert.alert("Erro", "Falha ao enviar a imagem: " + error.message);
        } finally {
            setUploading(false);
            setTempImageUri(null);
            setNewImageDescription('');
        }
    }

    // --- DELETE ---
    async function deleteImage(imageId: number) {
        Alert.alert("Apagar", "Tens a certeza que queres remover esta foto?", [
            { text: "Cancelar", style: "cancel" },
            { 
                text: "Sim, Apagar", 
                style: "destructive",
                onPress: async () => {
                    const { error } = await supabase.from('portfolio_images').delete().eq('id', imageId);
                    if (error) Alert.alert("Erro", error.message);
                    else fetchPortfolio();
                } 
            }
        ]);
    }

    // --- REORDENAÇÃO ---
    const handleDragEnd = async ({ data }: { data: PortfolioItem[] }) => {
        setPortfolio(data);
        // Atualiza silenciosamente no background
        const updates = data.map((item, index) => ({ id: item.id, position: index }));
        try {
            for (const item of updates) {
                await supabase.from('portfolio_images').update({ position: item.position }).eq('id', item.id);
            }
        } catch (e) {
            console.log("Erro ao guardar ordem");
        }
    };

    // --- SCROLL SLIDER (FULL SCREEN) ---
    const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (fullImageIndex === null) return;
        const contentOffset = e.nativeEvent.contentOffset.x;
        const viewSize = e.nativeEvent.layoutMeasurement.width;
        const newIndex = Math.floor(contentOffset / viewSize);
        if (newIndex >= 0 && newIndex !== fullImageIndex) {
            setFullImageIndex(newIndex);
        }
    };

    // --- RENDER ---
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
                
                {/* 1. HEADER */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                        <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Portfólio</Text>
                    
                    {/* Botão de Toggle Reordenar */}
                    {portfolio.length > 1 ? (
                        <TouchableOpacity 
                            onPress={() => setIsReordering(!isReordering)} 
                            style={[styles.toggleBtn, isReordering && styles.toggleBtnActive]}
                        >
                            <Ionicons 
                                name={isReordering ? "checkmark" : "swap-vertical"} 
                                size={20} 
                                color={isReordering ? "white" : "#1A1A1A"} 
                            />
                        </TouchableOpacity>
                    ) : (
                        <View style={{width: 40}} />
                    )}
                </View>

                {/* 2. BARRA DE ESTATÍSTICAS E AÇÃO */}
                <View style={styles.actionBar}>
                    <View>
                        <Text style={styles.statsTitle}>As minhas fotos</Text>
                        <Text style={styles.statsSubtitle}>
                            {portfolio.length} / {MAX_PHOTOS} utilizadas
                        </Text>
                    </View>

                    {/* Botão Adicionar (Só aparece se não estiver a reordenar) */}
                    {!isReordering && (
                        <TouchableOpacity
                            style={[styles.addBtn, uploading && { opacity: 0.7 }]}
                            onPress={pickAndUploadImage}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <ActivityIndicator color="white" size="small" />
                            ) : (
                                <>
                                    <Ionicons name="add" size={20} color="white" />
                                    <Text style={styles.addBtnText}>Adicionar</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                    
                    {isReordering && (
                        <View style={styles.reorderBadge}>
                            <Text style={styles.reorderText}>Arraste para mover</Text>
                        </View>
                    )}
                </View>

                {/* 3. CONTEÚDO PRINCIPAL */}
                <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
                    
                    {isReordering ? (
                        // --- MODO LISTA (DRAG & DROP) ---
                        <DraggableFlatList
                            data={portfolio}
                            keyExtractor={(item) => item.id.toString()}
                            onDragEnd={handleDragEnd}
                            // PADDING BOTTOM AQUI PARA CORRIGIR O TAB BAR
                            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
                            renderItem={({ item, drag, isActive }: RenderItemParams<PortfolioItem>) => (
                                <ScaleDecorator>
                                    <TouchableOpacity
                                        onLongPress={drag}
                                        delayLongPress={100}
                                        style={[
                                            styles.draggableItem,
                                            isActive && { backgroundColor: '#F0F0F0', elevation: 10, transform: [{ scale: 1.05 }] }
                                        ]}
                                    >
                                        <View style={styles.dragHandle}>
                                            <Ionicons name="menu" size={24} color="#CCC" />
                                        </View>
                                        
                                        <Image source={{ uri: item.image_url }} style={styles.draggableImage} />
                                        
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={styles.draggableTitle} numberOfLines={1}>
                                                {item.description || "Sem descrição"}
                                            </Text>
                                            <Text style={{ fontSize: 11, color: '#999' }}>Toque longo para arrastar</Text>
                                        </View>
                                    </TouchableOpacity>
                                </ScaleDecorator>
                            )}
                        />
                    ) : (
                        // --- MODO GRELHA (NORMAL) ---
                        <FlatList
                            data={portfolio}
                            keyExtractor={(item) => item.id.toString()}
                            numColumns={COLUMNS}
                            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPortfolio} />}
                            // PADDING BOTTOM AQUI TAMBÉM
                            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
                            columnWrapperStyle={{ gap: GAP }}
                            
                            ListEmptyComponent={
                                !loading ? (
                                    <View style={styles.emptyContainer}>
                                        <View style={styles.emptyIconBg}>
                                            <Ionicons name="images-outline" size={40} color="#999" />
                                        </View>
                                        <Text style={styles.emptyTitle}>Galeria Vazia</Text>
                                        <Text style={styles.emptyText}>
                                            Adiciona fotos dos teus melhores trabalhos para atrair mais clientes.
                                        </Text>
                                    </View>
                                ) : null
                            }
                            
                            renderItem={({ item, index }) => (
                                <View style={styles.gridItemContainer}>
                                    <TouchableOpacity
                                        onPress={() => setFullImageIndex(index)}
                                        activeOpacity={0.9}
                                        style={styles.gridImageBtn}
                                    >
                                        <Image source={{ uri: item.image_url }} style={styles.gridImage} />
                                        
                                        {/* Gradiente sutil em baixo para o texto (simulado) */}
                                        {item.description && (
                                            <View style={styles.imageOverlay}>
                                                <Ionicons name="text" size={10} color="white" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                    
                                    {/* Botão Apagar Discreto */}
                                    <TouchableOpacity
                                        style={styles.deleteBtn}
                                        onPress={() => deleteImage(item.id)}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <View style={styles.deleteIconBg}>
                                            <Ionicons name="trash" size={12} color="#FF3B30" />
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    )}
                </View>

                {/* MODAL DE UPLOAD */}
                <Modal
                    visible={uploadModalVisible}
                    transparent={true}
                    animationType="slide"
                    onRequestClose={() => setUploadModalVisible(false)}
                >
                    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Nova Publicação</Text>
                                <TouchableOpacity onPress={() => setUploadModalVisible(false)}>
                                    <Ionicons name="close" size={24} color="#999" />
                                </TouchableOpacity>
                            </View>

                            {tempImageUri && (
                                <View style={styles.previewContainer}>
                                    <Image source={{ uri: tempImageUri }} style={styles.previewImage} resizeMode="contain" />
                                </View>
                            )}

                            <Text style={styles.label}>Descrição (Opcional)</Text>
                            <TextInput
                                style={styles.inputDescription}
                                placeholder="Ex: Corte degradê e barba..."
                                value={newImageDescription}
                                onChangeText={setNewImageDescription}
                                multiline
                                maxLength={150}
                                placeholderTextColor="#CCC"
                            />

                            <View style={styles.modalButtons}>
                                <TouchableOpacity style={styles.btnCancel} onPress={() => setUploadModalVisible(false)}>
                                    <Text style={styles.btnCancelText}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.btnConfirm} onPress={confirmUpload}>
                                    <Text style={styles.btnConfirmText}>Publicar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

                {/* MODAL FULL SCREEN */}
                <Modal
                    visible={fullImageIndex !== null}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setFullImageIndex(null)}
                >
                    <View style={styles.fullScreenContainer}>
                        <TouchableOpacity style={styles.closeButton} onPress={() => setFullImageIndex(null)}>
                            <Ionicons name="close-circle" size={40} color="white" />
                        </TouchableOpacity>

                        {fullImageIndex !== null && (
                            <Text style={styles.counterText}>
                                {fullImageIndex + 1} / {portfolio.length}
                            </Text>
                        )}

                        <FlatList
                            ref={flatListRef}
                            data={portfolio}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={(item) => item.id.toString()}
                            initialScrollIndex={fullImageIndex || 0}
                            getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
                            onMomentumScrollEnd={onScrollEnd}
                            renderItem={({ item }) => (
                                <View style={{ width: width, height: height, justifyContent: 'center', alignItems: 'center' }}>
                                    <Image source={{ uri: item.image_url }} style={styles.fullScreenImage} resizeMode="contain" />
                                    {item.description && (
                                        <View style={styles.descriptionOverlay}>
                                            <Text style={styles.descriptionText}>{item.description}</Text>
                                        </View>
                                    )}
                                </View>
                            )}
                        />
                    </View>
                </Modal>

            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 15,
        backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0'
    },
    iconBtn: {
        width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
        borderRadius: 20, backgroundColor: '#F5F7FA'
    },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
    toggleBtn: {
        width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
        borderRadius: 20, backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#EEE'
    },
    toggleBtnActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },

    // Action Bar
    actionBar: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'white'
    },
    statsTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
    statsSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
    
    addBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#1A1A1A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20
    },
    addBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
    reorderBadge: {
        backgroundColor: '#FFF3E0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12
    },
    reorderText: { color: '#F57C00', fontWeight: '600', fontSize: 12 },

    // Grid Items
    gridItemContainer: {
        width: ITEM_SIZE, height: ITEM_SIZE * 1.25, // Aspect ratio 4:5
        marginBottom: GAP, position: 'relative'
    },
    gridImageBtn: {
        flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#EEE',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, elevation: 2
    },
    gridImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    imageOverlay: {
        position: 'absolute', bottom: 6, right: 6,
        backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: 4
    },
    deleteBtn: {
        position: 'absolute', top: -6, right: -6, padding: 6
    },
    deleteIconBg: {
        width: 24, height: 24, borderRadius: 12, backgroundColor: 'white',
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.2, elevation: 3
    },

    // Draggable List
    draggableItem: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'white', padding: 12, marginBottom: 12,
        borderRadius: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, elevation: 2
    },
    dragHandle: { paddingRight: 15 },
    draggableImage: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#F0F0F0' },
    draggableTitle: { fontSize: 14, fontWeight: '600', color: '#333' },

    // Empty State
    emptyContainer: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
    emptyIconBg: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0F0F0',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20
    },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 },
    emptyText: { textAlign: 'center', color: '#999', lineHeight: 20 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 24, paddingBottom: 40
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },
    previewContainer: {
        height: 200, backgroundColor: '#F8F9FA', borderRadius: 16,
        marginBottom: 20, justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
    },
    previewImage: { width: '100%', height: '100%' },
    label: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 8, textTransform: 'uppercase' },
    inputDescription: {
        backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, height: 100,
        textAlignVertical: 'top', borderWidth: 1, borderColor: '#EEE', fontSize: 15, color: '#333'
    },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
    btnCancel: {
        flex: 1, backgroundColor: '#F5F5F5', paddingVertical: 14, borderRadius: 12, alignItems: 'center'
    },
    btnConfirm: {
        flex: 1, backgroundColor: '#1A1A1A', paddingVertical: 14, borderRadius: 12, alignItems: 'center'
    },
    btnCancelText: { fontWeight: '600', color: '#666' },
    btnConfirmText: { fontWeight: '700', color: 'white' },

    // Full Screen
    fullScreenContainer: { flex: 1, backgroundColor: 'black', justifyContent: 'center' },
    fullScreenImage: { width: '100%', height: '100%' },
    closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 99 },
    counterText: {
        position: 'absolute', top: 60, alignSelf: 'center',
        color: 'white', fontSize: 16, fontWeight: '600',
        backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20
    },
    descriptionOverlay: {
        position: 'absolute', bottom: 50, left: 20, right: 20,
        backgroundColor: 'rgba(20,20,20,0.85)', padding: 16, borderRadius: 16
    },
    descriptionText: { color: 'white', textAlign: 'center', fontWeight: '500', fontSize: 14 }
});