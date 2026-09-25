import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  StatusBar,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';

const COLORS = {
  bg: '#090d16',
  panel: '#111725',
  panel2: '#171e2e',
  border: '#263047',
  text: '#f8fafc',
  muted: '#8ea0be',
  purple: '#8b5cf6',
  purple2: '#6d3bd1',
};

const SUPABASE_URL = 'https://zndlradxdcpfrrxirswy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__RU-9-tCv4jTLaovhNg25A_1WqQsiFy';
const SPOTIFY_SEARCH_URL = `${SUPABASE_URL}/functions/v1/spotify-search`;

const MOCK_SONGS = [
  { id: '1', title: 'Make It Wit Chu', artist: 'Queens of the Stone Age', album: 'Era Vulgaris', year: '2007', cover: '💗', tags: ['Baixo', 'Bateria'] },
  { id: '2', title: 'Come Together', artist: 'The Beatles', album: 'Abbey Road', year: '1969', cover: '🛣️', tags: ['Guitarra', 'Baixo'] },
  { id: '3', title: 'Like a Stone', artist: 'Audioslave', album: 'Audioslave', year: '2002', cover: '🔥', tags: ['Guitarra', 'Baixo', 'Bateria'] },
  { id: '4', title: 'Dunas', artist: 'GNR', album: 'Os Homens Não Se Querem Bonitos', year: '1985', cover: '🌊', tags: ['Letra'] },
  { id: '5', title: 'White Wedding', artist: 'Billy Idol', album: 'Billy Idol', year: '1982', cover: '⚡', tags: ['Guitarra'] },
  { id: '6', title: 'Smoke on the Water', artist: 'Deep Purple', album: 'Machine Head', year: '1972', cover: '🌫️', tags: ['Guitarra', 'Baixo'] },
];

function SongCover({ song, large = false }) {
  const imageUrl = song.image || song.thumbnail;
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={large ? styles.coverImageLarge : styles.coverImageSmall}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={large ? styles.coverLargeFallback : styles.coverSmallFallback}>
      <Text style={large ? styles.coverEmoji : styles.coverSmallEmoji}>{song.cover || '♫'}</Text>
    </View>
  );
}

