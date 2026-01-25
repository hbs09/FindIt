import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal, // <--- ADICIONAR
    NativeScrollEvent, // <--- ADICIONAR
    NativeSyntheticEvent,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendNotification } from '../utils/notifications';

import { supabase } from '../supabase';

// @ts-ignore
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';

// --- CONSTANTES ---
const CATEGORIES = ['Cabeleireiro', 'Barbearia', 'Unhas', 'Estética'];

// --- TIPOS ---
type Appointment = {
    id: number;
    cliente_nome: string;
    data_hora: string;
    status: string;
    services: { nome: string; preco: number };
    notas?: string;
};

type UserRole = 'owner' | 'staff' | null;

type StaffMember = {
    id: number;
    email: string;
    user_id: string | null;
    status: string;
    role: string;
    temp_name?: string; // <--- NOVO CAMPO
    profiles?: { nome: string }; // <--- Alterado de 'full_name' para 'name'
};

type PortfolioItem = {
    id: number;
    image_url: string;
    description?: string;
};

type ServiceItem = {
    id: number;
    nome: string;
    preco: number;
    position?: number;
};

type SalonDetails = {
    nome_salao: string;
    morada: string;
    cidade: string;
    hora_abertura: string;
    hora_fecho: string;
    publico: string;
    categoria: string[];
    intervalo_minutos: number;
    imagem: string | null;
    latitude: number | null;
    longitude: number | null;
    almoco_inicio: string | null;
    almoco_fim: string | null;
};

// --- NOVO TIPO PARA FECHOS ---
type Closure = {
    id: number;
    start_date: string;
    end_date: string;
    motivo: string;
};

export default function ManagerScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);
    const [salonName, setSalonName] = useState('');
    const { width, height } = Dimensions.get('window');
    const [isGalleryReordering, setIsGalleryReordering] = useState(false); // <--- NOVO ESTADO

    // --- ESTADOS PARA EQUIPA ---
    const [userRole, setUserRole] = useState<UserRole>(null);
    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [newStaffName, setNewStaffName] = useState(''); // <--- NOVO ESTADO
    const [inviting, setInviting] = useState(false);

    // --- ESTADOS DE FECHOS (Unificados aqui) ---
    const [closures, setClosures] = useState<Closure[]>([]);
    const [deletedClosureIds, setDeletedClosureIds] = useState<number[]>([]);

    // Avatar e Notificações (Header)
    const [userAvatar, setUserAvatar] = useState<string | null>(null);
    const [notificationCount, setNotificationCount] = useState(0);

    // Listas
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    const [services, setServices] = useState<ServiceItem[]>([]);

    // NOVOS ESTADOS PARA O UPLOAD COM DESCRIÇÃO
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [tempImageUri, setTempImageUri] = useState<string | null>(null);
    const [newImageDescription, setNewImageDescription] = useState('');

    // Estatísticas
    const [dailyStats, setDailyStats] = useState({ count: 0, revenue: 0 });

    // Edição
    const [salonDetails, setSalonDetails] = useState<SalonDetails>({
        nome_salao: '',
        morada: '',
        cidade: '',
        hora_abertura: '',
        hora_fecho: '',
        publico: 'Unissexo',
        categoria: ['Cabeleireiro'],
        intervalo_minutos: 30,
        imagem: null,
        latitude: null,
        longitude: null,
        almoco_inicio: null, // <--- NOVO
        almoco_fim: null
    });

    // Inputs Serviço e Estado de Edição
    const [newServiceName, setNewServiceName] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');
    const [addingService, setAddingService] = useState(false);
    const [editingService, setEditingService] = useState<ServiceItem | null>(null);

    // ESTADO PARA CONTROLAR A REORDENAÇÃO
    const [isReordering, setIsReordering] = useState(false);

    // Filtros
    const [filter, setFilter] = useState<'agenda' | 'pendente' | 'cancelado'>('agenda');

    // Datas (Agenda)
    const [currentDate, setCurrentDate] = useState(new Date());
    const [tempDate, setTempDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Relógios (Definições)
    const [activeTimePicker, setActiveTimePicker] = useState<'opening' | 'closing' | 'lunchStart' | 'lunchEnd' | null>(null);
    const [tempTime, setTempTime] = useState(new Date());
    const [showClosureStartPicker, setShowClosureStartPicker] = useState(false);
    const [showClosureEndPicker, setShowClosureEndPicker] = useState(false);
    const [newClosureStart, setNewClosureStart] = useState(new Date());
    const [newClosureEnd, setNewClosureEnd] = useState(new Date());
    const [newClosureReason, setNewClosureReason] = useState('Férias');
    const [tempClosureDate, setTempClosureDate] = useState(new Date());

    // Adiciona o | 'equipa' na lista de tipos
    const [activeTab, setActiveTab] = useState<'agenda' | 'galeria' | 'servicos' | 'definicoes' | 'equipa'>('agenda');
    const [uploading, setUploading] = useState(false);
    const [coverUploading, setCoverUploading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    // --- ESTADO PARA GALERIA (SLIDE) ---
    const [fullImageIndex, setFullImageIndex] = useState<number | null>(null);
    const flatListRef = useRef<FlatList>(null);

    // Função para atualizar o índice ao arrastar
    const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {

        if (fullImageIndex === null) return;

        const contentOffset = e.nativeEvent.contentOffset.x;
        const viewSize = e.nativeEvent.layoutMeasurement.width;
        const newIndex = Math.floor(contentOffset / viewSize);

        if (newIndex >= 0 && newIndex !== fullImageIndex) {
            setFullImageIndex(newIndex);
        }
    };

    useEffect(() => {
        checkManager();
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchNotificationCount();
        }, [])
    );

    useEffect(() => {
        if (salonId) {
            if (activeTab === 'agenda') { fetchAppointments(); fetchDailyStats(); }
            if (activeTab === 'galeria') fetchPortfolio();
            if (activeTab === 'servicos') fetchServices();
            if (activeTab === 'definicoes') { fetchSalonSettings(); fetchClosures(); }
            // --- ADICIONA ISTO ---
            if (activeTab === 'equipa' && userRole === 'owner') fetchStaff();
        }
    }, [salonId, filter, activeTab, currentDate, userRole]);

    useEffect(() => {
        if (!salonId) return;

        // Cria o canal de subscrição
        const channel = supabase
            .channel('appointments-changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // Escuta tudo: INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'appointments',
                    filter: `salon_id=eq.${salonId}` // Filtra apenas para o teu salão
                },
                (payload) => {
                    // Sempre que houver uma mudança, recarrega a lista
                    console.log('Alteração detetada:', payload);
                    fetchAppointments();
                    fetchDailyStats(); // Atualiza também os números do topo
                }
            )
            .subscribe();

        // Limpa a subscrição ao sair da página para não gastar recursos
        return () => {
            supabase.removeChannel(channel);
        };
    }, [salonId, filter, currentDate]); // Recria se mudares de salão ou filtro

    async function fetchStaff() {
        if (!salonId) return;

        const { data, error } = await supabase
            .from('salon_staff')
            .select('*, profiles ( nome )')
            .eq('salon_id', salonId);

        if (error) {
            console.error(error);
            Alert.alert("Erro", "Falha ao carregar equipa.");
        }

        if (data) {
            // --- ORDENAÇÃO AQUI ---
            const sortedList = (data as any[]).sort((a, b) => {
                // 1. Prioridade: Gerentes primeiro
                const isManagerA = a.role === 'gerente' ? 1 : 0;
                const isManagerB = b.role === 'gerente' ? 1 : 0;

                if (isManagerA > isManagerB) return -1; // A sobe
                if (isManagerA < isManagerB) return 1;  // B sobe

                // 2. Desempate: Ativos primeiro (opcional, mas fica melhor)
                const isActiveA = a.status === 'ativo' ? 1 : 0;
                const isActiveB = b.status === 'ativo' ? 1 : 0;
                if (isActiveA > isActiveB) return -1;
                if (isActiveA < isActiveB) return 1;

                return 0;
            });

            setStaffList(sortedList);
        }
    }

