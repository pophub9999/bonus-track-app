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
  Linking,
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
    syncedLyrics: song.synced_lyrics ?? song.syncedLyrics ?? null,
    lyricsSource: song.lyrics_source ?? song.lyricsSource ?? null,
    lyricsSourceId: song.lyrics_source_id ?? song.lyricsSourceId ?? null,
  };
}

async function libraryGet(action, extra = {}) {
  const params = new URLSearchParams({ action, ...extra });
  const response = await fetch(`${LIBRARY_URL}?${params.toString()}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Accept: 'application/json',
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Erro ao aceder à biblioteca.');
  return data;
}

async function libraryPost(action, payload = {}) {
  const response = await fetch(LIBRARY_URL, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Erro ao atualizar a biblioteca.');
  return data;
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



function BassTabPanel({ song }) {
  const GRID_COLUMNS = 18;
  const { width } = useWindowDimensions();
  const tablet = width >= 760;

  const [savedTabs, setSavedTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [savedLoading, setSavedLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [showSource, setShowSource] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const [tabTitle, setTabTitle] = useState('');
  const [stringCount, setStringCount] = useState(4);
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

  function stringLabels(count, tuningLabel) {
    if (tuningLabel) {
      const parsed = tuningLabel
        .split('·')
        .map((item) => item.trim().replace(/[0-9]/g, ''))
        .filter(Boolean);
      if (parsed.length === count) return parsed.reverse();
    }
    if (count === 5) return ['G', 'D', 'A', 'E', 'B'];
    if (count === 6) return ['C', 'G', 'D', 'A', 'E', 'B'];
    return ['G', 'D', 'A', 'E'];
  }

  function normalizeBlocks(tab, count) {
    const incoming = Array.isArray(tab?.sections) ? tab.sections : [];
    const visual = incoming.filter((section) => section?.type === 'visual-block' || Array.isArray(section?.cells));

    if (!visual.length) {
      return [newBlock('Bloco 1', count)];
    }

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
    const count = Number(tab?.string_count || 4);
    const safeCount = count >= 4 && count <= 6 ? count : 4;
    setTabTitle(tab?.title || ((song.title || 'Tab') + ' - Baixo'));
    setStringCount(safeCount);
    setEditorMode(tab?.editor_mode === 'text' ? 'text' : 'visual');
    setIsPublic(Boolean(tab?.is_public));
    setBlocks(normalizeBlocks(tab, safeCount));
    setCustomTab(tab?.custom_tab || '');
  }

  async function loadSavedTabs(preferredId = null) {
    setSavedLoading(true);
    setError('');
    try {
      const data = await libraryGet('tabs', { songId: song.id, instrument: 'bass' });
      const tabs = data.tabs || [];
      setSavedTabs(tabs);
      const chosen = tabs.find((item) => item.id === preferredId)
        || tabs.find((item) => item.is_primary)
        || tabs[0]
        || null;
      setActiveTab(chosen);
      hydrateEditor(chosen);
      if (!chosen) setShowSource(false);
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar as tabs guardadas.');
    } finally {
      setSavedLoading(false);
    }
  }

  async function searchBassTabs() {
    setSearching(true);
    setError('');
    setSavedMessage('');
    try {
      const q = song.artist + ' ' + song.title;
      const response = await fetch(TAB_SEARCH_URL + '?q=' + encodeURIComponent(q), {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Accept: 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível procurar tablaturas.');
      setResults(data.results || []);
      setSearched(true);
    } catch (err) {
      setResults([]);
      setSearched(true);
      setError(err?.message || 'Erro ao procurar tablaturas de baixo.');
    } finally {
      setSearching(false);
    }
  }

  async function chooseVersion(result, track) {
    const key = String(result.songId) + '-' + String(track.index);
    setSavingKey(key);
    setError('');
    setSavedMessage('');
    try {
      const data = await libraryPost('save_tab_reference', {
        songId: song.id,
        instrument: 'bass',
        result,
        track,
      });
      await loadSavedTabs(data.tab?.id || null);
      setShowSource(true);
      setEditing(false);
      setSavedMessage('Versão guardada como principal.');
    } catch (err) {
      setError(err?.message || 'Não foi possível guardar esta versão.');
    } finally {
      setSavingKey('');
    }
  }

  async function makePrimary(tab) {
    if (!tab) return;
    if (tab.is_primary) {
      setActiveTab(tab);
      hydrateEditor(tab);
      return;
    }
    setSavingKey(tab.id);
    setError('');
    try {
      const data = await libraryPost('set_primary_tab', { tabId: tab.id });
      await loadSavedTabs(data.tab?.id || tab.id);
      setSavedMessage('Versão definida como principal.');
    } catch (err) {
      setError(err?.message || 'Não foi possível definir a versão principal.');
    } finally {
      setSavingKey('');
    }
  }

  function resizeStrings(nextCount) {
    setStringCount(nextCount);
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

  function updateCell(blockIndex, rowIndex, colIndex, value) {
    const clean = value.replace(/[^0-9]/g, '').slice(0, 2);
    setBlocks((prev) => prev.map((block, index) => {
      if (index !== blockIndex) return block;
      const cells = block.cells.map((row, r) => {
        if (r !== rowIndex) return row;
        return row.map((cell, col) => col === colIndex ? clean : cell);
      });
      return { ...block, cells };
    }));
  }

  function clearBlock(blockIndex) {
    setBlocks((prev) => prev.map((block, index) =>
      index === blockIndex ? { ...block, cells: emptyRows(stringCount) } : block
    ));
  }

  function removeBlock(blockIndex) {
    setBlocks((prev) => prev.filter((_, index) => index !== blockIndex));
  }

  function addBlock() {
    setBlocks((prev) => [...prev, newBlock('Bloco ' + (prev.length + 1), stringCount)]);
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
        stringCount,
        isPublic,
        editorMode,
        sections: blocks,
        customTab,
      });
      setActiveTab(data.tab);
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

  function sourceUri(tab) {
    if (!tab?.source_url) return null;
    const joiner = tab.source_url.includes('?') ? '&' : '?';
    return tab.source_url + joiner + 'inst=bass';
  }

  function renderGrid(block, blockIndex, editable) {
    const labels = stringLabels(stringCount, activeTab?.tuning_label);
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.visualGridScroll}>
        <View>
          {Array.from({ length: stringCount }, (_, rowIndex) => (
            <View key={'row-' + rowIndex} style={styles.visualGridRow}>
              <Text style={styles.stringLabel}>{labels[rowIndex] || ''}</Text>
              <Text style={styles.stringDivider}>|</Text>
              {Array.from({ length: GRID_COLUMNS }, (_, colIndex) => {
                const value = block.cells?.[rowIndex]?.[colIndex] || '';
                return editable ? (
                  <TextInput
                    key={'cell-' + rowIndex + '-' + colIndex}
                    value={value}
                    onChangeText={(text) => updateCell(blockIndex, rowIndex, colIndex, text)}
                    keyboardType="number-pad"
                    maxLength={2}
                    selectTextOnFocus
                    style={[styles.fretCell, value ? styles.fretCellFilled : null]}
                    placeholder="–"
                    placeholderTextColor="#56627a"
                  />
                ) : (
                  <View key={'cell-' + rowIndex + '-' + colIndex} style={[styles.fretCellView, value ? styles.fretCellFilled : null]}>
                    <Text style={value ? styles.fretCellTextFilled : styles.fretCellTextEmpty}>{value || '–'}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  useEffect(() => {
    loadSavedTabs();
  }, [song.id]);

  useEffect(() => {
    if (!savedLoading && savedTabs.length === 0 && !searched && !searching) {
      searchBassTabs();
    }
  }, [savedLoading, savedTabs.length, searched, searching]);

  if (savedLoading) {
    return (
      <View style={styles.feedbackBox}>
        <ActivityIndicator />
        <Text style={styles.feedbackText}>A carregar tabs guardadas…</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.bassToolbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.emptyTitle}>Tab de baixo</Text>
          <Text style={styles.emptyText}>
            Guarda uma versão do Songsterr como referência e cria a tua versão visual dentro do Bonus Track.
          </Text>
        </View>
        <TouchableOpacity style={styles.primarySmall} onPress={searchBassTabs} disabled={searching}>
          <Text style={styles.primaryText}>{searching ? 'A procurar…' : '↻ Procurar versões'}</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorInline}>{error}</Text> : null}
      {savedMessage ? <Text style={styles.successInline}>{savedMessage}</Text> : null}

      {savedTabs.length > 0 ? (
        <View style={styles.savedTabsBlock}>
          <Text style={styles.resultLabel}>VERSÕES GUARDADAS</Text>
          {savedTabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.savedTabRow, activeTab?.id === tab.id && styles.savedTabRowActive]}
              onPress={() => makePrimary(tab)}
              disabled={savingKey === tab.id}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.songTitle}>
                  {(tab.title || tab.source_track_name || 'Baixo') + (tab.is_primary ? ' · Principal' : '')}
                </Text>
                <Text style={styles.songArtist}>
                  {(tab.source_artist || song.artist) + ' · ' + (tab.source_title || song.title)}
                </Text>
                <Text style={styles.songMeta}>
                  {(tab.string_count || 4) + ' cordas' + (tab.tuning_label ? ' · ' + tab.tuning_label : '')}
                </Text>
              </View>
              {savingKey === tab.id ? <ActivityIndicator /> : <Text style={styles.chevron}>›</Text>}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {activeTab ? (
        <View style={styles.primaryTabCard}>
          <View style={styles.bassResultHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.songTitle}>{activeTab.title || activeTab.source_title || song.title}</Text>
              <Text style={styles.songArtist}>
                {(activeTab.source_artist || song.artist) + (activeTab.source_track_name ? ' · ' + activeTab.source_track_name : '')}
              </Text>
              {activeTab.tuning_label ? <Text style={styles.songMeta}>{'Afinação: ' + activeTab.tuning_label}</Text> : null}
            </View>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => activeTab.source_url && Linking.openURL(activeTab.source_url)}
            >
              <Text style={styles.secondaryButtonText}>Abrir fonte ↗</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modeSwitch}>
            <TouchableOpacity
              style={[styles.modeButton, showSource && !editing && styles.modeButtonActive]}
              onPress={() => { setShowSource(true); setEditing(false); }}
            >
              <Text style={[styles.modeButtonText, showSource && !editing && styles.modeButtonTextActive]}>Fonte</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, !showSource && !editing && styles.modeButtonActive]}
              onPress={() => { setShowSource(false); setEditing(false); }}
            >
              <Text style={[styles.modeButtonText, !showSource && !editing && styles.modeButtonTextActive]}>Minha tab</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, editing && styles.modeButtonActive]}
              onPress={() => { setShowSource(false); setEditing(true); hydrateEditor(activeTab); }}
            >
              <Text style={[styles.modeButtonText, editing && styles.modeButtonTextActive]}>Editar</Text>
            </TouchableOpacity>
          </View>

          {showSource && !editing ? (
            sourceUri(activeTab) ? (
              <View style={styles.webViewFrame}>
                <WebView
                  source={{ uri: sourceUri(activeTab) }}
                  style={styles.webView}
                  startInLoadingState
                  renderLoading={() => (
                    <View style={styles.webViewLoading}>
                      <ActivityIndicator />
                      <Text style={styles.feedbackText}>A carregar a tab do Songsterr…</Text>
                    </View>
                  )}
                  javaScriptEnabled
                  domStorageEnabled
                  sharedCookiesEnabled
                  allowsInlineMediaPlayback
                />
              </View>
            ) : (
              <Text style={styles.emptyText}>Esta versão não tem um endereço de origem disponível.</Text>
            )
          ) : editing ? (
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
                  <Text style={styles.readonlyFieldText}>🎸 Baixo</Text>
                </View>

                <Text style={styles.formLabel}>Número de cordas</Text>
                <View style={styles.stringCountRow}>
                  {[4, 5, 6].map((count) => (
                    <TouchableOpacity
                      key={count}
                      style={[styles.stringCountButton, stringCount === count && styles.stringCountButtonActive]}
                      onPress={() => resizeStrings(count)}
                    >
                      <Text style={[styles.stringCountText, stringCount === count && styles.stringCountTextActive]}>
                        {count}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

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
                      placeholder="Escreve ou cola aqui a tua tab em formato livre."
                      placeholderTextColor={COLORS.muted}
                      style={[styles.tabEditorInput, styles.tabEditorLarge]}
                    />
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View>
              {activeTab.editor_mode === 'text' && activeTab.custom_tab?.trim() ? (
                <View style={styles.tabSectionCard}>
                  <Text style={styles.tabSectionTitle}>Tab / notas</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <Text style={styles.asciiTabText} selectable>{activeTab.custom_tab}</Text>
                  </ScrollView>
                </View>
              ) : (
                <View>
                  {(Array.isArray(activeTab.sections) ? activeTab.sections : [])
                    .filter((block) => block?.type === 'visual-block' || Array.isArray(block?.cells))
                    .map((block, blockIndex) => (
                      <View key={block.id || String(blockIndex)} style={styles.visualBlockCard}>
                        <Text style={styles.tabSectionTitle}>{block.name || ('Bloco ' + (blockIndex + 1))}</Text>
                        {renderGrid({
                          ...block,
                          cells: Array.from({ length: activeTab.string_count || 4 }, (_, rowIndex) => {
                            const existing = Array.isArray(block?.cells?.[rowIndex]) ? block.cells[rowIndex] : [];
                            return Array.from({ length: GRID_COLUMNS }, (_, colIndex) => String(existing[colIndex] ?? ''));
                          }),
                        }, blockIndex, false)}
                      </View>
                    ))}

                  {!Array.isArray(activeTab.sections) || !activeTab.sections.some((block) => Array.isArray(block?.cells)) ? (
                    <View style={styles.feedbackBox}>
                      <Text style={styles.emptyTitle}>Ainda não criaste a tua tab visual.</Text>
                      <Text style={styles.feedbackText}>Carrega em “Editar” para adicionar blocos e posições.</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          )}
        </View>
      ) : null}

      {searched ? (
        <View style={styles.searchVersionsBlock}>
          <Text style={styles.resultLabel}>RESULTADOS SONGSTERR</Text>
          {searching ? (
            <View style={styles.feedbackBox}>
              <ActivityIndicator />
              <Text style={styles.feedbackText}>A procurar versões com baixo…</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackText}>Não encontrei uma versão com baixo.</Text>
            </View>
          ) : (
            results.map((result) => (
              <View key={String(result.songId)} style={styles.bassResultCard}>
                <View style={styles.bassResultHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.songTitle}>{result.title}</Text>
                    <Text style={styles.songArtist}>{result.artist}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => Linking.openURL(result.songsterrUrl || result.searchUrl)}
                  >
                    <Text style={styles.secondaryButtonText}>Pré-visualizar ↗</Text>
                  </TouchableOpacity>
                </View>

                {result.bassTracks.map((track) => {
                  const key = String(result.songId) + '-' + String(track.index);
                  return (
                    <View key={key} style={styles.bassTrackRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bassTrackName}>{track.name || track.instrument}</Text>
                        <Text style={styles.bassTrackMeta}>
                          {track.instrument}
                          {track.tuningLabel ? ' · ' + track.tuningLabel : ''}
                          {track.views ? ' · ' + track.views.toLocaleString() + ' visualizações' : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.primarySmall}
                        onPress={() => chooseVersion(result, track)}
                        disabled={Boolean(savingKey)}
                      >
                        {savingKey === key
                          ? <ActivityIndicator />
                          : <Text style={styles.primaryText}>Usar esta versão</Text>}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function SongDetail({ song, onBack, onPlaylist, onEdit, onSongUpdate }) {
  const [tab, setTab] = useState('Letra');
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState('');
  const { width } = useWindowDimensions();
  const tablet = width >= 760;

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
                  : tab === 'Baixo'
                    ? 'Pesquisa automática de tablaturas de baixo'
                    : 'Conteúdo da música'}
              </Text>
            </View>
            {tab !== 'Letra' && tab !== 'Baixo' ? (
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
              <Text style={styles.lyricsText} selectable>{song.lyrics}</Text>
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
          ) : tab === 'Baixo' ? (
            <BassTabPanel song={song} />
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
    </SafeAreaView>
  );
}

function EditSong({ song, onBack, onSave }) {
  const [title, setTitle] = useState(song.title || '');
  const [artist, setArtist] = useState(song.artist || '');
  const [album, setAlbum] = useState(song.album || '');
  const [year, setYear] = useState(song.year ? String(song.year) : '');
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
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [screen, setScreen] = useState('songs');
  const [selected, setSelected] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
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

  useEffect(() => {
    loadSongs();
    loadPlaylists();
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
    setScreen('detail');
  }

  async function saveSongEdits(fields) {
    const data = await libraryPost('update_song', { songId: selected.id, fields });
    const updated = normalizeSong(data.song);
    updateSong(updated);
    setScreen('detail');
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
        onBack={() => setScreen('songs')}
        onPlaylist={() => setScreen('playlistPicker')}
        onEdit={() => setScreen('edit')}
        onSongUpdate={updateSong}
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
        onOpenSong={(song) => { setSelected(song); setScreen('detail'); }}
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

          {libraryError ? <Text style={styles.errorInline}>{libraryError}</Text> : null}

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
                <TouchableOpacity style={styles.songRow} onPress={() => { setSelected(item); setScreen('detail'); }}>
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
  stringDivider: { color: COLORS.muted, width: 10, textAlign: 'center', fontFamily: 'monospace' },
  fretCell: { width: 34, height: 30, marginRight: 3, borderWidth: 1, borderColor: '#202a3d', borderRadius: 5, backgroundColor: '#111827', color: COLORS.text, padding: 0, textAlign: 'center', fontFamily: 'monospace', fontWeight: '800', fontSize: 13 },
  fretCellView: { width: 34, height: 30, marginRight: 3, borderWidth: 1, borderColor: '#202a3d', borderRadius: 5, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  fretCellFilled: { borderColor: '#7850c7', backgroundColor: '#2a1c4a' },
  fretCellTextFilled: { color: '#d8c6ff', fontFamily: 'monospace', fontWeight: '900', fontSize: 13 },
  fretCellTextEmpty: { color: '#56627a', fontFamily: 'monospace', fontSize: 13 },
  addBlockButton: { borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 12 },
  addBlockText: { color: COLORS.text, fontWeight: '800' },

  createPlaylistRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  playlistRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#121a28' },
  playlistIcon: { width: 46, height: 46, borderRadius: 12, marginRight: 12, backgroundColor: '#2b1d48', alignItems: 'center', justifyContent: 'center' },
  playlistIconText: { color: '#c6a7ff', fontSize: 22 },
  selectedSongCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 18 },
  doneText: { color: COLORS.success, fontWeight: '800', fontSize: 12 },
  addText: { color: '#b99cff', fontWeight: '800', fontSize: 12 },
});
