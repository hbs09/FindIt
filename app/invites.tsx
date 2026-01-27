import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

type Invite = {
    id: number;
    salon_id: number;
    status: string;
    temp_name?: string; // Nome temporário dado no convite
    email: string;
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

        const { data, error } = await supabase
            .from('salon_staff')
            .select(`
                id, 
                salon_id, 
                status,
                email,
                temp_name,
                salons ( nome_salao, cidade )
            `)
            .eq('email', user.email)
            .eq('status', 'pendente');

        if (data) setInvites(data as any);
        setLoading(false);
    }

    // --- ATUALIZA ESTA FUNÇÃO ---
   async function notifyManagers(salonId: number, salonName: string, decision: 'ativo' | 'recusado', inviteeName: string) {
        try {
            const isAccepted = decision === 'ativo';
            const title = isAccepted ? 'Convite Aceite' : 'Convite Recusado';
            const body = isAccepted 
                ? `${inviteeName} aceitou o convite e juntou-se à equipa do ${salonName}.`
                : `${inviteeName} recusou o convite para a equipa do ${salonName}.`;

            // A chamada RPC tem de usar os mesmos nomes que definimos no SQL (p_salon_id, etc.)
            const { error } = await supabase.rpc('notify_salon_managers', {
                p_salon_id: salonId,
                p_title: title,
                p_body: body,
                p_data: { 
                    screen: '/manager', 
                    params: { tab: 'equipa' } // Garante que diz 'equipa' e não 'staff'
                } 
            });

            if (error) {
                console.error("Erro RPC Detalhado:", error);
                Alert.alert("Erro de Sistema", "Falha ao notificar gerente: " + error.message);
            }

        } catch (error: any) {
            console.log("Erro ao chamar notificação:", error);
        }
    }

    // --- ATUALIZA ESTA FUNÇÃO ---
    async function handleResponse(invite: Invite, decision: 'ativo' | 'recusado') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Atualiza o estado e vincula o user_id
        const { error } = await supabase
            .from('salon_staff')
            .update({
                status: decision,
                user_id: user.id
            })
            .eq('id', invite.id);

        if (error) {
            Alert.alert("Erro", error.message);
        } else {
            // 2. Notifica os gerentes (COM AWAIT)
            // O 'await' aqui é crucial para garantir que a notificação segue antes de mudar de ecrã
            const nameDisplay = invite.temp_name || invite.email;
            await notifyManagers(invite.salon_id, invite.salons.nome_salao, decision, nameDisplay);

            if (decision === 'ativo') {
                Alert.alert("Sucesso", "Faz parte da equipa! Podes agora aceder à área de gestão.", [
                    { text: "OK", onPress: () => router.replace('/manager') }
                ]);
            } else {
                fetchInvites();
            }
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 5 }}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Convites de Trabalho</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#333" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={invites}
                    keyExtractor={item => item.id.toString()}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="mail-open-outline" size={50} color="#CCC" />
                            <Text style={{ color: '#999', marginTop: 10 }}>Sem convites pendentes.</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <View>
                                <Text style={styles.salonName}>{item.salons?.nome_salao}</Text>
                                <Text style={styles.salonCity}>{item.salons?.cidade}</Text>
                                <Text style={styles.inviteRole}>
                                    Convite para: {item.temp_name || item.email}
                                </Text>
                            </View>

                            <View style={styles.actions}>
                                <TouchableOpacity
                                    style={[styles.btn, { backgroundColor: '#FFEBEE' }]}
                                    onPress={() => handleResponse(item, 'recusado')}
                                >
                                    <Text style={{ color: '#D32F2F', fontWeight: 'bold' }}>Rejeitar</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.btn, { backgroundColor: '#E8F5E9' }]}
                                    onPress={() => handleResponse(item, 'ativo')}
                                >
                                    <Text style={{ color: '#2E7D32', fontWeight: 'bold' }}>Aceitar</Text>
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
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 15 },
    title: { fontSize: 22, fontWeight: 'bold' },
    empty: { alignItems: 'center', marginTop: 100 },
    card: {
        backgroundColor: 'white', margin: 20, padding: 20, borderRadius: 12,
        shadowColor: '#000', shadowOpacity: 0.05, elevation: 2
    },
    salonName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    salonCity: { fontSize: 14, color: '#666', marginBottom: 4 },
    inviteRole: { fontSize: 12, color: '#999', marginBottom: 15 },
    actions: { flexDirection: 'row', gap: 10 },
    btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' }
});