useEffect(() => {
        let channel: any;

        async function setupRealtimeBadge() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            console.log("A tentar ligar ao canal de notificações...");

            channel = supabase
                .channel('manager_badge_updates') // Nome único para o canal
                .on(
                    'postgres_changes',
                    {
                        event: '*', // Escuta INSERT, UPDATE e DELETE
                        schema: 'public',
                        table: 'notifications'
                        // Removemos o 'filter' aqui para evitar erros de sintaxe com UUIDs
                    },
                    (payload: any) => {
                        // Filtramos manualmente: É para mim?
                        const userIdNotification = payload.new?.user_id || payload.old?.user_id;

                        if (userIdNotification === user.id) {
                            console.log("Mudança detetada nas minhas notificações!");
                            fetchNotificationCount();
                        }
                    }
                )
                .subscribe((status) => {
                    console.log("Status da Conexão Realtime:", status);
                });
        }

        setupRealtimeBadge();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    // Função para remover os segundos (ex: "13:00:00" -> "13:00")
    function formatTimeFromDB(time: string | null) {
        if (!time) return null;
        return time.substring(0, 5); // Fica apenas com os primeiros 5 caracteres
    }

    async function inviteStaff() {
        if (!newStaffEmail.trim()) {
            return Alert.alert("Campo Vazio", "Por favor, escreve o email.");
        }
        // Validação opcional: exigir nome também
        if (!newStaffName.trim()) {
            return Alert.alert("Campo Vazio", "Por favor, escreve o nome do funcionário.");
        }

        setInviting(true);
        const emailLower = newStaffEmail.trim().toLowerCase();

        // 1. Verificação Local
        const existsLocally = staffList.some(member => member.email.toLowerCase() === emailLower);
        if (existsLocally) {
            setInviting(false);
            return Alert.alert("Erro", "Esse email já está na lista.");
        }

        // 2. Envio para a Base de Dados (Incluindo temp_name)
        const { error } = await supabase.from('salon_staff').insert({
            salon_id: salonId,
            email: emailLower,
            temp_name: newStaffName.trim(), // <--- GUARDAR O NOME AQUI
            status: 'pendente'
        });

        if (error) {
            if (error.code === '23505' || error.message.includes('unique')) {
                Alert.alert("Duplicado", "Este email já está registado neste salão.");
            } else {
                Alert.alert("Erro", error.message);
            }
        } else {
            setNewStaffEmail('');
            setNewStaffName(''); // Limpar o campo do nome
            fetchStaff();
            Alert.alert("Sucesso", "Convite enviado!");
        }
        setInviting(false);
    }

    function toggleManagerRole(staffMember: StaffMember) {
        const isPromoting = staffMember.role !== 'gerente';
        const newRole = isPromoting ? 'gerente' : 'funcionario';

        const titulo = isPromoting ? "Promover a Gerente" : "Remover Gerência";
        const mensagem = isPromoting
            ? "Queres dar acesso total a este membro? Ele poderá gerir a equipa e definições."
            : "Queres retirar o acesso de gerente? Ele passará a ver apenas a agenda.";

        Alert.alert(
            titulo,
            mensagem,
            [
                {
                    text: "Cancelar",
                    style: "cancel"
                },
                {
                    text: "Confirmar",
                    onPress: async () => {
                        // 1. Atualiza a lista localmente e reordena (Visual imediato)
                        const updatedList = staffList.map(s =>
                            s.id === staffMember.id ? { ...s, role: newRole } : s
                        ).sort((a, b) => {
                            const roleA = a.role === 'gerente' ? 1 : 0;
                            const roleB = b.role === 'gerente' ? 1 : 0;
                            return roleB - roleA;
                        });

                        setStaffList(updatedList);

                        // 2. Atualiza na Base de Dados
                        const { error } = await supabase
                            .from('salon_staff')
                            .update({ role: newRole })
                            .eq('id', staffMember.id);

                        if (error) {
                            Alert.alert("Erro", "Não foi possível alterar o cargo.");
                            fetchStaff(); // Reverte se falhar
                        }
                    }
                }
            ]
        );
    }

    function removeStaff(id: number) {
        Alert.alert(
            "Remover da Equipa",
            "Tens a certeza que queres remover este membro? Ele perderá o acesso ao salão.",
            [
                {
                    text: "Cancelar",
                    style: "cancel"
                },
                {
                    text: "Remover",
                    style: "destructive", // Fica vermelho no iOS
                    onPress: async () => {
                        await supabase.from('salon_staff').delete().eq('id', id);
                        fetchStaff();
                    }
                }
            ]
        );
    }

    async function checkManager() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return router.replace('/login');

        if (user.user_metadata?.avatar_url) setUserAvatar(user.user_metadata.avatar_url);

        // 1. Tenta encontrar como DONO (Dono original do salão)
        const { data: salonOwner } = await supabase.from('salons').select('*').eq('dono_id', user.id).single();

        if (salonOwner) {
            setSalonId(salonOwner.id);
            setSalonName(salonOwner.nome_salao);
            setUserRole('owner'); // <--- ACESSO TOTAL
            setLoading(false);
            fetchNotificationCount();
            return;
        }

        // 2. Tenta encontrar como STAFF (Só entra se estiver ATIVO)
        const { data: staffRecord } = await supabase
            .from('salon_staff')
            .select('salon_id, id, status, role') // <--- IMPORTANTE: Trazemos o campo 'role'
            .or(`user_id.eq.${user.id},email.eq.${user.email}`)
            .single();

        if (staffRecord && staffRecord.status === 'ativo') {
            // Atualiza o user_id na tabela se ainda não estiver (vincula a conta)
            await supabase.from('salon_staff').update({ user_id: user.id }).eq('id', staffRecord.id);

            const { data: salonDetails } = await supabase.from('salons').select('*').eq('id', staffRecord.salon_id).single();

            if (salonDetails) {
                setSalonId(salonDetails.id);
                setSalonName(salonDetails.nome_salao);

                // --- LÓGICA DE ACESSO ---
                if (staffRecord.role === 'gerente') {
                    // Se foi promovido a gerente, damos permissão de 'owner' na App
                    // Assim ele vê todas as abas (Faturação, Equipa, etc)
                    setUserRole('owner');
                } else {
                    // Se for funcionário normal, vê apenas a Agenda
                    setUserRole('staff');
                }

                setLoading(false);
                fetchNotificationCount();
                return;
            }
        }

        Alert.alert("Acesso Negado", "Não tens permissão de gestor.");
        router.replace('/');
    }

    async function fetchNotificationCount() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('read', false);

        if (count !== null) {
            setNotificationCount(count);
        }
    }

    // ==========================================
    // LÓGICA DE NEGÓCIO
    // ==========================================

    async function fetchDailyStats() {
        if (!salonId) return;

        const start = new Date(currentDate); start.setHours(0, 0, 0, 0);
        const end = new Date(currentDate); end.setHours(23, 59, 59, 999);

        const { data } = await supabase
            .from('appointments')
            .select(`status, services (preco)`)
            .eq('salon_id', salonId)
            .gte('data_hora', start.toISOString())
            .lte('data_hora', end.toISOString())
            .neq('status', 'cancelado')
            .neq('status', 'pendente');

        if (data) {
            const count = data.length;
            const revenue = data.reduce((total, item: any) => {
                if (item.status === 'faltou') return total;

                const preco = Array.isArray(item.services)
                    ? item.services[0]?.preco
                    : item.services?.preco;
                return total + (preco || 0);
            }, 0);
            setDailyStats({ count, revenue });
        }
    }

    async function fetchAppointments() {
        if (!salonId) return;
        setLoading(true);

        let query = supabase
            .from('appointments')
            .select(`id, cliente_nome, data_hora, status, notas, services (nome, preco)`)
            .eq('salon_id', salonId)
            .order('data_hora', { ascending: true });

        const start = new Date(currentDate); start.setHours(0, 0, 0, 0);
        const end = new Date(currentDate); end.setHours(23, 59, 59, 999);

        query = query
            .gte('data_hora', start.toISOString())
            .lte('data_hora', end.toISOString());

        if (filter === 'agenda') {
            query = query.neq('status', 'cancelado');
        } else {
            query = query.eq('status', filter);
        }

        const { data } = await query;

        if (data) {
            const normalizedData = data.map((item: any) => ({
                ...item,
                services: Array.isArray(item.services) ? item.services[0] : item.services
            }));
            setAppointments(normalizedData);
        }
        setLoading(false);
    }

    // --- Date Picker Agenda Logic ---
    function changeDate(days: number) {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);
        setCurrentDate(newDate);
    }

    const openDatePicker = () => {
        setTempDate(currentDate);
        setShowDatePicker(true);
    };

    const onChangeDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
            if (selectedDate && event.type !== 'dismissed') {
                setCurrentDate(selectedDate);
            }
        } else {
            if (selectedDate) setTempDate(selectedDate);
        }
    };

    const confirmIOSDate = () => {
        setCurrentDate(tempDate);
        setShowDatePicker(false);
    };

    // --- Time Picker Logic (Definições) ---
    const openTimePicker = (type: 'opening' | 'closing' | 'lunchStart' | 'lunchEnd') => {
        let timeStr = '12:00'; // Default

        if (type === 'opening') timeStr = salonDetails.hora_abertura;
        else if (type === 'closing') timeStr = salonDetails.hora_fecho;
        else if (type === 'lunchStart') timeStr = salonDetails.almoco_inicio || '13:00';
        else if (type === 'lunchEnd') timeStr = salonDetails.almoco_fim || '14:00';

        const [hours, minutes] = timeStr ? timeStr.split(':').map(Number) : [12, 0];
        const d = new Date();
        d.setHours(hours || 0, minutes || 0, 0, 0);

        setTempTime(d);
        setActiveTimePicker(type);
    };

    const onTimeChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            if (event.type === 'set' && selectedDate) {
                const timeStr = selectedDate.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

                if (activeTimePicker === 'opening') setSalonDetails(prev => ({ ...prev, hora_abertura: timeStr }));
                else if (activeTimePicker === 'closing') setSalonDetails(prev => ({ ...prev, hora_fecho: timeStr }));
                // --- NOVAS LINHAS ---
                else if (activeTimePicker === 'lunchStart') setSalonDetails(prev => ({ ...prev, almoco_inicio: timeStr }));
                else if (activeTimePicker === 'lunchEnd') setSalonDetails(prev => ({ ...prev, almoco_fim: timeStr }));
            }
            setActiveTimePicker(null);
        } else {
            if (selectedDate) setTempTime(selectedDate);
        }
    };

    const confirmIOSTime = () => {
        const timeStr = tempTime.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

        if (activeTimePicker === 'opening') setSalonDetails(prev => ({ ...prev, hora_abertura: timeStr }));
        else if (activeTimePicker === 'closing') setSalonDetails(prev => ({ ...prev, hora_fecho: timeStr }));
        // --- NOVAS LINHAS ---
        else if (activeTimePicker === 'lunchStart') setSalonDetails(prev => ({ ...prev, almoco_inicio: timeStr }));
        else if (activeTimePicker === 'lunchEnd') setSalonDetails(prev => ({ ...prev, almoco_fim: timeStr }));

        setActiveTimePicker(null);
    };

    async function updateStatus(id: number, newStatus: string) {
        if (newStatus === 'faltou') {
            Alert.alert(
                "Marcar Falta",
                "O cliente não compareceu? Isto irá remover o valor da faturação prevista.",
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Sim, Faltou", style: 'destructive', onPress: async () => { await executeUpdate(id, newStatus); } }
                ]
            );
        } else {
            await executeUpdate(id, newStatus);
        }
    }

    async function executeUpdate(id: number, newStatus: string) {
        // 1. Verificação de Segurança: Ver como está o pedido AGORA na base de dados
        const { data: currentAppointment } = await supabase
            .from('appointments')
            .select('status')
            .eq('id', id)
            .single();

        // Se o cliente já cancelou entretanto, aborta e avisa o gerente
        if (currentAppointment && currentAppointment.status === 'cancelado' && newStatus === 'confirmado') {
            Alert.alert("Atenção", "Este pedido já foi cancelado pelo cliente.");
            fetchAppointments(); // Atualiza a lista visualmente
            return;
        }

        // 2. Se estiver tudo bem, prossegue com a atualização normal
        const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);

        if (!error) {
            // 3. Preparar Notificação
            const { data: appointment } = await supabase
                .from('appointments')
                .select('cliente_id, services(nome), data_hora, salons(nome_salao)')
                .eq('id', id)
                .single();

            if (appointment && appointment.cliente_id) {
                const serviceData = appointment.services as any;
                const serviceName = Array.isArray(serviceData) ? serviceData[0]?.nome : serviceData?.nome;

                const salonData = appointment.salons as any;
                const salonName = Array.isArray(salonData) ? salonData[0]?.nome_salao : salonData?.nome_salao || 'o salão';

                const dataObj = new Date(appointment.data_hora);
                const dataFormatada = dataObj.toLocaleDateString('pt-PT');
                const horaFormatada = dataObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

                let titulo = "Atualização de Agendamento";
                let msg = `O estado do seu agendamento mudou para: ${newStatus}.`;
                let extraData = null;

                if (newStatus === 'confirmado') {
                    titulo = "Agendamento Confirmado";
                    msg = `O seu agendamento de ${serviceName} no ${salonName} foi confirmado para o dia ${dataFormatada} às ${horaFormatada}.`;
                    // Confirmado vai para as "Próximas" (padrão), não precisa de params
                    extraData = { screen: '/history' };
                }
                else if (newStatus === 'cancelado') {
                    titulo = "Agendamento Cancelado";
                    msg = `O seu agendamento de ${serviceName} no ${salonName} agendado para ${dataFormatada} às ${horaFormatada} foi cancelado pelo estabelecimento.`;
                    // Cancelado vai para a aba "Histórico"
                    extraData = { screen: '/history', params: { tab: 'history' } };
                }
                else if (newStatus === 'concluido') {
                    titulo = "Serviço Concluído";
                    msg = `O serviço de ${serviceName} no ${salonName} foi marcado como concluído. Agradecemos a sua preferência.`;
                    // Concluído também vai para "Histórico"
                    extraData = { screen: '/history', params: { tab: 'history' } };
                }

                await sendNotification(appointment.cliente_id, titulo, msg, extraData);
            }

            // A lista atualiza-se sozinha pelo Realtime, mas mantemos para garantir rapidez
            fetchAppointments();
            fetchDailyStats();
        } else {
            Alert.alert("Erro", "Não foi possível atualizar.");
        }
    }

    // --- LOCALIZAÇÃO (GEOLOCATION + REVERSE GEOCODING) ---
    async function handleGetLocation() {
        setLocationLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permissão negada', 'Precisamos de acesso à sua localização para definir o ponto no mapa.');
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;

            const addressResponse = await Location.reverseGeocodeAsync({ latitude, longitude });

            let newMorada = salonDetails.morada;
            let newCidade = salonDetails.cidade;

            if (addressResponse.length > 0) {
                const item = addressResponse[0];
                const rua = item.street || item.name || '';
                const numero = item.streetNumber || '';

                if (rua) newMorada = `${rua}${numero ? ', ' + numero : ''}`;
                if (item.city || item.subregion || item.region) {
                    newCidade = item.city || item.subregion || item.region || '';
                }
            }

            setSalonDetails(prev => ({
                ...prev,
                latitude: latitude,
                longitude: longitude,
                morada: newMorada,
                cidade: newCidade
            }));

            Alert.alert("Sucesso", "Localização e morada capturadas! Clique em 'Guardar Alterações' para confirmar.");

        } catch (error) {
            Alert.alert("Erro", "Não foi possível obter a localização.");
        } finally {
            setLocationLoading(false);
        }
    }

    // --- IMAGEM DE CAPA ---
    async function pickCoverImage() {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.7,
            base64: true,
        });

        if (!result.canceled) {
            uploadCoverToSupabase(result.assets[0].uri);
        }
    }

    async function uploadCoverToSupabase(uri: string) {
        if (!salonId) return;
        setCoverUploading(true);
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            const fileName = `cover_${salonId}_${Date.now()}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('portfolio')
                .upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });

            if (uploadError) {
                console.error("Erro Supabase Upload:", uploadError);
                throw new Error(uploadError.message);
            }

            const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(fileName);

            setSalonDetails(prev => ({ ...prev, imagem: publicUrl }));

        } catch (error: any) {
            Alert.alert("Erro no Upload", error.message);
        } finally {
            setCoverUploading(false);
        }
    }

    const handleGalleryDragEnd = async ({ data }: { data: PortfolioItem[] }) => {
        setPortfolio(data); // Atualiza visualmente logo
        const updates = data.map((item, index) => ({ id: item.id, position: index }));

        try {
            for (const item of updates) {
                await supabase.from('portfolio_images').update({ position: item.position }).eq('id', item.id);
            }
        } catch (e) {
            console.log("Erro ao guardar ordem da galeria");
        }
    };
    // --- PORTFÓLIO LOGIC ---
    async function fetchPortfolio() {
        if (!salonId) return;
        setLoading(true);

        // --- ALTERAÇÃO: Ordenar por 'position' (crescente) ---
        const { data, error } = await supabase
            .from('portfolio_images')
            .select('*')
            .eq('salon_id', salonId)
            .order('position', { ascending: true }); // Mudado de 'created_at' para 'position'

        // Fallback: Se não houver posição definida, a ordem pode ser aleatória ou por ID
        if (data) setPortfolio(data);
        setLoading(false);
    }

    // --- NOVO LIMITE DE FOTOS ---
    const MAX_PHOTOS = 12;

    async function pickAndUploadImage() {
        // 1. Verificação do Limite
        if (portfolio.length >= MAX_PHOTOS) {
            return Alert.alert(
                "Limite Atingido",
                `Já atingiste o limite de ${MAX_PHOTOS} fotos. Apaga algumas antigas para poderes adicionar novas.`
            );
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 4],
            quality: 0.7,
            base64: true,
        });

        if (!result.canceled) {
            setTempImageUri(result.assets[0].uri);
            setNewImageDescription('');
            setUploadModalVisible(true);
        }
    }

    // NOVA FUNÇÃO: Chamada quando o utilizador clica em "Publicar" no modal
    async function confirmUpload() {
        if (tempImageUri) {
            setUploadModalVisible(false); // Fecha o modal
            await uploadToSupabase(tempImageUri, newImageDescription);
            setTempImageUri(null);
            setNewImageDescription('');
        }
    }

    async function uploadToSupabase(uri: string, description: string) {
        if (!salonId) return;
        setUploading(true);
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            const fileName = `${salonId}_${Date.now()}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('portfolio')
                .upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(fileName);

            // --- INCLUIR A DESCRIÇÃO NO INSERT ---
            await supabase.from('portfolio_images').insert({
                salon_id: salonId,
                image_url: publicUrl,
                description: description // <--- Guarda a descrição
            });

            Alert.alert("Sucesso", "Foto publicada!");
            fetchPortfolio();
        } catch (error: any) {
            Alert.alert("Erro", "Falha ao enviar a imagem: " + error.message);
        } finally {
            setUploading(false);
        }
    }

    async function deleteImage(imageId: number) {
        Alert.alert("Apagar", "Remover esta foto?", [{ text: "Sim", onPress: async () => { await supabase.from('portfolio_images').delete().eq('id', imageId); fetchPortfolio(); } }, { text: "Não" }]);
    }

    async function fetchServices() {
        if (!salonId) return;
        setLoading(true);

        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('salon_id', salonId)
            .order('position', { ascending: true });

        if (error) {
            const { data: dataFallback } = await supabase
                .from('services')
                .select('*')
                .eq('salon_id', salonId)
                .order('nome', { ascending: true });

            if (dataFallback) setServices(dataFallback);
        } else {
            if (data) setServices(data);
        }
        setLoading(false);
    }

    // --- LÓGICA DE SERVIÇOS (ADICIONAR + EDITAR) ---

    function handleEditService(item: ServiceItem) {
        setEditingService(item);
        setNewServiceName(item.nome);
        setNewServicePrice(item.preco.toString());
    }

    function cancelEditService() {
        setEditingService(null);
        setNewServiceName('');
        setNewServicePrice('');
    }

    async function saveService() {
        if (!newServiceName.trim() || !newServicePrice.trim()) {
            return Alert.alert("Atenção", "Preencha o nome e o preço do serviço.");
        }

        const nameNormalized = newServiceName.trim();
        const duplicate = services.find(s =>
            s.nome.trim().toLowerCase() === nameNormalized.toLowerCase() &&
            s.id !== (editingService?.id ?? -1)
        );

        if (duplicate) {
            return Alert.alert("Duplicado", "Já existe um serviço com este nome.");
        }

        const priceClean = newServicePrice.replace(',', '.');
        const priceValue = parseFloat(priceClean);

        if (isNaN(priceValue)) {
            return Alert.alert("Erro", "O preço inserido não é válido.");
        }

        setAddingService(true);

        if (editingService) {
            const { error } = await supabase
                .from('services')
                .update({ nome: newServiceName, preco: priceValue })
                .eq('id', editingService.id);

            if (error) {
                Alert.alert("Erro", error.message);
            } else {
                Alert.alert("Sucesso", "Serviço atualizado!");
                setEditingService(null);
                setNewServiceName('');
                setNewServicePrice('');
                fetchServices();
            }
        } else {
            const nextPosition = services.length > 0 ? services.length + 1 : 0;

            const payload: any = {
                salon_id: salonId,
                nome: newServiceName,
                preco: priceValue
            };

            if (services.length > 0 && services[0].position !== undefined) {
                payload.position = nextPosition;
            }

            const { error } = await supabase.from('services').insert(payload);

            if (error) {
                if (error.message.includes('column "position" of relation "services" does not exist')) {
                    delete payload.position;
                    const { error: retryError } = await supabase.from('services').insert(payload);
                    if (retryError) Alert.alert("Erro", retryError.message);
                    else {
                        setNewServiceName(''); setNewServicePrice(''); fetchServices(); Alert.alert("Sucesso", "Serviço adicionado!");
                    }
                } else {
                    Alert.alert("Erro no Sistema", error.message);
                }
            } else {
                setNewServiceName('');
                setNewServicePrice('');
                fetchServices();
                Alert.alert("Sucesso", "Serviço adicionado!");
            }
        }
        setAddingService(false);
    }

    async function deleteService(id: number) {
        Alert.alert(
            "Eliminar Serviço",
            "Tens a certeza que queres remover este serviço?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Eliminar",
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase.from('services').delete().eq('id', id);
                        if (error) {
                            console.error("Erro ao apagar:", error);
                            Alert.alert("Erro", "Não foi possível apagar: " + error.message);
                        } else {
                            fetchServices();
                        }
                    }
                }
            ]
        );
    }

    const handleDragEnd = async ({ data }: { data: ServiceItem[] }) => {
        setServices(data);
        const updates = data.map((item, index) => ({ id: item.id, position: index }));
        try {
            for (const item of updates) {
                await supabase.from('services').update({ position: item.position }).eq('id', item.id);
            }
        } catch (e) {
            console.log("Erro ao reordenar");
        }
    };

    async function fetchSalonSettings() {
        if (!salonId) return;
        setLoading(true);
        const { data } = await supabase.from('salons').select('*').eq('id', salonId).single();
        if (data) {

            let categoriasArray: string[] = ['Cabeleireiro'];
            if (data.categoria) {
                if (Array.isArray(data.categoria)) {
                    categoriasArray = data.categoria;
                } else {
                    categoriasArray = data.categoria.split(',').map((c: string) => c.trim());
                }
            }

            setSalonDetails({
                nome_salao: data.nome_salao,
                morada: data.morada,
                cidade: data.cidade,
                hora_abertura: formatTimeFromDB(data.hora_abertura) || '09:00',
                hora_fecho: formatTimeFromDB(data.hora_fecho) || '19:00',
                publico: data.publico || 'Unissexo',
                categoria: categoriasArray,
                intervalo_minutos: data.intervalo_minutos || 30,
                imagem: data.imagem || null,
                latitude: data.latitude,
                longitude: data.longitude,
                // --- CORREÇÃO AQUI TAMBÉM ---
                almoco_inicio: formatTimeFromDB(data.almoco_inicio),
                almoco_fim: formatTimeFromDB(data.almoco_fim),
            });
        }
        setLoading(false);
    }

    async function saveSettings() {
        if (!salonId) return;

        // --- NOVA VALIDAÇÃO: HORÁRIO DE ALMOÇO ---
        const temInicio = !!salonDetails.almoco_inicio;
        const temFim = !!salonDetails.almoco_fim;

        // Se um existir e o outro não (XOR), bloqueia
        if (temInicio !== temFim) {
            return Alert.alert(
                "Horário de Almoço Incompleto",
                "Para definir a hora de almoço, tens de preencher obrigatóriamente o início e o fim (ou remover ambos)."
            );
        }

        // Validação Extra: Garantir que o fim é depois do início
        if (temInicio && temFim && salonDetails.almoco_inicio! >= salonDetails.almoco_fim!) {
            return Alert.alert(
                "Horário Inválido",
                "A hora de fim de almoço tem de ser superior à hora de início."
            );
        }
        // ------------------------------------------

        setLoading(true);

        try {
            // 1. Atualizar Dados do Salão
            const payload = {
                ...salonDetails,
                categoria: salonDetails.categoria.join(', ')
            };
            const { error: salonError } = await supabase.from('salons').update(payload).eq('id', salonId);
            if (salonError) throw salonError;

            // 2. Processar REMOÇÕES de Ausências
            if (deletedClosureIds.length > 0) {
                const { error: deleteError } = await supabase
                    .from('salon_closures')
                    .delete()
                    .in('id', deletedClosureIds);
                if (deleteError) throw deleteError;
            }

            // 3. Processar ADIÇÕES de Ausências
            const newClosures = closures.filter(c => c.id < 0).map(c => ({
                salon_id: salonId,
                start_date: c.start_date,
                end_date: c.end_date,
                motivo: c.motivo
            }));

            if (newClosures.length > 0) {
                const { error: insertError } = await supabase
                    .from('salon_closures')
                    .insert(newClosures);
                if (insertError) throw insertError;
            }

            Alert.alert("Sucesso", "Todas as alterações foram guardadas!");
            setSalonName(salonDetails.nome_salao);

            setDeletedClosureIds([]);
            fetchClosures();

        } catch (error: any) {
            console.error("Erro ao guardar:", error);
            Alert.alert("Erro", error.message || "Falha ao guardar alterações.");
        } finally {
            setLoading(false);
        }
    }

    async function fetchClosures() {
        if (!salonId) return;
        const { data } = await supabase
            .from('salon_closures')
            .select('*')
            .eq('salon_id', salonId)
            .gte('end_date', new Date().toISOString().split('T')[0])
            .order('start_date', { ascending: true });

        if (data) {
            setClosures(data);
            setDeletedClosureIds([]); // Resetar lista de apagados ao carregar do servidor
        }
    }
    function addClosure() {
        // Validação básica (mantida)
        if (!salonId) return;
        if (newClosureEnd < newClosureStart) {
            return Alert.alert("Data Inválida", "A data de fim tem de ser depois da data de início.");
        }

        // Cria o objeto localmente
        const tempId = -Date.now(); // ID negativo para identificar que é novo
        const newClosureItem: Closure = {
            id: tempId,
            start_date: newClosureStart.toISOString().split('T')[0],
            end_date: newClosureEnd.toISOString().split('T')[0],
            motivo: newClosureReason
        };

        // Atualiza a lista visualmente
        setClosures([...closures, newClosureItem]);

        // Reset dos campos
        setNewClosureStart(new Date());
        setNewClosureEnd(new Date());
        setNewClosureReason('Férias');
    }

    function deleteClosure(id: number) {
        Alert.alert("Remover", "A ausência será removida da lista. Guarda as alterações para confirmar.", [
            { text: "Cancelar" },
            {
                text: "Sim", style: 'destructive', onPress: () => {
                    // Se o ID for positivo (>0), é porque já existe na BD, então marcamos para apagar depois
                    if (id > 0) {
                        setDeletedClosureIds(prev => [...prev, id]);
                    }
                    // Remove visualmente da lista atual
                    setClosures(prev => prev.filter(c => c.id !== id));
                }
            }
        ]);
    }

    // --- LÓGICA DE HANDLER PARA FERIADOS (ATUALIZADA) ---
    const onClosureDateChange = (event: any, selectedDate?: Date, type?: 'start' | 'end') => {
        if (Platform.OS === 'android') {
            if (type === 'start') setShowClosureStartPicker(false); else setShowClosureEndPicker(false);

            if (event.type === 'set' && selectedDate) {
                // Se for Feriados, define o dia de início e fim como iguais
                if (newClosureReason === 'Feriado') {
                    setNewClosureStart(selectedDate);
                    setNewClosureEnd(selectedDate);
                } else {
                    if (type === 'start') setNewClosureStart(selectedDate); else setNewClosureEnd(selectedDate);
                }
            }
        } else if (selectedDate) setTempClosureDate(selectedDate);
    };

    const confirmIOSClosureDate = (type: 'start' | 'end') => {
        if (newClosureReason === 'Feriado') {
            setNewClosureStart(tempClosureDate);
            setNewClosureEnd(tempClosureDate);
            setShowClosureStartPicker(false);
        } else {
            if (type === 'start') { setNewClosureStart(tempClosureDate); setShowClosureStartPicker(false); }
            else { setNewClosureEnd(tempClosureDate); setShowClosureEndPicker(false); }
        }
    };

    // --- UTILS ---
    function getBadgeConfig(status: string) {
        switch (status) {
            case 'confirmado':
                return { bg: '#E8F5E9', color: '#2E7D32', icon: 'checkmark-circle', label: 'CONFIRMADO' };
            case 'pendente':
                return { bg: '#FFF3E0', color: '#EF6C00', icon: 'time', label: 'PENDENTE' };
            case 'cancelado':
                return { bg: '#FFEBEE', color: '#D32F2F', icon: 'close-circle', label: 'CANCELADO' };
            case 'concluido':
                return { bg: '#F5F5F5', color: '#333', icon: 'checkbox', label: 'CONCLUÍDO' };
            case 'faltou':
                return { bg: '#FFEBEE', color: '#D32F2F', icon: 'warning', label: 'FALTOU' };
            default:
                return { bg: '#F5F5F5', color: '#999', icon: 'help-circle', label: status.toUpperCase() };
        }
    }

    function getStatusColor(status: string) {
        switch (status) {
            case 'confirmado': return '#4CD964';
            case 'cancelado': return '#FF3B30';
            case 'pendente': return '#FF9500';
            case 'concluido': return '#1A1A1A';
            case 'faltou': return '#8E8E93';
            default: return '#C7C7CC';
        }
    }

    if (loading && !salonName) return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
                <StatusBar style="dark" />
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: '#F8F9FA' }}>

                    {/* --- HEADER --- */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.headerSubtitle}>Painel de Controlo</Text>
                            <Text style={styles.headerTitle}>{salonName}</Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.notificationBtn}>
                                <Ionicons name="notifications-outline" size={22} color="#333" />
                                {notificationCount > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>
                                            {notificationCount > 9 ? '9+' : notificationCount}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.avatarContainer}>
                                {userAvatar ? (
                                    <Image source={{ uri: userAvatar }} style={styles.headerAvatarImage} />
                                ) : (
                                    <Ionicons name="person" size={24} color="#555" />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* --- MENU DINÂMICO --- */}
                    <View style={styles.menuContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuScroll}>
                            {[
                                // 1. Agenda (Todos veem)
                                { id: 'agenda', icon: 'calendar', label: 'Agenda' },

                                // 2. Abas exclusivas de DONO (Galeria, Serviços, Equipa, Definições)
                                ...(userRole === 'owner' ? [
                                    { id: 'galeria', icon: 'images', label: 'Galeria' },
                                    { id: 'servicos', icon: 'cut', label: 'Serviços' },
                                    { id: 'equipa', icon: 'people', label: 'Equipa' },
                                    { id: 'definicoes', icon: 'settings', label: 'Definições' } // <--- AGORA ESTÁ DENTRO DO BLOCO 'OWNER'
                                ] : [])

                            ].map((tab) => (
                                <TouchableOpacity
                                    key={tab.id}
                                    onPress={() => setActiveTab(tab.id as any)}
                                    style={[styles.menuItem, activeTab === tab.id && styles.menuItemActive]}
                                >
                                    <Ionicons name={tab.icon as any} size={18} color={activeTab === tab.id ? '#FFF' : '#666'} />
                                    <Text style={[styles.menuText, activeTab === tab.id && styles.menuTextActive]}>{tab.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* --- CONTEÚDO --- */}

                    {/* 1. ABA AGENDA */}
                    {activeTab === 'agenda' && (
                        <>
                            {/* Apenas o DONO vê o dinheiro */}
                            {userRole === 'owner' && (
                                <View style={styles.statsSummary}>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Clientes (Dia)</Text>
                                        <Text style={styles.statNumber}>{dailyStats.count}</Text>
                                    </View>
                                    <View style={styles.verticalDivider} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Faturação (Dia)</Text>
                                        <Text style={[styles.statNumber, { color: '#4CD964' }]}>
                                            {dailyStats.revenue.toFixed(2)}€
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* --- FILTROS (AGENDA, PENDENTE, CANCELADO) --- */}
                            <View style={[styles.filterContainer, userRole !== 'owner' && { marginTop: 20 }]}>
                                {[
                                    { id: 'agenda', label: 'Agenda' },
                                    { id: 'pendente', label: 'Pendentes' },
                                    { id: 'cancelado', label: 'Cancelados' }
                                ].map(f => (
                                    <TouchableOpacity
                                        key={f.id}
                                        onPress={() => setFilter(f.id as any)}
                                        style={[styles.filterTab, filter === f.id && styles.filterTabActive]}
                                    >
                                        <Text style={[styles.filterTabText, filter === f.id && { color: 'white' }]}>
                                            {f.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.dateControl}>
                                <TouchableOpacity onPress={() => changeDate(-1)} style={styles.arrowBtn}>
                                    <Ionicons name="chevron-back" size={20} color="#333" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={openDatePicker} style={styles.dateDisplay}>
                                    <Ionicons name="calendar-outline" size={16} color="#666" />
                                    <View>
                                        <Text style={styles.dateLabelSmall}>A visualizar</Text>
                                        <Text style={styles.dateText}>
                                            {currentDate.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => changeDate(1)} style={styles.arrowBtn}>
                                    <Ionicons name="chevron-forward" size={20} color="#333" />
                                </TouchableOpacity>
                            </View>

                            {showDatePicker && (
                                Platform.OS === 'ios' ? (
                                    <Modal visible={showDatePicker} transparent animationType="fade">
                                        <View style={styles.modalOverlay}>
                                            <View style={styles.modalContent}>
                                                <View style={styles.modalHeader}>
                                                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                                        <Text style={{ color: '#666' }}>Cancelar</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={confirmIOSDate}>
                                                        <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Confirmar</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                <DateTimePicker value={tempDate} mode="date" display="spinner" onChange={onChangeDate} style={{ height: 200 }} />
                                            </View>
                                        </View>
                                    </Modal>
                                ) : (
                                    <DateTimePicker value={currentDate} mode="date" display="default" onChange={onChangeDate} />
                                )
                            )}

                            <FlatList
                                data={appointments}
                                keyExtractor={(item) => item.id.toString()}
                                contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
                                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { fetchAppointments(); fetchDailyStats(); }} />}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <Ionicons name="calendar-clear-outline" size={64} color="#E0E0E0" />
                                        <Text style={styles.emptyText}>
                                            {filter === 'cancelado'
                                                ? 'Nenhum cancelamento nesta data.'
                                                : 'Sem agendamentos nesta data.'}
                                        </Text>
                                    </View>
                                }
                                renderItem={({ item, index }) => {
                                    const statusColor = getStatusColor(item.status);
                                    const isLast = index === appointments.length - 1;
                                    const badge = getBadgeConfig(item.status);

                                    return (
                                        <View style={styles.timelineRow}>
                                            <View style={styles.timeColumn}>
                                                <Text style={styles.timeText}>
                                                    {new Date(item.data_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                            </View>

                                            <View style={styles.lineColumn}>
                                                <View style={[styles.timelineDot, { backgroundColor: statusColor }]} />
                                                {!isLast && <View style={styles.timelineLine} />}
                                            </View>

                                            <View style={styles.contentColumn}>
                                                <View style={styles.timelineCard}>
                                                    <View style={styles.cardHeader}>
                                                        {/* --- ATUALIZAÇÃO: NOME E ÍCONE DE NOTAS LADO A LADO --- */}
                                                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                                                            <Text style={[
                                                                styles.clientName,
                                                                item.status === 'cancelado' && { textDecorationLine: 'line-through', color: '#999' },
                                                                item.status === 'faltou' && { color: '#8E8E93' },
                                                                { flexShrink: 1 } // Importante para não empurrar o ícone
                                                            ]} numberOfLines={1}>{item.cliente_nome}</Text>

                                                            {item.notas && (
                                                                <TouchableOpacity onPress={() => Alert.alert("Nota do Cliente", item.notas)} style={{ marginLeft: 6 }}>
                                                                    <Ionicons name="document-text" size={18} color="#FF9500" />
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>

                                                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                                                            <Ionicons name={badge.icon as any} size={12} color={badge.color} />
                                                            <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
                                                        </View>
                                                    </View>

                                                    <View style={styles.cardBody}>
                                                        <View style={styles.infoColumn}>
                                                            <Text style={styles.serviceDetail}>{item.services?.nome}</Text>
                                                            <Text style={[styles.priceTag, item.status === 'faltou' && { textDecorationLine: 'line-through', color: '#BBB' }]}>
                                                                {item.services?.preco.toFixed(2)}€
                                                            </Text>
                                                        </View>

                                                        <View style={styles.actionColumn}>
                                                            {item.status === 'pendente' && (
                                                                <>
                                                                    <TouchableOpacity onPress={() => updateStatus(item.id, 'confirmado')} style={[styles.miniBtn, { backgroundColor: '#E8F5E9' }]}>
                                                                        <Ionicons name="checkmark" size={18} color="#2E7D32" />
                                                                    </TouchableOpacity>
                                                                    <TouchableOpacity onPress={() => updateStatus(item.id, 'cancelado')} style={[styles.miniBtn, { backgroundColor: '#FFEBEE' }]}>
                                                                        <Ionicons name="close" size={18} color="#D32F2F" />
                                                                    </TouchableOpacity>
                                                                </>
                                                            )}
                                                            {item.status === 'confirmado' && (
                                                                <>
                                                                    <TouchableOpacity onPress={() => updateStatus(item.id, 'faltou')} style={[styles.miniBtn, { backgroundColor: '#FFF3E0' }]}>
                                                                        <Ionicons name="alert-circle-outline" size={18} color="#EF6C00" />
                                                                    </TouchableOpacity>
                                                                    <TouchableOpacity onPress={() => updateStatus(item.id, 'concluido')} style={[styles.miniBtn, { backgroundColor: '#212121' }]}>
                                                                        <Ionicons name="checkbox-outline" size={18} color="#FFF" />
                                                                    </TouchableOpacity>
                                                                </>
                                                            )}
                                                        </View>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                }}
                            />
                        </>
                    )}

                    {/* 2. ABA GALERIA */}
                    {activeTab === 'galeria' && (
                        <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
                            <View style={styles.galleryHeader}>
                                <View>
                                    <Text style={styles.sectionTitle}>O meu Portfólio</Text>
                                    <Text style={styles.gallerySubtitle}>
                                        {portfolio.length} / {MAX_PHOTOS} fotografias utilizadas
                                    </Text>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {/* BOTÃO ORGANIZAR */}
                                    {portfolio.length > 1 && (
                                        <TouchableOpacity
                                            style={[
                                                styles.uploadBtnCompact,
                                                { backgroundColor: isGalleryReordering ? '#333' : 'white', borderWidth: 1, borderColor: '#EEE' }
                                            ]}
                                            onPress={() => setIsGalleryReordering(!isGalleryReordering)}
                                        >
                                            <Ionicons
                                                name={isGalleryReordering ? "checkmark" : "swap-vertical"}
                                                size={18}
                                                color={isGalleryReordering ? "white" : "#333"}
                                            />
                                            {/* Texto opcional se quiseres, mas só o ícone poupa espaço */}
                                        </TouchableOpacity>
                                    )}

                                    {/* BOTÃO ADICIONAR (Esconde enquanto organiza) */}
                                    {!isGalleryReordering && (
                                        <TouchableOpacity
                                            style={[styles.uploadBtnCompact, uploading && styles.uploadBtnDisabled]}
                                            onPress={pickAndUploadImage}
                                            disabled={uploading}
                                        >
                                            {uploading ? (
                                                <ActivityIndicator color="white" size="small" />
                                            ) : (
                                                <>
                                                    <Ionicons name="add" size={20} color="white" />
                                                    <Text style={styles.uploadBtnText}>Adicionar</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {isGalleryReordering ? (
                                /* --- MODO DE ORGANIZAÇÃO (LISTA) --- */
                                <DraggableFlatList
                                    data={portfolio}
                                    keyExtractor={(item) => item.id.toString()}
                                    onDragEnd={handleGalleryDragEnd}
                                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                                    renderItem={({ item, drag, isActive }: RenderItemParams<PortfolioItem>) => (
                                        <ScaleDecorator>
                                            <TouchableOpacity
                                                onLongPress={drag}
                                                delayLongPress={100}
                                                style={[
                                                    styles.galleryListItem,
                                                    isActive && { backgroundColor: '#F0F0F0', elevation: 5, transform: [{ scale: 1.02 }] }
                                                ]}
                                            >
                                                <Ionicons name="reorder-two" size={24} color="#999" style={{ marginRight: 15 }} />
                                                <Image source={{ uri: item.image_url }} style={styles.galleryListImage} />
                                                <View style={{ flex: 1, marginLeft: 10 }}>
                                                    <Text style={styles.galleryListTitle} numberOfLines={1}>
                                                        {item.description ? item.description : "Foto sem descrição"}
                                                    </Text>
                                                    <Text style={{ fontSize: 10, color: '#ccc' }}>Arraste para mover</Text>
                                                </View>
                                            </TouchableOpacity>
                                        </ScaleDecorator>
                                    )}
                                />
                            ) : (
                                /* --- MODO DE VISUALIZAÇÃO (GRELHA) - CÓDIGO ANTIGO --- */
                                <FlatList
                                    data={portfolio}
                                    keyExtractor={(item) => item.id.toString()}
                                    numColumns={3}
                                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPortfolio} />}
                                    contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
                                    columnWrapperStyle={{ gap: 12 }}
                                    ListEmptyComponent={
                                        <View style={styles.emptyGalleryContainer}>
                                            <View style={styles.emptyIconBg}>
                                                <Ionicons name="images-outline" size={40} color="#999" />
                                            </View>
                                            <Text style={styles.emptyTitle}>Galeria Vazia</Text>
                                            <Text style={styles.galleryEmptyText}>Adiciona fotos dos teus melhores trabalhos para atrair mais clientes.</Text>
                                            <TouchableOpacity style={styles.emptyActionBtn} onPress={pickAndUploadImage}>
                                                <Text style={styles.emptyActionText}>Carregar Primeira Foto</Text>
                                            </TouchableOpacity>
                                        </View>
                                    }
                                    renderItem={({ item, index }) => (
                                        <View style={styles.galleryCard}>
                                            <TouchableOpacity
                                                onPress={() => setFullImageIndex(index)}
                                                activeOpacity={0.9}
                                                style={{ flex: 1 }}
                                            >
                                                <Image source={{ uri: item.image_url }} style={styles.galleryImage} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.deleteButtonCircle}
                                                onPress={() => deleteImage(item.id)}
                                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                            >
                                                <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                />
                            )}
                        </View>
                    )}

                    {/* 3. ABA SERVIÇOS */}
                    {activeTab === 'servicos' && (
                        <View style={{ flex: 1, backgroundColor: '#F8F9FA', width: '100%' }}>

                            <View style={{ height: 20 }} />

                            <View style={styles.addServiceForm}>
                                <Text style={styles.formTitle}>{editingService ? 'Editar Serviço' : 'Adicionar Novo'}</Text>
                                <View style={styles.inputRow}>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="cut-outline" size={20} color="#999" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.inputStyled}
                                            placeholder="Nome"
                                            value={newServiceName}
                                            onChangeText={setNewServiceName}
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                    <View style={[styles.inputWrapper, { flex: 0.6 }]}>
                                        <Text style={styles.currencyPrefix}>€</Text>
                                        <TextInput
                                            style={[styles.inputStyled, { paddingLeft: 25 }]}
                                            placeholder="Preço"
                                            keyboardType="numeric"
                                            value={newServicePrice}
                                            onChangeText={setNewServicePrice}
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    {editingService && (
                                        <TouchableOpacity
                                            style={[styles.addServiceBtn, { backgroundColor: '#EEE', flex: 1 }]}
                                            onPress={cancelEditService}
                                        >
                                            <Text style={[styles.addServiceBtnText, { color: '#666' }]}>Cancelar</Text>
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.addServiceBtn, { flex: 2 }]}
                                        onPress={saveService}
                                        disabled={addingService}
                                    >
                                        {addingService ? (
                                            <ActivityIndicator color="white" size="small" />
                                        ) : (
                                            <Text style={styles.addServiceBtnText}>
                                                {editingService ? 'Guardar Alterações' : 'Adicionar Serviço'}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {services.length > 0 && (
                                <View style={styles.listControlRow}>
                                    <Text style={styles.listCountText}>{services.length} Serviços</Text>

                                    <TouchableOpacity
                                        style={[styles.reorderBtn, isReordering && styles.reorderBtnActive]}
                                        onPress={() => setIsReordering(!isReordering)}
                                    >
                                        <Ionicons
                                            name={isReordering ? "checkmark" : "swap-vertical"}
                                            size={14}
                                            color={isReordering ? "white" : "#666"}
                                        />
                                        <Text style={[styles.reorderBtnText, isReordering && { color: 'white' }]}>
                                            {isReordering ? 'Concluir' : 'Organizar'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            <DraggableFlatList
                                style={{ flex: 1 }}
                                containerStyle={{ flex: 1 }}
                                data={services}
                                onDragEnd={handleDragEnd}
                                keyExtractor={(item) => item.id.toString()}
                                contentContainerStyle={{ padding: 20, paddingTop: 5, paddingBottom: 150 }}
                                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchServices} />}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <View style={[styles.emptyIconBg, { backgroundColor: '#FFF5F5' }]}>
                                            <Ionicons name="cut" size={32} color="#FF3B30" />
                                        </View>
                                        <Text style={styles.emptyText}>Ainda não tens serviços.</Text>
                                    </View>
                                }
                                renderItem={({ item, drag, isActive }: RenderItemParams<ServiceItem>) => (
                                    <ScaleDecorator>
                                        <View
                                            style={[
                                                styles.serviceCard,
                                                isActive && { backgroundColor: '#F0F0F0', elevation: 5, shadowOpacity: 0.2 }
                                            ]}
                                        >
                                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>

                                                {isReordering && (
                                                    <TouchableOpacity
                                                        onLongPress={drag}
                                                        delayLongPress={250}
                                                        hitSlop={20}
                                                        style={{ marginRight: 8 }}
                                                    >
                                                        <Ionicons name="reorder-two-outline" size={24} color="#333" />
                                                    </TouchableOpacity>
                                                )}

                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.serviceCardName} numberOfLines={2} ellipsizeMode="tail">
                                                        {item.nome}
                                                    </Text>

                                                    {isReordering && (
                                                        <Text style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                                                            Arraste para mover
                                                        </Text>
                                                    )}
                                                </View>
                                            </View>

                                            <View style={styles.serviceRight}>

                                                <View style={styles.priceBadge}>
                                                    <Text style={styles.priceBadgeText}>{item.preco.toFixed(2)}€</Text>
                                                </View>

                                                <View style={styles.actionButtonsContainer}>
                                                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditService(item)}>
                                                        <Ionicons name="pencil-outline" size={18} color="#007AFF" />
                                                    </TouchableOpacity>

                                                    <TouchableOpacity style={styles.actionBtn} onPress={() => deleteService(item.id)}>
                                                        <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        </View>
                                    </ScaleDecorator>
                                )}
                            />
                        </View>
                    )}

                    {/* 5. ABA EQUIPA (Só Donos) */}
                    {activeTab === 'equipa' && userRole === 'owner' && (
                        <View style={{ flex: 1, padding: 20 }}>
                            <View style={styles.addServiceForm}>
                                <Text style={styles.formTitle}>Adicionar Membro</Text>

                                {/* 1. INPUT DE NOME (NOVO) */}
                                <View style={[styles.inputRow, { marginBottom: 10 }]}>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="person-outline" size={20} color="#999" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.inputStyled}
                                            placeholder="Nome do Funcionário"
                                            value={newStaffName}
                                            onChangeText={setNewStaffName}
                                            autoCapitalize="words"
                                        />
                                    </View>
                                </View>

                                <View style={styles.inputRow}>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="mail-outline" size={20} color="#999" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.inputStyled}
                                            placeholder="email@funcionario.com"
                                            autoCapitalize="none"
                                            value={newStaffEmail}
                                            onChangeText={setNewStaffEmail}
                                        />
                                    </View>
                                </View>
                                <TouchableOpacity style={styles.addServiceBtn} onPress={inviteStaff} disabled={inviting}>
                                    {inviting ? <ActivityIndicator color="white" /> : <Text style={styles.addServiceBtnText}>Convidar</Text>}
                                </TouchableOpacity>
                            </View>



                            <FlatList
                                data={staffList}
                                keyExtractor={item => item.id.toString()}
                                ListEmptyComponent={
                                    <Text style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>
                                        Ainda não tens equipa. Envia um convite acima.
                                    </Text>
                                }
                                renderItem={({ item }) => (
                                    <View style={styles.serviceCard}>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>

                                                {/* 1. NOME */}
                                                <Text style={[styles.serviceCardName, { fontSize: 16 }]}>
                                                    {item.profiles?.nome || item.temp_name || "Convidado"}
                                                </Text>

                                                {/* 2. BADGES (Etiquetas) */}

                                                {/* A) Badge de GERENTE (Amarelo) */}
                                                {item.role === 'gerente' && (
                                                    <View style={{
                                                        backgroundColor: '#FFF9C4',
                                                        paddingHorizontal: 6,
                                                        paddingVertical: 2,
                                                        borderRadius: 4,
                                                        borderWidth: 1,
                                                        borderColor: '#FBC02D'
                                                    }}>
                                                        <Text style={{ fontSize: 10, color: '#F57F17', fontWeight: 'bold' }}>GERENTE</Text>
                                                    </View>
                                                )}

                                                {/* B) Badge de FUNCIONÁRIO (Azul) - Só aparece se NÃO for gerente e estiver ATIVO */}
                                                {item.role !== 'gerente' && item.status === 'ativo' && (
                                                    <View style={{
                                                        backgroundColor: '#E3F2FD', // Azul Claro
                                                        paddingHorizontal: 6,
                                                        paddingVertical: 2,
                                                        borderRadius: 4,
                                                        borderWidth: 1,
                                                        borderColor: '#64B5F6' // Borda Azul
                                                    }}>
                                                        <Text style={{ fontSize: 10, color: '#1976D2', fontWeight: 'bold' }}>FUNCIONÁRIO</Text>
                                                    </View>
                                                )}

                                            </View>

                                            {/* 3. EMAIL */}
                                            <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                                                {item.email}
                                            </Text>

                                            {/* 4. STATUS */}
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                                                <View style={{
                                                    width: 6,
                                                    height: 6,
                                                    borderRadius: 3,
                                                    backgroundColor: item.status === 'ativo' ? '#4CD964' : '#FF9500'
                                                }} />
                                                <Text style={{
                                                    fontSize: 12,
                                                    color: item.status === 'ativo' ? '#4CD964' : '#FF9500',
                                                    fontWeight: '500'
                                                }}>
                                                    {item.status === 'ativo' ? 'Ativo' : 'Pendente (Convite Enviado)'}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>

                                            {/* Botão Coroa (Mudar Cargo) */}
                                            <TouchableOpacity onPress={() => toggleManagerRole(item)}>
                                                <MaterialCommunityIcons
                                                    name={item.role === 'gerente' ? "crown" : "crown-outline"}
                                                    size={24}
                                                    color={item.role === 'gerente' ? "#FFD700" : "#CCC"}
                                                />
                                            </TouchableOpacity>

                                            {/* Botão Remover */}
                                            <TouchableOpacity onPress={() => removeStaff(item.id)}>
                                                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            />
                        </View>
                    )}

                    {/* 4. ABA DEFINIÇÕES */}
                    {activeTab === 'definicoes' && (
                        <ScrollView
                            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.settingsCard}>
                                <Text style={styles.settingsSectionTitle}>Imagem de Capa</Text>
                                <TouchableOpacity onPress={pickCoverImage} style={styles.coverUploadBtn} activeOpacity={0.9} disabled={coverUploading}>
                                    {coverUploading ? (
                                        <ActivityIndicator color="#666" />
                                    ) : salonDetails.imagem ? (
                                        <>
                                            <Image source={{ uri: salonDetails.imagem }} style={styles.coverImagePreview} />
                                            <View style={styles.editIconBadge}>
                                                <Ionicons name="camera" size={16} color="white" />
                                            </View>
                                        </>
                                    ) : (
                                        <View style={styles.coverPlaceholder}>
                                            <Ionicons name="image-outline" size={40} color="#CCC" />
                                            <Text style={styles.coverPlaceholderText}>Adicionar Capa (16:9)</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>

                            <View style={styles.settingsCard}>
                                <Text style={styles.settingsSectionTitle}>Informação do Salão</Text>

                                <View style={styles.settingsInputGroup}>
                                    <Text style={styles.settingsInputLabel}>NOME DO SALÃO</Text>
                                    <View style={styles.settingsInputContainer}>
                                        <Ionicons name="business-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                        <TextInput
                                            style={styles.settingsInputField}
                                            value={salonDetails.nome_salao}
                                            onChangeText={(t) => setSalonDetails({ ...salonDetails, nome_salao: t })}
                                            placeholder="Ex: Barbearia Central"
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                </View>

                                <View style={styles.settingsInputGroup}>
                                    <Text style={styles.settingsInputLabel}>MORADA COMPLETA</Text>
                                    <View style={styles.settingsInputContainer}>
                                        <Ionicons name="location-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                        <TextInput
                                            style={styles.settingsInputField}
                                            value={salonDetails.morada}
                                            onChangeText={(t) => setSalonDetails({ ...salonDetails, morada: t })}
                                            placeholder="Rua Principal, nº 123"
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                </View>

                                <View style={styles.settingsInputGroup}>
                                    <Text style={styles.settingsInputLabel}>CIDADE</Text>
                                    <View style={styles.settingsInputContainer}>
                                        <Ionicons name="map-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                        <TextInput
                                            style={styles.settingsInputField}
                                            value={salonDetails.cidade}
                                            onChangeText={(t) => setSalonDetails({ ...salonDetails, cidade: t })}
                                            placeholder="Lisboa"
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                </View>

                                <View style={[styles.settingsInputGroup, { marginTop: 10 }]}>
                                    <Text style={styles.settingsInputLabel}>LOCALIZAÇÃO (GPS)</Text>
                                    <TouchableOpacity onPress={handleGetLocation} style={styles.locationBtn} activeOpacity={0.8} disabled={locationLoading}>
                                        {locationLoading ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <>
                                                <Ionicons name="location" size={20} color="white" />
                                                <Text style={styles.locationBtnText}>Obter Localização Atual</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    <View style={[styles.settingsInputGroup, { flex: 1 }]}>
                                        <Text style={styles.settingsInputLabel}>LATITUDE</Text>
                                        <View style={styles.settingsInputContainer}>
                                            <TextInput
                                                style={styles.settingsInputField}
                                                value={salonDetails.latitude ? String(salonDetails.latitude) : ''}
                                                onChangeText={(t) => setSalonDetails({ ...salonDetails, latitude: parseFloat(t) || null })}
                                                placeholder="0.0000"
                                                placeholderTextColor="#999"
                                                keyboardType="numeric"
                                            />
                                        </View>
                                    </View>
                                    <View style={[styles.settingsInputGroup, { flex: 1 }]}>
                                        <Text style={styles.settingsInputLabel}>LONGITUDE</Text>
                                        <View style={styles.settingsInputContainer}>
                                            <TextInput
                                                style={styles.settingsInputField}
                                                value={salonDetails.longitude ? String(salonDetails.longitude) : ''}
                                                onChangeText={(t) => setSalonDetails({ ...salonDetails, longitude: parseFloat(t) || null })}
                                                placeholder="0.0000"
                                                placeholderTextColor="#999"
                                                keyboardType="numeric"
                                            />
                                        </View>
                                    </View>
                                </View>

                            </View>


                            {/* ... dentro de app/manager.tsx ... */}

                            <View style={styles.settingsCard}>
                                <Text style={styles.settingsSectionTitle}>Operação & Público</Text>

                                {/* 1. INPUTS DE ABERTURA E FECHO */}
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    <View style={[styles.settingsInputGroup, { flex: 1 }]}>
                                        <Text style={styles.settingsInputLabel}>ABERTURA</Text>
                                        <TouchableOpacity onPress={() => openTimePicker('opening')} style={styles.settingsInputContainer}>
                                            <Ionicons name="sunny-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                            <Text style={[styles.settingsInputField, { paddingVertical: 14 }]}>
                                                {salonDetails.hora_abertura || '09:00'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={[styles.settingsInputGroup, { flex: 1 }]}>
                                        <Text style={styles.settingsInputLabel}>FECHO</Text>
                                        <TouchableOpacity onPress={() => openTimePicker('closing')} style={styles.settingsInputContainer}>
                                            <Ionicons name="moon-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                            <Text style={[styles.settingsInputField, { paddingVertical: 14 }]}>
                                                {salonDetails.hora_fecho || '19:00'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* 2. NOVO BLOCO: HORÁRIO DE ALMOÇO (LOGO ABAIXO) */}
                                <View style={[styles.settingsInputGroup, { marginTop: 16 }]}>
                                    <Text style={styles.settingsInputLabel}>HORA DE ALMOÇO (OPCIONAL)</Text>
                                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                                        {/* Início Almoço */}
                                        <View style={{ flex: 1 }}>
                                            <TouchableOpacity onPress={() => openTimePicker('lunchStart')} style={styles.settingsInputContainer}>
                                                <Ionicons name="restaurant-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                                <Text style={[styles.settingsInputField, { paddingVertical: 14 }]}>
                                                    {salonDetails.almoco_inicio || '--:--'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        <Text style={{ color: '#999', fontWeight: 'bold' }}>-</Text>

                                        {/* Fim Almoço */}
                                        <View style={{ flex: 1 }}>
                                            <TouchableOpacity onPress={() => openTimePicker('lunchEnd')} style={styles.settingsInputContainer}>
                                                <Ionicons name="restaurant-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                                <Text style={[styles.settingsInputField, { paddingVertical: 14 }]}>
                                                    {salonDetails.almoco_fim || '--:--'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {/* Botão de Apagar Almoço (Só aparece se houver horário definido) */}
                                        {(salonDetails.almoco_inicio || salonDetails.almoco_fim) && (
                                            <TouchableOpacity
                                                style={{ marginLeft: 5 }}
                                                onPress={() => setSalonDetails(prev => ({ ...prev, almoco_inicio: null, almoco_fim: null }))}
                                            >
                                                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>

                                {/* 3. LÓGICA DO RELÓGIO (Time Picker) */}
                                {activeTimePicker && (
                                    Platform.OS === 'ios' ? (
                                        <Modal visible={true} transparent animationType="fade">
                                            <View style={styles.modalOverlay}>
                                                <View style={styles.modalContent}>
                                                    <View style={styles.modalHeader}>
                                                        <TouchableOpacity onPress={() => setActiveTimePicker(null)}>
                                                            <Text style={{ color: '#666' }}>Cancelar</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={confirmIOSTime}>
                                                            <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Confirmar</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                    <DateTimePicker
                                                        value={tempTime}
                                                        mode="time"
                                                        display="spinner"
                                                        onChange={onTimeChange}
                                                        locale="pt-PT"
                                                        is24Hour={true}
                                                        themeVariant="light"
                                                        style={{ height: 200 }}
                                                    />
                                                </View>
                                            </View>
                                        </Modal>
                                    ) : (
                                        <DateTimePicker
                                            value={tempTime}
                                            mode="time"
                                            display="spinner"
                                            onChange={onTimeChange}
                                            is24Hour={true}
                                            themeVariant="light"
                                        />
                                    )
                                )}

                                {/* 4. INTERVALO ENTRE SERVIÇOS */}
                                <View style={[styles.settingsInputGroup, { marginTop: 16 }]}>
                                    <Text style={styles.settingsInputLabel}>INTERVALO ENTRE SERVIÇOS (MIN)</Text>
                                    <View style={styles.settingsInputContainer}>
                                        <Ionicons name="timer-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                        <TextInput
                                            style={styles.settingsInputField}
                                            value={salonDetails.intervalo_minutos ? String(salonDetails.intervalo_minutos) : ''}
                                            onChangeText={(t) => setSalonDetails({ ...salonDetails, intervalo_minutos: Number(t) })}
                                            placeholder="Ex: 30"
                                            placeholderTextColor="#999"
                                            keyboardType="numeric"
                                        />
                                    </View>
                                </View>

                                {/* 5. PÚBLICO ALVO */}
                                <View style={[styles.settingsInputGroup, { marginTop: 16 }]}>
                                    <Text style={styles.settingsInputLabel}>PÚBLICO ALVO</Text>
                                    <View style={styles.settingsSegmentContainer}>
                                        {['Homem', 'Mulher', 'Unissexo'].map((opt) => (
                                            <TouchableOpacity
                                                key={opt}
                                                style={[styles.settingsSegmentBtn, salonDetails.publico === opt && styles.settingsSegmentBtnActive]}
                                                onPress={() => setSalonDetails({ ...salonDetails, publico: opt })}
                                            >
                                                <Text style={[styles.settingsSegmentTxt, salonDetails.publico === opt && styles.settingsSegmentTxtActive]}>{opt}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                {/* 6. CATEGORIAS */}
                                <View style={[styles.settingsInputGroup, { marginTop: 16 }]}>
                                    <Text style={styles.settingsInputLabel}>CATEGORIA (Múltipla Escolha)</Text>
                                    <View style={[styles.settingsSegmentContainer, { flexWrap: 'wrap', justifyContent: 'center', gap: 8, padding: 8 }]}>
                                        {CATEGORIES.map((cat) => {
                                            const isSelected = salonDetails.categoria.includes(cat);
                                            return (
                                                <TouchableOpacity
                                                    key={cat}
                                                    style={[
                                                        styles.settingsSegmentBtn,
                                                        { minWidth: '45%', flex: 0 },
                                                        isSelected && styles.settingsSegmentBtnActive
                                                    ]}
                                                    onPress={() => {
                                                        setSalonDetails(prev => {
                                                            const currentCats = prev.categoria;
                                                            if (currentCats.includes(cat)) {
                                                                if (currentCats.length === 1) {
                                                                    Alert.alert("Aviso", "Tens de ter pelo menos uma categoria.");
                                                                    return prev;
                                                                }
                                                                return { ...prev, categoria: currentCats.filter(c => c !== cat) };
                                                            } else {
                                                                return { ...prev, categoria: [...currentCats, cat] };
                                                            }
                                                        });
                                                    }}
                                                >
                                                    <Text style={[
                                                        styles.settingsSegmentTxt,
                                                        isSelected && styles.settingsSegmentTxtActive
                                                    ]}>{cat}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                            </View>

                            {/* --- GESTÃO DE AUSÊNCIAS --- */}
                            <View style={styles.settingsCard}>
                                <Text style={styles.settingsSectionTitle}>Gestão de Ausências</Text>

                                {/* SELETOR DE MOTIVO */}
                                <Text style={styles.settingsInputLabel}>MOTIVO</Text>
                                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                                    {['Férias', 'Feriado', 'Manutenção'].map((opt) => (
                                        <TouchableOpacity
                                            key={opt}
                                            style={[
                                                styles.settingsSegmentBtn,
                                                newClosureReason === opt && styles.settingsSegmentBtnActive,
                                                { paddingVertical: 8 }
                                            ]}
                                            onPress={() => setNewClosureReason(opt)}
                                        >
                                            <Text style={[
                                                styles.settingsSegmentTxt,
                                                newClosureReason === opt && styles.settingsSegmentTxtActive
                                            ]}>{opt}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* LÓGICA DE DATAS: SE FERIADOS = 1 INPUT, SENÃO = 2 INPUTS */}
                                {newClosureReason === 'Feriado' ? (
                                    <View style={{ marginBottom: 15 }}>
                                        <Text style={styles.settingsInputLabel}>DIA</Text>
                                        <TouchableOpacity onPress={() => { setTempClosureDate(newClosureStart); setShowClosureStartPicker(true); }} style={styles.datePickerBtn}>
                                            <Text>{newClosureStart.toLocaleDateString()}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 15 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.settingsInputLabel}>DE</Text>
                                            <TouchableOpacity onPress={() => { setTempClosureDate(newClosureStart); setShowClosureStartPicker(true); }} style={styles.datePickerBtn}>
                                                <Text>{newClosureStart.toLocaleDateString()}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.settingsInputLabel}>ATÉ</Text>
                                            <TouchableOpacity onPress={() => { setTempClosureDate(newClosureEnd); setShowClosureEndPicker(true); }} style={styles.datePickerBtn}>
                                                <Text>{newClosureEnd.toLocaleDateString()}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {/* BOTÃO ADICIONAR (COR: PRETO) */}
                                <TouchableOpacity
                                    style={[styles.addClosureBtn, { backgroundColor: '#1A1A1A' }]}
                                    onPress={addClosure}
                                >
                                    <Ionicons name="add-circle" size={18} color="white" />
                                    <Text style={{ color: 'white', fontWeight: 'bold' }}>Adicionar Período</Text>
                                </TouchableOpacity>

                                {/* LISTA DE AUSÊNCIAS EXISTENTES */}
                                {closures.length > 0 && (
                                    <View style={{ marginTop: 15, borderTopWidth: 1, borderColor: '#EEE', paddingTop: 10 }}>
                                        <Text style={styles.settingsInputLabel}>PRÓXIMOS FECHOS</Text>
                                        {closures.map((c) => (
                                            <View key={c.id} style={styles.closureItem}>
                                                <View>
                                                    <Text style={{ fontWeight: '600', color: '#333' }}>{c.motivo}</Text>
                                                    <Text style={{ fontSize: 12, color: '#666' }}>
                                                        {new Date(c.start_date).toLocaleDateString()}
                                                        {c.start_date !== c.end_date ? ` - ${new Date(c.end_date).toLocaleDateString()}` : ''}
                                                    </Text>
                                                </View>
                                                <TouchableOpacity onPress={() => deleteClosure(c.id)}>
                                                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {/* MODAIS DOS DATE PICKERS (MANTIDO IGUAL) */}
                                {showClosureStartPicker && (Platform.OS === 'ios' ? (
                                    <Modal visible={true} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalContent}><View style={styles.modalHeader}><TouchableOpacity onPress={() => setShowClosureStartPicker(false)}><Text style={{ color: '#666' }}>Cancelar</Text></TouchableOpacity><TouchableOpacity onPress={() => confirmIOSClosureDate('start')}><Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Confirmar</Text></TouchableOpacity></View><DateTimePicker value={tempClosureDate} mode="date" display="spinner" onChange={(e, d) => onClosureDateChange(e, d, 'start')} style={{ height: 200 }} /></View></View></Modal>
                                ) : <DateTimePicker value={newClosureStart} mode="date" display="default" onChange={(e, d) => onClosureDateChange(e, d, 'start')} themeVariant="light" />)}

                                {showClosureEndPicker && (Platform.OS === 'ios' ? (
                                    <Modal visible={true} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalContent}><View style={styles.modalHeader}><TouchableOpacity onPress={() => setShowClosureEndPicker(false)}><Text style={{ color: '#666' }}>Cancelar</Text></TouchableOpacity><TouchableOpacity onPress={() => confirmIOSClosureDate('end')}><Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Confirmar</Text></TouchableOpacity></View><DateTimePicker value={tempClosureDate} mode="date" display="spinner" onChange={(e, d) => onClosureDateChange(e, d, 'end')} style={{ height: 200 }} /></View></View></Modal>
                                ) : <DateTimePicker value={newClosureEnd} mode="date" display="default" onChange={(e, d) => onClosureDateChange(e, d, 'end')} themeVariant="light" />)}
                            </View>

                            {/* BOTÃO COM COR ALTERADA PARA VERDE */}
                            <TouchableOpacity style={styles.settingsSaveButtonFull} onPress={saveSettings} activeOpacity={0.8}>
                                <Text style={styles.settingsSaveButtonText}>Guardar Alterações</Text>
                                <Ionicons name="checkmark-circle" size={22} color="white" />
                            </TouchableOpacity>

                        </ScrollView>
                    )}

                    {/* MODAL FULLSCREEN PARA VER IMAGEM COM DESCRIÇÃO */}
                    <Modal
                        visible={fullImageIndex !== null}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={() => setFullImageIndex(null)}
                    >
                        <View style={styles.fullScreenContainer}>
                            {/* Botão Fechar */}
                            <TouchableOpacity style={styles.closeButton} onPress={() => setFullImageIndex(null)}>
                                <Ionicons name="close-circle" size={40} color="white" />
                            </TouchableOpacity>

                            {/* Contador (Ex: 1 / 10) */}
                            {fullImageIndex !== null && (
                                <Text style={styles.counterText}>
                                    {fullImageIndex + 1} / {portfolio.length}
                                </Text>
                            )}

                            {/* Lista Horizontal (Slide) */}
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
                                        <Image
                                            source={{ uri: item.image_url }}
                                            style={styles.fullScreenImage}
                                            resizeMode="contain"
                                        />

                                        {/* Descrição */}
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

                </KeyboardAvoidingView>
                {/* --- MODAL PARA ADICIONAR DESCRIÇÃO (UPLOAD) --- */}
                <Modal
                    visible={uploadModalVisible}
                    transparent={true}
                    animationType="slide"
                    onRequestClose={() => setUploadModalVisible(false)}
                >
                    {/* --- ALTERAÇÃO: Usar KeyboardAvoidingView em vez de View --- */}
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.modalOverlay}
                    >
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Nova Publicação</Text>

                            {tempImageUri && (
                                <Image
                                    source={{ uri: tempImageUri }}
                                    style={{ width: '100%', height: 250, borderRadius: 12, marginBottom: 15 }}
                                    resizeMode="cover"
                                />
                            )}

                            <Text style={styles.label}>Descrição (Opcional)</Text>
                            <TextInput
                                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                                placeholder="Ex: Corte degradê com acabamento natural..."
                                value={newImageDescription}
                                onChangeText={setNewImageDescription}
                                multiline
                                maxLength={150}
                            />

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                <TouchableOpacity
                                    style={[styles.addServiceBtn, { backgroundColor: '#EEE', flex: 1 }]}
                                    onPress={() => setUploadModalVisible(false)}
                                >
                                    <Text style={[styles.addServiceBtnText, { color: '#666' }]}>Cancelar</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.addServiceBtn, { flex: 1 }]}
                                    onPress={confirmUpload}
                                >
                                    <Text style={styles.addServiceBtnText}>Publicar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Header
    header: {
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 20 : 15,
        paddingBottom: 10,
        backgroundColor: '#FFF',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10
    },
    headerSubtitle: { fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600', marginBottom: 2 },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },

    notificationBtn: {
        width: 44, height: 44,
        borderRadius: 22,
        backgroundColor: '#F5F7FA',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#EEE',
        position: 'relative'
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#FF3B30',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 1.5,
        borderColor: '#FFF'
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold'
    },

    avatarContainer: {
        width: 44, height: 44,
        borderRadius: 22,
        backgroundColor: '#F5F7FA',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#EEE',
        overflow: 'hidden'
    },
    headerAvatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: 22
    },

    // Menu Tabs
    menuContainer: {
        backgroundColor: '#FFF',
        paddingBottom: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4,
        zIndex: 9
    },
    menuScroll: { paddingHorizontal: 20, gap: 10 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F5F7FA' },
    menuItemActive: { backgroundColor: '#1A1A1A' },
    menuText: { fontSize: 14, fontWeight: '600', color: '#666' },
    menuTextActive: { color: '#FFF' },

    // Stats
    statsSummary: { flexDirection: 'row', backgroundColor: 'white', margin: 20, padding: 15, borderRadius: 12, justifyContent: 'space-around', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.03, elevation: 1 },
    statItem: { alignItems: 'center' },
    statLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 2 },
    statNumber: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    verticalDivider: { width: 1, height: 30, backgroundColor: '#EEE' },

    // Filtros
    filterContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, gap: 10, marginBottom: 15 },
    filterTab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0E0E0' },
    filterTabActive: { backgroundColor: '#333', borderColor: '#333' },
    filterTabText: { fontSize: 13, fontWeight: '600', color: '#666' },

    // Date Control
    dateControl: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginBottom: 10, padding: 5, backgroundColor: 'white', borderRadius: 8 },
    dateDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dateLabelSmall: { fontSize: 10, color: '#999', textTransform: 'uppercase' },
    dateText: { fontWeight: '600', textTransform: 'capitalize' },
    arrowBtn: { padding: 8 },

    // Timeline Rows
    timelineRow: { flexDirection: 'row', paddingHorizontal: 20 },
    timeColumn: { width: 50, alignItems: 'flex-end', paddingTop: 16, paddingRight: 10 },
    timeText: { fontSize: 13, fontWeight: '600', color: '#999' },
    lineColumn: { width: 20, alignItems: 'center' },
    timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 20, zIndex: 2, borderWidth: 2, borderColor: '#F8F9FA' },
    timelineLine: { width: 2, backgroundColor: '#E0E0E0', flex: 1, position: 'absolute', top: 20, bottom: -20 },
    contentColumn: { flex: 1, paddingBottom: 15 },

    // Cards
    timelineCard: {
        backgroundColor: 'white',
        padding: 15,
        borderRadius: 12,
        flexDirection: 'column',
        marginTop: 5,
        shadowColor: '#000', shadowOpacity: 0.03, elevation: 1
    },

    // Header Row (Nome + Badge)
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },

    // Body Row (Info + Actions)
    cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    infoColumn: { flex: 1 },

    clientName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    serviceDetail: { fontSize: 14, color: '#666', marginTop: 2 },
    priceTag: { fontSize: 14, fontWeight: 'bold', color: '#007AFF', marginTop: 4 },

    // Unified Status Badge
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusBadgeText: { fontSize: 10, fontWeight: 'bold' },

    // Ações
    actionColumn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    miniBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    // Utilitários
    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { color: '#CCC', marginTop: 10 },

    // --- ESTILOS DA GALERIA ---
    galleryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
    },
    gallerySubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2
    },
    uploadBtnCompact: {
        backgroundColor: '#1A1A1A',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 30,
        gap: 6,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2
    },
    uploadBtnDisabled: {
        opacity: 0.7
    },
    uploadBtnText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 13
    },
    galleryCard: {
        flex: 1,
        aspectRatio: 1,
        borderRadius: 16,
        backgroundColor: 'white',
        position: 'relative',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
        overflow: 'hidden',
        marginBottom: 12,
    },
    galleryImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    deleteButtonCircle: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3
    },
    emptyGalleryContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
        paddingHorizontal: 40,
    },
    emptyIconBg: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0F0F0',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20
    },
    emptyTitle: {
        fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8
    },
    galleryEmptyText: {
        textAlign: 'center', color: '#999', lineHeight: 20, marginBottom: 25
    },
    emptyActionBtn: {
        paddingVertical: 12, paddingHorizontal: 24,
        borderRadius: 12, borderWidth: 1, borderColor: '#DDD',
        backgroundColor: 'white'
    },
    emptyActionText: {
        fontWeight: '600', color: '#333'
    },

    // --- ESTILOS DE SERVIÇOS ---
    tabHeader: { padding: 20, paddingBottom: 10 },
    sectionSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },

    addServiceForm: {
        marginHorizontal: 20, marginBottom: 15,
        backgroundColor: 'white', borderRadius: 16, padding: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    formTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    inputRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
    inputWrapper: { flex: 1, position: 'relative', justifyContent: 'center' },
    inputStyled: {
        backgroundColor: '#F5F7FA', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, paddingLeft: 40,
        fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#EEE'
    },
    inputIcon: { position: 'absolute', left: 10, zIndex: 1 },
    currencyPrefix: { position: 'absolute', left: 12, zIndex: 1, fontSize: 16, fontWeight: 'bold', color: '#999' },

    addServiceBtn: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    addServiceBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

    // Controlos da Lista (Contador + Botão Organizar)
    listControlRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 25,
        paddingBottom: 5,
        marginBottom: 10
    },
    listCountText: { fontSize: 12, fontWeight: '600', color: '#999', textTransform: 'uppercase' },
    reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#EEE' },
    reorderBtnActive: { backgroundColor: '#333' },
    reorderBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },

    serviceCard: {
        backgroundColor: 'white', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15, marginBottom: 10,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.03, elevation: 1
    },
    serviceCardName: { fontSize: 15, fontWeight: '600', color: '#333', lineHeight: 20 },

    serviceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    priceBadge: {
        backgroundColor: '#F0F9F4', paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 8, borderWidth: 1, borderColor: '#E8F5E9', marginRight: 5
    },
    priceBadgeText: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },

    actionButtonsContainer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionBtn: { padding: 5 },

    // --- ESTILOS ORIGINAIS (MANTIDOS PARA COMPATIBILIDADE) ---
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    label: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 5 },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginBottom: 20,
        textAlign: 'center'
    },
    input: { backgroundColor: '#F5F7FA', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#EEE' },
    segment: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#EEE', alignItems: 'center' },
    segmentActive: { backgroundColor: '#333' },
    segmentText: { fontSize: 12, fontWeight: '600', color: '#666' },
    saveBtn: { backgroundColor: '#4CD964', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // --- ESTILOS DA NOVA ABA DEFINIÇÕES (RENOMEADOS PARA EVITAR CONFLITOS) ---
    settingsHeaderTitle: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5 },
    settingsHeaderSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },

    settingsCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3
    },
    settingsSectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 20 },

    settingsInputGroup: { marginBottom: 16 },
    settingsInputLabel: { fontSize: 11, fontWeight: '700', color: '#999', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

    settingsInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F7FA', borderRadius: 12, borderWidth: 1, borderColor: '#EEE' },
    settingsInputIcon: { paddingLeft: 12 },
    settingsInputField: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: '#333', fontWeight: '500' },

    settingsSegmentContainer: { flexDirection: 'row', backgroundColor: '#F5F7FA', padding: 4, borderRadius: 12, borderWidth: 1, borderColor: '#EEE' },
    settingsSegmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    settingsSegmentBtnActive: { backgroundColor: '#1A1A1A', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    settingsSegmentTxt: { fontSize: 13, fontWeight: '600', color: '#999' },
    settingsSegmentTxtActive: { color: 'white' },

    settingsSaveButtonFull: {
        backgroundColor: '#4CD964', // <--- MUDADO PARA VERDE
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
        paddingVertical: 18, borderRadius: 16,
        marginTop: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
    },
    settingsSaveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

    // Estilos Imagem de Capa
    coverUploadBtn: {
        height: 180,
        backgroundColor: '#F5F7FA',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#EEE',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
    },
    coverPlaceholder: { alignItems: 'center', gap: 8 },
    coverPlaceholderText: { fontSize: 14, color: '#999', fontWeight: '600' },
    coverImagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
    editIconBadge: {
        position: 'absolute', bottom: 10, right: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 8, borderRadius: 20
    },

    // Estilos de Localização
    locationBtn: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        paddingVertical: 14,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12
    },
    locationBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
    coordsContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#EEE' },
    coordsText: { fontSize: 12, color: '#555', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    coordsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    coordsBadgeText: { fontSize: 10, color: '#2E7D32', fontWeight: 'bold' },
    coordsEmpty: { fontSize: 13, color: '#999', textAlign: 'center', fontStyle: 'italic' },

    // Modais e Utilitários Gerais
    fullScreenContainer: { flex: 1, backgroundColor: 'black', justifyContent: 'center' },
    fullScreenImage: { width: '100%', height: '100%' },
    closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 99 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
    modalContent: { backgroundColor: 'white', width: '90%', borderRadius: 15, padding: 20, alignSelf: 'center' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },

    // --- ESTILOS ADICIONAIS PARA FECHOS ---
    datePickerBtn: { backgroundColor: '#F5F7FA', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#EEE', alignItems: 'center' },

    addClosureBtn: {
        backgroundColor: '#1A1A1A', // <--- MUDADO PARA PRETO
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8, padding: 12,
        borderRadius: 10
    },

    closureItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F7FA' },

    // --- NOVOS ESTILOS PARA DESCRIÇÃO ---
    descriptionOverlay: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: 15,
        borderRadius: 12,
    },
    descriptionText: {
        color: 'white',
        fontSize: 14,
        textAlign: 'center',
        fontWeight: '500'
    },
    counterText: {
        position: 'absolute',
        top: 60,
        alignSelf: 'center',
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        zIndex: 998
    },
    galleryListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 10,
        marginBottom: 10,
        borderRadius: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1
    },
    galleryListImage: {
        width: 50,
        height: 50,
        borderRadius: 8,
        backgroundColor: '#f0f0f0'
    },
    galleryListTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333'
    }
});