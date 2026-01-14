import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { supabase } from '../../supabase';

// [IMAGEM DE CONTEXTO: Mobile Map UI - Standard Pins]

type Salao = {
  id: number;
  nome_salao: string;
  cidade: string;
  latitude: number;
  longitude: number;
  imagem: string | null;
  categoria: string;
};

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Alturas do Bottom Sheet
const HEIGHT_FULL = SCREEN_HEIGHT * 0.8;
const HEIGHT_MEDIUM = SCREEN_HEIGHT * 0.45;
const HEIGHT_CLOSED = 0;

const BTN_SIZE = 50;

// --- ESTILO DO MAPA (Limpo/Minimalista) ---
const mapStyle = [
  { "featureType": "poi", "elementType": "labels.text", "stylers": [{ "visibility": "off" }] },
  { "featureType": "poi.business", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] }
];

export default function MapScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [cidadePesquisa, setCidadePesquisa] = useState('');
  
  const [sheetState, setSheetState] = useState<'closed' | 'collapsed' | 'expanded'>('closed');
  const [selectedSalonId, setSelectedSalonId] = useState<number | null>(null);
  const [showSearchAreaBtn, setShowSearchAreaBtn] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);

  const animatedHeight = useRef(new Animated.Value(HEIGHT_CLOSED)).current;

  // 1. Ocultar TabBar quando o painel está expandido
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
      duration: 350,
      useNativeDriver: false,
      easing: Easing.out(Easing.poly(4)), 
    }).start();
  }, [sheetState]);

  const estadoAtualRef = useRef(sheetState);
  useEffect(() => { estadoAtualRef.current = sheetState; }, [sheetState]);

  // 3. Gestos do Bottom Sheet
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (e, gestureState) => {
        const dy = gestureState.dy; 
        const vy = gestureState.vy;
        const estadoAtual = estadoAtualRef.current; 

        if (dy > 60 || vy > 0.6) {
          if (estadoAtual === 'expanded') setSheetState('collapsed');
          else if (estadoAtual === 'collapsed') {
             setSheetState('closed');
             setSelectedSalonId(null);
             Keyboard.dismiss();
          }
        } 
        else if (dy < -60 || vy < -0.6) {
          if (estadoAtual === 'collapsed') setSheetState('expanded');
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
        const region = {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
        };
        mapRef.current?.animateToRegion(region);
        setCurrentRegion(region);
      }
      buscarSaloes(); 
    })();
  }, []);

  async function buscarSaloes(overrideCity?: string) {
    Keyboard.dismiss();
    setShowSearchAreaBtn(false);
    
    let query = supabase
      .from('salons')
      .select('id, nome_salao, cidade, latitude, longitude, imagem, categoria')
      .not('latitude', 'is', null);

    const termo = overrideCity !== undefined ? overrideCity : cidadePesquisa;

    if (termo.trim().length > 0) {
      query = query.ilike('cidade', `%${termo}%`);
    } else if (currentRegion && !termo) {
        // Busca pela região visível
        const minLat = currentRegion.latitude - currentRegion.latitudeDelta / 2;
        const maxLat = currentRegion.latitude + currentRegion.latitudeDelta / 2;
        const minLon = currentRegion.longitude - currentRegion.longitudeDelta / 2;
        const maxLon = currentRegion.longitude + currentRegion.longitudeDelta / 2;
        
        query = query
            .gte('latitude', minLat).lte('latitude', maxLat)
            .gte('longitude', minLon).lte('longitude', maxLon);
    }

    const { data, error } = await query;

    if (!error && data) {
      setSaloes(data as Salao[]);
      if (data.length > 0) {
          if (termo.length > 0) {
            setSheetState('collapsed');
            mapRef.current?.animateToRegion({
                latitude: data[0].latitude,
                longitude: data[0].longitude,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
            });
          }
      } else {
         if (termo.length > 0) Alert.alert("Ups", "Nenhum salão encontrado nesta cidade.");
      }
    }
  }

  function handleRegionChangeComplete(region: Region) {
      setCurrentRegion(region);
      if (!location) return;
      
      const latDiff = Math.abs(region.latitude - (currentRegion?.latitude || 0));
      const lonDiff = Math.abs(region.longitude - (currentRegion?.longitude || 0));
      
      if (latDiff > region.latitudeDelta * 0.1 || lonDiff > region.longitudeDelta * 0.1) {
          setShowSearchAreaBtn(true);
      }
  }

  function centerOnUser() {
      if (location) {
          const region = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
          };
          mapRef.current?.animateToRegion(region);
          setCurrentRegion(region);
          setShowSearchAreaBtn(false);
      }
  }

  return (
    <View style={styles.container}>
      
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        customMapStyle={mapStyle}
        initialRegion={{
          latitude: 38.7253, longitude: -9.1500,
          latitudeDelta: 0.1, longitudeDelta: 0.1,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={() => {
            setSheetState('closed');
            setSelectedSalonId(null);
            Keyboard.dismiss();
        }}
      >
        {saloes.map((salao) => (
          <Marker
            key={salao.id}
            coordinate={{ latitude: salao.latitude, longitude: salao.longitude }}
            onPress={() => {
                setSelectedSalonId(salao.id);
                setSheetState('collapsed');
            }}
            // Pinos Normais (Standard)
            // Preto (#1a1a1a) quando normal, Azul (#007AFF) quando selecionado
            pinColor={selectedSalonId === salao.id ? '#007AFF' : '#1a1a1a'}
            tracksViewChanges={false} 
          />
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
              onSubmitEditing={() => buscarSaloes(cidadePesquisa)}
            />
            {cidadePesquisa.length > 0 && (
                <TouchableOpacity onPress={() => {
                    setCidadePesquisa('');
                    buscarSaloes('');
                }}>
                   <Ionicons name="close-circle" size={18} color="#ccc" />
                </TouchableOpacity>
            )}
        </View>
      </View>

      {/* --- BOTÃO "PESQUISAR NESTA ÁREA" --- */}
      {showSearchAreaBtn && (
          <View style={styles.searchAreaContainer}>
              <TouchableOpacity 
                style={styles.searchAreaBtn} 
                activeOpacity={0.8}
                onPress={() => {
                    setCidadePesquisa('');
                    buscarSaloes(''); 
                }}
              >
                  <Ionicons name="refresh" size={16} color="white" style={{marginRight: 6}} />
                  <Text style={styles.searchAreaText}>Pesquisar nesta área</Text>
              </TouchableOpacity>
          </View>
      )}

      {/* --- CONTROLOS FLUTUANTES --- */}
      <View style={styles.controlsContainer}>
          <TouchableOpacity style={styles.circleBtn} onPress={centerOnUser}>
              <Ionicons name="locate" size={24} color="#1a1a1a" />
          </TouchableOpacity>

          {sheetState === 'closed' && saloes.length > 0 && (
            <TouchableOpacity 
                style={styles.listPillBtn} 
                onPress={() => setSheetState('collapsed')} 
            >
                <Ionicons name="list" size={18} color="white" />
                <Text style={styles.listPillText}>Lista</Text>
            </TouchableOpacity>
          )}
      </View>

      {/* --- BOTTOM SHEET (PAINEL) --- */}
      <Animated.View style={[
          styles.bottomSheet, 
          { height: animatedHeight } 
      ]}>
            
            <View style={styles.sheetHeader} {...panResponder.panHandlers}>
                <View style={styles.handleIndicator} />
                <Text style={styles.sheetTitle}>
                    {saloes.length} {saloes.length === 1 ? 'resultado' : 'resultados'} encontrados
                </Text>
            </View>

            <FlatList
              data={saloes}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{padding: 20, paddingBottom: 50}} 
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.card, selectedSalonId === item.id && styles.cardSelected]} 
                  onPress={() => router.push(`/salon/${item.id}`)}
                  activeOpacity={0.9}
                >
                  <Image 
                    source={{ uri: item.imagem || 'https://via.placeholder.com/150' }} 
                    style={styles.cardImage} 
                  />

                  <View style={styles.cardContent}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.nome_salao}</Text>
                        <Ionicons name="chevron-forward" size={18} color="#ccc" />
                    </View>
                    
                    <View style={styles.badgeRow}>
                         <View style={styles.categoryBadge}>
                             <Text style={styles.categoryBadgeText}>{item.categoria}</Text>
                         </View>
                    </View>

                    <View style={styles.locationRow}>
                        <Ionicons name="location-sharp" size={14} color="#888" />
                        <Text style={styles.cardLocation} numberOfLines={1}>{item.cidade}</Text>
                    </View>
                  </View>
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

  // --- SEARCH BAR ---
  topSearchContainer: {
    position: 'absolute', top: Platform.OS === 'ios' ? 60 : 50,
    width: '100%', paddingHorizontal: 20, zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row', backgroundColor: 'white', borderRadius: 25,
    paddingHorizontal: 16, height: BTN_SIZE, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5,
  },
  input: { flex: 1, fontSize: 15, color: '#1a1a1a', marginRight: 10 },

  // --- SEARCH AREA BUTTON ---
  searchAreaContainer: { 
      position: 'absolute', top: 115, width: '100%', alignItems: 'center', zIndex: 9 
  },
  searchAreaBtn: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: '#1a1a1a', // Preto
      paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6
  },
  searchAreaText: { fontWeight: '600', color: 'white', fontSize: 13 },

  // --- CONTROLS ---
  controlsContainer: {
      position: 'absolute', right: 20, bottom: 120,
      alignItems: 'flex-end', gap: 15, zIndex: 10,
  },
  circleBtn: {
      width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE/2, backgroundColor: 'white',
      justifyContent: 'center', alignItems: 'center',
      shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.15, shadowRadius:5, elevation:4
  },
  listPillBtn: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
      paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, gap: 8,
      shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity:0.3, shadowRadius:5, elevation:6
  },
  listPillText: { color: 'white', fontWeight: '600', fontSize: 14 },

  // --- BOTTOM SHEET ---
  bottomSheet: {
    position: 'absolute', bottom: 0, width: '100%',
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, elevation: 20,
    zIndex: 20, overflow: 'hidden',
  },
  sheetHeader: {
    alignItems: 'center', paddingVertical: 15, backgroundColor: 'white',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  handleIndicator: {
    width: 40, height: 5, backgroundColor: '#e0e0e0', borderRadius: 3, marginBottom: 8,
  },
  sheetTitle: { fontWeight: '600', fontSize: 13, color: '#999' },
  
  // --- CARDS ---
  card: {
    flexDirection: 'row', backgroundColor: 'white', borderRadius: 16,
    marginBottom: 12, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: 'transparent'
  },
  cardSelected: {
    borderColor: '#1a1a1a',
    borderWidth: 1.5
  },
  cardImage: {
    width: 80, height: 80, borderRadius: 12, backgroundColor: '#f0f0f0',
  },
  cardContent: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  
  badgeRow: { flexDirection: 'row', marginBottom: 6 },
  categoryBadge: { backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }, 
  categoryBadgeText: { fontSize: 11, color: '#333', fontWeight: '600' }, 

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardLocation: { fontSize: 13, color: '#666' },
});