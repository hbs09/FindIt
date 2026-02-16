import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';


const PENDING_COLOR = '#FF9500'; // Laranja
const PRIMARY_COLOR = '#111';

export default function SuccessScreen() {
    const router = useRouter();

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
                    {/* FRASE REMOVIDA AQUI */}
                    
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

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: 'white',
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
        backgroundColor: '#FFF8E1', 
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    title: { 
        fontSize: 26,
        fontWeight: '800', 
        color: '#1A1A1A', 
        marginBottom: 16, 
        textAlign: 'center',
        letterSpacing: -0.5
    },
    textContainer: {
        alignItems: 'center',
        maxWidth: 320,
    },
    subMessage: { 
        fontSize: 16, // Aumentei ligeiramente (de 15 para 16)
        color: '#555', // Escureci um pouco (de #777 para #555) para melhor leitura
        textAlign: 'center', 
        lineHeight: 24, 
    },
    footer: {
        width: '100%',
        gap: 12,
        paddingBottom: 20, 
    },
    btn: { 
        backgroundColor: PRIMARY_COLOR, 
        paddingVertical: 16, 
        borderRadius: 16, 
        width: '100%', 
        alignItems: 'center',
        shadowColor: PRIMARY_COLOR,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3
    },
    btnText: { 
        color: 'white', 
        fontWeight: '700', 
        fontSize: 16 
    },
    secondaryBtn: {
        paddingVertical: 12, 
        width: '100%',
        alignItems: 'center',
    },
    secondaryBtnText: {
        color: '#888', 
        fontWeight: '600', 
        fontSize: 15
    }
});