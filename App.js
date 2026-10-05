import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Linking,
  PanResponder,
  Animated,
  Modal,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';

const COLORS = {
  bg: '#090d16',
  panel: '#111725',
  panel2: '#171e2e',
  border: '#263047',
  text: '#f8fafc',
  muted: '#8ea0be',
  purple: '#8b5cf6',
  purple2: '#6d3bd1',
  success: '#35c98b',
  danger: '#ef8b9b',
};

const SUPABASE_URL = 'https://zndlradxdcpfrrxirswy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__RU-9-tCv4jTLaovhNg25A_1WqQsiFy';
const SPOTIFY_SEARCH_URL = `${SUPABASE_URL}/functions/v1/spotify-search`;
const LIBRARY_URL = `${SUPABASE_URL}/functions/v1/library`;
const TAB_SEARCH_URL = `${SUPABASE_URL}/functions/v1/tab-search`;

function normalizeSong(song) {
  if (!song) return null;
  return {
    ...song,
    spotifyId: song.spotify_id ?? song.spotifyId ?? song.id,
    year: song.release_year ?? song.year ?? null,
    image: song.image_url ?? song.image ?? null,
    thumbnail: song.thumbnail_url ?? song.thumbnail ?? null,
    durationMs: song.duration_ms ?? song.durationMs ?? null,
    spotifyUrl: song.spotify_url ?? song.spotifyUrl ?? null,
    youtubeUrl: song.youtube_url ?? song.youtubeUrl ?? null,
    customUrl: song.custom_url ?? song.customUrl ?? null,
    syncedLyrics: song.synced_lyrics ?? song.syncedLyrics ?? null,
    lyricsSource: song.lyrics_source ?? song.lyricsSource ?? null,
    lyricsSourceId: song.lyrics_source_id ?? song.lyricsSourceId ?? null,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestLibrary(url, options, fallbackMessage) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, options);
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok) return data || {};

      const message = data?.error || data?.message || fallbackMessage;
      lastError = new Error(message);

      if (![500, 502, 503, 504].includes(response.status)) {
        throw lastError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(fallbackMessage);
      if (attempt === 2) break;
    }

    if (attempt < 2) {
      await wait(700 * (attempt + 1));
    }
  }

  throw lastError || new Error(fallbackMessage);
}

async function libraryGet(action, extra = {}) {
  const params = new URLSearchParams({ action, ...extra });
  return requestLibrary(
    `${LIBRARY_URL}?${params.toString()}`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Accept: 'application/json',
      },
    },
    'Erro ao aceder à biblioteca.'
  );
}

async function libraryPost(action, payload = {}) {
  return requestLibrary(
    LIBRARY_URL,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ action, ...payload }),
    },
    'Erro ao atualizar a biblioteca.'
  );
}

function openExternalLink(url) {
  if (!url) return;
  const value = /^https?:\/\//i.test(url) ? url : 'https://' + url;
  Linking.openURL(value).catch(() => {});
}

