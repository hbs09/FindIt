import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../supabase';
import { sendNotification } from '../utils/notifications';

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
    
    const [step, setStep] = useState(1);
    const [notes, setNotes] = useState('');

    const scrollViewRef = useRef<ScrollView>(null);

    useEffect(() => {
        if (salonId) fetchServices();
    }, [salonId]);

    async function fetchServices() {
        const { data } = await supabase
            .from('services')
            .select('*')
            .eq('salon_id', salonId)
            // --- ALTERAÇÃO AQUI: ORDENAR POR POSIÇÃO (COMO NO GESTOR) ---
            .order('position', { ascending: true });
        
        if (data) setServices(data as Service[]);
        setLoading(false);
    }

    function handleNext() {
        if (!selectedService) {
            return Alert.alert("Falta o serviço", "Por favor seleciona o serviço que queres fazer.");
        }
        setStep(2);
        
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }

    async function handleConfirm() {
        Keyboard.dismiss();

        if (!selectedService) return;

        setSubmitting(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setSubmitting(false);
            return Alert.alert("Login Necessário", "Precisas de estar logado para agendar.", [
                { text: "Ir para Login", onPress: () => router.push('/login') }
            ]);
        }
        const userName = user.user_metadata?.full_name || 'Cliente';

        const dateObj = new Date(date as string);
        const [hours, minutes] = (time as string).split(':').map(Number);
        
        dateObj.setHours(hours);
        dateObj.setMinutes(minutes);
        dateObj.setSeconds(0);
        dateObj.setMilliseconds(0);
        
        const isoDate = dateObj.toISOString();

        // VALIDAÇÕES
        const { data: meusPendentes } = await supabase
            .from('appointments')
            .select('id')
            .eq('salon_id', Number(salonId))
            .eq('cliente_id', user.id)
            .eq('status', 'pendente');

        if (meusPendentes && meusPendentes.length > 0) {
            setSubmitting(false);
            return Alert.alert("Aguarde Confirmação", "Já tens um pedido pendente neste salão.");
        }

        const { data: horarioTrancado } = await supabase
            .from('appointments')
            .select('id')
            .eq('salon_id', Number(salonId))
            .eq('data_hora', isoDate)
            .eq('status', 'confirmado');

        if (horarioTrancado && horarioTrancado.length > 0) {
            setSubmitting(false);
            return Alert.alert("Horário Ocupado", "Este horário já foi ocupado.");
        }

        const { error } = await supabase.from('appointments').insert({
            cliente_id: user.id,
            cliente_nome: userName,
            salon_id: Number(salonId),
            service_id: selectedService.id,
            data_hora: isoDate,
            status: 'pendente',
            notas: notes.trim()
        });

        if (error) {
            Alert.alert("Erro", "Não foi possível marcar. Tenta novamente.");
            setSubmitting(false);
        } else {
            const { data: salonInfo } = await supabase
                .from('salons')
                .select('dono_id, nome_salao')
                .eq('id', Number(salonId))
                .single();

            if (salonInfo && salonInfo.dono_id) {
                const noteText = notes.trim() ? `\nNota: "${notes.trim()}"` : '';
                await sendNotification(
                    salonInfo.dono_id,
                    "Nova Marcação",
                    `${userName} agendou ${selectedService.nome} para ${dateObj.toLocaleDateString()} às ${time}.${noteText}`
                );
            }

            router.dismissAll();
            router.push('/success');
        }
    }

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#333" /></View>;

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"} 
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
            <View style={styles.header}>
                <TouchableOpacity 
                    onPress={() => step === 2 ? setStep(1) : router.back()} 
                    style={styles.backBtn}
                >
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>
                    {step === 1 ? 'Escolher Serviço' : 'Resumo e Notas'}
                </Text>
            </View>

            <ScrollView 
                ref={scrollViewRef}
                contentContainerStyle={{padding: 20, paddingBottom: 150}}
                keyboardShouldPersistTaps="handled"
            >
                
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

                    {step === 2 && selectedService && (
                        <>
                            <View style={styles.divider} />
                            <View>
                                <Text style={styles.summaryLabel}>Serviço Selecionado</Text>
                                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5}}>
                                    <Text style={styles.summaryValueService}>{selectedService.nome}</Text>
                                    <Text style={styles.summaryValuePrice}>{selectedService.preco}€</Text>
                                </View>
                            </View>
                        </>
                    )}
                </View>

                {step === 1 && (
                    <>
                        <Text style={styles.sectionTitle}>Serviços Disponíveis</Text>
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
                    </>
                )}

                {step === 2 && (
                    <View style={styles.notesContainer}>
                        <Text style={styles.sectionTitle}>Notas para o Profissional (Opcional)</Text>
                        <TextInput
                            style={styles.notesInput}
                            placeholder="Ex: Tenho alergia a certos produtos, prefiro cabelo curto..."
                            placeholderTextColor="#999"
                            value={notes}
                            onChangeText={setNotes}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                            onFocus={() => {
                                setTimeout(() => {
                                    scrollViewRef.current?.scrollToEnd({ animated: true });
                                }, 300);
                            }}
                        />
                    </View>
                )}

            </ScrollView>

            <View style={styles.footer}>
                <View>
                    <Text style={{color:'#666', fontSize:12}}>Total a Pagar</Text>
                    <Text style={{fontSize:20, fontWeight:'bold'}}>{selectedService ? `${selectedService.preco}€` : '--'}</Text>
                </View>
                
                <TouchableOpacity 
                    style={[styles.confirmBtn, (!selectedService || submitting) && {backgroundColor:'#ccc'}]} 
                    onPress={step === 1 ? handleNext : handleConfirm} 
                    disabled={!selectedService || submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.confirmBtnText}>
                            {step === 1 ? 'Continuar' : 'Confirmar'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
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
    summaryValueService: { fontSize: 16, fontWeight: '600', color: '#333' },
    summaryValuePrice: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
    
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
    
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
    
    serviceItem: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
    serviceSelected: { borderColor: '#333', backgroundColor: '#fffdf5' },
    serviceName: { fontSize: 16, color: '#333' },
    servicePrice: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    
    notesContainer: { marginTop: 10 },
    notesInput: { 
        backgroundColor: 'white', 
        borderRadius: 12, 
        padding: 15, 
        minHeight: 120, 
        fontSize: 15, 
        color: '#333',
        shadowColor: '#000', shadowOpacity: 0.05, elevation: 1
    },

    footer: { padding: 20, paddingBottom: 40, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    confirmBtn: { backgroundColor: '#333', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 12, minWidth: 150, alignItems: 'center' },
    confirmBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});