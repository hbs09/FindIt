import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '../../supabase';

// [IMAGEM DE CONTEXTO: Mobile Map UI Design]
// Diagrama mental: Mapa full-screen atrás, barra de pesquisa flutuante no topo, painel deslizante em baixo.

type Salao = {
  id: number;
  nome_salao: string;
  cidade: string;
  latitude: number;
  longitude: number;
  imagem: string | null;
  categoria: string; // Adicionado para contexto
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Alturas do Bottom Sheet
const HEIGHT_FULL = SCREEN_HEIGHT * 0.8;
const HEIGHT_MEDIUM = SCREEN_HEIGHT * 0.45; // Um pouco mais alto para ver mais info
const HEIGHT_CLOSED = 0;

// Estilo consistente com a Home
const BTN_SIZE = 50;

export default function MapScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [cidadePesquisa, setCidadePesquisa] = useState('');
  
  const [sheetState, setSheetState] = useState<'closed' | 'collapsed' | 'expanded'>('closed');
  
  const animatedHeight = useRef(new Animated.Value(HEIGHT_CLOSED)).current;

  // 1. Ocultar TabBar quando o painel está expandido/colapsado
  useEffect(() => {
    const shouldHideTabBar = sheetState !== 'closed';
    navigation.setOptions({
        tabBarStyle: { display: shouldHideTabBar ? 'none' : 'flex' }
    });
  }, [sheetState, navigation]);

  // 2. Animação do Bottom Sheet
  useEffect(() => {
    let targetHeight = HEIGHT_CLOSED;
    if (sheetState === 'collapsed') targetHeight = HEIGHT_MEDIUM;
    else if (sheetState === 'expanded') targetHeight = HEIGHT_FULL;

    Animated.timing(animatedHeight, {
      toValue: targetHeight,
      duration: 300,
      useNativeDriver: false,
      easing: Easing.out(Easing.quad),
    }).start();
  }, [sheetState]);

  const estadoAtualRef = useRef(sheetState);
  useEffect(() => { estadoAtualRef.current = sheetState; }, [sheetState]);

  // 3. Gestos do Bottom Sheet (PanResponder)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      onPanResponderRelease: (e, gestureState) => {
        const dy = gestureState.dy; 
        const vy = gestureState.vy;
        const estadoAtual = estadoAtualRef.current; 

        // Lógica de arrastar para fechar/abrir
        if (dy > 50 || vy > 0.5) {
          if (estadoAtual === 'expanded') setSheetState('collapsed');
          else if (estadoAtual === 'collapsed') setSheetState('closed');
        } 
        else if (dy < -50 || vy < -0.5) {
          if (estadoAtual === 'collapsed') setSheetState('expanded');
        }
        else {
           // Se o movimento for pequeno, mantém ou alterna baseado no toque
           if (Math.abs(dy) < 10) {
              if (estadoAtual === 'collapsed') setSheetState('expanded');
              else if (estadoAtual === 'expanded') setSheetState('collapsed');
           }
        }
      },
    })
  ).current;

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
        // Centrar no user se houver permissão
        mapRef.current?.animateToRegion({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
        });
      }
      buscarSaloes(false); 
    })();
  }, []);

  async function buscarSaloes(eUmaPesquisaDoUser = true) {
    Keyboard.dismiss();
    
    let query = supabase
      .from('salons')
      .select('id, nome_salao, cidade, latitude, longitude, imagem, categoria')
      .not('latitude', 'is', null);

    if (cidadePesquisa.trim().length > 0) {
      query = query.ilike('cidade', `%${cidadePesquisa}%`);
    }

    const { data, error } = await query;

    if (!error && data) {
      setSaloes(data as Salao[]);
      
      if (data.length > 0) {
        if (eUmaPesquisaDoUser && cidadePesquisa.length > 0) {
          // Se foi pesquisa, foca no primeiro e abre painel
          setSheetState('collapsed');
          mapRef.current?.animateToRegion({
            latitude: data[0].latitude,
            longitude: data[0].longitude,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          });
        }
      } else {
         if(eUmaPesquisaDoUser) setSheetState('closed');
      }
    }
  }

  function centerOnUser() {
      if (location) {
          mapRef.current?.animateToRegion({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
          });
      }
  }

  return (
    <View style={styles.container}>
      
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={{
          latitude: 38.7253, longitude: -9.1500,
          latitudeDelta: 0.1, longitudeDelta: 0.1,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false} // Vamos usar o nosso botão customizado
        onPress={() => {
            if (sheetState === 'expanded') setSheetState('collapsed');
            else if (sheetState === 'collapsed') setSheetState('closed');
            Keyboard.dismiss();
        }}
      >
        {saloes.map((salao) => (
          <Marker
            key={salao.id}
            coordinate={{ latitude: salao.latitude, longitude: salao.longitude }}
            onPress={() => {
                setSheetState('collapsed');
                // Opcional: Centrar no marker clicado
                mapRef.current?.animateToRegion({
                    latitude: salao.latitude,
                    longitude: salao.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                });
            }}
          >
            {/* Custom Marker Pin (Opcional, se quiseres mudar a cor podes usar pinColor) */}
          </Marker>
        ))}
      </MapView>

      {/* --- BARRA DE PESQUISA FLUTUANTE --- */}
      <View style={styles.topSearchContainer}>
        <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#666" style={{marginRight: 8}} />
            <TextInput 
              style={styles.input}
              placeholder="Pesquisar cidade..."
              placeholderTextColor="#999"
              value={cidadePesquisa}
              onChangeText={setCidadePesquisa}
              onSubmitEditing={() => buscarSaloes(true)}
            />
            {cidadePesquisa.length > 0 && (
                <TouchableOpacity onPress={() => {
                    setCidadePesquisa('');
                    setSheetState('closed');
                    buscarSaloes(false);
                }}>
                   <Ionicons name="close-circle" size={18} color="#ccc" />
                </TouchableOpacity>
            )}
        </View>
      </View>

      {/* --- BOTÃO DE LOCALIZAÇÃO E BOTÃO DE LISTA --- */}
      <View style={styles.controlsContainer}>
          {/* Botão Centrar */}
          <TouchableOpacity style={styles.circleBtn} onPress={centerOnUser}>
              <Ionicons name="locate" size={24} color="#1a1a1a" />
          </TouchableOpacity>

          {/* Botão Flutuante da Lista (Só aparece se houver salões e o painel estiver fechado) */}
          {sheetState === 'closed' && saloes.length > 0 && (
            <TouchableOpacity 
                style={styles.listPillBtn} 
                onPress={() => setSheetState('collapsed')} 
            >
                <Ionicons name="list" size={18} color="white" />
                <Text style={styles.listPillText}>Ver Lista ({saloes.length})</Text>
            </TouchableOpacity>
          )}
      </View>

      {/* --- BOTTOM SHEET (PAINEL) --- */}
      <Animated.View style={[
          styles.bottomSheet, 
          { height: animatedHeight } 
      ]}>
            
            {/* Header do Painel (Pega de arrastar) */}
            <View 
                style={styles.sheetHeader} 
                {...panResponder.panHandlers} 
            >
                <View style={styles.handleIndicator} />
                <Text style={styles.sheetTitle}>
                    {saloes.length} {saloes.length === 1 ? 'resultado' : 'resultados'} na área
                </Text>
            </View>

            <FlatList
              data={saloes}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{paddingBottom: 40}} 
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.listItem} 
                  onPress={() => router.push(`/salon/${item.id}`)}
                >
                  <Image 
                    source={{ uri: item.imagem || 'https://via.placeholder.com/100' }} 
                    style={styles.listImage} 
                  />

                  <View style={{flex: 1}}>
                    <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                        <Text style={styles.listName}>{item.nome_salao}</Text>
                        <Text style={styles.listCategory}>{item.categoria}</Text>
                    </View>
                    <View style={{flexDirection:'row', alignItems:'center', marginTop: 4, gap:4}}>
                        <Ionicons name="location-sharp" size={12} color="#666" />
                        <Text style={styles.listCity}>{item.cidade}</Text>
                    </View>
                  </View>
                  
                  <Ionicons name="chevron-forward" size={20} color="#e0e0e0" />
                </TouchableOpacity>
              )}
            />
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  map: { width: '100%', height: '100%' },

  // Barra de Pesquisa (Estilo Home)
  topSearchContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    width: '100%',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 25, // Redondo como na Home
    paddingHorizontal: 16,
    height: BTN_SIZE,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  input: { flex: 1, fontSize: 15, color: '#1a1a1a', marginRight: 10 },

  // Botões Laterais / Flutuantes
  controlsContainer: {
      position: 'absolute',
      right: 20,
      bottom: 110, // Acima da TabBar
      alignItems: 'flex-end',
      gap: 15,
      zIndex: 10,
  },
  circleBtn: {
      width: BTN_SIZE, height: BTN_SIZE,
      borderRadius: BTN_SIZE/2,
      backgroundColor: 'white',
      justifyContent: 'center', alignItems: 'center',
      shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.15, shadowRadius:5, elevation:4
  },
  listPillBtn: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: '#1a1a1a',
      paddingVertical: 12, paddingHorizontal: 20,
      borderRadius: 30,
      gap: 8,
      shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity:0.3, shadowRadius:5, elevation:6
  },
  listPillText: { color: 'white', fontWeight: '600', fontSize: 14 },

  // Bottom Sheet
  bottomSheet: {
    position: 'absolute', bottom: 0, width: '100%',
    backgroundColor: 'white',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, elevation: 20,
    zIndex: 20,
    overflow: 'hidden',
  },
  sheetHeader: {
    alignItems: 'center',
    paddingVertical: 12, 
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  handleIndicator: {
    width: 40, height: 5, 
    backgroundColor: '#e0e0e0', 
    borderRadius: 3, marginBottom: 10,
  },
  sheetTitle: { 
    fontWeight: '700', fontSize: 14, color: '#666' 
  },
  
  // Lista Items
  listItem: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#f7f7f7', gap: 15,
  },
  listImage: {
    width: 60, height: 60, borderRadius: 12, backgroundColor: '#f0f0f0',
  },
  listName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  listCategory: { fontSize: 11, color: '#999', backgroundColor:'#f5f5f5', paddingHorizontal:6, paddingVertical:2, borderRadius:6, overflow:'hidden'},
  listCity: { fontSize: 13, color: '#666' },
});