function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SongCover({ song, large = false }) {
  const imageUrl = song?.image || song?.thumbnail;
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
      <Text style={large ? styles.coverEmoji : styles.coverSmallEmoji}>♫</Text>
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





function FullscreenStage({
  visible,
  title,
  subtitle,
  onClose,
  fontSize = 26,
  onFontSizeChange,
  autoScroll,
  onAutoScrollChange,
  speed = 1,
  onSpeedChange,
  fitToWidth = false,
  onFitToWidthChange,
  children,
}) {
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);
  const autoScrollRef = useRef(Boolean(autoScroll));

  useEffect(() => {
    autoScrollRef.current = Boolean(autoScroll);
  }, [autoScroll]);

  useEffect(() => {
    if (!visible) {
      autoScrollRef.current = false;
      scrollY.current = 0;
      return undefined;
    }

    if (!autoScroll) return undefined;

    autoScrollRef.current = true;

    const timer = setInterval(() => {
      if (!autoScrollRef.current) return;

      const maxY = Math.max(0, contentHeight.current - viewportHeight.current);
      if (maxY <= 0) return;

      const next = Math.min(maxY, scrollY.current + Math.max(0.5, Number(speed || 1)));
      scrollY.current = next;
      scrollRef.current?.scrollTo?.({ y: next, animated: false });

      if (next >= maxY) {
        autoScrollRef.current = false;
        onAutoScrollChange?.(false);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [visible, autoScroll, speed]);

  const speeds = [0.5, 1, 1.5, 2];

  function toggleAutoScroll() {
    const next = !autoScrollRef.current;
    autoScrollRef.current = next;
    onAutoScrollChange?.(next);
  }

  function cycleSpeed() {
    const currentIndex = speeds.findIndex((value) => value === speed);
    const next = speeds[(currentIndex + 1) % speeds.length] || 1;
    onSpeedChange?.(next);
  }

  function changeFont(delta) {
    if (fitToWidth && onFitToWidthChange) {
      onFitToWidthChange(false);
    }
    const next = Math.max(8, Math.min(44, fontSize + delta));
    onFontSizeChange?.(next);
  }

  function goToStart() {
    autoScrollRef.current = false;
    onAutoScrollChange?.(false);
    scrollY.current = 0;
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.stageSafe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.stageHeader}>
          <TouchableOpacity style={styles.stageCloseButton} onPress={onClose}>
            <Text style={styles.stageCloseText}>‹ Sair</Text>
          </TouchableOpacity>

          <View style={styles.stageHeaderCenter}>
            <Text style={styles.stageTitle} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.stageSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>

          <View style={styles.stageHeaderSpacer} />
        </View>

        <View style={styles.stageControls}>
          <TouchableOpacity
            style={[styles.stageControlButton, autoScroll && styles.stageControlButtonActive]}
            onPress={toggleAutoScroll}
          >
            <Text style={styles.stageControlText}>{autoScroll ? '❚❚ Pausar' : '▶ Auto scroll'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.stageControlButton} onPress={cycleSpeed}>
            <Text style={styles.stageControlText}>{speed}x</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.stageControlButton}
            onPress={() => changeFont(-2)}
          >
            <Text style={styles.stageControlText}>A−</Text>
          </TouchableOpacity>

          <View style={styles.stageFontPill}>
            <Text style={styles.stageFontText}>{fontSize}px</Text>
          </View>

          <TouchableOpacity
            style={styles.stageControlButton}
            onPress={() => changeFont(2)}
          >
            <Text style={styles.stageControlText}>A＋</Text>
          </TouchableOpacity>

          {onFitToWidthChange ? (
            <TouchableOpacity
              style={[styles.stageControlButton, fitToWidth && styles.stageControlButtonActive]}
              onPress={() => onFitToWidthChange?.(!fitToWidth)}
            >
              <Text style={styles.stageControlText}>{fitToWidth ? '✓ Ajustado' : '↔ Ajustar'}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.stageControlButton}
            onPress={goToStart}
          >
            <Text style={styles.stageControlText}>↑ Início</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.stageScroll}
          contentContainerStyle={styles.stageScrollContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={(_, height) => { contentHeight.current = height; }}
          onLayout={(event) => { viewportHeight.current = event.nativeEvent.layout.height; }}
          onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}
          onScrollBeginDrag={() => {
            if (autoScrollRef.current) {
              autoScrollRef.current = false;
              onAutoScrollChange?.(false);
            }
          }}
          scrollEventThrottle={16}
        >
          {children}
          <View style={styles.stageBottomSpace} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const INSTRUMENT_TAB_CONFIG = {
  bass: {
    key: 'bass',
    label: 'Baixo',
    icon: '🎸',
    defaultRows: 4,
    rowOptions: [4, 5, 6],
    rowCountLabel: 'Número de cordas',
    cellMode: 'number',
    defaultLabels: {
      4: ['G', 'D', 'A', 'E'],
      5: ['G', 'D', 'A', 'E', 'B'],
      6: ['C', 'G', 'D', 'A', 'E', 'B'],
    },
  },
  guitar: {
    key: 'guitar',
    label: 'Guitarra',
    icon: '🎸',
    defaultRows: 6,
    rowOptions: [6, 7, 8],
    rowCountLabel: 'Número de cordas',
    cellMode: 'number',
    defaultLabels: {
      6: ['e', 'B', 'G', 'D', 'A', 'E'],
      7: ['e', 'B', 'G', 'D', 'A', 'E', 'B'],
      8: ['e', 'B', 'G', 'D', 'A', 'E', 'B', 'F#'],
    },
  },
  drums: {
    key: 'drums',
    label: 'Bateria',
    icon: '🥁',
    defaultRows: 8,
    rowOptions: [6, 8, 10],
    rowCountLabel: 'Peças / linhas',
    cellMode: 'drum',
    defaultLabels: {
      6: ['HH', 'Crash', 'Ride', 'Snare', 'Tom', 'Kick'],
      8: ['HH', 'Crash', 'Ride', 'T1', 'T2', 'FT', 'Snare', 'Kick'],
      10: ['HH', 'Crash', 'Ride', 'China', 'T1', 'T2', 'T3', 'FT', 'Snare', 'Kick'],
    },
    drumValues: ['', 'x', 'o', 'g', 'f'],
  },
  keys: {
    key: 'keys',
    label: 'Teclas',
    icon: '🎹',
    defaultRows: 2,
    rowOptions: [2, 3],
    rowCountLabel: 'Linhas',
    cellMode: 'text',
    defaultLabels: {
      2: ['MD', 'ME'],
      3: ['Acordes', 'MD', 'ME'],
    },
  },
};

function InstrumentTabPanel({ song, instrument }) {
  const GRID_COLUMNS = 18;
  const config = INSTRUMENT_TAB_CONFIG[instrument] || INSTRUMENT_TAB_CONFIG.bass;
  const { width } = useWindowDimensions();
  const tablet = width >= 760;

  const [savedTabs, setSavedTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [savedLoading, setSavedLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [myTab, setMyTab] = useState(null);
  const [principalTab, setPrincipalTab] = useState(null);
  const [savingContent, setSavingContent] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [stageVisible, setStageVisible] = useState(false);
  const [stageFontSize, setStageFontSize] = useState(26);
  const [stageAutoScroll, setStageAutoScroll] = useState(false);
  const [stageSpeed, setStageSpeed] = useState(1);
  const [stageFitToWidth, setStageFitToWidth] = useState(true);

  const [tabTitle, setTabTitle] = useState('');
  const [rowCount, setRowCount] = useState(config.defaultRows);
  const [editorMode, setEditorMode] = useState('visual');
  const [isPublic, setIsPublic] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [customTab, setCustomTab] = useState('');

  function emptyRows(count) {
    return Array.from({ length: count }, () => Array.from({ length: GRID_COLUMNS }, () => ''));
  }

  function newBlock(name, count) {
    return {
      id: String(Date.now()) + '-' + String(Math.floor(Math.random() * 100000)),
      name: name || 'Bloco',
      type: 'visual-block',
      cells: emptyRows(count),
    };
  }

  function rowLabels(count, tuningLabel) {
    if ((instrument === 'bass' || instrument === 'guitar') && tuningLabel) {
      const parsed = tuningLabel
        .split('·')
        .map((item) => item.trim().replace(/[0-9]/g, ''))
        .filter(Boolean);
      if (parsed.length === count) return parsed.reverse();
    }
    return config.defaultLabels[count] || Array.from({ length: count }, (_, index) => String(index + 1));
  }

  function normalizeBlocks(tab, count) {
    const incoming = Array.isArray(tab?.sections) ? tab.sections : [];
    const visual = incoming.filter((section) => section?.type === 'visual-block' || Array.isArray(section?.cells));

    if (!visual.length) return [newBlock('Bloco 1', count)];

    return visual.map((block, index) => {
      const rows = Array.from({ length: count }, (_, rowIndex) => {
        const sourceRow = Array.isArray(block?.cells?.[rowIndex]) ? block.cells[rowIndex] : [];
        return Array.from({ length: GRID_COLUMNS }, (_, colIndex) => String(sourceRow[colIndex] ?? ''));
      });

      return {
        id: block.id || ('block-' + index),
        name: block.name || ('Bloco ' + (index + 1)),
        type: 'visual-block',
        cells: rows,
      };
    });
  }

  function hydrateEditor(tab) {
    const allowed = config.rowOptions;
    const stored = Number(tab?.string_count || config.defaultRows);
    const safeCount = allowed.includes(stored) ? stored : config.defaultRows;
    setTabTitle(tab?.title || ((song.title || 'Tab') + ' - ' + config.label));
    setRowCount(safeCount);
    setEditorMode(tab?.editor_mode === 'text' ? 'text' : 'visual');
    setIsPublic(Boolean(tab?.is_public));
    setBlocks(normalizeBlocks(tab, safeCount));
    setCustomTab(tab?.custom_tab || '');
  }

  function hasStoredUserContent(tab) {
    if (!tab) return false;
    if (tab.source === 'Manual') return true;
    if (tab.editor_mode === 'text' && tab.custom_tab?.trim()) return true;
    if (tab.custom_tab?.trim()) return true;
    return Array.isArray(tab.sections)
      && tab.sections.some((block) => block?.type === 'visual-block' || Array.isArray(block?.cells));
  }

  function isSongsterrTab(tab) {
    return tab?.source === 'Songsterr' && Boolean(tab?.source_url);
  }

  async function loadSavedTabs(preferredId = null) {
    setSavedLoading(true);
    setError('');
    try {
      const data = await libraryGet('tabs', { songId: song.id, instrument: config.key });
      const tabs = data.tabs || [];
      setSavedTabs(tabs);

      const principal = tabs.find((item) => isSongsterrTab(item) && item.is_primary)
        || tabs.find((item) => isSongsterrTab(item))
        || null;

      const own = tabs.find((item) => item.source === 'Manual')
        || tabs.find((item) => hasStoredUserContent(item) && !isSongsterrTab(item))
        || tabs.find((item) => item.id === preferredId && !isSongsterrTab(item))
        || null;

      setPrincipalTab(principal);
      setMyTab(own);
      setActiveTab(own);
      if (own) hydrateEditor(own);
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar a tab.');
    } finally {
      setSavedLoading(false);
    }
  }

  async function searchPrincipal() {
    setSearching(true);
    setError('');
    try {
      const q = song.artist + ' ' + song.title;
      const response = await fetch(
        TAB_SEARCH_URL + '?q=' + encodeURIComponent(q) + '&instrument=' + encodeURIComponent(config.key),
        {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Accept: 'application/json',
          },
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível localizar a versão principal.');

      const firstResult = (data.results || [])[0];
      const firstTrack = firstResult?.tracks?.[0];

      if (firstResult && firstTrack) {
        const saved = await libraryPost('save_tab_reference', {
          songId: song.id,
          instrument: config.key,
          result: firstResult,
          track: firstTrack,
        });
        await loadSavedTabs(saved.tab?.id || null);
      }

      setSearched(true);
    } catch (err) {
      setSearched(true);
      setError(err?.message || 'Não foi possível localizar a versão principal.');
    } finally {
      setSearching(false);
    }
  }

  function resizeRows(nextCount) {
    setRowCount(nextCount);
    setBlocks((prev) => prev.map((block) => {
      const nextCells = Array.from({ length: nextCount }, (_, rowIndex) => {
        const existing = Array.isArray(block.cells?.[rowIndex]) ? block.cells[rowIndex] : [];
        return Array.from({ length: GRID_COLUMNS }, (_, colIndex) => String(existing[colIndex] ?? ''));
      });
      return { ...block, cells: nextCells };
    }));
  }

  function updateBlockName(blockIndex, name) {
    setBlocks((prev) => prev.map((block, index) => index === blockIndex ? { ...block, name } : block));
  }

  function cleanCellValue(value) {
    if (config.cellMode === 'number') {
      if (instrument === 'bass') return value.replace(/[^0-9/]/g, '').slice(0, 5);
      return value.replace(/[^0-9]/g, '').slice(0, 2);
    }
    if (config.cellMode === 'text') return value.slice(0, 6);
    return value;
  }

  function updateCell(blockIndex, rowIndex, colIndex, value) {
    const clean = cleanCellValue(value);
    setBlocks((prev) => prev.map((block, index) => {
      if (index !== blockIndex) return block;
      const cells = block.cells.map((row, r) => {
        if (r !== rowIndex) return row;
        return row.map((cell, col) => col === colIndex ? clean : cell);
      });
      return { ...block, cells };
    }));
  }

  function cycleDrumCell(blockIndex, rowIndex, colIndex) {
    const values = config.drumValues || ['', 'x', 'o'];
    setBlocks((prev) => prev.map((block, index) => {
      if (index !== blockIndex) return block;
      const cells = block.cells.map((row, r) => {
        if (r !== rowIndex) return row;
        return row.map((cell, col) => {
          if (col !== colIndex) return cell;
          const current = values.indexOf(String(cell || ''));
          return values[(current + 1) % values.length];
        });
      });
      return { ...block, cells };
    }));
  }

  function clearBlock(blockIndex) {
    setBlocks((prev) => prev.map((block, index) =>
      index === blockIndex ? { ...block, cells: emptyRows(rowCount) } : block
    ));
  }

  function removeBlock(blockIndex) {
    setBlocks((prev) => prev.filter((_, index) => index !== blockIndex));
  }

  function addBlock() {
    setBlocks((prev) => [...prev, newBlock('Bloco ' + (prev.length + 1), rowCount)]);
  }

  async function createOwnTab() {
    setError('');
    setSavedMessage('');
    try {
      let tab = myTab;
      if (!tab) {
        const data = await libraryPost('create_manual_tab', {
          songId: song.id,
          instrument: config.key,
        });
        tab = data.tab;
        setSavedTabs((prev) => prev.some((item) => item.id === tab.id) ? prev : [tab, ...prev]);
        setMyTab(tab);
      }
      setActiveTab(tab);
      hydrateEditor(tab);
      setShowSource(false);
      setEditing(true);
    } catch (err) {
      setError(err?.message || 'Não foi possível criar a tua tab.');
    }
  }

  async function saveOwnTab() {
    if (!activeTab) return;
    setSavingContent(true);
    setError('');
    setSavedMessage('');
    try {
      const data = await libraryPost('save_tab_content', {
        tabId: activeTab.id,
        title: tabTitle,
        stringCount: rowCount,
        isPublic,
        editorMode,
        sections: blocks,
        customTab,
      });
      setActiveTab(data.tab);
      setMyTab(data.tab);
      setSavedTabs((prev) => prev.map((item) => item.id === data.tab.id ? data.tab : item));
      hydrateEditor(data.tab);
      setEditing(false);
      setShowSource(false);
      setSavedMessage('A tua tab ficou guardada.');
    } catch (err) {
      setError(err?.message || 'Não foi possível guardar a tua tab.');
    } finally {
      setSavingContent(false);
    }
  }

  function renderGrid(block, blockIndex, editable) {
    const labels = rowLabels(rowCount, principalTab?.tuning_label || activeTab?.tuning_label);

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.visualGridScroll}>
        <View>
          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <View key={'row-' + rowIndex} style={styles.visualGridRow}>
              <Text style={[styles.stringLabel, config.cellMode !== 'number' && styles.instrumentRowLabel]}>
                {labels[rowIndex] || ''}
              </Text>
              <Text style={styles.stringDivider}>|</Text>

              {Array.from({ length: GRID_COLUMNS }, (_, colIndex) => {
                const value = block.cells?.[rowIndex]?.[colIndex] || '';

                if (!editable) {
                  return (
                    <View key={'cell-' + rowIndex + '-' + colIndex} style={[styles.fretCellView, value ? styles.fretCellFilled : null, config.cellMode === 'text' && styles.noteCell]}>
                      <Text style={value ? styles.fretCellTextFilled : styles.fretCellTextEmpty}>{value || '–'}</Text>
                    </View>
                  );
                }

                if (config.cellMode === 'drum') {
                  return (
                    <TouchableOpacity
                      key={'cell-' + rowIndex + '-' + colIndex}
                      style={[styles.fretCellView, value ? styles.fretCellFilled : null]}
                      onPress={() => cycleDrumCell(blockIndex, rowIndex, colIndex)}
                    >
                      <Text style={value ? styles.fretCellTextFilled : styles.fretCellTextEmpty}>{value || '–'}</Text>
                    </TouchableOpacity>
                  );
                }

                return (
                  <TextInput
                    key={'cell-' + rowIndex + '-' + colIndex}
                    value={value}
                    onChangeText={(text) => updateCell(blockIndex, rowIndex, colIndex, text)}
                    keyboardType={config.cellMode === 'number' && instrument !== 'bass' ? 'number-pad' : 'default'}
                    autoCapitalize={config.cellMode === 'text' ? 'characters' : 'none'}
                    autoCorrect={false}
                    maxLength={config.cellMode === 'number' ? (instrument === 'bass' ? 5 : 2) : 6}
                    selectTextOnFocus
                    style={[styles.fretCell, value ? styles.fretCellFilled : null, config.cellMode === 'text' && styles.noteCell]}
                    placeholder="–"
                    placeholderTextColor="#56627a"
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }


  function renderStageGrid(block, blockIndex) {
    const count = config.rowOptions.includes(Number(myTab?.string_count))
      ? Number(myTab.string_count)
      : config.defaultRows;
    const labels = rowLabels(count, principalTab?.tuning_label || myTab?.tuning_label);
    const stageContentWidth = Math.max(240, Math.min(width, 1400) - 24);
    const labelWidth = config.cellMode === 'number' ? 34 : 66;
    const dividerWidth = 18;
    const gapWidth = GRID_COLUMNS * 2;
    const fittedWidth = Math.max(
      12,
      Math.floor((stageContentWidth - labelWidth - dividerWidth - gapWidth) / GRID_COLUMNS)
    );
    const cellWidth = stageFitToWidth ? fittedWidth : Math.max(20, stageFontSize + 10);
    const effectiveFontSize = stageFitToWidth
      ? Math.max(8, Math.min(stageFontSize, fittedWidth - 3))
      : stageFontSize;
    const cellHeight = stageFitToWidth
      ? Math.max(20, effectiveFontSize + 8)
      : Math.max(24, stageFontSize + 8);

    return (
      <View key={block.id || String(blockIndex)} style={styles.stageTabBlock}>
        <Text style={[styles.stageTabBlockTitle, { fontSize: Math.max(12, stageFontSize - 2) }]}>
          {block.name || ('Bloco ' + (blockIndex + 1))}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {Array.from({ length: count }, (_, rowIndex) => (
              <View key={'stage-row-' + rowIndex} style={styles.stageGridRow}>
                <Text style={[
                  styles.stageGridLabel,
                  config.cellMode !== 'number' && styles.stageGridLabelWide,
                  { fontSize: Math.max(8, stageFontSize - 4) },
                ]}>
                  {labels[rowIndex] || ''}
                </Text>
                <Text style={[styles.stageGridDivider, { fontSize: stageFontSize }]} >|</Text>
                {Array.from({ length: GRID_COLUMNS }, (_, colIndex) => {
                  const sourceRow = Array.isArray(block?.cells?.[rowIndex]) ? block.cells[rowIndex] : [];
                  const value = String(sourceRow[colIndex] ?? '');
                  return (
                    <View
                      key={'stage-cell-' + rowIndex + '-' + colIndex}
                      style={[
                        styles.stageGridCell,
                        value ? styles.stageGridCellFilled : null,
                        { width: cellWidth, height: cellHeight },
                      ]}
                    >
                      <Text style={[
                        value ? styles.stageGridCellTextFilled : styles.stageGridCellTextEmpty,
                        { fontSize: effectiveFontSize },
                      ]}>
                        {value || '–'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  useEffect(() => {
    loadSavedTabs();
  }, [song.id, config.key]);

  useEffect(() => {
    const hasPrincipal = savedTabs.some((item) => isSongsterrTab(item));
    if (!savedLoading && !hasPrincipal && !searched && !searching) {
      searchPrincipal();
    }
  }, [savedLoading, savedTabs, searched, searching]);

  if (savedLoading) {
    return (
      <View style={styles.feedbackBox}>
        <ActivityIndicator />
        <Text style={styles.feedbackText}>A carregar {config.label.toLowerCase()}…</Text>
      </View>
    );
  }

  const ownExists = hasStoredUserContent(myTab);

  return (
    <View>
      <View style={styles.modeSwitch}>
        <TouchableOpacity
          style={[styles.modeButton, !showSource && styles.modeButtonActive]}
          onPress={() => { setShowSource(false); setEditing(false); }}
        >
          <Text style={[styles.modeButtonText, !showSource && styles.modeButtonTextActive]}>Minha tab</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, showSource && styles.modeButtonActive]}
          onPress={() => { setShowSource(true); setEditing(false); }}
        >
          <Text style={[styles.modeButtonText, showSource && styles.modeButtonTextActive]}>Versão principal</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorInline}>{error}</Text> : null}
      {savedMessage ? <Text style={styles.successInline}>{savedMessage}</Text> : null}

      {showSource ? (
        <View style={styles.primaryTabCard}>
          {searching ? (
            <View style={styles.feedbackBox}>
              <ActivityIndicator />
              <Text style={styles.feedbackText}>A localizar a versão principal no Songsterr…</Text>
            </View>
          ) : principalTab ? (
            <View>
              <Text style={styles.contentTitle}>Versão principal · {config.label}</Text>
              <Text style={styles.detailArtist}>{principalTab.source_artist || song.artist}</Text>
              <Text style={styles.meta}>
                {(principalTab.source_title || song.title)
                  + (principalTab.source_track_name ? ' · ' + principalTab.source_track_name : '')}
              </Text>
              {principalTab.tuning_label ? (
                <Text style={styles.songMeta}>{'Afinação: ' + principalTab.tuning_label}</Text>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 16, alignSelf: 'flex-start' }]}
                onPress={() => principalTab.source_url && Linking.openURL(principalTab.source_url)}
              >
                <Text style={styles.primaryText}>Abrir na fonte ↗</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.emptyTitle}>Sem versão principal disponível.</Text>
              <Text style={styles.emptyText}>
                Não encontrei automaticamente uma versão de {config.label.toLowerCase()} no Songsterr para esta música.
              </Text>
            </View>
          )}
        </View>
      ) : editing ? (
        <View>
          <View style={styles.editorModeHeader}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                setEditing(false);
                if (myTab) hydrateEditor(myTab);
              }}
            >
              <Text style={styles.secondaryButtonText}>‹ Voltar à minha tab</Text>
            </TouchableOpacity>
            <Text style={styles.contentTitle}>Editar · {config.label}</Text>
          </View>

          <View style={[styles.visualEditorShell, tablet && styles.visualEditorShellTablet]}>
            <View style={[styles.editorSettingsCard, tablet && styles.editorSettingsCardTablet]}>
              <Text style={styles.editorPanelTitle}>Configurações</Text>

              <Text style={styles.formLabel}>Título</Text>
              <TextInput
                value={tabTitle}
                onChangeText={setTabTitle}
                style={styles.formInput}
                placeholder="Nome da tab"
                placeholderTextColor={COLORS.muted}
              />

              <Text style={styles.formLabel}>Instrumento</Text>
              <View style={styles.readonlyField}>
                <Text style={styles.readonlyFieldText}>{config.icon} {config.label}</Text>
              </View>

              <Text style={styles.formLabel}>{config.rowCountLabel}</Text>
              <View style={styles.stringCountRow}>
                {config.rowOptions.map((count) => (
                  <TouchableOpacity
                    key={count}
                    style={[styles.stringCountButton, rowCount === count && styles.stringCountButtonActive]}
                    onPress={() => resizeRows(count)}
                  >
                    <Text style={[styles.stringCountText, rowCount === count && styles.stringCountTextActive]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {config.cellMode === 'drum' ? (
                <View style={styles.drumLegend}>
                  <Text style={styles.drumLegendText}>x = prato/hi-hat · o = ataque · g = ghost · f = flam</Text>
                  <Text style={styles.contentSub}>Toca numa caixa para alternar o símbolo.</Text>
                </View>
              ) : config.cellMode === 'text' ? (
                <Text style={styles.contentSub}>Nas caixas podes escrever notas ou acordes curtos.</Text>
              ) : instrument === 'bass' ? (
                <Text style={styles.contentSub}>Nas caixas podes usar trastes e slide, por exemplo: 5, / ou 5/7.</Text>
              ) : (
                <Text style={styles.contentSub}>Nas caixas coloca o número do traste.</Text>
              )}

              <Text style={styles.formLabel}>Música associada</Text>
              <View style={styles.readonlyField}>
                <Text style={styles.readonlyFieldText}>{song.title + ' — ' + song.artist}</Text>
              </View>

              <View style={styles.publicRow}>
                <Text style={styles.formLabel}>Pública</Text>
                <TouchableOpacity
                  style={[styles.switchTrack, isPublic && styles.switchTrackOn]}
                  onPress={() => setIsPublic((value) => !value)}
                >
                  <View style={[styles.switchThumb, isPublic && styles.switchThumbOn]} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.editorMain}>
              <View style={styles.editorModeHeader}>
                <View style={styles.modeSwitch}>
                  <TouchableOpacity
                    style={[styles.modeButton, editorMode === 'visual' && styles.modeButtonActive]}
                    onPress={() => setEditorMode('visual')}
                  >
                    <Text style={[styles.modeButtonText, editorMode === 'visual' && styles.modeButtonTextActive]}>⌘ Editor Visual</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeButton, editorMode === 'text' && styles.modeButtonActive]}
                    onPress={() => setEditorMode('text')}
                  >
                    <Text style={[styles.modeButtonText, editorMode === 'text' && styles.modeButtonTextActive]}>Texto Livre</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={saveOwnTab} disabled={savingContent}>
                  {savingContent ? <ActivityIndicator /> : <Text style={styles.primaryText}>▣ Guardar</Text>}
                </TouchableOpacity>
              </View>

              {editorMode === 'visual' ? (
                <View>
                  {blocks.map((block, blockIndex) => (
                    <View key={block.id} style={styles.visualBlockCard}>
                      <View style={styles.visualBlockHeader}>
                        <TextInput
                          value={block.name}
                          onChangeText={(name) => updateBlockName(blockIndex, name)}
                          style={styles.blockNameInput}
                          placeholder={'Bloco ' + (blockIndex + 1)}
                          placeholderTextColor={COLORS.muted}
                        />
                        <View style={styles.blockHeaderActions}>
                          <TouchableOpacity onPress={() => clearBlock(blockIndex)} style={styles.clearBlockButton}>
                            <Text style={styles.clearBlockText}>Limpar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeBlock(blockIndex)} style={styles.removeBlockButton}>
                            <Text style={styles.removeBlockText}>🗑 Remover bloco</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {renderGrid(block, blockIndex, true)}
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addBlockButton} onPress={addBlock}>
                    <Text style={styles.addBlockText}>＋ Adicionar bloco</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.formLabel}>Texto livre</Text>
                  <TextInput
                    value={customTab}
                    onChangeText={setCustomTab}
                    multiline
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Escreve ou cola aqui a tua tab / notas em formato livre."
                    placeholderTextColor={COLORS.muted}
                    style={[styles.tabEditorInput, styles.tabEditorLarge]}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      ) : ownExists ? (
        <View>
          <View style={styles.bassToolbar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.contentTitle}>{myTab?.title || ('Minha tab · ' + config.label)}</Text>
              <Text style={styles.contentSub}>
                {config.rowCountLabel + ': ' + (myTab?.string_count || config.defaultRows)}
              </Text>
            </View>
            <View style={styles.tabActionRow}>
              <TouchableOpacity
                style={styles.stageBarButton}
                onPress={() => {
                  setStageFitToWidth(false);
                  setStageFontSize((value) => Math.max(8, value - 2));
                }}
              >
                <Text style={styles.stageText}>A−</Text>
              </TouchableOpacity>
              <View style={styles.stageBarPill}>
                <Text style={styles.stageText}>{stageFontSize}px</Text>
              </View>
              <TouchableOpacity
                style={styles.stageBarButton}
                onPress={() => {
                  setStageFitToWidth(false);
                  setStageFontSize((value) => Math.min(44, value + 2));
                }}
              >
                <Text style={styles.stageText}>A＋</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stageBarButton}
                onPress={() => {
                  setStageAutoScroll(true);
                  setStageVisible(true);
                }}
              >
                <Text style={styles.stageText}>▶ Auto scroll</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setStageAutoScroll(false);
                  setStageVisible(true);
                }}
              >
                <Text style={styles.secondaryButtonText}>⛶ Fullscreen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primarySmall}
                onPress={() => {
                  setActiveTab(myTab);
                  hydrateEditor(myTab);
                  setEditing(true);
                }}
              >
                <Text style={styles.primaryText}>✎ Editar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {myTab?.editor_mode === 'text' && myTab?.custom_tab?.trim() ? (
            <View style={styles.tabSectionCard}>
              <Text style={styles.tabSectionTitle}>Tab / notas</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text
                  style={[styles.asciiTabText, { fontSize: stageFontSize, lineHeight: Math.round(stageFontSize * 1.4) }]}
                  selectable
                >
                  {myTab.custom_tab}
                </Text>
              </ScrollView>
            </View>
          ) : (
            <View>
              {(Array.isArray(myTab?.sections) ? myTab.sections : [])
                .filter((block) => block?.type === 'visual-block' || Array.isArray(block?.cells))
                .map((block, blockIndex) => {
                  const count = config.rowOptions.includes(Number(myTab?.string_count))
                    ? Number(myTab.string_count)
                    : config.defaultRows;
                  return (
                    <View key={block.id || String(blockIndex)} style={styles.visualBlockCard}>
                      <Text style={styles.tabSectionTitle}>{block.name || ('Bloco ' + (blockIndex + 1))}</Text>
                      {(() => {
                        const previousCount = rowCount;
                        const normalized = {
                          ...block,
                          cells: Array.from({ length: count }, (_, rowIndex) => {
                            const existing = Array.isArray(block?.cells?.[rowIndex]) ? block.cells[rowIndex] : [];
                            return Array.from({ length: GRID_COLUMNS }, (_, colIndex) => String(existing[colIndex] ?? ''));
                          }),
                        };
                        const labels = rowLabels(count, principalTab?.tuning_label || myTab?.tuning_label);
                        return (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.visualGridScroll}>
                            <View>
                              {Array.from({ length: count }, (_, rowIndex) => (
                                <View key={'read-row-' + rowIndex} style={styles.visualGridRow}>
                                  <Text
                                    style={[
                                      styles.stringLabel,
                                      config.cellMode !== 'number' && styles.instrumentRowLabel,
                                      { fontSize: Math.max(8, stageFontSize - 4) },
                                    ]}
                                  >
                                    {labels[rowIndex] || ''}
                                  </Text>
                                  <Text style={[styles.stringDivider, { fontSize: Math.max(8, stageFontSize - 4) }]}>|</Text>
                                  {Array.from({ length: GRID_COLUMNS }, (_, colIndex) => {
                                    const value = normalized.cells?.[rowIndex]?.[colIndex] || '';
                                    const cellWidth = Math.max(config.cellMode === 'text' ? 30 : 20, stageFontSize + (config.cellMode === 'text' ? 16 : 10));
                                    const cellHeight = Math.max(24, stageFontSize + 8);
                                    return (
                                      <View
                                        key={'read-cell-' + rowIndex + '-' + colIndex}
                                        style={[
                                          styles.fretCellView,
                                          value ? styles.fretCellFilled : null,
                                          config.cellMode === 'text' && styles.noteCell,
                                          { width: cellWidth, height: cellHeight },
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            value ? styles.fretCellTextFilled : styles.fretCellTextEmpty,
                                            { fontSize: Math.max(8, stageFontSize - 2) },
                                          ]}
                                        >
                                          {value || '–'}
                                        </Text>
                                      </View>
                                    );
                                  })}
                                </View>
                              ))}
                            </View>
                          </ScrollView>
                        );
                      })()}
                    </View>
                  );
                })}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.feedbackBox}>
          <Text style={styles.emptyTitle}>Ainda não tens uma tab própria de {config.label.toLowerCase()}.</Text>
          <Text style={styles.feedbackText}>
            Cria uma tab manual com um quadro adaptado a {config.label.toLowerCase()}.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={createOwnTab}>
            <Text style={styles.primaryText}>＋ Criar minha tab</Text>
          </TouchableOpacity>
        </View>
      )}

      <FullscreenStage
        visible={stageVisible}
        title={myTab?.title || (song.title + ' · ' + config.label)}
        subtitle={song.artist + ' · ' + config.label}
        onClose={() => {
          setStageVisible(false);
          setStageAutoScroll(false);
        }}
        fontSize={stageFontSize}
        onFontSizeChange={setStageFontSize}
        autoScroll={stageAutoScroll}
        onAutoScrollChange={setStageAutoScroll}
        speed={stageSpeed}
        onSpeedChange={setStageSpeed}
        fitToWidth={stageFitToWidth}
        onFitToWidthChange={setStageFitToWidth}
      >
        {myTab?.editor_mode === 'text' && myTab?.custom_tab?.trim() ? (
          <Text style={[styles.stageFreeText, { fontSize: stageFontSize, lineHeight: Math.round(stageFontSize * 1.45) }]}>
            {myTab.custom_tab}
          </Text>
        ) : (
          <View>
            {(Array.isArray(myTab?.sections) ? myTab.sections : [])
              .filter((block) => block?.type === 'visual-block' || Array.isArray(block?.cells))
              .map((block, blockIndex) => renderStageGrid(block, blockIndex))}
          </View>
        )}
      </FullscreenStage>
    </View>
  );
}

function SongDetail({ song, onBack, onPlaylist, onEdit, onDelete, onSongUpdate, setlistContext }) {
  const [tab, setTab] = useState('Letra');
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [lyricsFontSize, setLyricsFontSize] = useState(26);
  const [lyricsStageVisible, setLyricsStageVisible] = useState(false);
  const [lyricsAutoScroll, setLyricsAutoScroll] = useState(false);
  const [lyricsSpeed, setLyricsSpeed] = useState(1);
  const { width } = useWindowDimensions();
  const tablet = width >= 760;

  function confirmDeleteSong() {
    setDeleteError('');
    Alert.alert(
      'Apagar música',
      'Queres mesmo apagar "' + song.title + '"? A música será removida também das playlists, alinhamentos e tabs guardadas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete?.(song);
            } catch (error) {
              setDeleteError(error?.message || 'Não foi possível apagar a música.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  async function retryLyrics() {
    setLyricsLoading(true);
    setLyricsError('');
    try {
      const data = await libraryPost('retry_lyrics', { songId: song.id });
      const updated = normalizeSong(data.song);
      onSongUpdate(updated);
    } catch (error) {
      setLyricsError(error?.message || 'Não foi possível procurar a letra.');
    } finally {
      setLyricsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.detailWrap}>
        <TouchableOpacity onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹  Voltar</Text>
        </TouchableOpacity>

        {setlistContext ? (
          <View style={styles.concertNav}>
            <TouchableOpacity
              style={[styles.concertNavButton, setlistContext.index <= 0 && styles.concertNavButtonDisabled]}
              onPress={setlistContext.onPrevious}
              disabled={setlistContext.index <= 0}
            >
              <Text style={styles.concertNavButtonText}>‹ Anterior</Text>
            </TouchableOpacity>
            <View style={styles.concertNavCenter}>
              <Text style={styles.concertNavName} numberOfLines={1}>{setlistContext.name}</Text>
              <Text style={styles.concertNavPosition}>
                {setlistContext.index + 1} / {setlistContext.total}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.concertNavButton, setlistContext.index >= setlistContext.total - 1 && styles.concertNavButtonDisabled]}
              onPress={setlistContext.onNext}
              disabled={setlistContext.index >= setlistContext.total - 1}
            >
              <Text style={styles.concertNavButtonText}>Seguinte ›</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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

            {(song.youtubeUrl || song.customUrl) ? (
              <View style={styles.externalLinksRow}>
                {song.youtubeUrl ? (
                  <TouchableOpacity style={styles.youtubeLinkButton} onPress={() => openExternalLink(song.youtubeUrl)}>
                    <Text style={styles.externalLinkText}>▶ YouTube</Text>
                  </TouchableOpacity>
                ) : null}
                {song.customUrl ? (
                  <TouchableOpacity style={styles.externalLinkButton} onPress={() => openExternalLink(song.customUrl)}>
                    <Text style={styles.externalLinkText}>↗ Link</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.primarySmall} onPress={onPlaylist}>
                <Text style={styles.primaryText}>＋ Playlist</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>♡ Favoritar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={onEdit}>
                <Text style={styles.secondaryButtonText}>✎ Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteSongButton}
                onPress={confirmDeleteSong}
                disabled={deleting}
              >
                {deleting
                  ? <ActivityIndicator />
                  : <Text style={styles.deleteSongText}>🗑 Apagar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {deleteError ? <Text style={styles.errorInline}>{deleteError}</Text> : null}

        {tab === 'Letra' && song.lyrics ? (
          <View style={styles.stageBar}>
            <TouchableOpacity
              style={styles.stageBarButton}
              onPress={() => {
                setLyricsAutoScroll(true);
                setLyricsStageVisible(true);
              }}
            >
              <Text style={styles.stageText}>▶ Scroll automático</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stageBarButton}
              onPress={() => setLyricsFontSize((value) => Math.max(8, value - 2))}
            >
              <Text style={styles.stageText}>A−</Text>
            </TouchableOpacity>
            <View style={styles.stageBarPill}>
              <Text style={styles.stageText}>{lyricsFontSize}px</Text>
            </View>
            <TouchableOpacity
              style={styles.stageBarButton}
              onPress={() => setLyricsFontSize((value) => Math.min(44, value + 2))}
            >
              <Text style={styles.stageText}>A＋</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stageBarButton}
              onPress={() => {
                setLyricsAutoScroll(false);
                setLyricsStageVisible(true);
              }}
            >
              <Text style={styles.stageText}>⛶ Fullscreen</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {['Letra', 'Guitarra', 'Baixo', 'Bateria', 'Teclas', 'Notas'].map((item) => (
            <TabButton key={item} label={item} active={tab === item} onPress={() => setTab(item)} />
          ))}
        </ScrollView>

        <View style={styles.contentCard}>
          <View style={styles.contentHeader}>
            <View>
              <Text style={styles.contentTitle}>{tab}</Text>
              <Text style={styles.contentSub}>
                {tab === 'Letra'
                  ? song.lyricsSource
                    ? `Letra automática · ${song.lyricsSource}`
                    : 'Letra da música'
                  : ['Guitarra', 'Baixo', 'Bateria', 'Teclas'].includes(tab)
                    ? 'Minha tab + versão principal Songsterr'
                    : 'Conteúdo da música'}
              </Text>
            </View>
            {tab === 'Notas' ? (
              <TouchableOpacity style={styles.primarySmall}>
                <Text style={styles.primaryText}>+ Adicionar</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {tab === 'Letra' ? (
            song.instrumental ? (
              <View>
                <Text style={styles.emptyTitle}>Faixa instrumental</Text>
                <Text style={styles.emptyText}>A fonte de letras identificou esta gravação como instrumental.</Text>
              </View>
            ) : song.lyrics ? (
              <Text
                style={[styles.lyricsText, { fontSize: lyricsFontSize, lineHeight: Math.round(lyricsFontSize * 1.5) }]}
                selectable
              >
                {song.lyrics}
              </Text>
            ) : (
              <View>
                <Text style={styles.emptyTitle}>Ainda não encontrei a letra automaticamente.</Text>
                <Text style={styles.emptyText}>
                  Podes voltar a procurar ou, mais tarde, adicionar/editar a letra manualmente.
                </Text>
                {lyricsError ? <Text style={styles.errorInline}>{lyricsError}</Text> : null}
                <TouchableOpacity style={styles.retryButton} onPress={retryLyrics} disabled={lyricsLoading}>
                  {lyricsLoading ? <ActivityIndicator /> : <Text style={styles.secondaryButtonText}>↻ Procurar letra novamente</Text>}
                </TouchableOpacity>
              </View>
            )
          ) : tab === 'Guitarra' ? (
            <InstrumentTabPanel song={song} instrument="guitar" />
          ) : tab === 'Baixo' ? (
            <InstrumentTabPanel song={song} instrument="bass" />
          ) : tab === 'Bateria' ? (
            <InstrumentTabPanel song={song} instrument="drums" />
          ) : tab === 'Teclas' ? (
            <InstrumentTabPanel song={song} instrument="keys" />
          ) : (
            <View>
              <Text style={styles.emptyTitle}>Ainda não existe conteúdo em {tab.toLowerCase()}.</Text>
              <Text style={styles.emptyText}>
                Poderás adicionar texto, uma pauta, PDF, imagem ou uma versão específica para o teu instrumento.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <FullscreenStage
        visible={lyricsStageVisible}
        title={song.title}
        subtitle={song.artist + ' · Letra'}
        onClose={() => {
          setLyricsStageVisible(false);
          setLyricsAutoScroll(false);
        }}
        fontSize={lyricsFontSize}
        onFontSizeChange={setLyricsFontSize}
        autoScroll={lyricsAutoScroll}
        onAutoScrollChange={setLyricsAutoScroll}
        speed={lyricsSpeed}
        onSpeedChange={setLyricsSpeed}
      >
        <Text style={[styles.stageLyricsText, { fontSize: lyricsFontSize, lineHeight: Math.round(lyricsFontSize * 1.5) }]}>
          {song.lyrics || ''}
        </Text>
      </FullscreenStage>
    </SafeAreaView>
  );
}

function EditSong({ song, onBack, onSave }) {
  const [title, setTitle] = useState(song.title || '');
  const [artist, setArtist] = useState(song.artist || '');
  const [album, setAlbum] = useState(song.album || '');
  const [year, setYear] = useState(song.year ? String(song.year) : '');
  const [youtubeUrl, setYoutubeUrl] = useState(song.youtubeUrl || '');
  const [customUrl, setCustomUrl] = useState(song.customUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!title.trim() || !artist.trim()) {
      setError('Nome da música e artista são obrigatórios.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim(),
        year: year.trim(),
        youtubeUrl: youtubeUrl.trim(),
        customUrl: customUrl.trim(),
      });
    } catch (err) {
      setError(err?.message || 'Não foi possível guardar as alterações.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.editWrap}>
        <View style={styles.topLine}>
          <TouchableOpacity onPress={onBack}><Text style={styles.backText}>‹ Cancelar</Text></TouchableOpacity>
          <Text style={styles.screenTitle}>Editar música</Text>
          <View style={{ width: 55 }} />
        </View>

        <View style={styles.editHero}>
          <View style={styles.editCover}><SongCover song={song} large /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLead}>Dados da música</Text>
            <Text style={styles.sectionDescription}>
              Podes corrigir os dados importados do catálogo sem alterar a gravação original associada.
            </Text>
          </View>
        </View>

        <Text style={styles.formLabel}>Nome da música</Text>
        <TextInput value={title} onChangeText={setTitle} style={styles.formInput} placeholderTextColor={COLORS.muted} />

        <Text style={styles.formLabel}>Artista</Text>
        <TextInput value={artist} onChangeText={setArtist} style={styles.formInput} placeholderTextColor={COLORS.muted} />

        <Text style={styles.formLabel}>Álbum</Text>
        <TextInput value={album} onChangeText={setAlbum} style={styles.formInput} placeholderTextColor={COLORS.muted} />

        <Text style={styles.formLabel}>Ano</Text>
        <TextInput
          value={year}
          onChangeText={(value) => setYear(value.replace(/[^0-9]/g, '').slice(0, 4))}
          keyboardType="number-pad"
          style={styles.formInput}
          placeholderTextColor={COLORS.muted}
        />

        <Text style={styles.formLabel}>Link YouTube</Text>
        <TextInput
          value={youtubeUrl}
          onChangeText={setYoutubeUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.formInput}
          placeholder="https://youtube.com/..."
          placeholderTextColor={COLORS.muted}
        />

        <Text style={styles.formLabel}>Outro link</Text>
        <TextInput
          value={customUrl}
          onChangeText={setCustomUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.formInput}
          placeholder="https://..."
          placeholderTextColor={COLORS.muted}
        />

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}

        <View style={styles.editActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onBack} disabled={saving}>
            <Text style={styles.secondaryButtonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator /> : <Text style={styles.primaryText}>Guardar alterações</Text>}
          </TouchableOpacity>
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
  const [addingId, setAddingId] = useState(null);

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
      if (!response.ok) throw new Error(data?.error || 'Não foi possível pesquisar no Spotify.');
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

  async function addSong(item) {
    setAddingId(item.id);
    setError('');
    try {
      await onAdd(item);
    } catch (err) {
      setError(err?.message || 'Não foi possível adicionar a música.');
    } finally {
      setAddingId(null);
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

    const timer = setTimeout(() => searchSpotify(q), 550);
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
        <Text style={styles.sectionDescription}>
          Procura por título, artista ou ambos. Ao adicionar, tento também obter automaticamente a letra.
        </Text>

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
            <Text style={styles.errorTitle}>Ocorreu um problema</Text>
            <Text style={styles.errorText}>{error}</Text>
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
              <View style={styles.coverSmall}><SongCover song={item} /></View>
              <View style={styles.resultInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.songArtist} numberOfLines={1}>{item.artist}</Text>
                <Text style={styles.songMeta} numberOfLines={1}>
                  {item.album || 'Álbum desconhecido'}{item.year ? ` · ${item.year}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addCircle}
                onPress={() => addSong(item)}
                disabled={Boolean(addingId)}
              >
                {addingId === item.id ? <ActivityIndicator /> : <Text style={styles.addCircleText}>+</Text>}
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


function SetlistsScreen({ setlists, loading, onBack, onCreate, onOpen }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    const value = name.trim();
    if (!value) {
      setError('Escreve um nome para o alinhamento.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      await onCreate(value);
      setName('');
    } catch (err) {
      setError(err?.message || 'Não foi possível criar o alinhamento.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topLine}>
          <TouchableOpacity onPress={onBack}><Text style={styles.backText}>‹ Voltar</Text></TouchableOpacity>
          <Text style={styles.screenTitle}>Alinhamentos</Text>
          <View style={{ width: 55 }} />
        </View>

        <Text style={styles.sectionLead}>Alinhamentos de concerto</Text>
        <Text style={styles.sectionDescription}>
          Organiza as músicas pela ordem do concerto e abre-as depois em sequência.
        </Text>

        <View style={styles.createPlaylistRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={create}
            placeholder="Nome do alinhamento"
            placeholderTextColor={COLORS.muted}
            style={[styles.searchInput, styles.searchInputGrow]}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={create} disabled={creating}>
            {creating ? <ActivityIndicator /> : <Text style={styles.primaryText}>＋ Criar</Text>}
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}

        {loading ? (
          <View style={styles.feedbackBox}><ActivityIndicator /></View>
        ) : setlists.length === 0 ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.emptyTitle}>Ainda não tens alinhamentos.</Text>
            <Text style={styles.feedbackText}>Cria o primeiro para preparar a ordem de um concerto.</Text>
          </View>
        ) : (
          <FlatList
            data={setlists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.playlistRow} onPress={() => onOpen(item)}>
                <View style={styles.setlistIcon}><Text style={styles.setlistIconText}>≡</Text></View>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle}>{item.name}</Text>
                  <Text style={styles.songArtist}>{item.song_count ?? 0} músicas</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}


function DraggableSetlistRow({
  item,
  index,
  dragging,
  onOpen,
  onRemove,
  onDragStart,
  onDragEnd,
}) {
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 2,
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        translateY.setValue(0);
        onDragStart(index);
      },
      onPanResponderMove: (_, gesture) => {
        translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        translateY.setValue(0);
        onDragEnd(index, gesture.dy);
      },
      onPanResponderTerminate: (_, gesture) => {
        translateY.setValue(0);
        onDragEnd(index, gesture?.dy || 0);
      },
      onShouldBlockNativeResponder: () => true,
    }),
    [index, onDragStart, onDragEnd, translateY]
  );

  return (
    <Animated.View
      style={[
        styles.setlistSongRow,
        dragging && styles.setlistSongRowDragging,
        dragging ? { transform: [{ translateY }], zIndex: 20, elevation: 8 } : null,
      ]}
    >
      <View {...panResponder.panHandlers} style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.dragHandleText}>≡</Text>
      </View>
      <Text style={styles.setlistPosition}>{index + 1}</Text>
      <TouchableOpacity style={styles.setlistSongMain} onPress={() => onOpen(item, index)} disabled={dragging}>
        <View style={styles.coverSmall}><SongCover song={item} /></View>
        <View style={styles.songInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.songArtist} numberOfLines={1}>{item.artist}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.removeSetlistSongButton} onPress={() => onRemove(item)} disabled={dragging}>
        <Text style={styles.removeSetlistSongText}>×</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function SetlistDetail({ setlist, librarySongs, onBack, onOpenSong, onChanged }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [busySongId, setBusySongId] = useState(null);
  const [error, setError] = useState('');
  const [draggingId, setDraggingId] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await libraryGet('setlist_songs', { setlistId: setlist.id });
      setSongs((data.songs || []).map(normalizeSong));
    } catch (err) {
      setError(err?.message || 'Não foi possível abrir o alinhamento.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [setlist.id]);

  async function addSong(song) {
    setBusySongId(song.id);
    setError('');
    try {
      await libraryPost('add_to_setlist', { setlistId: setlist.id, songId: song.id });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Não foi possível adicionar a música.');
    } finally {
      setBusySongId(null);
    }
  }

  async function removeSong(song) {
    setBusySongId(song.id);
    setError('');
    try {
      await libraryPost('remove_from_setlist', { setlistId: setlist.id, songId: song.id });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Não foi possível remover a música.');
    } finally {
      setBusySongId(null);
    }
  }

  function startDrag(index) {
    setDraggingId(songs[index]?.id || null);
  }

  async function endDrag(fromIndex, dy) {
    setDraggingId(null);
    if (!songs.length) return;

    const rowHeight = 77;
    const targetIndex = Math.max(
      0,
      Math.min(songs.length - 1, fromIndex + Math.round(Number(dy || 0) / rowHeight))
    );

    if (targetIndex === fromIndex) return;

    const next = moveItem(songs, fromIndex, targetIndex);
    setSongs(next);

    try {
      await libraryPost('reorder_setlist', {
        setlistId: setlist.id,
        songIds: next.map((item) => item.id),
      });
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Não foi possível guardar a nova ordem.');
      load();
    }
  }

  const availableSongs = librarySongs.filter((song) => {
    if (songs.some((item) => item.id === song.id)) return false;
    const needle = addQuery.trim().toLowerCase();
    if (!needle) return true;
    return (song.title + ' ' + song.artist).toLowerCase().includes(needle);
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topLine}>
          <TouchableOpacity onPress={onBack}><Text style={styles.backText}>‹ Alinhamentos</Text></TouchableOpacity>
          <Text style={styles.screenTitle}>{setlist.name}</Text>
          <TouchableOpacity onPress={() => setAdding((value) => !value)}>
            <Text style={styles.addText}>{adding ? 'Fechar' : '＋ Música'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.setlistIntroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLead}>{setlist.name}</Text>
            <Text style={styles.sectionDescription}>
              Arrasta pelo símbolo ≡ para mudar a ordem. Toca numa música para iniciar o modo concerto.
            </Text>
          </View>
          <View style={styles.setlistCountPill}><Text style={styles.setlistCountText}>{songs.length}</Text></View>
        </View>

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}

        {adding ? (
          <View style={styles.addSongsPanel}>
            <TextInput
              value={addQuery}
              onChangeText={setAddQuery}
              placeholder="Pesquisar na biblioteca..."
              placeholderTextColor={COLORS.muted}
              style={styles.searchInput}
            />
            <ScrollView style={styles.addSongsScroll} keyboardShouldPersistTaps="handled">
              {availableSongs.length === 0 ? (
                <Text style={styles.feedbackText}>Não há mais músicas para adicionar.</Text>
              ) : availableSongs.map((song) => (
                <View key={song.id} style={styles.addSongRow}>
                  <View style={styles.coverSmall}><SongCover song={song} /></View>
                  <View style={styles.songInfo}>
                    <Text style={styles.songTitle}>{song.title}</Text>
                    <Text style={styles.songArtist}>{song.artist}</Text>
                  </View>
                  <TouchableOpacity style={styles.primarySmall} onPress={() => addSong(song)} disabled={busySongId === song.id}>
                    {busySongId === song.id ? <ActivityIndicator /> : <Text style={styles.primaryText}>＋</Text>}
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.feedbackBox}><ActivityIndicator /></View>
        ) : songs.length === 0 ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.emptyTitle}>Alinhamento vazio.</Text>
            <Text style={styles.feedbackText}>Carrega em “＋ Música” para escolher músicas da biblioteca.</Text>
          </View>
        ) : (
          <ScrollView scrollEnabled={!draggingId} contentContainerStyle={styles.setlistSongsList}>
            {songs.map((item, index) => (
              <DraggableSetlistRow
                key={item.id}
                item={item}
                index={index}
                dragging={draggingId === item.id}
                onOpen={(song, songIndex) => onOpenSong(song, songs, songIndex)}
                onRemove={removeSong}
                onDragStart={startDrag}
                onDragEnd={endDrag}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

function PlaylistsScreen({ playlists, loading, onBack, onCreate, onOpen }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    const value = name.trim();
    if (!value) return;
    setCreating(true);
    setError('');
    try {
      await onCreate(value);
      setName('');
    } catch (err) {
      setError(err?.message || 'Não foi possível criar a playlist.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topLine}>
          <TouchableOpacity onPress={onBack}><Text style={styles.backText}>‹ Músicas</Text></TouchableOpacity>
          <Text style={styles.screenTitle}>Playlists</Text>
          <View style={{ width: 55 }} />
        </View>

        <View style={styles.createPlaylistRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={create}
            placeholder="Nome da nova playlist"
            placeholderTextColor={COLORS.muted}
            style={[styles.searchInput, styles.searchInputGrow]}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={create} disabled={creating}>
            {creating ? <ActivityIndicator /> : <Text style={styles.primaryText}>＋ Criar</Text>}
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}
        <Text style={styles.resultLabel}>{playlists.length} PLAYLISTS</Text>

        {loading ? (
          <View style={styles.feedbackBox}><ActivityIndicator /></View>
        ) : playlists.length === 0 ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>Ainda não tens playlists. Cria a primeira acima.</Text>
          </View>
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.playlistRow} onPress={() => onOpen(item)}>
                <View style={styles.playlistIcon}><Text style={styles.playlistIconText}>☷</Text></View>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle}>{item.name}</Text>
                  <Text style={styles.songArtist}>{item.song_count ?? 0} músicas</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function PlaylistDetail({ playlist, onBack, onOpenSong }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await libraryGet('playlist_songs', { playlistId: playlist.id });
      setSongs((data.songs || []).map(normalizeSong));
    } catch (err) {
      setError(err?.message || 'Não foi possível abrir a playlist.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [playlist.id]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <TouchableOpacity onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹ Playlists</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{playlist.name}</Text>
        <Text style={styles.subtitle}>{songs.length} músicas</Text>

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}
        {loading ? (
          <View style={[styles.feedbackBox, { marginTop: 20 }]}><ActivityIndicator /></View>
        ) : songs.length === 0 ? (
          <View style={[styles.feedbackBox, { marginTop: 20 }]}>
            <Text style={styles.feedbackText}>Esta playlist ainda está vazia.</Text>
          </View>
        ) : (
          <FlatList
            data={songs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.songRow} onPress={() => onOpenSong(item)}>
                <View style={styles.coverSmall}><SongCover song={item} /></View>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle}>{item.title}</Text>
                  <Text style={styles.songArtist}>{item.artist}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function PlaylistPicker({ song, playlists, onBack, onCreate, onAdd }) {
  const [name, setName] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [doneId, setDoneId] = useState(null);
  const [error, setError] = useState('');

  async function createAndAdd() {
    const value = name.trim();
    if (!value) return;
    setBusyId('new');
    setError('');
    try {
      const playlist = await onCreate(value);
      await onAdd(playlist.id, song.id);
      setDoneId(playlist.id);
      setName('');
    } catch (err) {
      setError(err?.message || 'Não foi possível adicionar à playlist.');
    } finally {
      setBusyId(null);
    }
  }

  async function add(playlist) {
    setBusyId(playlist.id);
    setError('');
    try {
      await onAdd(playlist.id, song.id);
      setDoneId(playlist.id);
    } catch (err) {
      setError(err?.message || 'Não foi possível adicionar à playlist.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topLine}>
          <TouchableOpacity onPress={onBack}><Text style={styles.backText}>‹ Voltar</Text></TouchableOpacity>
          <Text style={styles.screenTitle}>Adicionar à playlist</Text>
          <View style={{ width: 55 }} />
        </View>

        <View style={styles.selectedSongCard}>
          <View style={styles.coverSmall}><SongCover song={song} /></View>
          <View style={styles.songInfo}>
            <Text style={styles.songTitle}>{song.title}</Text>
            <Text style={styles.songArtist}>{song.artist}</Text>
          </View>
        </View>

        <Text style={styles.resultLabel}>NOVA PLAYLIST</Text>
        <View style={styles.createPlaylistRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={createAndAdd}
            placeholder="Nome da playlist"
            placeholderTextColor={COLORS.muted}
            style={[styles.searchInput, styles.searchInputGrow]}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={createAndAdd} disabled={busyId === 'new'}>
            {busyId === 'new' ? <ActivityIndicator /> : <Text style={styles.primaryText}>Criar + adicionar</Text>}
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}
        <Text style={styles.resultLabel}>AS TUAS PLAYLISTS</Text>

        {playlists.length === 0 ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>Ainda não existem playlists.</Text>
          </View>
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.playlistRow} onPress={() => add(item)} disabled={Boolean(busyId)}>
                <View style={styles.playlistIcon}><Text style={styles.playlistIconText}>☷</Text></View>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle}>{item.name}</Text>
                  <Text style={styles.songArtist}>{item.song_count ?? 0} músicas</Text>
                </View>
                {busyId === item.id ? (
                  <ActivityIndicator />
                ) : doneId === item.id ? (
                  <Text style={styles.doneText}>✓ Adicionada</Text>
                ) : (
                  <Text style={styles.addText}>＋ Adicionar</Text>
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const tablet = width >= 760;
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [setlists, setSetlists] = useState([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [loadingSetlists, setLoadingSetlists] = useState(true);
  const [screen, setScreen] = useState('songs');
  const [selected, setSelected] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [selectedSetlist, setSelectedSetlist] = useState(null);
  const [concertContext, setConcertContext] = useState(null);
  const [query, setQuery] = useState('');
  const [libraryError, setLibraryError] = useState('');

  async function loadSongs() {
    try {
      const data = await libraryGet('songs');
      setSongs((data.songs || []).map(normalizeSong));
      setLibraryError('');
    } catch (error) {
      setLibraryError(error?.message || 'Não foi possível carregar a biblioteca.');
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function loadPlaylists() {
    setLoadingPlaylists(true);
    try {
      const data = await libraryGet('playlists');
      setPlaylists(data.playlists || []);
    } catch (error) {
      setLibraryError(error?.message || 'Não foi possível carregar as playlists.');
    } finally {
      setLoadingPlaylists(false);
    }
  }

  async function loadSetlists() {
    setLoadingSetlists(true);
    try {
      const data = await libraryGet('setlists');
      setSetlists(data.setlists || []);
    } catch (error) {
      setLibraryError(error?.message || 'Não foi possível carregar os alinhamentos.');
    } finally {
      setLoadingSetlists(false);
    }
  }

  useEffect(() => {
    loadSongs();
    loadPlaylists();
    loadSetlists();
  }, []);

  const filtered = useMemo(
    () => songs.filter((s) => (s.title + ' ' + s.artist).toLowerCase().includes(query.toLowerCase())),
    [songs, query]
  );

  async function addSongFromSpotify(song) {
    const data = await libraryPost('add_song', { song });
    const stored = normalizeSong(data.song);
    setSongs((prev) => {
      const without = prev.filter((x) => x.id !== stored.id);
      return [stored, ...without];
    });
    setSelected(stored);
    setConcertContext(null);
    setScreen('detail');
  }

  async function saveSongEdits(fields) {
    const data = await libraryPost('update_song', { songId: selected.id, fields });
    const updated = normalizeSong(data.song);
    updateSong(updated);
    setScreen('detail');
  }

  async function createSetlist(name) {
    const data = await libraryPost('create_setlist', { name });
    const setlist = data.setlist;
    setSetlists((prev) => [setlist, ...prev]);
    return setlist;
  }

  async function createPlaylist(name) {
    const data = await libraryPost('create_playlist', { name });
    const playlist = data.playlist;
    setPlaylists((prev) => [playlist, ...prev]);
    return playlist;
  }

  async function addToPlaylist(playlistId, songId) {
    await libraryPost('add_to_playlist', { playlistId, songId });
    setPlaylists((prev) =>
      prev.map((p) => p.id === playlistId ? { ...p, song_count: (p.song_count ?? 0) + 1 } : p)
    );
  }

  async function deleteSong(song) {
    await libraryPost('delete_song', { songId: song.id });

    setSongs((prev) => prev.filter((item) => item.id !== song.id));
    setSelected(null);

    const wasConcert = Boolean(concertContext);
    setConcertContext(null);

    await Promise.all([
      loadPlaylists(),
      loadSetlists(),
    ]);

    setScreen(wasConcert && selectedSetlist ? 'setlistDetail' : 'songs');
  }

  function openConcertSong(song, orderedSongs, index) {
    setSelected(song);
    setConcertContext({
      setlist: selectedSetlist,
      songs: orderedSongs,
      index,
    });
    setScreen('detail');
  }

  function goConcert(delta) {
    if (!concertContext) return;
    const nextIndex = concertContext.index + delta;
    if (nextIndex < 0 || nextIndex >= concertContext.songs.length) return;
    const nextSong = concertContext.songs[nextIndex];
    setSelected(nextSong);
    setConcertContext((prev) => prev ? { ...prev, index: nextIndex } : prev);
  }

  function updateSong(updated) {
    setSelected(updated);
    setSongs((prev) => prev.map((s) => s.id === updated.id ? updated : s));
  }

  if (screen === 'add') {
    return <AddSong onClose={() => setScreen('songs')} onAdd={addSongFromSpotify} />;
  }

  if (screen === 'detail' && selected) {
    return (
      <SongDetail
        song={selected}
        onBack={() => setScreen(concertContext ? 'setlistDetail' : 'songs')}
        onPlaylist={() => setScreen('playlistPicker')}
        onEdit={() => setScreen('edit')}
        onDelete={deleteSong}
        onSongUpdate={updateSong}
        setlistContext={concertContext ? {
          name: concertContext.setlist?.name || 'Alinhamento',
          index: concertContext.index,
          total: concertContext.songs.length,
          onPrevious: () => goConcert(-1),
          onNext: () => goConcert(1),
        } : null}
      />
    );
  }

  if (screen === 'edit' && selected) {
    return (
      <EditSong
        song={selected}
        onBack={() => setScreen('detail')}
        onSave={saveSongEdits}
      />
    );
  }

  if (screen === 'playlistPicker' && selected) {
    return (
      <PlaylistPicker
        song={selected}
        playlists={playlists}
        onBack={() => setScreen('detail')}
        onCreate={createPlaylist}
        onAdd={addToPlaylist}
      />
    );
  }

  if (screen === 'setlists') {
    return (
      <SetlistsScreen
        setlists={setlists}
        loading={loadingSetlists}
        onBack={() => setScreen('songs')}
        onCreate={createSetlist}
        onOpen={(setlist) => {
          setSelectedSetlist(setlist);
          setConcertContext(null);
          setScreen('setlistDetail');
        }}
      />
    );
  }

  if (screen === 'setlistDetail' && selectedSetlist) {
    return (
      <SetlistDetail
        setlist={selectedSetlist}
        librarySongs={songs}
        onBack={() => {
          setConcertContext(null);
          setScreen('setlists');
        }}
        onOpenSong={openConcertSong}
        onChanged={loadSetlists}
      />
    );
  }

  if (screen === 'playlists') {
    return (
      <PlaylistsScreen
        playlists={playlists}
        loading={loadingPlaylists}
        onBack={() => setScreen('songs')}
        onCreate={createPlaylist}
        onOpen={(playlist) => { setSelectedPlaylist(playlist); setScreen('playlistDetail'); }}
      />
    );
  }

  if (screen === 'playlistDetail' && selectedPlaylist) {
    return (
      <PlaylistDetail
        playlist={selectedPlaylist}
        onBack={() => setScreen('playlists')}
        onOpenSong={(song) => { setConcertContext(null); setSelected(song); setScreen('detail'); }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.appShell, tablet && styles.appShellTablet]}>
        {tablet && (
          <View style={styles.sidebar}>
            <Text style={styles.logo}>◉  Bonus Track</Text>
            <Text style={styles.navCaption}>PRINCIPAL</Text>

            <TouchableOpacity style={styles.sideItem}>
              <Text style={styles.sideText}>⌂  Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sideItem, styles.sideItemActive]} onPress={() => setScreen('songs')}>
              <Text style={[styles.sideText, styles.sideTextActive]}>♫  Músicas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideItem} onPress={() => setScreen('playlists')}>
              <Text style={styles.sideText}>☷  Playlists</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideItem} onPress={() => setScreen('setlists')}>
              <Text style={styles.sideText}>≡  Alinhamentos</Text>
            </TouchableOpacity>
            {['♬  Tabs', '▣  Ensaios', '★  Concertos', '♡  Favoritos'].map((item) => (
              <TouchableOpacity key={item} style={styles.sideItem}>
                <Text style={styles.sideText}>{item}</Text>
              </TouchableOpacity>
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

          {libraryError ? (
            <View style={styles.inlineErrorRow}>
              <Text style={[styles.errorInline, { flex: 1 }]}>{libraryError}</Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => { setLoadingLibrary(true); loadSongs(); }}>
                <Text style={styles.secondaryButtonText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {loadingLibrary ? (
            <View style={styles.feedbackBox}><ActivityIndicator /></View>
          ) : filtered.length === 0 ? (
            <View style={styles.feedbackBox}>
              <Text style={styles.emptyTitle}>{songs.length ? 'Nenhuma música corresponde à pesquisa.' : 'A tua biblioteca está vazia.'}</Text>
              <Text style={styles.feedbackText}>{songs.length ? 'Experimenta outro título ou artista.' : 'Usa “Adicionar” para procurar no Spotify.'}</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.songRow} onPress={() => { setConcertContext(null); setSelected(item); setScreen('detail'); }}>
                  <View style={styles.coverSmall}><SongCover song={item} /></View>
                  <View style={styles.songInfo}>
                    <Text style={styles.songTitle}>{item.title}</Text>
                    <Text style={styles.songArtist}>{item.artist}</Text>
                    <Text style={styles.songTags}>
                      {item.lyrics ? 'Letra ✓' : 'Sem letra'}{item.album ? `  ·  ${item.album}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}

          {!tablet && (
            <View style={styles.bottomNav}>
              <TouchableOpacity style={styles.bottomButton} onPress={() => setScreen('songs')}>
                <Text style={[styles.bottomItem, styles.bottomActive]}>♫{'\n'}Músicas</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bottomButton} onPress={() => setScreen('playlists')}>
                <Text style={styles.bottomItem}>☷{'\n'}Playlists</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bottomButton} onPress={() => setScreen('setlists')}>
                <Text style={styles.bottomItem}>≡{'\n'}Alinhamentos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bottomButton}>
                <Text style={styles.bottomItem}>♡{'\n'}Favoritos</Text>
              </TouchableOpacity>
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
  primaryButton: { backgroundColor: COLORS.purple, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
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
  bottomButton: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  bottomItem: { color: COLORS.muted, textAlign: 'center', fontSize: 12, lineHeight: 19 },
  bottomActive: { color: '#b99cff', fontWeight: '800' },

  screen: { flex: 1, padding: 20 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  back: { marginBottom: 22 },
  backText: { color: '#9eb0ce', fontSize: 14 },
  screenTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  sectionLead: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: 5 },
  sectionDescription: { color: COLORS.muted, fontSize: 14, marginBottom: 18 },
  resultLabel: { color: COLORS.muted, fontSize: 12, marginVertical: 8, fontWeight: '700' },
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
  errorInline: { color: COLORS.danger, marginVertical: 10, lineHeight: 19 },
  inlineErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  retryButton: { marginTop: 14, alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },

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
  concertNav: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111827', borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 8, marginBottom: 18 },
  concertNavButton: { minWidth: 88, borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, alignItems: 'center' },
  concertNavButtonDisabled: { opacity: 0.3 },
  concertNavButtonText: { color: COLORS.text, fontWeight: '800', fontSize: 12 },
  concertNavCenter: { flex: 1, alignItems: 'center', minWidth: 0 },
  concertNavName: { color: '#c6b0ff', fontWeight: '900', fontSize: 13, maxWidth: '100%' },
  concertNavPosition: { color: COLORS.muted, marginTop: 2, fontSize: 11 },
  externalLinksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  youtubeLinkButton: { backgroundColor: '#7f1d1d', borderWidth: 1, borderColor: '#b91c1c', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  externalLinkButton: { backgroundColor: COLORS.panel2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  externalLinkText: { color: COLORS.text, fontWeight: '800', fontSize: 12 },
    actionRow: { flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap' },
  deleteSongButton: { borderWidth: 1, borderColor: '#7f1d1d', backgroundColor: '#2a1117', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, minWidth: 86, alignItems: 'center', justifyContent: 'center' },
  deleteSongText: { color: '#ff8a98', fontWeight: '800', fontSize: 12 },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 13 },
  stageSafe: { flex: 1, backgroundColor: '#05070c' },
  stageHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#1d2535' },
  stageCloseButton: { minWidth: 62, paddingVertical: 10, paddingHorizontal: 8 },
  stageCloseText: { color: '#c8b7ff', fontSize: 15, fontWeight: '900' },
  stageHeaderCenter: { flex: 1, alignItems: 'center', minWidth: 0 },
  stageHeaderSpacer: { width: 62 },
  stageTitle: { color: COLORS.text, fontSize: 17, fontWeight: '900', maxWidth: '100%' },
  stageSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 2, maxWidth: '100%' },
  stageControls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1d2535', backgroundColor: '#090d16' },
  stageControlButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#111725' },
  stageControlButtonActive: { backgroundColor: COLORS.purple2, borderColor: COLORS.purple },
  stageControlText: { color: COLORS.text, fontWeight: '800', fontSize: 12 },
  stageFontPill: { minWidth: 58, borderRadius: 9, backgroundColor: '#1d2637', paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' },
  stageFontText: { color: '#d9c9ff', fontWeight: '900', fontSize: 12 },
  stageScroll: { flex: 1 },
  stageScrollContent: { paddingHorizontal: 12, paddingTop: 18, paddingBottom: 100, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  stageBottomSpace: { height: 220 },
  stageLyricsText: { color: '#ffffff', fontWeight: '500', letterSpacing: 0.15 },
  stageFreeText: { color: '#ffffff', fontFamily: 'monospace' },
  stageTabBlock: { marginBottom: 30, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1d2535' },
  stageTabBlockTitle: { color: '#c8b7ff', fontWeight: '900', marginBottom: 14 },
  stageGridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  stageGridLabel: { width: 34, color: '#b77cff', fontWeight: '900', textAlign: 'center', fontFamily: 'monospace' },
  stageGridLabelWide: { width: 66 },
  stageGridDivider: { color: '#7f8ba3', width: 18, textAlign: 'center', fontFamily: 'monospace' },
  stageGridCell: { marginRight: 2, borderWidth: 1, borderColor: '#202a3d', borderRadius: 5, backgroundColor: '#0f1522', alignItems: 'center', justifyContent: 'center' },
  stageGridCellFilled: { borderColor: '#7850c7', backgroundColor: '#291b49' },
  stageGridCellTextFilled: { color: '#ffffff', fontFamily: 'monospace', fontWeight: '900' },
  stageGridCellTextEmpty: { color: '#47536a', fontFamily: 'monospace' },
  tabActionRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' },
  stageBarButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  stageBarPill: { backgroundColor: '#202838', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
    stageBar: { backgroundColor: COLORS.panel2, borderRadius: 13, padding: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 22, marginBottom: 16 },
  stageText: { color: '#a8b7cf', fontSize: 13 },
  tabs: { gap: 8, paddingBottom: 14 },
  tabButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel },
  tabButtonActive: { backgroundColor: COLORS.purple2, borderColor: COLORS.purple },
  tabText: { color: COLORS.muted, fontWeight: '700' },
  tabTextActive: { color: 'white' },
  contentCard: { minHeight: 270, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel, borderRadius: 16, padding: 18 },
  contentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26, gap: 14 },
  contentTitle: { color: COLORS.text, fontWeight: '850', fontSize: 18 },
  contentSub: { color: COLORS.muted, marginTop: 3 },
  emptyTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: COLORS.muted, lineHeight: 21, maxWidth: 650 },
  lyricsText: { color: COLORS.text, fontSize: 18, lineHeight: 30, letterSpacing: 0.1 },
  editWrap: { padding: 20, paddingBottom: 50, maxWidth: 720, width: '100%', alignSelf: 'center' },
  editHero: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 },
  editCover: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden', backgroundColor: COLORS.panel2 },
  formLabel: { color: '#c6d0e2', fontWeight: '700', fontSize: 13, marginBottom: 7, marginTop: 8 },
  formInput: { backgroundColor: COLORS.panel2, color: COLORS.text, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 15, paddingVertical: 13, fontSize: 16, marginBottom: 10 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  bassResultCard: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel2, borderRadius: 14, padding: 14, marginBottom: 12 },
  bassResultHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  bassTrackRow: { borderTopWidth: 1, borderTopColor: '#263047', paddingTop: 10, marginTop: 8 },
  bassTrackName: { color: COLORS.text, fontWeight: '800', fontSize: 14 },
  bassTrackMeta: { color: COLORS.muted, marginTop: 4, fontSize: 12, lineHeight: 18 },

  bassToolbar: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' },
  successInline: { color: COLORS.success, marginVertical: 10, fontWeight: '700' },
  savedTabsBlock: { marginBottom: 16 },
  savedTabRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, marginBottom: 8, backgroundColor: '#0d1320' },
  savedTabRowActive: { borderColor: COLORS.purple, backgroundColor: '#1b1530' },
  primaryTabCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, backgroundColor: '#0c121e', marginBottom: 18 },
  modeSwitch: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  modeButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.panel },
  modeButtonActive: { backgroundColor: COLORS.purple2, borderColor: COLORS.purple },
  modeButtonText: { color: COLORS.muted, fontWeight: '700', fontSize: 12 },
  modeButtonTextActive: { color: COLORS.text },
  webViewFrame: { height: 620, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
  webView: { flex: 1, backgroundColor: '#fff' },
  webViewLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.panel, gap: 10 },
  sectionEditor: { marginBottom: 12 },
  tabEditorInput: { minHeight: 110, backgroundColor: '#070b12', color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontFamily: 'monospace', fontSize: 14, lineHeight: 21 },
  tabEditorLarge: { minHeight: 180 },
  tabSectionCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: COLORS.panel2 },
  tabSectionTitle: { color: '#c8b4ff', fontWeight: '900', marginBottom: 10, fontSize: 15 },
  asciiTabText: { color: COLORS.text, fontFamily: 'monospace', fontSize: 14, lineHeight: 21 },
  searchVersionsBlock: { marginTop: 12 },

  
  visualEditorShell: { gap: 16 },
  visualEditorShellTablet: { flexDirection: 'row', alignItems: 'flex-start' },
  editorSettingsCard: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#0f1522', borderRadius: 14, padding: 15, marginBottom: 4 },
  editorSettingsCardTablet: { width: 292, flexShrink: 0 },
  editorPanelTitle: { color: COLORS.text, fontWeight: '900', fontSize: 15, marginBottom: 14 },
  editorMain: { flex: 1, minWidth: 0 },
  editorModeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  readonlyField: { backgroundColor: COLORS.panel2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 10 },
  readonlyFieldText: { color: '#d8e0ee', fontSize: 14, fontWeight: '700' },
  stringCountRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stringCountButton: { width: 48, height: 40, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel2, alignItems: 'center', justifyContent: 'center' },
  stringCountButtonActive: { backgroundColor: COLORS.purple2, borderColor: COLORS.purple },
  stringCountText: { color: COLORS.muted, fontWeight: '800' },
  stringCountTextActive: { color: COLORS.text },
  publicRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  switchTrack: { width: 42, height: 24, borderRadius: 12, backgroundColor: '#202838', padding: 3, justifyContent: 'center' },
  switchTrackOn: { backgroundColor: COLORS.purple2 },
  switchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#6d778b' },
  switchThumbOn: { alignSelf: 'flex-end', backgroundColor: '#fff' },
  visualBlockCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: '#0d1320', padding: 14, marginBottom: 14 },
  visualBlockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 },
  blockNameInput: { minWidth: 170, flexGrow: 1, maxWidth: 260, color: COLORS.text, backgroundColor: COLORS.panel2, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 9, fontWeight: '800' },
  blockHeaderActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  clearBlockButton: { borderWidth: 1, borderColor: '#7c2d3b', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  clearBlockText: { color: '#ff6b7d', fontSize: 12, fontWeight: '800' },
  removeBlockButton: { paddingHorizontal: 6, paddingVertical: 7 },
  removeBlockText: { color: '#ff536a', fontSize: 12, fontWeight: '800' },
  visualGridScroll: { paddingBottom: 4, paddingRight: 6 },
  visualGridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  stringLabel: { width: 22, color: '#a968ff', fontWeight: '900', textAlign: 'center', fontFamily: 'monospace' },
  instrumentRowLabel: { width: 52, fontSize: 11 },
  stringDivider: { color: COLORS.muted, width: 10, textAlign: 'center', fontFamily: 'monospace' },
  fretCell: { width: 34, height: 30, marginRight: 3, borderWidth: 1, borderColor: '#202a3d', borderRadius: 5, backgroundColor: '#111827', color: COLORS.text, padding: 0, textAlign: 'center', fontFamily: 'monospace', fontWeight: '800', fontSize: 13 },
  fretCellView: { width: 34, height: 30, marginRight: 3, borderWidth: 1, borderColor: '#202a3d', borderRadius: 5, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  fretCellFilled: { borderColor: '#7850c7', backgroundColor: '#2a1c4a' },
  fretCellTextFilled: { color: '#d8c6ff', fontFamily: 'monospace', fontWeight: '900', fontSize: 13 },
  fretCellTextEmpty: { color: '#56627a', fontFamily: 'monospace', fontSize: 13 },
  noteCell: { width: 52 },
  drumLegend: { backgroundColor: '#0a101b', borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, padding: 10, marginBottom: 12 },
  drumLegendText: { color: '#c9b2ff', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  addBlockButton: { borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 12 },
  addBlockText: { color: COLORS.text, fontWeight: '800' },

  setlistIcon: { width: 46, height: 46, borderRadius: 12, marginRight: 12, backgroundColor: '#1b263b', alignItems: 'center', justifyContent: 'center' },
  setlistIconText: { color: '#b6c9ef', fontSize: 26, fontWeight: '900' },
  setlistIntroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  setlistCountPill: { minWidth: 42, height: 42, paddingHorizontal: 10, borderRadius: 21, backgroundColor: '#2b1d48', alignItems: 'center', justifyContent: 'center' },
  setlistCountText: { color: '#c9b2ff', fontWeight: '900', fontSize: 15 },
  addSongsPanel: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#0d1320', borderRadius: 14, padding: 12, marginBottom: 14, maxHeight: 300 },
  addSongsScroll: { maxHeight: 220 },
  addSongRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#172033' },
  setlistSongsList: { paddingBottom: 40 },
  setlistSongRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: '#0d1320', paddingVertical: 8, paddingHorizontal: 8, marginBottom: 7 },
  setlistSongRowDragging: { borderColor: COLORS.purple, backgroundColor: '#21163a', opacity: 0.96, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  dragHandle: { width: 38, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  dragHandleText: { color: '#b99cff', fontSize: 28, fontWeight: '900' },
  setlistPosition: { width: 28, color: COLORS.muted, textAlign: 'center', fontWeight: '800' },
  setlistSongMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  removeSetlistSongButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#5a2731', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  removeSetlistSongText: { color: '#ff7b88', fontSize: 23, lineHeight: 25 },
    createPlaylistRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  playlistRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#121a28' },
  playlistIcon: { width: 46, height: 46, borderRadius: 12, marginRight: 12, backgroundColor: '#2b1d48', alignItems: 'center', justifyContent: 'center' },
  playlistIconText: { color: '#c6a7ff', fontSize: 22 },
  selectedSongCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 18 },
  doneText: { color: COLORS.success, fontWeight: '800', fontSize: 12 },
  addText: { color: '#b99cff', fontWeight: '800', fontSize: 12 },
});
