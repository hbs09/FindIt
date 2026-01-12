import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../supabase';

type Service = {
    id: number;
    nome: string;
    preco: number;
    duracao_minutos: number;
};

export default function BookConfirmScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    
    const { salonId, salonName, date, time } = params;

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [services, setServices] = useState<Service[]>([]);
    const [selectedService, setSelectedService] = useState<Service | null>(null);

    useEffect(() => {
        if (salonId) fetchServices();
    }, [salonId]);

    async function fetchServices() {
        const { data } = await supabase
            .from('services')
            .select('*')
            .eq('salon_id', salonId)
            .order('preco', { ascending: true });
        
        if (data) setServices(data as Service[]);
        setLoading(false);
    }

    async function handleConfirm() {
        if (!selectedService) {
            return Alert.alert("Falta o serviço", "Por favor seleciona o serviço que queres fazer.");
        }

        setSubmitting(true);

        // 1. Obter Utilizador
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setSubmitting(false);
            return Alert.alert("Login Necessário", "Precisas de estar logado para agendar.", [
                { text: "Ir para Login", onPress: () => router.push('/login') }
            ]);
        }
        const userName = user.user_metadata?.full_name || 'Cliente';

        // 2. Preparar Data/Hora (COM CORREÇÃO DE MILISSEGUNDOS) 🕒
        const dateObj = new Date(date as string);
        const [hours, minutes] = (time as string).split(':').map(Number);
        
        dateObj.setHours(hours);
        dateObj.setMinutes(minutes);
        dateObj.setSeconds(0);
        dateObj.setMilliseconds(0); // <--- CRUCIAL: Zera os milissegundos para a comparação ser exata!
        
        const isoDate = dateObj.toISOString();

        // --- VALIDAÇÃO 1: ANTI-SPAM (O utilizador já tem pendentes aqui?) ---
        const { data: meusPendentes } = await supabase
            .from('appointments')
            .select('id')
            .eq('salon_id', Number(salonId))
            .eq('cliente_id', user.id)
            .eq('status', 'pendente');

        if (meusPendentes && meusPendentes.length > 0) {
            setSubmitting(false);
            return Alert.alert(
                "Aguarde Confirmação", 
                "Já tens um pedido pendente neste salão. Aguarda a resposta do barbeiro antes de fazeres outro pedido."
            );
        }

        // --- VALIDAÇÃO 2: HORÁRIO TRANCADO? (Apenas se CONFIRMADO) ---
        const { data: horarioTrancado } = await supabase
            .from('appointments')
            .select('id')
            .eq('salon_id', Number(salonId)) // Garante que é número
            .eq('data_hora', isoDate)        // Agora a data é exata (sem milissegundos aleatórios)
            .eq('status', 'confirmado');     // Bloqueia apenas se estiver confirmado

        if (horarioTrancado && horarioTrancado.length > 0) {
            setSubmitting(false);
            return Alert.alert(
                "Horário Ocupado", 
                "Este horário já foi confirmado para outro cliente. Por favor escolhe outro."
            );
        }

        // 3. Gravar
        const { error } = await supabase.from('appointments').insert({
            cliente_id: user.id,
            cliente_nome: userName,
            salon_id: Number(salonId),
            service_id: selectedService.id,
            data_hora: isoDate,
            status: 'pendente'
        });

        if (error) {
            Alert.alert("Erro", "Não foi possível marcar. Tenta novamente.");
            setSubmitting(false);
        } else {
            router.replace('/success');
        }
    }

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#333" /></View>;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Confirmar Agendamento</Text>
            </View>

            <ScrollView contentContainerStyle={{padding: 20}}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Salão</Text>
                    <Text style={styles.summaryValue}>{salonName}</Text>
                    <View style={styles.divider} />
                    <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                        <View>
                            <Text style={styles.summaryLabel}>Data</Text>
                            <Text style={styles.summaryValue}>
                                {new Date(date as string).toLocaleDateString('pt-PT', {day:'numeric', month:'long'})}
                            </Text>
                        </View>
                        <View>
                            <Text style={styles.summaryLabel}>Hora</Text>
                            <Text style={styles.summaryValue}>{time}</Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>Escolha o Serviço</Text>
                {services.map((service) => (
                    <TouchableOpacity 
                        key={service.id} 
                        style={[styles.serviceItem, selectedService?.id === service.id && styles.serviceSelected]}
                        onPress={() => setSelectedService(service)}
                    >
                        <View style={{flexDirection:'row', alignItems:'center', gap: 10}}>
                            <Ionicons name={selectedService?.id === service.id ? "radio-button-on" : "radio-button-off"} size={20} color={selectedService?.id === service.id ? "#333" : "#ccc"} />
                            <Text style={[styles.serviceName, selectedService?.id === service.id && {fontWeight:'bold'}]}>{service.nome}</Text>
                        </View>
                        <Text style={styles.servicePrice}>{service.preco}€</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={styles.footer}>
                <View>
                    <Text style={{color:'#666', fontSize:12}}>Total a Pagar</Text>
                    <Text style={{fontSize:20, fontWeight:'bold'}}>{selectedService ? `${selectedService.preco}€` : '--'}</Text>
                </View>
                <TouchableOpacity style={[styles.confirmBtn, (!selectedService || submitting) && {backgroundColor:'#ccc'}]} onPress={handleConfirm} disabled={!selectedService || submitting}>
                    {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.confirmBtnText}>Confirmar</Text>}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: { padding: 20, paddingTop: 60, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 15 },
    backBtn: { padding: 5 },
    title: { fontSize: 20, fontWeight: 'bold' },
    summaryCard: { backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 25, shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
    summaryLabel: { color: '#999', fontSize: 12, textTransform: 'uppercase', marginBottom: 4 },
    summaryValue: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
    serviceItem: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
    serviceSelected: { borderColor: '#333', backgroundColor: '#fffdf5' },
    serviceName: { fontSize: 16, color: '#333' },
    servicePrice: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    footer: { padding: 20, paddingBottom: 40, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    confirmBtn: { backgroundColor: '#333', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 12, minWidth: 150, alignItems: 'center' },
    confirmBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});