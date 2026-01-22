import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

type Invite = {
    id: number;
    salon_id: number;
    status: string;
    salons: { nome_salao: string; cidade: string };
};

export default function InvitesScreen() {
    const router = useRouter();
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchInvites();
    }, []);

    async function fetchInvites() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) return setLoading(false);

        // Procura convites pelo EMAIL do utilizador atual
        const { data, error } = await supabase
            .from('salon_staff')
            .select(`
                id, 
                salon_id, 
                status,
                salons ( nome_salao, cidade )
            `)
            .eq('email', user.email)
            .eq('status', 'pendente'); // Só queremos os pendentes

        if (data) setInvites(data as any);
        setLoading(false);
    }

    async function handleResponse(id: number, decision: 'ativo' | 'rejeitado') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Atualiza o estado e vincula o user_id
        const { error } = await supabase
            .from('salon_staff')
            .update({ 
                status: decision,
                user_id: user.id // Vincula a conta ao convite
            })
            .eq('id', id);

        if (error) {
            Alert.alert("Erro", error.message);
        } else {
            if (decision === 'ativo') {
                Alert.alert("Sucesso", "Faz parte da equipa! Podes agora aceder à área de gestão.");
                router.replace('/manager'); // Redireciona para o manager
            } else {
                fetchInvites(); // Apenas recarrega a lista
            }
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{padding:5}}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Convites de Trabalho</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#333" style={{marginTop:50}} />
            ) : (
                <FlatList
                    data={invites}
                    keyExtractor={item => item.id.toString()}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="mail-open-outline" size={50} color="#CCC" />
                            <Text style={{color:'#999', marginTop:10}}>Sem convites pendentes.</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <View>
                                <Text style={styles.salonName}>{item.salons?.nome_salao}</Text>
                                <Text style={styles.salonCity}>{item.salons?.cidade}</Text>
                            </View>
                            
                            <View style={styles.actions}>
                                <TouchableOpacity 
                                    style={[styles.btn, {backgroundColor:'#FFEBEE'}]} 
                                    onPress={() => handleResponse(item.id, 'rejeitado')}
                                >
                                    <Text style={{color:'#D32F2F', fontWeight:'bold'}}>Rejeitar</Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[styles.btn, {backgroundColor:'#E8F5E9'}]} 
                                    onPress={() => handleResponse(item.id, 'ativo')}
                                >
                                    <Text style={{color:'#2E7D32', fontWeight:'bold'}}>Aceitar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA', paddingTop: 50 },
    header: { flexDirection:'row', alignItems:'center', padding:20, gap:15 },
    title: { fontSize: 22, fontWeight: 'bold' },
    empty: { alignItems:'center', marginTop:100 },
    card: { 
        backgroundColor:'white', margin:20, padding:20, borderRadius:12,
        shadowColor:'#000', shadowOpacity:0.05, elevation:2
    },
    salonName: { fontSize:18, fontWeight:'bold', color:'#333' },
    salonCity: { fontSize:14, color:'#666', marginBottom:15 },
    actions: { flexDirection:'row', gap:10 },
    btn: { flex:1, padding:12, borderRadius:8, alignItems:'center' }
});