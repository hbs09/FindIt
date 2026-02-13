import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
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

    // --- UPLOAD ---
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
            aspect: [4, 5], // Formato mais "Instagram" vertical, ou [4,4] quadrado
            quality: 0.7,
            base64: true, // Necessário para o upload via FileSystem
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
            const base64 = await FileSystem.readAsStringAsync(tempImageUri, { encoding: 'base64' });
            const fileName = `${salonId}_${Date.now()}.jpg`;

            // 1. Upload para Storage
            const { error: uploadError } = await supabase.storage
                .from('portfolio')
                .upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });

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
                
                {/* HEADER */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Portfólio</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* INFO BAR */}
                <View style={styles.infoBar}>
                    <View>
                        <Text style={styles.infoTitle}>As minhas fotos</Text>
                        <Text style={styles.infoSubtitle}>{portfolio.length} / {MAX_PHOTOS} fotos utilizadas</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {/* Botão Organizar */}
                        {portfolio.length > 1 && (
                            <TouchableOpacity
                                style={[styles.controlBtn, isReordering ? styles.controlBtnActive : null]}
                                onPress={() => setIsReordering(!isReordering)}
                            >
                                <Ionicons name={isReordering ? "checkmark" : "swap-vertical"} size={18} color={isReordering ? "white" : "#333"} />
                            </TouchableOpacity>
                        )}

                        {/* Botão Adicionar */}
                        {!isReordering && (
                            <TouchableOpacity
                                style={[styles.addBtn, uploading && styles.disabledBtn]}
                                onPress={pickAndUploadImage}
                                disabled={uploading}
                            >
                                {uploading ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="add" size={22} color="white" />}
                                <Text style={styles.addBtnText}>Nova Foto</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* CONTEÚDO PRINCIPAL */}
                <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
                    
                    {isReordering ? (
                        // --- MODO LISTA (DRAG & DROP) ---
                        <DraggableFlatList
                            data={portfolio}
                            keyExtractor={(item) => item.id.toString()}
                            onDragEnd={handleDragEnd}
                            contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                            renderItem={({ item, drag, isActive }: RenderItemParams<PortfolioItem>) => (
                                <ScaleDecorator>
                                    <TouchableOpacity
                                        onLongPress={drag}
                                        delayLongPress={100}
                                        style={[
                                            styles.draggableItem,
                                            isActive && { backgroundColor: '#F0F0F0', elevation: 5, transform: [{ scale: 1.02 }] }
                                        ]}
                                    >
                                        <Ionicons name="reorder-two" size={24} color="#999" style={{ marginRight: 15 }} />
                                        <Image source={{ uri: item.image_url }} style={styles.draggableImage} />
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Text style={styles.draggableTitle} numberOfLines={1}>
                                                {item.description ? item.description : "Sem descrição"}
                                            </Text>
                                            <Text style={{ fontSize: 10, color: '#ccc' }}>Arraste para mover</Text>
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
                            numColumns={3}
                            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPortfolio} />}
                            contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
                            columnWrapperStyle={{ gap: 10 }}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <View style={styles.emptyIconBg}><Ionicons name="images-outline" size={40} color="#999" /></View>
                                    <Text style={styles.emptyTitle}>Galeria Vazia</Text>
                                    <Text style={styles.emptyText}>Adiciona fotos dos teus melhores trabalhos para atrair mais clientes.</Text>
                                </View>
                            }
                            renderItem={({ item, index }) => (
                                <View style={styles.gridItem}>
                                    <TouchableOpacity
                                        onPress={() => setFullImageIndex(index)}
                                        activeOpacity={0.9}
                                        style={{ flex: 1 }}
                                    >
                                        <Image source={{ uri: item.image_url }} style={styles.gridImage} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.deleteBtn}
                                        onPress={() => deleteImage(item.id)}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Ionicons name="trash-outline" size={14} color="#FF3B30" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    )}
                </View>

                {/* MODAL DE UPLOAD (DESCRIÇÃO) */}
                <Modal
                    visible={uploadModalVisible}
                    transparent={true}
                    animationType="slide"
                    onRequestClose={() => setUploadModalVisible(false)}
                >
                    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Nova Publicação</Text>

                            {tempImageUri && (
                                <Image source={{ uri: tempImageUri }} style={styles.previewImage} resizeMode="cover" />
                            )}

                            <Text style={styles.label}>Descrição (Opcional)</Text>
                            <TextInput
                                style={styles.inputDescription}
                                placeholder="Ex: Corte degradê..."
                                value={newImageDescription}
                                onChangeText={setNewImageDescription}
                                multiline
                                maxLength={150}
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

                {/* MODAL FULL SCREEN (SLIDER) */}
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: '#F5F7FA' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },

    infoBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white' },
    infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    infoSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },

    controlBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F7FA', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
    controlBtnActive: { backgroundColor: '#333', borderColor: '#333' },
    
    addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', paddingHorizontal: 16, height: 40, borderRadius: 20, gap: 6 },
    addBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
    disabledBtn: { opacity: 0.7 },

    // Grid
    gridItem: { flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: 'white', position: 'relative', marginBottom: 10 },
    gridImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    deleteBtn: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },

    // Draggable List
    draggableItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 10, marginBottom: 10, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, elevation: 1 },
    draggableImage: { width: 50, height: 50, borderRadius: 8, backgroundColor: '#F0F0F0' },
    draggableTitle: { fontSize: 14, fontWeight: '600', color: '#333' },

    // Empty State
    emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
    emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 },
    emptyText: { textAlign: 'center', color: '#999' },

    // Upload Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
    modalContent: { backgroundColor: 'white', margin: 20, borderRadius: 20, padding: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    previewImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 15 },
    label: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 5 },
    inputDescription: { backgroundColor: '#F5F7FA', borderRadius: 10, padding: 12, height: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#EEE' },
    modalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
    btnCancel: { flex: 1, backgroundColor: '#EEE', padding: 14, borderRadius: 12, alignItems: 'center' },
    btnConfirm: { flex: 1, backgroundColor: '#1A1A1A', padding: 14, borderRadius: 12, alignItems: 'center' },
    btnCancelText: { fontWeight: 'bold', color: '#666' },
    btnConfirmText: { fontWeight: 'bold', color: 'white' },

    // Full Screen
    fullScreenContainer: { flex: 1, backgroundColor: 'black', justifyContent: 'center' },
    fullScreenImage: { width: '100%', height: '100%' },
    closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 99 },
    counterText: { position: 'absolute', top: 60, alignSelf: 'center', color: 'white', fontSize: 18, fontWeight: 'bold', zIndex: 99 },
    descriptionOverlay: { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 12 },
    descriptionText: { color: 'white', textAlign: 'center', fontWeight: '500' }
});