function TabButton({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SongDetail({ song, onBack }) {
  const [tab, setTab] = useState('Letra');
  const { width } = useWindowDimensions();
  const tablet = width >= 760;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.detailWrap}>
        <TouchableOpacity onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹  Voltar</Text>
        </TouchableOpacity>

        <View style={[styles.hero, tablet && styles.heroTablet]}>
          <View style={[styles.coverLarge, tablet && styles.coverLargeTablet]}>
            <SongCover song={song} large />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.detailTitle}>{song.title}</Text>
            <Text style={styles.detailArtist}>{song.artist}</Text>
            <Text style={styles.meta}>
              {song.album || 'Álbum desconhecido'}{song.year ? ` · ${song.year}` : ''}
            </Text>
            {song.spotifyUrl ? <Text style={styles.sourceText}>Fonte: Spotify</Text> : null}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>♡ Favoritar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>✎ Editar</Text></TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.stageBar}>
          <Text style={styles.stageText}>▶ Scroll automático</Text>
          <Text style={styles.stageText}>1x</Text>
          <Text style={styles.stageText}>Texto  26px</Text>
          <Text style={styles.stageText}>⛶ Modo palco</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {['Letra', 'Cifra', 'Guitarra', 'Baixo', 'Bateria', 'Teclas', 'Notas'].map((item) => (
            <TabButton key={item} label={item} active={tab === item} onPress={() => setTab(item)} />
          ))}
        </ScrollView>

        <View style={styles.contentCard}>
          <View style={styles.contentHeader}>
            <View>
              <Text style={styles.contentTitle}>{tab}</Text>
              <Text style={styles.contentSub}>Conteúdo da música</Text>
            </View>
            <TouchableOpacity style={styles.primarySmall}><Text style={styles.primaryText}>+ Adicionar</Text></TouchableOpacity>
          </View>

          {tab === 'Cifra' ? (
            <View>
              <View style={styles.keyRow}>
                <Text style={styles.keyText}>Tom original: C</Text>
                <TouchableOpacity style={styles.keyButton}><Text style={styles.keyText}>−</Text></TouchableOpacity>
                <TouchableOpacity style={styles.keyButton}><Text style={styles.keyText}>+</Text></TouchableOpacity>
              </View>
              <Text style={styles.chord}>C                 G</Text>
              <Text style={styles.lyric}>Come together, right now</Text>
              <Text style={styles.chord}>Am               F</Text>
              <Text style={styles.lyric}>Over me...</Text>
            </View>
          ) : (
            <View>
              <Text style={styles.emptyTitle}>Ainda não existe conteúdo em {tab.toLowerCase()}.</Text>
              <Text style={styles.emptyText}>Poderás adicionar texto, uma pauta, PDF, imagem ou uma versão específica para o teu instrumento.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AddSong({ onClose, onAdd }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  async function searchSpotify(searchText = query) {
    const q = searchText.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${SPOTIFY_SEARCH_URL}?q=${encodeURIComponent(q)}&limit=10&market=PT`,
        {
          method: 'GET',
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Accept: 'application/json',
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível pesquisar no Spotify.');
      }

      setResults(data.tracks || []);
      setSearched(true);
    } catch (err) {
      setResults([]);
      setSearched(true);
      setError(err?.message || 'Erro na pesquisa. Tenta novamente.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const q = query.trim();

    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setError('');
      return undefined;
    }

    const timer = setTimeout(() => {
      searchSpotify(q);
    }, 550);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topLine}>
          <TouchableOpacity onPress={onClose}><Text style={styles.backText}>‹ Voltar</Text></TouchableOpacity>
          <Text style={styles.screenTitle}>Adicionar música</Text>
          <View style={{ width: 55 }} />
        </View>

        <Text style={styles.sectionLead}>Pesquisa no Spotify</Text>
        <Text style={styles.sectionDescription}>Pesquisa por título, artista ou ambos. Os resultados vêm do catálogo oficial do Spotify.</Text>

        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => searchSpotify()}
            returnKeyType="search"
            autoCorrect={false}
            placeholder="Ex.: Make It Wit Chu, QOTSA..."
            placeholderTextColor={COLORS.muted}
            style={[styles.searchInput, styles.searchInputGrow]}
          />
          <TouchableOpacity style={styles.searchButton} onPress={() => searchSpotify()}>
            <Text style={styles.primaryText}>Pesquisar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchStatusRow}>
          <Text style={styles.resultLabel}>Resultados</Text>
          <Text style={styles.spotifyLabel}>Spotify</Text>
        </View>

        {loading ? (
          <View style={styles.feedbackBox}>
            <ActivityIndicator />
            <Text style={styles.feedbackText}>A pesquisar no catálogo Spotify…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Não foi possível pesquisar</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => searchSpotify()}>
              <Text style={styles.secondaryButtonText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : searched && results.length === 0 ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>Não foram encontrados resultados. Experimenta título + artista.</Text>
          </View>
        ) : !searched ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>Escreve pelo menos 2 caracteres para começar a pesquisa.</Text>
          </View>
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.searchResultsList}
          renderItem={({ item }) => (
            <View style={styles.resultCard}>
              <View style={styles.coverSmall}>
                <SongCover song={item} />
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.songArtist} numberOfLines={1}>{item.artist}</Text>
                <Text style={styles.songMeta} numberOfLines={1}>
                  {item.album || 'Álbum desconhecido'}{item.year ? ` · ${item.year}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addCircle}
                onPress={() => onAdd({ ...item, cover: '♫', tags: [] })}
              >
                <Text style={styles.addCircleText}>+</Text>
              </TouchableOpacity>
            </View>
          )}
        />

        <TouchableOpacity style={styles.manualButton}>
          <Text style={styles.secondaryButtonText}>✎ Criar música manualmente</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const tablet = width >= 760;
  const [songs, setSongs] = useState(MOCK_SONGS);
  const [screen, setScreen] = useState('songs');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => songs.filter((s) => (s.title + ' ' + s.artist).toLowerCase().includes(query.toLowerCase())),
    [songs, query]
  );

  if (screen === 'add') {
    return (
      <AddSong
        onClose={() => setScreen('songs')}
        onAdd={(song) => {
          const normalized = {
            ...song,
            id: song.id || String(Date.now()),
            tags: song.tags || [],
          };

          setSongs((prev) =>
            prev.some((x) => x.id === normalized.id || (x.title === normalized.title && x.artist === normalized.artist))
              ? prev
              : [normalized, ...prev]
          );
          setSelected(normalized);
          setScreen('detail');
        }}
      />
    );
  }

  if (screen === 'detail' && selected) {
    return <SongDetail song={selected} onBack={() => setScreen('songs')} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.appShell, tablet && styles.appShellTablet]}>
        {tablet && (
          <View style={styles.sidebar}>
            <Text style={styles.logo}>◉  Bonus Track</Text>
            <Text style={styles.navCaption}>PRINCIPAL</Text>
            {['⌂  Dashboard', '♫  Músicas', '☷  Playlists', '♬  Tabs', '▣  Ensaios', '★  Concertos', '♡  Favoritos'].map((item, i) => (
              <View key={item} style={[styles.sideItem, i === 1 && styles.sideItemActive]}>
                <Text style={[styles.sideText, i === 1 && styles.sideTextActive]}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.main}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Músicas</Text>
              <Text style={styles.subtitle}>{songs.length} músicas na biblioteca</Text>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('add')}>
              <Text style={styles.primaryText}>＋ Adicionar</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Pesquisar título, artista..."
            placeholderTextColor={COLORS.muted}
            style={styles.searchInput}
          />

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.songRow} onPress={() => { setSelected(item); setScreen('detail'); }}>
                <View style={styles.coverSmall}>
                  <SongCover song={item} />
                </View>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle}>{item.title}</Text>
                  <Text style={styles.songArtist}>{item.artist}</Text>
                  {!!item.tags?.length && <Text style={styles.songTags}>{item.tags.join('  ·  ')}</Text>}
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />

          {!tablet && (
            <View style={styles.bottomNav}>
              <Text style={styles.bottomItem}>⌂{'\\n'}Início</Text>
              <Text style={[styles.bottomItem, styles.bottomActive]}>♫{'\\n'}Músicas</Text>
              <Text style={styles.bottomItem}>☷{'\\n'}Setlists</Text>
              <Text style={styles.bottomItem}>♡{'\\n'}Favoritos</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  appShell: { flex: 1 },
  appShellTablet: { flexDirection: 'row' },
  sidebar: { width: 220, backgroundColor: '#070b12', borderRightWidth: 1, borderRightColor: COLORS.border, padding: 18 },
  logo: { color: COLORS.text, fontWeight: '800', fontSize: 18, marginBottom: 34 },
  navCaption: { color: COLORS.muted, fontSize: 11, marginBottom: 10 },
  sideItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  sideItemActive: { backgroundColor: '#38235f', borderWidth: 1, borderColor: COLORS.purple2 },
  sideText: { color: '#d8e0ee', fontSize: 14 },
  sideTextActive: { color: '#c7a7ff', fontWeight: '700' },
  main: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  primaryButton: { backgroundColor: COLORS.purple, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  primarySmall: { backgroundColor: COLORS.purple, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 },
  primaryText: { color: 'white', fontWeight: '800' },
  searchInput: { backgroundColor: COLORS.panel2, color: COLORS.text, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 15, paddingVertical: 13, fontSize: 15, marginBottom: 12 },
  searchInputGrow: { flex: 1, marginBottom: 0 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch', marginBottom: 10 },
  searchButton: { backgroundColor: COLORS.purple, borderRadius: 12, paddingHorizontal: 15, justifyContent: 'center' },
  searchStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  spotifyLabel: { color: '#1ed760', fontWeight: '800', fontSize: 12 },
  list: { paddingBottom: 100 },
  searchResultsList: { paddingBottom: 12 },
  songRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#121a28' },
  coverSmall: { width: 50, height: 50, borderRadius: 10, backgroundColor: COLORS.panel2, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  coverImageSmall: { width: 50, height: 50 },
  coverSmallFallback: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  coverSmallEmoji: { fontSize: 24 },
  songInfo: { flex: 1 },
  songTitle: { color: COLORS.text, fontWeight: '750', fontSize: 15 },
  songArtist: { color: COLORS.muted, marginTop: 2, fontSize: 13 },
  songMeta: { color: '#70829f', marginTop: 2, fontSize: 12 },
  songTags: { color: '#a98af8', marginTop: 4, fontSize: 11 },
  chevron: { color: COLORS.muted, fontSize: 28, paddingHorizontal: 8 },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 72, flexDirection: 'row', backgroundColor: '#0d1320', borderTopWidth: 1, borderTopColor: COLORS.border, justifyContent: 'space-around', alignItems: 'center' },
  bottomItem: { color: COLORS.muted, textAlign: 'center', fontSize: 12, lineHeight: 19 },
  bottomActive: { color: '#b99cff', fontWeight: '800' },

  screen: { flex: 1, padding: 20 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  back: { marginBottom: 22 },
  backText: { color: '#9eb0ce', fontSize: 14 },
  screenTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  sectionLead: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: 5 },
  sectionDescription: { color: COLORS.muted, fontSize: 14, marginBottom: 18 },
  resultLabel: { color: COLORS.muted, fontSize: 12, textTransform: 'uppercase', marginVertical: 8 },
  resultCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 10, marginBottom: 9 },
  resultInfo: { flex: 1 },
  addCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.purple, alignItems: 'center', justifyContent: 'center' },
  addCircleText: { color: 'white', fontSize: 24, lineHeight: 26 },
  manualButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, marginTop: 6, alignItems: 'center' },
  secondaryButtonText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  feedbackBox: { minHeight: 82, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 10, marginBottom: 10 },
  feedbackText: { color: COLORS.muted, textAlign: 'center' },
  errorBox: { borderWidth: 1, borderColor: '#713b50', backgroundColor: '#24141b', borderRadius: 14, padding: 15, marginBottom: 10 },
  errorTitle: { color: '#ffd5df', fontWeight: '800', marginBottom: 5 },
  errorText: { color: '#d9a8b5', lineHeight: 19 },
  retryButton: { marginTop: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },

  detailWrap: { padding: 20, paddingBottom: 50, maxWidth: 1050, width: '100%', alignSelf: 'center' },
  hero: { gap: 16, marginBottom: 20 },
  heroTablet: { flexDirection: 'row', alignItems: 'center' },
  coverLarge: { width: 160, height: 160, borderRadius: 18, backgroundColor: '#2a1a43', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverLargeTablet: { width: 190, height: 190 },
  coverImageLarge: { width: '100%', height: '100%' },
  coverLargeFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  coverEmoji: { fontSize: 76 },
  heroInfo: { flex: 1 },
  detailTitle: { color: COLORS.text, fontSize: 30, fontWeight: '900' },
  detailArtist: { color: '#a2b3ce', fontSize: 17, marginTop: 5 },
  meta: { color: COLORS.muted, marginTop: 6 },
  sourceText: { color: '#1ed760', marginTop: 7, fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap' },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 13 },
  stageBar: { backgroundColor: COLORS.panel2, borderRadius: 13, padding: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 22, marginBottom: 16 },
  stageText: { color: '#a8b7cf', fontSize: 13 },
  tabs: { gap: 8, paddingBottom: 14 },
  tabButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel },
  tabButtonActive: { backgroundColor: COLORS.purple2, borderColor: COLORS.purple },
  tabText: { color: COLORS.muted, fontWeight: '700' },
  tabTextActive: { color: 'white' },
  contentCard: { minHeight: 270, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel, borderRadius: 16, padding: 18 },
  contentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 },
  contentTitle: { color: COLORS.text, fontWeight: '850', fontSize: 18 },
  contentSub: { color: COLORS.muted, marginTop: 3 },
  emptyTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: COLORS.muted, lineHeight: 21, maxWidth: 650 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  keyText: { color: '#bba2ff', fontWeight: '800' },
  keyButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  chord: { color: '#b77cff', fontFamily: 'monospace', fontWeight: '800', fontSize: 17, marginTop: 8 },
  lyric: { color: COLORS.text, fontFamily: 'monospace', fontSize: 17, marginBottom: 12 },
});
