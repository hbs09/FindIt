import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';

export default function ProfileScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);

    useEffect(() => {
        getProfile();
    }, []);

    async function getProfile() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setProfile({
                email: user.email,
                name: user.user_metadata?.full_name || 'Utilizador',
                avatar_url: user.user_metadata?.avatar_url,
                id: user.id
            });

            const { count } = await supabase
                .from('salons')
                .select('*', { count: 'exact', head: true })
                .eq('dono_id', user.id);
            
            if (count && count > 0) setIsManager(true);

        } catch (error) {
            console.log(error);
        } finally {
            setLoading(false);
        }
    }

    async function pickImage() {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                uploadAvatar(result.assets[0].uri);
            }
        } catch (error) {
            Alert.alert("Erro", "Não foi possível abrir a galeria.");
        }
    }

    async function uploadAvatar(uri: string) {
        setUploading(true);
        try {
            const response = await fetch(uri);
            const arrayBuffer = await response.arrayBuffer();
            const fileExt = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, arrayBuffer, {
                    contentType: `image/${fileExt}`,
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const { error: updateError } = await supabase.auth.updateUser({
                data: { avatar_url: publicUrl }
            });

            if (updateError) throw updateError;

            setProfile((prev: any) => ({ ...prev, avatar_url: publicUrl }));
            Alert.alert("Sucesso", "Foto de perfil atualizada!");

        } catch (error) {
            console.log(error);
            Alert.alert("Erro", "Falha ao carregar a imagem.");
        } finally {
            setUploading(false);
        }
    }

    async function handleLogout() {
        Alert.alert("Sair", "Tens a certeza que queres sair?", [
            { text: "Cancelar", style: "cancel" },
            { 
                text: "Sair", 
                style: "destructive", 
                onPress: async () => {
                    await supabase.auth.signOut();
                    router.replace('/login');
                } 
            }
        ]);
    }

    if (loading) return <View style={styles.center}><ActivityIndicator color="#333" /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* [AJUSTE] paddingBottom aumentado para 120 para não ficar atrás da TabBar */}
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                
                <View style={styles.header}>
                    <TouchableOpacity 
                        style={styles.avatarContainer} 
                        onPress={pickImage}
                        disabled={uploading}
                    >
                        {uploading ? (
                            <ActivityIndicator color="#333" />
                        ) : profile?.avatar_url ? (
                            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarText}>
                                {profile?.name?.charAt(0).toUpperCase() || 'U'}
                            </Text>
                        )}

                        <View style={styles.cameraIconBadge}>
                            <Ionicons name="camera" size={14} color="white" />
                        </View>
                    </TouchableOpacity>

                    <Text style={styles.name}>{profile?.name}</Text>
                    <Text style={styles.email}>{profile?.email}</Text>
                </View>

                <View style={styles.menuSection}>
                    <Text style={styles.sectionTitle}>Conta</Text>
                    
                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/history')}>
                        <View style={styles.menuIconBg}><Ionicons name="time-outline" size={20} color="#333" /></View>
                        <Text style={styles.menuText}>Histórico de Marcações</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/favorites')}>
                        <View style={styles.menuIconBg}><Ionicons name="heart-outline" size={20} color="#333" /></View>
                        <Text style={styles.menuText}>Meus Favoritos</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/notifications')}>
                        <View style={styles.menuIconBg}><Ionicons name="notifications-outline" size={20} color="#333" /></View>
                        <Text style={styles.menuText}>Notificações</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>
                </View>

                {isManager && (
                    <View style={styles.menuSection}>
                        <Text style={styles.sectionTitle}>Profissional</Text>
                        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/manager')}>
                            <View style={[styles.menuIconBg, {backgroundColor:'#333'}]}><Ionicons name="briefcase-outline" size={20} color="white" /></View>
                            <Text style={styles.menuText}>Gerir Meu Salão</Text>
                            <Ionicons name="chevron-forward" size={20} color="#ccc" />
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.menuSection}>
                    <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                        <View style={[styles.menuIconBg, {backgroundColor:'#FFEBEE'}]}><Ionicons name="log-out-outline" size={20} color="#D32F2F" /></View>
                        <Text style={[styles.menuText, {color: '#D32F2F'}]}>Terminar Sessão</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.versionText}>FindIt v1.0.0</Text>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    header: { alignItems: 'center', paddingVertical: 40 },
    
    avatarContainer: {
        width: 100, height: 100, borderRadius: 50, backgroundColor: '#e1e1e1',
        justifyContent: 'center', alignItems: 'center', marginBottom: 15,
        borderWidth: 3, borderColor: 'white',
        shadowColor: '#000', shadowOffset: {width:0, height:5}, shadowOpacity:0.1, shadowRadius:5, elevation:5,
        position: 'relative'
    },
    avatarImage: {
        width: '100%', height: '100%', borderRadius: 50, resizeMode: 'cover'
    },
    avatarText: { fontSize: 40, fontWeight: 'bold', color: '#666' },
    
    cameraIconBadge: {
        position: 'absolute', bottom: 0, right: 0,
        backgroundColor: '#1a1a1a', width: 30, height: 30, borderRadius: 15,
        justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white'
    },

    name: { fontSize: 24, fontWeight: 'bold', color: '#333' },
    email: { fontSize: 14, color: '#888', marginTop: 4 },

    menuSection: {
        backgroundColor: 'white', marginHorizontal: 20, marginBottom: 15, borderRadius: 20, // MarginBottom reduzido ligeiramente
        paddingVertical: 8, paddingHorizontal: 5, // PaddingVertical reduzido
        shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.03, shadowRadius:4, elevation:2
    },
    sectionTitle: {
        marginLeft: 15, marginTop: 10, marginBottom: 5, fontSize: 12, fontWeight: 'bold', color: '#ccc', textTransform: 'uppercase'
    },
    menuItem: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, // [AJUSTE] Reduzido de 15 para 12
        borderBottomWidth: 1, borderBottomColor: '#f9f9f9'
    },
    menuIconBg: {
        width: 36, height: 36, borderRadius: 12, backgroundColor: '#f5f5f5',
        justifyContent: 'center', alignItems: 'center', marginRight: 15
    },
    menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#333' },

    footer: { alignItems: 'center', marginTop: 10 },
    versionText: { color: '#ccc', fontSize: 12 },
});