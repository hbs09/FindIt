import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useTheme } from '../context/ThemeContext'; // <-- Importar o Tema
import { supabase } from '../supabase';
import { sendNotification } from '../utils/notifications';

const { width } = Dimensions.get('window');

type Service = {
    id: number;
    nome: string;
    preco: number;
    duracao_minutos: number;
    service_categories?: { nome: string } | null;
};

export default function BookConfirmScreen() {
    // 1. Hook de Tema
    const { colors, isDarkMode } = useTheme();
    // 2. Estilos Dinâmicos
    const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);

    const router = useRouter();
    const params = useLocalSearchParams();

    const { salonId, salonName, date, time, serviceId, employeeId, employeeName } = params;
    const [loading, setLoading] = useState(true);

    const [submitting, setSubmitting] = useState(false);
    const [services, setServices] = useState<Service[]>([]);
    const [selectedService, setSelectedService] = useState<Service | null>(null);

    const [step, setStep] = useState(1);
    const [notes, setNotes] = useState('');

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
        // Pedimos os serviços e usamos o '!inner' para cruzar com a nova tabela staff_services
        let query = supabase
            .from('services')
            .select('*, service_categories(nome), staff_services!inner(staff_id)')
            .eq('salon_id', salonId)
            .order('nome', { ascending: true });

        // Se o cliente escolheu um profissional específico, filtramos os serviços pelas especialidades dele!
        if (employeeId && employeeId !== 'any') {
            query = query.eq('staff_services.staff_id', Number(employeeId));
        }

        const { data } = await query;

        if (data) {
            setServices(data as Service[]);

            if (serviceId) {
                const preSelected = data.find(s => s.id === Number(serviceId));
                if (preSelected) {
                    setSelectedService(preSelected as Service);
                    setStep(2);
                }
            }
        }
        setLoading(false);
    }

    // --- MAGIA DE AGRUPAMENTO ---
    // Esta função agrupa os serviços automaticamente sempre que a lista de serviços muda
    const groupedServices = useMemo(() => {
        const groups: { [key: string]: Service[] } = {};

        services.forEach(service => {
            const catName = service.service_categories?.nome || 'Geral';
            if (!groups[catName]) groups[catName] = [];
            groups[catName].push(service);
        });

        // Converte o objeto num array amigável para o React mapear
        return Object.keys(groups)
            .sort() // Organiza as categorias por ordem alfabética
            .map(title => ({
                title,
                data: groups[title]
            }));
    }, [services]);

    function handleNext() {
        if (!selectedService) {
            return Alert.alert("Selecione um serviço", "Por favor escolha o serviço que deseja realizar.");
        }
        setStep(2);
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

        // --- NOVA LÓGICA DE VALIDAÇÃO E ATRIBUIÇÃO ---

     // 1. Em vez de ir buscar toda a equipa, vamos buscar APENAS quem sabe fazer o serviço selecionado!
        const { data: capableStaff } = await supabase
            .from('staff_services')
            .select('staff_id, salon_staff!inner(id, salon_id, status)')
            .eq('service_id', selectedService.id)
            .eq('salon_staff.salon_id', Number(salonId))
            .eq('salon_staff.status', 'ativo');

        const staffCapacitadoIds = capableStaff ? capableStaff.map((s: any) => s.staff_id) : [];

        // 2. Vamos ver quais as marcações ativas nesta exata hora
        const { data: marcacoesNestaHora } = await supabase
            .from('appointments')
            .select('employee_id')
            .eq('salon_id', Number(salonId))
            .eq('data_hora', isoDate)
            .not('status', 'in', '("cancelado","cancelado_cliente","cancelado_salao","faltou")');

        const funcionariosOcupados = marcacoesNestaHora ? marcacoesNestaHora.map(m => m.employee_id) : [];
        let finalEmployeeId = null;

        if (employeeId && employeeId !== 'any') {
            // A) Escolheu um profissional específico
            finalEmployeeId = Number(employeeId);
            
            // Segurança extra: Verifica se ele sabe mesmo fazer o serviço
            if (!staffCapacitadoIds.includes(finalEmployeeId)) {
                setSubmitting(false);
                return Alert.alert("Indisponível", "Este profissional não realiza o serviço selecionado.");
            }

            if (funcionariosOcupados.includes(finalEmployeeId)) {
                setSubmitting(false);
                return Alert.alert("Horário Ocupado", "Este profissional já foi reservado para esta hora.");
            }
        } else {
            // B) Escolheu "Qualquer um". Vamos cruzar os que sabem fazer o serviço com os que estão livres!
            const disponiveis = staffCapacitadoIds.filter(id => !funcionariosOcupados.includes(id));

            if (disponiveis.length === 0) {
                setSubmitting(false);
                return Alert.alert("Esgotado", "Não há nenhum profissional disponível para este serviço a esta hora.");
            }

            // Atribui automaticamente ao primeiro profissional livre que tem a especialidade!
            finalEmployeeId = disponiveis[0];
        }
        // -----------------------------------------------------------

        const { error } = await supabase.from('appointments').insert({
            cliente_id: user.id,
            cliente_nome: userName,
            salon_id: Number(salonId),
            service_id: selectedService.id,
            employee_id: finalEmployeeId, // <--- Usa o novo finalEmployeeId validado!
            data_hora: isoDate,
            status: 'pendente',
            notas: notes.trim()
        });

        if (error) {
            console.error("ERRO SUPABASE INSERT:", error);
            Alert.alert("Erro", "Não foi possível marcar. Tenta novamente.");
            setSubmitting(false);
        } else {
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
            const profName = employeeName && employeeName !== 'Qualquer um' ? ` com ${employeeName}` : '';
            const messageBody = `${userName} agendou ${selectedService.nome}${profName} para ${dateObj.toLocaleDateString()} às ${time}.${noteText}`;
            const targetScreen = { screen: '/manager', params: { tab: 'agenda' } };

            for (const userId of Array.from(recipientIds)) {
                await sendNotification(userId, messageTitle, messageBody, targetScreen);
            }

            router.replace('/success');
        }
    }

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.text} /></View>;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
            <View style={styles.header}>
                <View style={styles.navRow}>
                    <TouchableOpacity
                        onPress={() => step === 2 ? setStep(1) : router.back()}
                        style={styles.backBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>
                        {step === 1 ? 'Escolher Serviço' : 'Confirmar Agendamento'}
                    </Text>
                    <View style={{ width: 40 }} />
                </View>

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
                <View style={styles.ticketCard}>
                    <View style={styles.ticketHeader}>
                        <Text style={styles.salonName}>{salonName}</Text>
                        <View style={styles.ticketBadge}>
                            <Text style={styles.ticketBadgeText}>PENDENTE</Text>
                        </View>
                    </View>

                    <View style={styles.ticketRow}>
                        <View style={styles.ticketItem}>
                            <Ionicons name="calendar-outline" size={18} color={colors.subText} style={{ marginBottom: 4 }} />
                            <Text style={styles.ticketLabel}>Data</Text>
                            <Text style={styles.ticketValue}>
                                {new Date(date as string).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                            </Text>
                        </View>

                        <View style={styles.ticketDividerVertical} />

                        <View style={styles.ticketItem}>
                            <Ionicons name="time-outline" size={18} color={colors.subText} style={{ marginBottom: 4 }} />
                            <Text style={styles.ticketLabel}>Hora</Text>
                            <Text style={styles.ticketValue}>{time}</Text>
                        </View>

                        {/* --- NOVA COLUNA: PROFISSIONAL --- */}
                        <View style={styles.ticketDividerVertical} />

                        <View style={styles.ticketItem}>
                            <Ionicons name="person-outline" size={18} color={colors.subText} style={{ marginBottom: 4 }} />
                            <Text style={styles.ticketLabel}>Equipa</Text>
                            <Text style={styles.ticketValue} numberOfLines={1}>
                                {employeeName ? (employeeName as string).split(' ')[0] : 'Qualquer'}
                            </Text>
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
                                <View style={styles.footerColumn}>
                                    <Text style={styles.footerLabel}>Serviço</Text>
                                    <Text style={styles.footerServiceName} numberOfLines={2}>
                                        {selectedService.nome}
                                    </Text>
                                </View>

                                <View style={styles.footerPriceColumn}>
                                    <Text style={styles.footerLabel}>Total</Text>
                                    <Text style={styles.footerPriceValue}>{selectedService.preco}€</Text>
                                </View>
                            </View>
                        </>
                    )}
                </View>

                {step === 1 && (
                    <View style={styles.stepContainer}>

                        {groupedServices.map((group) => (
                            <View key={group.title} style={styles.categoryGroup}>
                                <Text style={styles.categoryTitle}>{group.title}</Text>

                                {group.data.map((service) => {
                                    const isSelected = selectedService?.id === service.id;

                                    return (
                                        <TouchableOpacity
                                            key={service.id}
                                            style={[styles.serviceCard, isSelected && styles.serviceCardSelected]}
                                            onPress={() => setSelectedService(service)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.serviceInfo}>
                                                <Text style={[styles.serviceName, isSelected && styles.serviceNameSelected]}>
                                                    {service.nome}
                                                </Text>
                                            </View>

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
                        ))}
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.sectionTitle}>Alguma observação?</Text>

                        <Text style={styles.sectionSubtitle}>
                            Tem alguma preferência ou restrição? Deixe uma nota para o profissional.
                        </Text>

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.notesInput}
                                value={notes}
                                onChangeText={setNotes}
                                placeholder="Anotações opcionais..."
                                placeholderTextColor={colors.subText}
                                multiline
                                textAlignVertical="top"
                                onFocus={() => {
                                    setTimeout(() => {
                                        scrollViewRef.current?.scrollToEnd({ animated: true });
                                    }, 200);
                                }}
                            />
                        </View>
                    </View>
                )}

            </ScrollView>

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
                        <ActivityIndicator color={isDarkMode ? '#000' : 'white'} />
                    ) : (
                        <View style={styles.btnContent}>
                            <Text style={[
                                styles.confirmBtnText,
                                (!selectedService) && { color: isDarkMode ? 'white' : 'white' }
                            ]}>
                                {step === 1 ? 'Continuar' : 'Confirmar Agendamento'}
                            </Text>
                            {step === 1 && <Ionicons name="arrow-forward" size={20} color={isDarkMode ? ((!selectedService) ? 'white' : '#000') : 'white'} />}
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const createStyles = (colors: any, isDarkMode: boolean) => StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
    container: { flex: 1, backgroundColor: colors.bg },

    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },

    progressBarBg: { height: 3, width: '100%', backgroundColor: colors.border },
    progressBarFill: { height: '100%', backgroundColor: colors.text },

    scrollContent: { padding: 20, paddingBottom: 150 },

    ticketCard: {
        backgroundColor: colors.card,
        borderRadius: 20,
        marginBottom: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 4,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border
    },
    ticketHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingBottom: 0,
        backgroundColor: colors.card
    },
    salonName: { fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 },
    ticketBadge: { backgroundColor: isDarkMode ? '#332700' : '#FFF4E5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    ticketBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#FF9500' },

    ticketRow: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        paddingHorizontal: 20,
        paddingBottom: 24,
        paddingTop: 24,
    },
    ticketItem: { alignItems: 'center', flex: 1 },
    ticketLabel: { fontSize: 11, color: colors.subText, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    ticketValue: { fontSize: 15, fontWeight: '700', color: colors.text },
    ticketDividerVertical: { width: 1, height: '80%', backgroundColor: colors.border, alignSelf: 'center' },

    dashDivider: { flexDirection: 'row', alignItems: 'center', height: 20, overflow: 'hidden', position: 'relative' },
    circleLeft: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bg, position: 'absolute', left: -10, borderWidth: 1, borderColor: colors.border },
    circleRight: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bg, position: 'absolute', right: -10, borderWidth: 1, borderColor: colors.border },
    dashLine: { flex: 1, borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: 'dashed', marginHorizontal: 15, marginTop: -1 },

    ticketFooter: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        backgroundColor: colors.card,
    },
    serviceSummaryName: { fontSize: 16, fontWeight: '600', color: colors.text },
    serviceSummaryPrice: { fontSize: 18, fontWeight: '800', color: colors.accent },

    stepContainer: { flex: 1 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: colors.text },
    sectionSubtitle: { fontSize: 14, color: colors.subText, marginBottom: 20 },
    cardIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },

    serviceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.card,
        borderRadius: 16,
        paddingVertical: 18,
        paddingHorizontal: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    serviceCardSelected: {
        borderColor: colors.text,
        backgroundColor: isDarkMode ? '#1C1C1E' : '#FAFAFA',
        borderWidth: 1.5,
    },
    serviceInfo: {
        flex: 1,
        paddingRight: 10,
    },
    serviceName: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.text,
    },
    serviceNameSelected: {
        fontWeight: '700',
        color: colors.text,
    },
    serviceRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    servicePrice: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.text,
        letterSpacing: -0.5,
    },
    servicePriceSelected: {
        color: colors.text,
        fontWeight: '800',
    },
    radioButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioButtonSelected: {
        borderColor: colors.text,
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.text,
    },

    inputContainer: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 4,
        borderWidth: 1,
        borderColor: colors.border
    },
    notesInput: {
        padding: 16,
        minHeight: 140,
        fontSize: 16,
        color: colors.text,
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
        color: colors.subText,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
        fontWeight: '600',
    },
    footerServiceName: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        lineHeight: 22,
    },
    footerPriceValue: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        lineHeight: 22,
    },

    footer: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingVertical: 16,
        paddingHorizontal: 24,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 10
    },
    footerPriceContainer: { justifyContent: 'center' },
    footerPrice: { fontSize: 24, fontWeight: '800', color: colors.text },

    confirmBtn: {
        width: '100%',
        backgroundColor: colors.text,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4
    },
    confirmBtnDisabled: {
        backgroundColor: colors.iconBg,
        shadowOpacity: 0,
    },
    btnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
    },
    confirmBtnText: {
        color: colors.bg,
        fontWeight: '700',
        fontSize: 16,
        letterSpacing: 0.3
    },
    header: {
        paddingTop: Platform.OS === 'ios' ? 50 : 20,
        backgroundColor: colors.bg,
        borderBottomWidth: 0,
        paddingBottom: 10,
    },
    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingBottom: 16,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
        borderWidth: 1,
        borderColor: colors.border
    },
    categoryGroup: { marginBottom: 24 },
    categoryTitle: { fontSize: 16, fontWeight: '800', color: colors.text, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 4, opacity: 0.8 },
});