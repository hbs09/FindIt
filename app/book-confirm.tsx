import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
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

const { width } = Dimensions.get('window');
const PRIMARY_COLOR = '#111';
const ACCENT_COLOR = '#007AFF';

type Service = {
    id: number;
    nome: string;
    preco: number;
    duracao_minutos: number; // Mantive no tipo, mas não é usado na UI
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

    // Animação simples para a barra de progresso
    const progressAnim = useRef(new Animated.Value(0.5)).current;
    const scrollViewRef = useRef<ScrollView>(null);

    useEffect(() => {
        if (salonId) fetchServices();
    }, [salonId]);

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: step === 1 ? 0.5 : 1,
            duration: 300,
            useNativeDriver: false,
        }).start();
    }, [step]);

    async function fetchServices() {
        const { data } = await supabase
            .from('services')
            .select('*')
            .eq('salon_id', salonId)
            .order('position', { ascending: true });

        if (data) setServices(data as Service[]);
        setLoading(false);
    }

    function handleNext() {
        if (!selectedService) {
            return Alert.alert("Selecione um serviço", "Por favor escolha o serviço que deseja realizar.");
        }
        setStep(2);
        // Scroll para o topo ao mudar de passo para ver o resumo atualizado
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
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
            return Alert.alert("Horário Ocupado", "Este horário acabou de ser ocupado.");
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
            // Lógica de Notificações
            const { data: salonInfo } = await supabase
                .from('salons')
                .select('dono_id, nome_salao')
                .eq('id', Number(salonId))
                .single();

            const { data: staffData } = await supabase
                .from('salon_staff')
                .select('user_id')
                .eq('salon_id', Number(salonId))
                .eq('role', 'gerente')
                .eq('status', 'ativo')
                .not('user_id', 'is', null);

            const recipientIds = new Set<string>();
            if (salonInfo && salonInfo.dono_id) recipientIds.add(salonInfo.dono_id);
            if (staffData) {
                staffData.forEach((staff: any) => {
                    if (staff.user_id) recipientIds.add(staff.user_id);
                });
            }

            const noteText = notes.trim() ? `\nNota: "${notes.trim()}"` : '';
            const messageTitle = "Nova Marcação";
            const messageBody = `${userName} agendou ${selectedService.nome} para ${dateObj.toLocaleDateString()} às ${time}.${noteText}`;
            const targetScreen = { screen: '/manager', params: { tab: 'agenda' } };

            for (const userId of Array.from(recipientIds)) {
                await sendNotification(userId, messageTitle, messageBody, targetScreen);
            }

           router.replace('/success');
        }
    }

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY_COLOR} /></View>;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
            {/* Header com Barra de Progresso */}
            <View style={styles.header}>
                <View style={styles.navRow}>
                    <TouchableOpacity
                        onPress={() => step === 2 ? setStep(1) : router.back()}
                        style={styles.backBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {step === 1 ? 'Escolher Serviço' : 'Confirmar Agendamento'}
                    </Text>
                    <View style={{ width: 24 }} />
                </View>

                {/* Barra de Progresso */}
                <View style={styles.progressBarBg}>
                    <Animated.View
                        style={[
                            styles.progressBarFill,
                            {
                                width: progressAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%']
                                })
                            }
                        ]}
                    />
                </View>
            </View>

            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Cartão de Resumo (Estilo Ticket) */}
                <View style={styles.ticketCard}>
                    <View style={styles.ticketHeader}>
                        <Text style={styles.salonName}>{salonName}</Text>
                        <View style={styles.ticketBadge}>
                            <Text style={styles.ticketBadgeText}>PENDENTE</Text>
                        </View>
                    </View>

                    {/* REMOVIDO: Duração deste bloco */}
                    <View style={styles.ticketRow}>
                        <View style={styles.ticketItem}>
                            <Ionicons name="calendar-outline" size={18} color="#666" style={{ marginBottom: 4 }} />
                            <Text style={styles.ticketLabel}>Data</Text>
                            <Text style={styles.ticketValue}>
                                {new Date(date as string).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                            </Text>
                        </View>

                        <View style={styles.ticketDividerVertical} />

                        <View style={styles.ticketItem}>
                            <Ionicons name="time-outline" size={18} color="#666" style={{ marginBottom: 4 }} />
                            <Text style={styles.ticketLabel}>Hora</Text>
                            <Text style={styles.ticketValue}>{time}</Text>
                        </View>
                    </View>

                    {step === 2 && selectedService && (
                        <>
                            <View style={styles.dashDivider}>
                                <View style={styles.circleLeft} />
                                <View style={styles.dashLine} />
                                <View style={styles.circleRight} />
                            </View>

                            <View style={styles.ticketFooter}>
                                {/* Coluna Esquerda: Serviço */}
                                <View style={styles.footerColumn}>
                                    <Text style={styles.footerLabel}>Serviço</Text>
                                    <Text style={styles.footerServiceName} numberOfLines={2}>
                                        {selectedService.nome}
                                    </Text>
                                </View>

                                {/* Coluna Direita: Preço */}
                                <View style={styles.footerPriceColumn}>
                                    <Text style={styles.footerLabel}>Total</Text>
                                    <Text style={styles.footerPriceValue}>{selectedService.preco}€</Text>
                                </View>
                            </View>
                        </>
                    )}
                </View>

                {/* PASSO 1: LISTA DE SERVIÇOS */}
                {step === 1 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.sectionTitle}>Serviços Disponíveis</Text>
                        {services.map((service) => {
                            const isSelected = selectedService?.id === service.id;

                            return (
                                <TouchableOpacity
                                    key={service.id}
                                    style={[styles.serviceCard, isSelected && styles.serviceCardSelected]}
                                    onPress={() => setSelectedService(service)}
                                    activeOpacity={0.7}
                                >
                                    {/* LADO ESQUERDO: Apenas o Nome */}
                                    <View style={styles.serviceInfo}>
                                        <Text style={[styles.serviceName, isSelected && styles.serviceNameSelected]}>
                                            {service.nome}
                                        </Text>
                                    </View>

                                    {/* LADO DIREITO: Preço + Radio Button (Bem separados) */}
                                    <View style={styles.serviceRight}>
                                        <Text style={[styles.servicePrice, isSelected && styles.servicePriceSelected]}>
                                            {service.preco}€
                                        </Text>

                                        <View style={[styles.radioButton, isSelected && styles.radioButtonSelected]}>
                                            {isSelected && <View style={styles.radioInner} />}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {/* PASSO 2: NOTAS */}
                {step === 2 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.sectionTitle}>Alguma observação?</Text>

                        {/* TEXTO ATUALIZADO AQUI */}
                        <Text style={styles.sectionSubtitle}>
                            Tem alguma preferência ou restrição? Deixe uma nota para o profissional.
                        </Text>

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.notesInput}
                                value={notes}
                                onChangeText={setNotes}
                                multiline
                                textAlignVertical="top"
                                onFocus={() => {
                                    // Mantém o scroll para garantir que o footer não tapa, 
                                    // mas agora vai subir menos.
                                    setTimeout(() => {
                                        scrollViewRef.current?.scrollToEnd({ animated: true });
                                    }, 200);
                                }}
                            />
                        </View>
                    </View>
                )}

            </ScrollView>

            {/* Sticky Footer */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[
                        styles.confirmBtn,
                        (!selectedService || submitting) && styles.confirmBtnDisabled
                    ]}
                    onPress={step === 1 ? handleNext : handleConfirm}
                    disabled={!selectedService || submitting}
                    activeOpacity={0.8}
                >
                    {submitting ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <View style={styles.btnContent}>
                            <Text style={styles.confirmBtnText}>
                                {step === 1 ? 'Continuar' : 'Confirmar Agendamento'}
                            </Text>
                            {/* Seta apenas no passo 1 */}
                            {step === 1 && <Ionicons name="arrow-forward" size={20} color="white" />}
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1, backgroundColor: '#FAFAFA' },

    // Header
    header: {
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },

    // Progress Bar
    progressBarBg: { height: 3, width: '100%', backgroundColor: '#F0F0F0' },
    progressBarFill: { height: '100%', backgroundColor: PRIMARY_COLOR },

    scrollContent: { padding: 20, paddingBottom: 150 },

    // Ticket Card
    ticketCard: {
        backgroundColor: 'white',
        borderRadius: 20,
        marginBottom: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 4,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#F2F4F7'
    },
    ticketHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingBottom: 0, // Removi o padding de baixo aqui para controlar tudo no ticketRow
        backgroundColor: '#FDFDFD'
    },
    salonName: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', flex: 1 },
    ticketBadge: { backgroundColor: '#FFF4E5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    ticketBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#FF9500' },

    ticketRow: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        paddingHorizontal: 20,
        paddingBottom: 24, // Mais espaço em baixo
        paddingTop: 24,    // <--- AQUI: Empurra a data/hora para baixo (antes estava 0 ou pouco)
    },
    ticketItem: { alignItems: 'center', flex: 1 },
    ticketLabel: { fontSize: 11, color: '#888', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    ticketValue: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
    ticketDividerVertical: { width: 1, height: '80%', backgroundColor: '#F0F0F0', alignSelf: 'center' },

    // Ticket Dashed Line Effect
    dashDivider: { flexDirection: 'row', alignItems: 'center', height: 20, overflow: 'hidden', position: 'relative' },
    circleLeft: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FAFAFA', position: 'absolute', left: -10, borderWidth: 1, borderColor: '#F2F4F7' },
    circleRight: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FAFAFA', position: 'absolute', right: -10, borderWidth: 1, borderColor: '#F2F4F7' },
    dashLine: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', borderStyle: 'dashed', marginHorizontal: 15, marginTop: -1 },

    ticketFooter: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start', // Alinha pelo topo
        backgroundColor: '#FFF',
    },
    serviceSummaryName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
    serviceSummaryPrice: { fontSize: 18, fontWeight: '800', color: ACCENT_COLOR },

    // Step Container
    stepContainer: { flex: 1 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: '#1A1A1A' },
    sectionSubtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
    cardIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },

    // Service Cards
    serviceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between', // Garante separação total
        backgroundColor: 'white',
        borderRadius: 16,
        paddingVertical: 18, // Mais altura para "respirar"
        paddingHorizontal: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F2F4F7',
        // Sombra muito subtil
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    serviceCardSelected: {
        borderColor: PRIMARY_COLOR, // Apenas a borda muda, mantém o fundo clean ou muda ligeiramente
        backgroundColor: '#FAFAFA',
        borderWidth: 1.5, // Borda um pouco mais grossa ao selecionar
    },
    serviceInfo: {
        flex: 1, // Ocupa todo o espaço disponível à esquerda
        paddingRight: 10,
    },
    serviceName: {
        fontSize: 16,
        fontWeight: '500', // Peso médio para leitura fácil
        color: '#1A1A1A',
    },
    serviceNameSelected: {
        fontWeight: '700',
        color: PRIMARY_COLOR,
    },
    // REMOVIDO: Styles não usados (serviceMetaRow, serviceDuration, etc.)

    serviceRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16, // <--- AQUI: 16px de distância separa bem o preço da bolinha
    },
    servicePrice: {
        fontSize: 17,
        fontWeight: '600',
        color: '#1A1A1A',
        letterSpacing: -0.5,
    },
    servicePriceSelected: {
        color: PRIMARY_COLOR,
        fontWeight: '800',
    },
    // Radio Button Customizado
    radioButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#E0E0E0', // Cinza claro quando inativo
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioButtonSelected: {
        borderColor: PRIMARY_COLOR, // Preto (ou cor primária) quando ativo
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: PRIMARY_COLOR,
    },
    // Input Notes
    inputContainer: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 4,
        borderWidth: 1,
        borderColor: '#E0E0E0'
    },
    notesInput: {
        padding: 16,
        minHeight: 140,
        fontSize: 16,
        color: '#333',
    },

    footerColumn: {
        flex: 1,
        paddingRight: 16,
    },
    footerPriceColumn: {
        alignItems: 'flex-end',
        minWidth: 80,
    },
    footerLabel: {
        fontSize: 11,
        color: '#98A2B3', // Cinza suave para o texto "Serviço" e "Total"
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
        fontWeight: '600',
    },
    footerServiceName: {
        fontSize: 16,
        fontWeight: '700', // Bold
        color: '#1A1A1A',
        lineHeight: 22,
    },
    footerPriceValue: {
        fontSize: 16,      // Tamanho igual
        fontWeight: '700', // Peso igual
        color: '#1A1A1A',  // Cor igual (era colorido antes)
        lineHeight: 22,    // Alinhamento igual
    },

    // Footer
    footer: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        paddingVertical: 16, // Um pouco mais compacto
        paddingHorizontal: 24,
        // Ajuste de segurança para iPhones sem botão home
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 10
    },
    footerPriceContainer: { justifyContent: 'center' },
    footerPrice: { fontSize: 24, fontWeight: '800', color: '#1A1A1A' },

    confirmBtn: {
        width: '100%', // <--- Ocupa a largura toda
        backgroundColor: PRIMARY_COLOR,
        paddingVertical: 16,
        borderRadius: 16, // Cantos menos arredondados (moderno) ou 50 para pílula
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: PRIMARY_COLOR,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4
    },
    confirmBtnDisabled: {
        backgroundColor: '#E5E5EA', // Cinza claro desativado
        shadowOpacity: 0,
    },
    btnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
    },
    confirmBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 16,
        letterSpacing: 0.3
    }
});