import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react'; // <--- O useMemo vem daqui!
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const PENDING_COLOR = '#FF9500'; // Laranja mantido estático pois é uma cor de marca/estado

export default function SuccessScreen() {
    const router = useRouter();

    // 1. Hook de Tema
    const { colors, isDarkMode } = useTheme();
    // 2. Estilos Dinâmicos
    const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                
                {/* Ícone */}
                <View style={styles.iconContainer}>
                    <Ionicons name="time" size={84} color={PENDING_COLOR} />
                </View>

                {/* Título */}
                <Text style={styles.title}>Aguardando Confirmação</Text>
                
                {/* Container de Texto */}
                <View style={styles.textContainer}>
                    <Text style={styles.subMessage}>
                        O salão irá validar a disponibilidade do horário e receberás uma notificação assim que for aceite.
                    </Text>
                </View>

            </View>
            
            <View style={styles.footer}>
                <TouchableOpacity 
                    style={styles.btn} 
                    activeOpacity={0.8}
                    onPress={() => {
                        router.dismissAll();
                        router.push('/profile');
                    }}
                >
                    <Text style={styles.btnText}>Ver Agendamentos</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.secondaryBtn} 
                    onPress={() => router.dismissAll()}
                >
                    <Text style={styles.secondaryBtnText}>Voltar ao Início</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// 3. Função Dinâmica de Estilos
const createStyles = (colors: any, isDarkMode: boolean) => StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: colors.bg,
        paddingHorizontal: 24,
        paddingVertical: 20
    },
    content: {
        flex: 1,
        justifyContent: 'center', 
        alignItems: 'center',
        marginTop: -40, 
    },
    iconContainer: {
        width: 130,
        height: 130,
        borderRadius: 65,
        // No dark mode fica um laranja escuro muito suave, no claro fica o amarelo creme antigo
        backgroundColor: isDarkMode ? 'rgba(255, 149, 0, 0.15)' : '#FFF8E1', 
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    title: { 
        fontSize: 26,
        fontWeight: '800', 
        color: colors.text, 
        marginBottom: 16, 
        textAlign: 'center',
        letterSpacing: -0.5
    },
    textContainer: {
        alignItems: 'center',
        maxWidth: 320,
    },
    subMessage: { 
        fontSize: 16, 
        color: colors.subText, 
        textAlign: 'center', 
        lineHeight: 24, 
    },
    footer: {
        width: '100%',
        gap: 12,
        paddingBottom: 20, 
    },
    btn: { 
        backgroundColor: colors.text, // Usa o texto como fundo (no dark mode o botão fica branco)
        paddingVertical: 16, 
        borderRadius: 16, 
        width: '100%', 
        alignItems: 'center',
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3
    },
    btnText: { 
        color: colors.bg, // O texto do botão fica sempre com a cor do ecrã (perfeito contraste)
        fontWeight: '700', 
        fontSize: 16 
    },
    secondaryBtn: {
        paddingVertical: 12, 
        width: '100%',
        alignItems: 'center',
    },
    secondaryBtnText: {
        color: colors.subText, 
        fontWeight: '600', 
        fontSize: 15
    }
});