import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
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
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';

const { width } = Dimensions.get('window');

// --- TIPOS ---
type Service = {
    id: number;
    nome: string;
    preco: number;
    duracao_minutos: number;
    service_categories?: { nome: string } | null;
};

type Employee = {
    id: number;
    nome: string;
    foto: string;
};

type SalonInfo = {
    hora_abertura: string;
    hora_fecho: string;
    almoco_inicio?: string;
    almoco_fim?: string;
};

export default function BookConfirmScreen() {
    const { colors, isDarkMode } = useTheme();
    const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);
    const router = useRouter();
    const params = useLocalSearchParams();
    const { salonId, salonName, serviceId } = params;

    // --- ESTADOS GERAIS ---
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [step, setStep] = useState(1);
    const progressAnim = useRef(new Animated.Value(0.33)).current;
    const scrollViewRef = useRef<ScrollView>(null);

    // --- ESTADOS DE DADOS ---
    const [salonInfo, setSalonInfo] = useState<SalonInfo | null>(null);
    const [services, setServices] = useState<Service[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);

    // --- ESTADOS DE SELEÇÃO ---
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null); // null = "Qualquer um"
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [displayedMonth, setDisplayedMonth] = useState(new Date());
    const [calendarDays, setCalendarDays] = useState<Date[]>([]);
    const flatListRef = useRef<FlatList>(null);
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

    // --- ESTADOS DE HORÁRIOS E TETRIS ---
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [notes, setNotes] = useState('');

    // --- INICIALIZAÇÃO E GERAÇÃO DO CALENDÁRIO ---
    useEffect(() => {
        const days = [];
        const today = new Date();
        for (let i = 0; i < 90; i++) { // Gera próximos 90 dias
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            days.push(d);
        }
        setCalendarDays(days);

        if (salonId) {
            fetchInitialData();
        }
    }, [salonId]);

    // Anima a barra de progresso no topo
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: step === 1 ? 0.33 : step === 2 ? 0.66 : 1,
            duration: 300,
            useNativeDriver: false,
        }).start();
    }, [step]);

    // Sempre que o utilizador muda de Dia, Empregado ou Serviço (no passo 2), recalcula os horários!
    useEffect(() => {
        if (step === 2 && selectedService && salonInfo) {
            calculateDynamicSlots();
        }
    }, [selectedDate, selectedEmployee, step, selectedService]);

    // --- FUNÇÕES DE BUSCA ---
    async function fetchInitialData() {
        setLoading(true);

        // 1. Horários do Salão
        const { data: sInfo } = await supabase
            .from('salons')
            .select('hora_abertura, hora_fecho, almoco_inicio, almoco_fim')
            .eq('id', salonId)
            .single();
        if (sInfo) setSalonInfo(sInfo);

        // 2. Serviços (Normalizados)
        let query = supabase
            .from('services')
            .select('*, service_categories(nome), staff_services!inner(staff_id)')
            .eq('salon_id', salonId)
            .order('nome');

        const { data: sData } = await query;
        if (sData) {
            const formattedServices = sData.map((item: any) => ({
                ...item,
                service_categories: Array.isArray(item.service_categories) ? item.service_categories[0] : item.service_categories
            }));
            setServices(formattedServices);

            // --- NOVA LÓGICA DO "MARCAR NOVAMENTE" ---
            if (serviceId) {
                // Se vier do Perfil, procura o serviço que ele fez antes
                const preSelected = formattedServices.find((s: any) => s.id === Number(serviceId));
                if (preSelected) {
                    setSelectedService(preSelected);
                    setExpandedCategory(preSelected.service_categories?.nome || 'Geral');
                    setStep(2); // Salta logo o Passo 1!
                }
            } else if (formattedServices.length > 0) {
                // Se for uma marcação normal, abre a primeira categoria
                setExpandedCategory(formattedServices[0].service_categories?.nome || 'Geral');
            }
        }

        // 3. Empregados
        const { data: eData } = await supabase
            .from('salon_staff')
            .select(`id, profiles(nome, full_name, avatar_url)`)
            .eq('salon_id', salonId)
            .eq('status', 'ativo');

        if (eData) {
            const formattedEmployees = eData.map((emp: any) => ({
                id: emp.id,
                nome: emp.profiles?.nome || emp.profiles?.full_name || 'Sem Nome',
                foto: emp.profiles?.avatar_url || null
            }));
            setEmployees(formattedEmployees);
        }

        setLoading(false);
    }

    // --- MAGIA DE AGRUPAMENTO (SERVIÇOS) ---
    const groupedServices = useMemo(() => {
        const groups: { [key: string]: Service[] } = {};
        services.forEach(service => {
            const catName = service.service_categories?.nome || 'Geral';
            if (!groups[catName]) groups[catName] = [];
            groups[catName].push(service);
        });
        return Object.keys(groups).sort().map(title => ({ title, data: groups[title] }));
    }, [services]);

    // --- O CÉREBRO: O TETRIS DOS HORÁRIOS ---
    async function calculateDynamicSlots() {
        if (!salonInfo || !selectedService) return;
        setLoadingSlots(true);
        setSelectedSlot(null);

        // 1. Converter horas de abertura/fecho do salão em minutos desde a meia-noite (para a matemática ser fácil)
        const timeToMinutes = (timeStr: string) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const openMin = timeToMinutes(salonInfo.hora_abertura);
        const closeMin = timeToMinutes(salonInfo.hora_fecho);
        const lunchStartMin = salonInfo.almoco_inicio ? timeToMinutes(salonInfo.almoco_inicio) : null;
        const lunchEndMin = salonInfo.almoco_fim ? timeToMinutes(salonInfo.almoco_fim) : null;
        const serviceDuration = selectedService.duracao_minutos;

        // 2. Definir o dia da pesquisa
        const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);

        // 3. Ir buscar as marcações ativas para este dia
        let appQuery = supabase
            .from('appointments')
            .select('data_hora, employee_id, services(duracao_minutos)')
            .eq('salon_id', salonId)
            .gte('data_hora', startOfDay.toISOString())
            .lte('data_hora', endOfDay.toISOString())
            .not('status', 'in', '("cancelado","cancelado_cliente","cancelado_salao","faltou")');

        const { data: appointments } = await appQuery;

        // Formata as marcações existentes (em minutos desde a meia noite)
        const getAppointmentsForEmployee = (empId: number) => {
            if (!appointments) return [];
            return appointments
                .filter(app => app.employee_id === empId)
                .map(app => {
                    const d = new Date(app.data_hora);
                    const start = d.getHours() * 60 + d.getMinutes();
                    // O TypeScript queixa-se que 'services' pode ser array. Garantimos que é um valor seguro.
                    const durationData = Array.isArray(app.services) ? app.services[0] : app.services;
                    const duration = durationData?.duracao_minutos || 30; // 30m por defeito se falhar
                    return { start, end: start + duration };
                });
        };

        // 4. Vamos criar as "bolinhas" (slots) de 15 em 15 minutos para testar
        const generatedSlots: string[] = [];
        let currentTestingSlot = openMin;

        // Vê que horas são agora para não permitir marcações no passado
        const now = new Date();
        const isToday = isSameDay(selectedDate, now);
        const currentMinNow = now.getHours() * 60 + now.getMinutes();

        // 5. TESTAR CADA BURACO DE TEMPO
        while (currentTestingSlot + serviceDuration <= closeMin) {
            const slotStart = currentTestingSlot;
            const slotEnd = currentTestingSlot + serviceDuration;

            let isValid = true;

            // Regra A: Já passou a hora?
            if (isToday && slotStart <= currentMinNow) {
                isValid = false;
            }

            // Regra B: Bate na hora de almoço do salão? (se houver)
            if (isValid && lunchStartMin && lunchEndMin) {
                // Se a marcação começar antes do fim do almoço E acabar depois do início do almoço = CONFLITO!
                if (slotStart < lunchEndMin && slotEnd > lunchStartMin) {
                    isValid = false;
                }
            }

            // Regra C: Verificar as agendas da equipa (A parte mais inteligente!)
            if (isValid) {
                if (selectedEmployee) {
                    // C1: Cliente escolheu um Profissional Específico
                    const empAgenda = getAppointmentsForEmployee(selectedEmployee.id);
                    // Verifica se o nosso buraco choca com alguma das marcações dele
                    const hasConflict = empAgenda.some(app => slotStart < app.end && slotEnd > app.start);
                    if (hasConflict) isValid = false;
                } else {
                    // C2: Cliente escolheu "Qualquer um"
                    // Para a hora ser válida, pelo menos UM funcionário tem de estar livre o tempo todo
                    let atLeastOneFree = false;
                    for (const emp of employees) {
                        const empAgenda = getAppointmentsForEmployee(emp.id);
                        const hasConflict = empAgenda.some(app => slotStart < app.end && slotEnd > app.start);
                        if (!hasConflict) {
                            atLeastOneFree = true;
                            break; // Encontrámos um livre! Para de procurar.
                        }
                    }
                    if (!atLeastOneFree) isValid = false;
                }
            }

            // Se sobreviveu a todas as regras, o espaço é perfeito! Adiciona à lista.
            if (isValid) {
                const h = Math.floor(currentTestingSlot / 60);
                const m = currentTestingSlot % 60;
                const timeString = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                generatedSlots.push(timeString);
            }

            // Avança o testador de 15 em 15 minutos
            currentTestingSlot += 15;
        }

        setAvailableSlots(generatedSlots);
        setLoadingSlots(false);
    }

    // --- FUNÇÕES DE INTERFACE ---
    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems && viewableItems.length > 0) setDisplayedMonth(viewableItems[0].item);
    }).current;

    const isSameDay = (d1: Date, d2: Date) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

    function handleNextStep() {
        if (step === 1) {
            if (!selectedService) return Alert.alert("Selecione um serviço", "Por favor, escolha o que deseja realizar.");
            setStep(2);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        } else if (step === 2) {
            if (!selectedSlot) return Alert.alert("Selecione um horário", "Por favor, escolha a hora da sua marcação.");
            setStep(3);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        }
    }

    // --- CONFIRMAÇÃO FINAL NA BASE DE DADOS ---
    async function handleConfirm() {
        Keyboard.dismiss();
        if (!selectedService || !selectedSlot) return;

        setSubmitting(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setSubmitting(false);
            return Alert.alert("Login Necessário", "Precisas de estar logado para agendar.", [{ text: "Ir para Login", onPress: () => router.push('/login') }]);
        }
        const userName = user.user_metadata?.full_name || 'Cliente';

        // 1. Cria a data_hora no formato certo
        const dateObj = new Date(selectedDate);
        const [hours, minutes] = selectedSlot.split(':').map(Number);
        dateObj.setHours(hours, minutes, 0, 0);
        const isoDate = dateObj.toISOString();

        // 2. Previne spam
        const { data: meusPendentes } = await supabase.from('appointments').select('id').eq('salon_id', Number(salonId)).eq('cliente_id', user.id).eq('status', 'pendente');
        if (meusPendentes && meusPendentes.length > 0) {
            setSubmitting(false);
            return Alert.alert("Aguarde Confirmação", "Já tens um pedido pendente neste salão.");
        }

        // 3. A ATRIBUIÇÃO FINA (Como no passo anterior mas com lógica de 'Qualquer um' e especialidades)
        let finalEmployeeId = null;

        if (selectedEmployee) {
            finalEmployeeId = selectedEmployee.id;
        } else {
            // Se foi "Qualquer um", temos de encontrar qual é o funcionário que tem o buraco livre para o encaixar agora mesmo
            const slotStartMin = hours * 60 + minutes;
            const slotEndMin = slotStartMin + selectedService.duracao_minutos;

            // Busca marcações do dia para cruzar
            const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
            const { data: todayApps } = await supabase.from('appointments').select('employee_id, data_hora, services(duracao_minutos)').eq('salon_id', salonId).gte('data_hora', startOfDay.toISOString()).lte('data_hora', endOfDay.toISOString()).not('status', 'in', '("cancelado","cancelado_cliente","cancelado_salao","faltou")');

            const getEmpApps = (eId: number) => {
                if (!todayApps) return [];
                // Colocamos (a: any) para o TypeScript não bloquear a leitura do a.services
                return todayApps.filter((a: any) => a.employee_id === eId).map((a: any) => {
                    const d = new Date(a.data_hora);
                    const s = d.getHours() * 60 + d.getMinutes();
                    const dur = Array.isArray(a.services) ? a.services[0]?.duracao_minutos : a.services?.duracao_minutos;
                    return { start: s, end: s + (dur || 30) };
                });
            };

            // Encontra o primeiro funcionário livre que sabe fazer o serviço!
            // (Para simplicidade desta primeira versão, vamos assumir que o "Qualquer um" procura em todos. 
            // Para cruzar com especialidades 'staff_services' aqui, necessitaria de mais uma query, mas deixamos básico para já)
            for (const emp of employees) {
                const agenda = getEmpApps(emp.id);
                const isBusy = agenda.some(app => slotStartMin < app.end && slotEndMin > app.start);
                if (!isBusy) {
                    finalEmployeeId = emp.id;
                    break;
                }
            }

            if (!finalEmployeeId) {
                setSubmitting(false);
                return Alert.alert("Esgotado", "Enquanto preenchia os dados, esta vaga foi ocupada. Tente outra hora.");
            }
        }

        // 4. INSERE NA BASE DE DADOS
        const { error } = await supabase.from('appointments').insert({
            cliente_id: user.id,
            cliente_nome: userName,
            salon_id: Number(salonId),
            service_id: selectedService.id,
            employee_id: finalEmployeeId,
            data_hora: isoDate,
            status: 'pendente',
            notas: notes.trim()
        });

        if (error) {
            Alert.alert("Erro", "Não foi possível marcar. Tenta novamente.");
            setSubmitting(false);
        } else {
            // Notificações...
            router.replace('/success');
        }
    }

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.text} /></View>;

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            {/* CABEÇALHO */}
            <View style={styles.header}>
                <View style={styles.navRow}>
                    <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {step === 1 ? '1. Serviço' : step === 2 ? '2. Horário' : '3. Confirmar'}
                    </Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.progressBarBg}>
                    <Animated.View style={[styles.progressBarFill, {
                        width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    }]} />
                </View>
            </View>

            <ScrollView ref={scrollViewRef} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>

                {/* --- PASSO 1: SERVIÇOS --- */}
                {step === 1 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.sectionTitle}>O que deseja fazer?</Text>

                        {groupedServices.map((group) => {
                            const isExpanded = expandedCategory === group.title;
                            const hasSelectedInGroup = group.data.some(s => s.id === selectedService?.id);

                            return (
                                <View key={group.title} style={[styles.accordionGroup, hasSelectedInGroup && styles.accordionGroupActive]}>
                                    <TouchableOpacity
                                        style={styles.accordionHeader}
                                        onPress={() => setExpandedCategory(isExpanded ? null : group.title)}
                                    >
                                        <Text style={[styles.accordionTitle, hasSelectedInGroup && { color: colors.text }]}>{group.title}</Text>
                                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.subText} />
                                    </TouchableOpacity>

                                    {isExpanded && (
                                        <View style={styles.accordionBody}>
                                            {group.data.map(service => {
                                                const isSelected = selectedService?.id === service.id;
                                                return (
                                                    <TouchableOpacity
                                                        key={service.id}
                                                        style={[styles.serviceRow, isSelected && styles.serviceRowSelected]}
                                                        onPress={() => setSelectedService(service)}
                                                    >
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={[styles.serviceName, isSelected && { color: colors.bg }]}>{service.nome}</Text>
                                                            <Text style={[
                                                                styles.serviceDuration,
                                                                isSelected && { color: isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)' }
                                                            ]}>
                                                                <Ionicons name="time-outline" size={12} /> {service.duracao_minutos} min
                                                            </Text>
                                                        </View>
                                                        <Text style={[styles.servicePrice, isSelected && { color: colors.bg }]}>{service.preco}€</Text>
                                                        {isSelected && <View style={styles.checkCircle}><Ionicons name="checkmark" size={14} color={colors.text} /></View>}
                                                    </TouchableOpacity>
                                                )
                                            })}
                                        </View>
                                    )}
                                </View>
                            )
                        })}
                    </View>
                )}

                {/* --- PASSO 2: EQUIPA E CALENDÁRIO --- */}
                {step === 2 && (
                    <View style={styles.stepContainer}>
                        {/* RESUMO DO SERVIÇO ESCOLHIDO */}
                        <View style={styles.summaryBadge}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.summaryLabel}>Serviço Selecionado</Text>
                                <Text style={styles.summaryValue}>{selectedService?.nome}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setStep(1)} style={styles.editBtn}>
                                <Text style={styles.editBtnText}>Alterar</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.sectionTitle}>Com quem?</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, marginBottom: 24 }}>
                            <TouchableOpacity
                                style={[styles.employeeCard, !selectedEmployee && styles.employeeCardActive]}
                                onPress={() => setSelectedEmployee(null)}
                            >
                                <View style={[styles.employeeAvatarPlaceholder, !selectedEmployee && { backgroundColor: colors.text }]}>
                                    <Ionicons name="people" size={20} color={!selectedEmployee ? colors.bg : colors.text} />
                                </View>
                                <Text style={[styles.employeeName, !selectedEmployee && { fontWeight: '700', color: colors.text }]}>Qualquer um</Text>
                            </TouchableOpacity>
                            {employees.map(emp => (
                                <TouchableOpacity
                                    key={emp.id}
                                    style={[styles.employeeCard, selectedEmployee?.id === emp.id && styles.employeeCardActive]}
                                    onPress={() => setSelectedEmployee(emp)}
                                >
                                    <Image source={{ uri: emp.foto || 'https://via.placeholder.com/100' }} style={styles.employeeAvatar} />
                                    <Text style={[styles.employeeName, selectedEmployee?.id === emp.id && { fontWeight: '700', color: colors.text }]}>
                                        {emp.nome.split(' ')[0]}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text style={styles.sectionTitle}>Para quando?</Text>
                        <View style={styles.scheduleCard}>
                            <View style={styles.calendarHeader}>
                                <Text style={styles.currentMonth}>{displayedMonth.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}</Text>
                            </View>

                            <FlatList
                                ref={flatListRef}
                                data={calendarDays}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
                                keyExtractor={(item) => item.toISOString()}
                                onViewableItemsChanged={onViewableItemsChanged}
                                viewabilityConfig={viewabilityConfig}
                                renderItem={({ item }) => {
                                    const isSelected = isSameDay(item, selectedDate);
                                    return (
                                        <TouchableOpacity
                                            style={[styles.datePill, isSelected && styles.datePillSelected]}
                                            onPress={() => setSelectedDate(item)}
                                        >
                                            <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
                                                {item.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '').toUpperCase()}
                                            </Text>
                                            <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{item.getDate()}</Text>
                                        </TouchableOpacity>
                                    );
                                }}
                            />

                            <View style={styles.scheduleDivider} />

                            <View style={styles.slotsMinHeight}>
                                {loadingSlots ? (
                                    <ActivityIndicator size="small" color={colors.text} style={{ marginTop: 20 }} />
                                ) : availableSlots.length === 0 ? (
                                    <Text style={styles.noSlotsText}>
                                        Não há tempo suficiente para um serviço de {selectedService?.duracao_minutos} min neste dia.
                                    </Text>
                                ) : (
                                    <View style={styles.slotsGrid}>
                                        {availableSlots.map((time) => {
                                            const isSelected = selectedSlot === time;
                                            return (
                                                <TouchableOpacity
                                                    key={time}
                                                    style={[styles.slotItem, isSelected && styles.slotItemSelected]}
                                                    onPress={() => setSelectedSlot(time)}
                                                >
                                                    <Text style={[styles.slotText, isSelected && styles.slotTextSelected]}>{time}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                )}

                {/* --- PASSO 3: CONFIRMAR --- */}
                {step === 3 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.ticketCard}>
                            <View style={styles.ticketHeader}>
                                <Text style={styles.salonName}>{salonName}</Text>
                            </View>
                            <View style={styles.ticketRow}>
                                <View style={styles.ticketItem}>
                                    <Ionicons name="calendar-outline" size={18} color={colors.subText} style={{ marginBottom: 4 }} />
                                    <Text style={styles.ticketLabel}>Data</Text>
                                    <Text style={styles.ticketValue}>{selectedDate.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}</Text>
                                </View>
                                <View style={styles.ticketDividerVertical} />
                                <View style={styles.ticketItem}>
                                    <Ionicons name="time-outline" size={18} color={colors.subText} style={{ marginBottom: 4 }} />
                                    <Text style={styles.ticketLabel}>Hora</Text>
                                    <Text style={styles.ticketValue}>{selectedSlot}</Text>
                                </View>
                                <View style={styles.ticketDividerVertical} />
                                <View style={styles.ticketItem}>
                                    <Ionicons name="person-outline" size={18} color={colors.subText} style={{ marginBottom: 4 }} />
                                    <Text style={styles.ticketLabel}>Equipa</Text>
                                    <Text style={styles.ticketValue} numberOfLines={1}>{selectedEmployee ? selectedEmployee.nome.split(' ')[0] : 'Qualquer'}</Text>
                                </View>
                            </View>

                            <View style={styles.dashDivider}>
                                <View style={styles.circleLeft} /><View style={styles.dashLine} /><View style={styles.circleRight} />
                            </View>

                            <View style={styles.ticketFooter}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.ticketLabel}>Serviço</Text>
                                    <Text style={styles.ticketValue}>{selectedService?.nome}</Text>
                                    <Text style={[styles.ticketLabel, { marginTop: 4, textTransform: 'none' }]}>Duração aprox: {selectedService?.duracao_minutos} min</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.ticketLabel}>Total</Text>
                                    <Text style={[styles.ticketValue, { fontSize: 20 }]}>{selectedService?.preco}€</Text>
                                </View>
                            </View>
                        </View>

                        <Text style={styles.sectionTitle}>Alguma observação?</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.notesInput}
                                value={notes}
                                onChangeText={setNotes}
                                placeholder="Tens alguma preferência? Escreve aqui..."
                                placeholderTextColor={colors.subText}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>
                    </View>
                )}

            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[
                        styles.confirmBtn,
                        { backgroundColor: isDarkMode ? '#FFFFFF' : colors.text },
                        ((step === 1 && !selectedService) || (step === 2 && !selectedSlot) || submitting) && styles.confirmBtnDisabled
                    ]}
                    onPress={step === 3 ? handleConfirm : handleNextStep}
                    disabled={(step === 1 && !selectedService) || (step === 2 && !selectedSlot) || submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color={isDarkMode ? '#000' : 'white'} />
                    ) : (
                        <Text style={[styles.confirmBtnText, { color: isDarkMode ? '#000000' : colors.bg }]}>
                            {step === 3 ? 'Confirmar Marcação' : 'Continuar'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const createStyles = (colors: any, isDarkMode: boolean) => StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
    container: { flex: 1, backgroundColor: colors.bg },

    header: { paddingTop: Platform.OS === 'ios' ? 50 : 20, backgroundColor: colors.bg, paddingBottom: 10 },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16 },
    backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    progressBarBg: { height: 4, width: '100%', backgroundColor: colors.border },
    progressBarFill: { height: '100%', backgroundColor: colors.text },

    stepContainer: { flex: 1 },
    sectionTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16, color: colors.text, letterSpacing: -0.5 },

    // Passo 1: Serviços
    accordionGroup: { backgroundColor: colors.card, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    accordionGroupActive: { borderColor: colors.text, borderWidth: 1.5 },
    accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: colors.card },
    accordionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
    accordionBody: { paddingHorizontal: 12, paddingBottom: 12 },
    serviceRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: colors.bg, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
    serviceRowSelected: { backgroundColor: colors.text, borderColor: colors.text },
    serviceName: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 },
    serviceDuration: { fontSize: 12, color: colors.subText, fontWeight: '500' },
    servicePrice: { fontSize: 16, fontWeight: '800', color: colors.text },
    checkCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },

    // Passo 2: Empregados e Calendário
    summaryBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.iconBg, padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
    summaryLabel: { fontSize: 12, color: colors.subText, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
    summaryValue: { fontSize: 16, fontWeight: '700', color: colors.text },
    editBtn: { backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    editBtnText: { fontSize: 12, fontWeight: '700', color: colors.text },

    employeeCard: { alignItems: 'center', padding: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, minWidth: 85 },
    employeeCardActive: { borderColor: colors.text, backgroundColor: colors.iconBg },
    employeeAvatar: { width: 46, height: 46, borderRadius: 23, marginBottom: 8 },
    employeeAvatarPlaceholder: { width: 46, height: 46, borderRadius: 23, marginBottom: 8, backgroundColor: colors.iconBg, justifyContent: 'center', alignItems: 'center' },
    employeeName: { fontSize: 12, color: colors.subText, fontWeight: '600', textAlign: 'center' },

    scheduleCard: { backgroundColor: colors.card, borderRadius: 24, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
    calendarHeader: { marginBottom: 16 },
    currentMonth: { fontSize: 16, color: colors.text, fontWeight: '800', textTransform: 'capitalize' },
    datePill: { width: 56, height: 70, borderRadius: 16, backgroundColor: isDarkMode ? '#2C2C2E' : '#F9FAFB', borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
    datePillSelected: { backgroundColor: colors.text, borderColor: colors.text },
    dayName: { fontSize: 12, color: colors.subText, fontWeight: '700', marginBottom: 4 },
    dayNameSelected: { color: colors.bg },
    dayNumber: { fontSize: 18, fontWeight: '800', color: colors.text },
    dayNumberSelected: { color: colors.bg },

    slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    slotItem: { width: '31%', paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: isDarkMode ? '#2C2C2E' : '#F9FAFB', borderWidth: 1, borderColor: colors.border },
    slotItemSelected: { backgroundColor: colors.text, borderColor: colors.text },
    scheduleDivider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
    slotText: { fontSize: 14, fontWeight: '700', color: colors.text },
    slotTextSelected: { color: colors.bg },
    noSlotsText: { textAlign: 'center', color: colors.subText, fontStyle: 'italic', marginVertical: 20 },
    slotsMinHeight: { minHeight: 100 },

    // Passo 3: Ticket Confirmação
    ticketCard: { backgroundColor: colors.card, borderRadius: 20, marginBottom: 30, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    ticketHeader: { padding: 20, paddingBottom: 0, backgroundColor: colors.card },
    salonName: { fontSize: 20, fontWeight: '800', color: colors.text },
    ticketRow: { flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 20, paddingVertical: 24 },
    ticketItem: { alignItems: 'center', flex: 1 },
    ticketLabel: { fontSize: 11, color: colors.subText, marginBottom: 4, textTransform: 'uppercase', fontWeight: '700' },
    ticketValue: { fontSize: 15, fontWeight: '800', color: colors.text },
    ticketDividerVertical: { width: 1, height: '80%', backgroundColor: colors.border, alignSelf: 'center' },
    dashDivider: { flexDirection: 'row', alignItems: 'center', height: 20, overflow: 'hidden', position: 'relative' },
    circleLeft: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bg, position: 'absolute', left: -10, borderWidth: 1, borderColor: colors.border },
    circleRight: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bg, position: 'absolute', right: -10, borderWidth: 1, borderColor: colors.border },
    dashLine: { flex: 1, borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: 'dashed', marginHorizontal: 15, marginTop: -1 },
    ticketFooter: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.iconBg },

    inputContainer: { backgroundColor: colors.card, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: colors.border },
    notesInput: { padding: 16, minHeight: 120, fontSize: 15, color: colors.text },

    footer: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 16, paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
    confirmBtn: { width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    confirmBtnDisabled: { opacity: 0.3 },
    confirmBtnText: { fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
});