/**
 * CHAM TOEIC – Main Application
 * Manages: Home page, Setup Modal, Test Workspace, Timer, Score Results
 */

/* ── Version (tăng khi update code để clear cache cũ) ─────── */
const APP_VERSION = '2.4.0';
const SESSION_KEY = `toeic_session_v${APP_VERSION.replace(/\./g, '_')}`;

/* ── Constants ────────────────────────────────────────────── */
const TESTS_META = [
  { id: 'bai-on-1', testNumber: 1, title: 'Bài Ôn Tập 1', dataFile: 'public/data/test-1.json', tag: 'LISTENING + READING' },
  { id: 'bai-on-2', testNumber: 2, title: 'Bài Ôn Tập 2', dataFile: 'public/data/test-2.json', tag: 'LISTENING + READING' },
  { id: 'bai-on-3', testNumber: 3, title: 'Bài Ôn Tập 3', dataFile: 'public/data/test-3.json', tag: 'LISTENING + READING' },
  { id: 'bai-on-4', testNumber: 4, title: 'Bài Ôn Tập 4', dataFile: 'public/data/test-4.json', tag: 'LISTENING + READING' },
  { id: 'bai-on-5', testNumber: 5, title: 'Bài Ôn Tập 5', dataFile: 'public/data/test-5.json', tag: 'READING ONLY' },
];

const PART_CONFIG = [
  { key: 'part1', label: 'Part 1', count: 6  },
  { key: 'part2', label: 'Part 2', count: 25 },
  { key: 'part3', label: 'Part 3', count: 39 },
  { key: 'part4', label: 'Part 4', count: 30 },
  { key: 'part5', label: 'Part 5', count: 30 },
  { key: 'part6', label: 'Part 6', count: 16 },
  { key: 'part7', label: 'Part 7', count: 54 },
];

/* ── State ────────────────────────────────────────────────── */
const S = {
  currentTest: null,     // test JSON data object
  currentTestMeta: null, // from TESTS_META
  mode: 'practice',      // 'practice' | 'exam'
  selectedParts: ['part1','part2','part3','part4','part5','part6','part7'],
  activePart: 'part1',
  activeQId: null,
  answers: {},           // { qId: 'A'|'B'|'C'|'D' }
  flagged: new Set(),
  timerSeconds: 7200,
  timerInterval: null,
  submitted: false,
  startTime: null,
  transcriptVisible: {}, // { groupId: true/false } - Part3/4 transcript toggle
  shuffleMap: {},        // { qId: [displayIdx → originalIdx] } – deterministic shuffle cho Reading
};

/**
 * Tạo shuffle mapping deterministic theo qId (không ngẫu nhiên mỗi lần render).
 * Trả về mảng indices: shuffleMap[i] = chỉ số gốc của option ở vị trí hiển thị i.
 * Ví dụ: [2,0,3,1] nghĩa là: hiển thị slot 0 = option gốc C, slot 1 = A, ...
 */
function getShuffleMap(qId, optCount) {
  if (S.shuffleMap[qId]) return S.shuffleMap[qId];
  const indices = Array.from({ length: optCount }, (_, i) => i);
  // Seeded Fisher-Yates: dùng qId làm seed để kết quả ổn định
  let seed = qId * 2654435761 >>> 0; // multiplicative hash
  for (let i = indices.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  S.shuffleMap[qId] = indices;
  return indices;
}

/* ── DOM references (lazy) ───────────────────────────────── */
const $ = id => document.getElementById(id);

/* ============================================================
   PAGE VIEWS
   ============================================================ */
function showView(id) {
  document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
  const view = $(id);
  if (view) view.classList.add('active');
  window.scrollTo(0, 0);
}

/* ============================================================
   HOME PAGE – render test cards
   ============================================================ */
function renderHome() {
  const grid = $('testGrid');
  if (!grid) return;

  grid.innerHTML = TESTS_META.map((t, idx) => {
    const isReadingOnly = t.tag === 'READING ONLY';
    const qCount  = isReadingOnly ? 100   : 200;
    const timeStr = isReadingOnly ? "75'"  : "120'";
    const pCount  = isReadingOnly ? 3      : 7;
    const subtitle = isReadingOnly ? `${qCount} câu hỏi • ${pCount} phần thi • Reading` : `${qCount} câu hỏi • ${pCount} phần thi • Nghe + Đọc`;
    return `
    <div class="test-card" data-idx="${idx}">
      <div class="test-card-head">
        <div class="test-num-badge">${t.testNumber}</div>
        <span class="test-card-tag">${t.tag}</span>
      </div>
      <div class="test-card-title">${t.title}</div>
      <div class="test-card-subtitle">${subtitle}</div>
      <div class="test-card-meta">
        <div class="meta-chip">
          <span class="meta-chip-val">${qCount}</span>
          <span class="meta-chip-label">Câu hỏi</span>
        </div>
        <div class="meta-chip">
          <span class="meta-chip-val">${timeStr}</span>
          <span class="meta-chip-label">Thời gian</span>
        </div>
        <div class="meta-chip">
          <span class="meta-chip-val">${pCount}</span>
          <span class="meta-chip-label">Phần thi</span>
        </div>
      </div>
      <div class="test-card-actions">
        <button class="btn-practice" onclick="openSetupModal(${idx}, 'practice')">Luyện tập</button>
        <button class="btn-exam"     onclick="openSetupModal(${idx}, 'exam')">Thi thử</button>
      </div>
    </div>
  `;
  }).join('');
}

/* ============================================================
   SETUP MODAL
   ============================================================ */
function openSetupModal(testIdx, defaultMode) {
  S.currentTestMeta = TESTS_META[testIdx];
  S.mode = defaultMode;

  // Pre-select appropriate parts based on test type
  const isReadingOnly = S.currentTestMeta.tag === 'READING ONLY';
  S.selectedParts = isReadingOnly
    ? ['part5', 'part6', 'part7']
    : ['part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'];

  // Set modal title
  $('modalTestTitle').textContent = S.currentTestMeta.title;

  // Switch active tab and show correct button
  selectModalTab(defaultMode);

  // Render part checkboxes
  renderModalParts();

  // Show modal
  $('setupModal').classList.remove('hidden');
}

function _syncStartButtons(mode) {
  const pBtn = $('btnStartPractice');
  const eBtn = $('btnStartExam');
  if (!pBtn || !eBtn) return;
  pBtn.classList.toggle('hidden', mode !== 'practice');
  eBtn.classList.toggle('hidden', mode !== 'exam');
}

function closeSetupModal() {
  $('setupModal').classList.add('hidden');
}

function selectModalTab(mode) {
  S.mode = mode;
  $('tabModePractice').classList.toggle('active', mode === 'practice');
  $('tabModeExam').classList.toggle('active', mode === 'exam');
  $('panelPracticeSetup').style.display = mode === 'practice' ? 'block' : 'none';
  $('panelExamSetup').style.display    = mode === 'exam'     ? 'block' : 'none';
  _syncStartButtons(mode);
}

function renderModalParts() {
  const container = $('partsContainer');
  if (!container) return;

  const isReadingOnly = S.currentTestMeta && S.currentTestMeta.tag === 'READING ONLY';
  const listeningParts = ['part1','part2','part3','part4'];

  container.innerHTML = PART_CONFIG.map(p => {
    const unavailable = isReadingOnly && listeningParts.includes(p.key);
    const checked = !unavailable && S.selectedParts.includes(p.key);
    return `
    <label class="part-check-item ${checked ? 'checked' : ''} ${unavailable ? 'disabled' : ''}" 
           id="part-label-${p.key}"
           onclick="${unavailable ? '' : `togglePartCheck('${p.key}', this)`}">
      <input type="checkbox" class="part-cb" id="cb-${p.key}" value="${p.key}"
             ${checked ? 'checked' : ''} ${unavailable ? 'disabled' : ''} />
      <span class="part-check-label">${p.label}</span>
      <span class="part-check-count">${unavailable ? 'Không có' : p.count + ' câu'}</span>
    </label>
  `;
  }).join('');
}

function togglePartCheck(key, labelEl) {
  const cb = $(`cb-${key}`);
  // toggle is handled by the label/input naturally; sync state
  setTimeout(() => {
    const checked = cb.checked;
    labelEl.classList.toggle('checked', checked);
    if (checked && !S.selectedParts.includes(key)) {
      S.selectedParts.push(key);
    } else if (!checked) {
      S.selectedParts = S.selectedParts.filter(k => k !== key);
    }
  }, 0);
}

function selectAllParts() {
  const isReadingOnly = S.currentTestMeta && S.currentTestMeta.tag === 'READING ONLY';
  S.selectedParts = isReadingOnly
    ? ['part5', 'part6', 'part7']
    : PART_CONFIG.map(p => p.key);
  renderModalParts();
}
function clearAllParts() {
  S.selectedParts = [];
  renderModalParts();
}

/* ============================================================
   START TEST
   ============================================================ */
async function startTest() {
  if (S.mode === 'exam') {
    const isReadingOnly = S.currentTestMeta && S.currentTestMeta.tag === 'READING ONLY';
    S.selectedParts = isReadingOnly
      ? ['part5', 'part6', 'part7']
      : PART_CONFIG.map(p => p.key);
    S.timerSeconds = isReadingOnly ? 4500 : 7200; // 75 mins for reading only, 120 mins full
  } else {
    if (S.selectedParts.length === 0) {
      alert('Vui lòng chọn ít nhất một phần thi!');
      return;
    }
    const mins = parseInt($('timerSelect')?.value || '120');
    S.timerSeconds = mins * 60;
  }

  // Reset state
  S.answers = {};
  S.flagged.clear();
  S.submitted = false;
  S.shuffleMap = {};     // Reset shuffle khi bắt đầu bài mới
  S.startTime = new Date();
  S.activePart = S.selectedParts[0];

  closeSetupModal();

  // Load test data (cache-busting bằng APP_VERSION)
  try {
    $('loadingSpinner')?.classList.remove('hidden');
    const dataUrl = `${S.currentTestMeta.dataFile}?v=${APP_VERSION}`;
    const resp = await fetch(dataUrl, { cache: 'no-store' });
    S.currentTest = await resp.json();
    $('loadingSpinner')?.classList.add('hidden');
  } catch (err) {
    $('loadingSpinner')?.classList.add('hidden');
    alert('Không thể tải dữ liệu đề thi. Vui lòng kiểm tra kết nối!');
    return;
  }

  saveSession();  // Lưu session ngay khi bắt đầu
  showView('viewWorkspace');
  startTimer();
  renderWorkspace();
}

/* ============================================================
   TIMER
   ============================================================ */
function startTimer() {
  clearInterval(S.timerInterval);
  updateTimerDisplay();
  let autoSaveCounter = 0;
  S.timerInterval = setInterval(() => {
    if (S.timerSeconds <= 0) {
      clearInterval(S.timerInterval);
      autoSubmit();
      return;
    }
    S.timerSeconds--;
    updateTimerDisplay();
    // Auto-save mỗi 30 giây
    autoSaveCounter++;
    if (autoSaveCounter >= 30) {
      autoSaveCounter = 0;
      saveSession();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = $('timerDisplay');
  if (!el) return;
  const h = Math.floor(S.timerSeconds / 3600);
  const m = Math.floor((S.timerSeconds % 3600) / 60);
  const s = S.timerSeconds % 60;
  const text = h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`;
  el.textContent = text;
  el.parentElement.className = 'timer-display';
  if (S.timerSeconds <= 300) el.parentElement.classList.add('warning');
  if (S.timerSeconds <= 60)  el.parentElement.classList.add('urgent');
}
const pad = n => String(n).padStart(2, '0');

function autoSubmit() {
  alert('⏰ Hết giờ! Hệ thống sẽ tự động nộp bài.');
  submitTest();
}

/* ============================================================
   WORKSPACE RENDERING
   ============================================================ */
function renderWorkspace() {
  const part = S.currentTest.parts[S.activePart];
  if (!part) return;

  // Set default activeQId if not in current part
  if (!S.activeQId || !part.questions.find(q => q.id === S.activeQId)) {
    S.activeQId = part.questions[0]?.id || 1;
  }

  // Part badge
  const badge = $('currentPartPill');
  if (badge) badge.textContent = part.name.split(' - ')[0];

  // Audio bar
  const audioBar = $('audioBar');
  const hasAudio = part.audio && part.audio.length > 0;
  if (audioBar) audioBar.style.display = hasAudio ? 'flex' : 'none';
  if (hasAudio) {
    AP.pause();
    AP.load(part.audio);
  }

  // Media panel for currently active question / passage group
  renderMediaPanel(part, S.activeQId);

  // Questions
  const panel = $('questionsPanel');
  if (panel) {
    panel.innerHTML = part.questions.map((q, idx) => renderQuestionCard(q, idx, part.questions)).join('');
    bindQuestionEvents(part.questions);
  }

  // Palette
  renderPalette();
}

function renderMediaPanel(part, targetQId) {
  const panel = $('mediaPanel');
  if (!panel) return;

  const qId = targetQId || S.activeQId || part.questions[0]?.id;
  const currentQ = part.questions.find(q => q.id === qId) || part.questions[0];
  const imgSrc = currentQ?.image || currentQ?.passageImage || '';

  const isReadingPart = ['part5','part6','part7'].includes(S.activePart);
  const isPart34 = ['part3','part4'].includes(S.activePart);

  // Build label
  const labelText = currentQ.group 
    ? `${part.name.split(' - ')[0]} – Câu ${currentQ.group}`
    : `${part.name.split(' - ')[0]} – Câu ${currentQ.id}`;

  // ── Part 3/4: Show transcript panel if toggled ──────────────────
  if (isPart34) {
    const groupId = currentQ.group || String(currentQ.id);
    const showTrans = S.transcriptVisible[groupId];
    if (showTrans) {
      panel.innerHTML = buildTranscriptPanel(part, currentQ, labelText);
      return;
    }
  }

  // Passage title badge for reading parts
  const passageBadge = isReadingPart && currentQ.passageTitle
    ? `<div class="media-passage-badge">
         <span class="media-passage-icon">📖</span>
         <span>${currentQ.passageTitle}</span>
       </div>`
    : '';

  // Click-to-zoom hint
  const zoomHint = imgSrc
    ? `<div class="media-zoom-hint">🔍 Nhấn vào ảnh để xem toàn màn hình</div>`
    : '';

  if (imgSrc) {
    panel.innerHTML = `
      <span class="media-panel-label">${labelText}</span>
      ${passageBadge}
      <img src="${imgSrc}" alt="Hình ảnh ${labelText}" 
           onclick="openImageFull('${imgSrc}')" 
           style="cursor:zoom-in; width:100%; border-radius:8px; box-shadow:0 2px 12px rgba(0,0,0,.12);" 
           onerror="this.parentElement.innerHTML='<div class=\'no-media-placeholder\'><div class=\'icon\'>⚠️</div><div>Không tải được hình ảnh</div></div>'" />
      ${zoomHint}
    `;
  } else {
    const iconLabel = S.activePart === 'part5' ? '📝' : '📄';
    const msgText = S.activePart === 'part5'
      ? 'Part 5 – Câu độc lập<br>Đọc câu hỏi ở cột giữa'
      : 'Không có hình ảnh đính kèm<br>Đọc câu hỏi ở cột giữa';
    panel.innerHTML = `
      <span class="media-panel-label">${labelText}</span>
      <div class="no-media-placeholder">
        <div class="icon">${iconLabel}</div>
        <div>${msgText}</div>
      </div>
    `;
  }
}

/**
 * Build transcript panel HTML for Part 3/4 media panel.
 * Highlights sentences that relate to the active question.
 */
function buildTranscriptPanel(part, currentQ, labelText) {
  const groupId = currentQ.group || String(currentQ.id);
  const groupQs = part.questions.filter(q =>
    (q.group && q.group === currentQ.group) || q.id === currentQ.id
  );

  // Get transcript from first question in group
  const rawTranscript = (groupQs[0]?.transcript || '').trim();

  // Detect placeholder transcripts (short or starts with Vietnamese description)
  const isPlaceholder = rawTranscript.length < 250 ||
    rawTranscript.startsWith('(Hội thoại') ||
    rawTranscript.startsWith('(Bài nói') ||
    rawTranscript.startsWith('Hội thoại') ||
    rawTranscript.startsWith('Bài nói') ||
    rawTranscript.startsWith('Thông báo') ||
    rawTranscript.startsWith('Quảng cáo');

  // Count correct answers in this group
  const correctCount = groupQs.filter(q => S.answers[q.id] && S.answers[q.id] === q.answer).length;
  const answeredCount = groupQs.filter(q => S.answers[q.id]).length;
  const totalInGroup = groupQs.length;

  const scoreBadge = `<div class="trans-score-badge">
     <span class="trans-score-correct">${correctCount}/${totalInGroup}</span>
     <span class="trans-score-label"> câu đúng</span>
   </div>`;

  // Per-question mini badges
  const activeQId = S.activeQId;
  const qBadges = groupQs.map(q => {
    const ans = S.answers[q.id];
    let cls = 'trans-q-badge';
    if (ans && ans === q.answer) cls += ' correct';
    else if (ans) cls += ' wrong';
    else if (q.id === activeQId) cls += ' active';
    return `<span class="${cls}" title="Q${q.id}: ${q.text ? q.text.substring(0,50) : ''}"
              onclick="S.activeQId=${q.id}; renderMediaPanel(S.currentTest.parts[S.activePart], ${q.id}); renderPalette();">Q${q.id}</span>`;
  }).join('');

  // ── Content section ──────────────────────────────────────────
  let contentHtml;

  if (isPlaceholder) {
    // No real transcript available
    contentHtml = `
      <div class="trans-no-data">
        <div class="trans-no-data-icon">🎧</div>
        <div class="trans-no-data-title">Chưa có script</div>
        <div class="trans-no-data-msg">
          Script của đoạn hội thoại này chưa được xử lý.<br>
          <strong>Gợi ý:</strong> Nghe lại audio và chú ý các từ khóa trong câu hỏi bên phải.
        </div>
        <div class="trans-question-hints">
          ${groupQs.map(q => `
            <div class="trans-q-hint-row ${q.id === activeQId ? 'active-q' : ''}">
              <span class="trans-q-hint-num">Q${q.id}</span>
              <span class="trans-q-hint-text">${q.text ? q.text.replace(/^\d+\.\s*/, '') : ''}</span>
            </div>`).join('')}
        </div>
      </div>`;
  } else {
    // Real transcript - split into speaker turns and sentences
    // Detect speaker-tagged format (Man:, Woman:, M:, W:, Speaker 1:, etc.)
    const hasSpeakerTags = /^(Man|Woman|M|W|Speaker\s*\d+|A|B)[\s:]/im.test(rawTranscript);

    let sentences;
    if (hasSpeakerTags) {
      // Split by speaker turns
      sentences = rawTranscript
        .split(/\n/)
        .map(s => s.trim())
        .filter(Boolean);
    } else {
      // Split by sentence boundary
      sentences = rawTranscript
        .replace(/([.!?])\s+/g, '$1\n')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 2);
    }

    // Extract keywords from ALL questions in the group
    const allGroupKeywords = groupQs.flatMap(q => {
      const qWords = (q.text || '').toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 &&
          !['what','when','where','which','does','will','they','this','that',
            'have','with','from','about','most','likely','woman','according',
            'mention','suggest','imply','does','man','say','speaker'].includes(w));
      const optWords = Object.values(q.options || {}).flatMap(opt =>
        (opt || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
          .filter(w => w.length > 4)
      );
      return [...qWords, ...optWords];
    });

    const allKeywords = [...new Set(allGroupKeywords)];

    const sentenceHtml = sentences.map((sentence) => {
      const lower = sentence.toLowerCase();

      // Detect speaker prefix for styling
      const speakerMatch = sentence.match(/^(Man|Woman|M|W|Speaker\s*\d+)[:\s]/i);
      const speakerTag = speakerMatch
        ? `<span class="trans-speaker ${speakerMatch[1].toLowerCase().startsWith('w') ? 'trans-speaker-w' : 'trans-speaker-m'}">${speakerMatch[1]}</span>`
        : '';

      const textContent = speakerMatch
        ? sentence.replace(/^(Man|Woman|M|W|Speaker\s*\d+)[:\s]*/i, '').trim()
        : sentence;

      // Highlight matching keywords in the text
      let displayText = textContent;
      if (allKeywords.length > 0) {
        const kwPattern = new RegExp(`(${allKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
        displayText = textContent.replace(kwPattern, '<mark class="trans-kw-mark">$1</mark>');
      }

      const isHighlighted = allKeywords.length > 0 && allKeywords.some(kw => lower.includes(kw));

      return `<div class="trans-sentence ${isHighlighted ? 'trans-highlight' : ''}">
        ${speakerTag}
        <span class="trans-sent-text">${displayText}</span>
      </div>`;
    }).join('');

    contentHtml = `
      <div class="trans-body">
        <div class="trans-label">📜 Full Script hội thoại — <span style="font-weight:600;color:#166534;">Nội dung tô xanh lá liên quan đến đáp án</span></div>
        <div class="trans-sentences">${sentenceHtml}</div>
      </div>`;
  }

  return `
    <div class="trans-panel">
      <div class="trans-panel-header">
        <span class="media-panel-label">${labelText}</span>
        <button class="trans-close-btn" onclick="toggleGroupTranscript('${groupId}')" title="Đóng script">✕ Ẩn script</button>
      </div>
      <div class="trans-q-row">${qBadges}${scoreBadge}</div>
      ${contentHtml}
    </div>`;
}

function renderQuestionCard(q, idx, allQs) {
  const isListening = ['part1','part2','part3','part4'].includes(S.activePart);
  const isPart2 = S.activePart === 'part2';
  const hasSeg = isListening && q.startTime !== undefined && q.endTime !== undefined;
  const isFlagged = S.flagged.has(q.id);
  const answered = S.answers[q.id];

  // ── Parse Part 2 transcript → extract real option texts ──────────────────
  let p2Parsed = null;
  if (isPart2 && q.transcript) {
    p2Parsed = parseP2Transcript(q.transcript);
  }

  const prevQ = allQs && idx > 0 ? allQs[idx - 1] : null;
  const isNewGroup = !prevQ || (q.group && prevQ.group !== q.group) || (q.passageTitle && prevQ.passageTitle !== q.passageTitle);

  // Part 3/4: single transcript toggle button on group banner
  const isPart34 = ['part3','part4'].includes(S.activePart);
  const groupId = q.group || String(q.id);
  const transVisible = S.transcriptVisible[groupId];
  const transBtn = (isPart34 && isNewGroup && !S.submitted)
    ? `<button class="trans-toggle-btn ${transVisible ? 'active' : ''}" onclick="toggleGroupTranscript('${groupId}')" title="Xem full script cả 3 câu">
         📜 ${transVisible ? 'Ẩn script hội thoại' : 'Xem full script cả 3 câu'}
       </button>`
    : '';

  const groupBannerHtml = (isNewGroup && (q.passageTitle || isPart34))
    ? `<div class="passage-group-banner part34-group-banner">
         <div class="group-banner-left">
           <span>🎧</span>
           <span>${q.passageTitle || (isPart34 ? `Cụm câu ${q.group || q.id}` : '')}</span>
         </div>
         ${transBtn}
       </div>`
    : '';

  const subAudioBtn = hasSeg
    ? `<button class="q-subaudio-btn" onclick="playSegment(${q.id}, ${q.startTime}, ${q.endTime})">
         🔊 Nghe câu ${q.id} (${TOEICAudioPlayer_fmt(q.startTime)} – ${TOEICAudioPlayer_fmt(q.endTime)})
       </button>`
    : '';

  const qImg = q.image
    ? `<img src="${q.image}" alt="Hình ảnh câu ${q.id}" style="width:100%; max-height:380px; object-fit:contain; border-radius:8px; margin-bottom:12px; cursor:pointer;"
             onclick="openImageFull('${q.image}')"
             onerror="this.style.display='none'" />`
    : '';

  // Part 2: show parsed question text from transcript; others use q.text
  // Part 6/7: dùng placeholder thay vì hiển thị đoạn văn dài
  const isP67 = ['part6','part7'].includes(S.activePart);
  let displayQText;
  if (isPart2 && p2Parsed && p2Parsed.questionText) {
    displayQText = p2Parsed.questionText;
  } else if (isP67) {
    // Part 6/7: câu hỏi nằm trong ảnh bên trái → chỉ hiện gợi ý
    displayQText = `<span class="p67-placeholder-text">📖 Vui lòng đọc câu hỏi và các lựa chọn từ hình ảnh bên trái</span>`;
  } else {
    displayQText = q.text ? q.text.replace(/^\d+\.\s*/, '') : `Câu hỏi ${q.id}`;
  }

  // Options rendering: luôn giữ nguyên thứ tự A, B, C, D từ dữ liệu chuẩn
  const shuffleIndices = null;
  const optCount = (q.options || []).length;

  // Build options
  const buildOptions = () => {
    const origLetters = ['A','B','C','D'];
    return (q.options || []).map((_, displaySlot) => {
      // Lấy original index từ shuffle map (hoặc giữ nguyên)
      const origIdx = shuffleIndices ? shuffleIndices[displaySlot] : displaySlot;
      const opt = q.options[origIdx];
      const origLetter = origLetters[origIdx] || 'A'; // letter đúng trong data
      const displayLetter = origLetters[displaySlot] || 'A'; // letter hiển thị cho user

      let displayText;
      if (isPart2 && p2Parsed && p2Parsed.optTexts[origLetter]) {
        displayText = p2Parsed.optTexts[origLetter];
      } else {
        displayText = typeof opt === 'string'
          ? opt.replace(/^\([A-D]\)\s*/i, '').replace(/^[A-D][\.\)]\s*/i, '')
          : opt;
      }

      // Nếu displayText trùng với A, B, C, D (như trong Part 1) -> để trống để tránh trùng 'A  A'
      if (typeof displayText === 'string' && (['A','B','C','D'].includes(displayText.trim().toUpperCase()) || displayText.trim().toUpperCase() === displayLetter)) {
        displayText = '';
      }

      // isSelected: user chọn display letter này
      const isSelected = answered === displayLetter;
      let cls = 'q-option';
      if (isSelected) cls += ' selected';

      // Sau khi answered hoặc submitted: tô màu đúng/sai
      // Cần map: display letter → orig letter để so sánh với q.answer
      if (S.submitted || (S.mode === 'practice' && answered)) {
        if (origLetter === q.answer) cls += ' correct-ans';      // ô này là đáp án đúng
        else if (isSelected && origLetter !== q.answer) cls += ' wrong-ans'; // user chọn sai
      }

      // value của radio = displayLetter (vì S.answers lưu displayLetter)
      return `
        <label class="${cls}" id="opt-${q.id}-${displayLetter}">
          <input type="radio" name="q${q.id}" value="${displayLetter}" ${isSelected ? 'checked' : ''} />
          <span class="q-option-letter">${displayLetter}</span>
          <span class="q-option-text">${displayText}</span>
        </label>`;
    }).join('');
  };
  const optionsHtml = buildOptions();


  // ── Reading focus note (chỉ cho Part 6/7, practice mode, trước submit) ────
  const readingFocusNote = (isP67 && !S.submitted)
    ? `<div class="reading-focus-note">💡 Hãy chú ý đoạn văn — không cần để ý câu hỏi trong hình</div>`
    : '';

  // ── Hint button (only shown BEFORE submit, for reading parts) ────────────
  const isReading = ['part5','part6','part7'].includes(S.activePart);
  const hintHtml = (!S.submitted && isReading && q.hint)
    ? `<div class="q-hint-container">
         <button class="q-hint-btn" id="hintbtn-${q.id}" onclick="toggleHint(${q.id})">
           <span class="hint-icon">💡</span> Gợi ý cách làm
           <span class="hint-arrow" id="hintarrow-${q.id}">▼</span>
         </button>
         <div class="q-hint-panel" id="hint-${q.id}">
           <div class="q-hint-body">${q.hint}</div>
         </div>
       </div>`
    : '';

  // ── Rich explanation panel (practice mode when answered OR after submit) ──
  let explanationHtml = '';
  if ((S.submitted || (S.mode === 'practice' && answered)) && (q.explanation || q.transcript)) {
    const userAns = S.answers[q.id] || null;
    const isCorrect = userAns === q.answer;
    const statusClass = !userAns ? 'skip' : isCorrect ? 'right' : 'wrong';
    const statusLabel = !userAns ? '⚪ Bỏ qua' : isCorrect ? '✅ Đúng!' : '❌ Bạn chọn chưa đúng!';

    // Option analysis rows – luôn hiển thị theo thứ tự GỐC A B C D (không shuffle)
    const optLetters = ['A','B','C','D'];
    const optAnalysis = (q.options || []).map((opt, i) => {
      const letter = optLetters[i] || 'A';
      let displayText;
      if (isPart2 && p2Parsed && p2Parsed.optTexts[letter]) {
        displayText = p2Parsed.optTexts[letter];
      } else {
        displayText = typeof opt === 'string'
          ? opt.replace(/^\([A-D]\)\s*/i, '').replace(/^[A-D][\.\)]\s*/i, '')
          : opt;
      }
      const isAnswer  = letter === q.answer;
      const isChosen  = letter === userAns;
      let rowClass = 'exp-opt-row';
      if (isAnswer) rowClass += ' exp-opt-correct';
      else if (isChosen && !isAnswer) rowClass += ' exp-opt-wrong';
      const badge = isAnswer
        ? `<span class="exp-badge correct">✓ Đáp án đúng</span>`
        : (isChosen ? `<span class="exp-badge wrong">✗ Lựa chọn của bạn</span>` : '');
      return `<div class="${rowClass}">
        <span class="exp-opt-letter">${letter}</span>
        <span class="exp-opt-text">${displayText}</span>
        ${badge}
      </div>`;
    }).join('');

    // Format transcript
    const formattedTranscript = q.transcript
      ? q.transcript.replace(/\n/g, '<br>')
      : '';

    explanationHtml = `
    <div class="q-explanation rich-explanation">
      <div class="exp-header">
        <span class="exp-status ${statusClass}">${statusLabel}</span>
        <span class="exp-answer-label">Đáp án đúng: <strong>(${q.answer})</strong></span>
      </div>
      <div class="exp-section">
        <div class="exp-section-title">📋 Phân tích đáp án</div>
        <div class="exp-options-list">${optAnalysis}</div>
      </div>
      <div class="exp-section">
        <div class="exp-section-title">💡 Giải thích chi tiết (Tiếng Việt)</div>
        <div class="exp-vi-text">${q.explanation || ''}</div>
      </div>
      ${q.hint ? `
      <div class="exp-section exp-hint-recap">
        <div class="exp-section-title">🎯 Chiến lược giải</div>
        <div class="exp-vi-text hint-recap-text">${q.hint}</div>
      </div>` : ''}
    </div>`;
  }

  return `
    ${groupBannerHtml}
    <div class="q-card ${S.activeQId === q.id ? 'current' : ''}" id="qcard-${q.id}">
      <div class="q-card-header">
        <div class="q-num-badge">${q.id}</div>
        <button class="q-flag-btn ${isFlagged ? 'flagged' : ''}" id="flag-${q.id}"
                onclick="toggleFlag(${q.id})" title="Đánh dấu câu này">🚩</button>
      </div>
      <div class="q-audio-row">
        ${subAudioBtn}
      </div>
      ${qImg}
      <div class="q-text">${displayQText}</div>
      ${readingFocusNote}
      ${hintHtml}
      <div class="q-options" id="opts-${q.id}">${optionsHtml}</div>
      ${explanationHtml}
    </div>`;
}


// Helper: format time without module dependency
function TOEICAudioPlayer_fmt(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/**
 * parseP2Transcript – tách transcript Part 2 thành:
 *   { questionText: string, optTexts: {A: string, B: string, C: string} }
 * Transcript format:
 *   "Question text\nA. Option A text\nB. Option B text\nC. Option C text"
 */
function parseP2Transcript(transcript) {
  if (!transcript) return { questionText: '', optTexts: {} };
  const lines = transcript.split('\n').map(l => l.trim()).filter(Boolean);
  const optTexts = {};
  let questionLines = [];
  for (const line of lines) {
    const m = line.match(/^([A-C])[.)\s]\s*(.+)$/);
    if (m) {
      optTexts[m[1]] = m[2].trim();
    } else {
      questionLines.push(line);
    }
  }
  return { questionText: questionLines.join(' '), optTexts };
}

function toggleTranscriptPanel(qId) {
  const panel = document.getElementById(`transcript-panel-${qId}`);
  const arrow = document.getElementById(`transcript-arrow-${qId}`);
  const btn   = document.getElementById(`transcript-btn-${qId}`);
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (arrow) arrow.textContent = isOpen ? '▲' : '▼';
  if (btn)   btn.classList.toggle('active', isOpen);
}

function bindQuestionEvents(questions) {
  const part = S.currentTest?.parts[S.activePart];
  questions.forEach(q => {
    const cardEl = $(`qcard-${q.id}`);
    if (cardEl) {
      cardEl.addEventListener('click', () => {
        if (S.activeQId !== q.id) {
          S.activeQId = q.id;
          if (part) renderMediaPanel(part, q.id);
          renderPalette();
        }
      });
    }

    const opts = document.querySelectorAll(`input[name="q${q.id}"]`);
    opts.forEach(input => {
      input.addEventListener('change', e => {
        S.answers[q.id] = e.target.value;
        S.activeQId = q.id;
        if (part) renderMediaPanel(part, q.id);
        highlightOptions(q.id, e.target.value);
        renderPalette();
        saveSession();  // Lưu ngay khi chọn đáp án
      });
    });
  });
}

function highlightOptions(qId, selected) {
  document.querySelectorAll(`#opts-${qId} .q-option`).forEach(label => {
    const val = label.querySelector('input')?.value;
    label.classList.toggle('selected', val === selected);
  });
}

function toggleFlag(qId) {
  if (S.flagged.has(qId)) S.flagged.delete(qId);
  else S.flagged.add(qId);
  const btn = $(`flag-${qId}`);
  if (btn) btn.classList.toggle('flagged', S.flagged.has(qId));
  renderPalette();
  saveSession();  // Lưu khi flag/unflag
}

function toggleHint(qId) {
  const panel = $(`hint-${qId}`);
  const arrow = $(`hintarrow-${qId}`);
  const btn   = $(`hintbtn-${qId}`);
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (arrow) arrow.textContent = isOpen ? '▲' : '▼';
  if (btn)   btn.classList.toggle('active', isOpen);
}

/**
 * Toggle transcript visibility for a Part3/4 group.
 * Re-renders the media panel and the question group banner.
 */
function toggleGroupTranscript(groupId) {
  S.transcriptVisible[groupId] = !S.transcriptVisible[groupId];
  const part = S.currentTest?.parts[S.activePart];
  if (part) {
    renderMediaPanel(part, S.activeQId);
    // Re-render to update banner button state
    const panel = $('questionsPanel');
    if (panel) {
      panel.innerHTML = part.questions.map((q, idx) => renderQuestionCard(q, idx, part.questions)).join('');
      bindQuestionEvents(part.questions);
    }
  }
}

/**
 * Activate a question and show its group transcript on the left panel.
 */
function activateAndShowTranscript(qId, groupId) {
  S.activeQId = qId;
  S.transcriptVisible[groupId] = true;
  const part = S.currentTest?.parts[S.activePart];
  if (part) {
    renderMediaPanel(part, qId);
    const panel = $('questionsPanel');
    if (panel) {
      panel.innerHTML = part.questions.map((q, idx) => renderQuestionCard(q, idx, part.questions)).join('');
      bindQuestionEvents(part.questions);
    }
    renderPalette();
  }
}

function playSegment(qId, start, end) {
  S.activeQId = qId;
  const part = S.currentTest?.parts[S.activePart];
  if (part) renderMediaPanel(part, qId);
  renderPalette();
  AP.playSegment(start, end);
}

function openImageFull(src) {
  const w = window.open();
  if (w) w.document.write(`<img src="${src}" style="max-width:100%;"/>`);
}

/* ── Palette ────────────────────────────────────────────── */
function renderPalette() {
  const container = $('paletteContainer');
  if (!container || !S.currentTest) return;

  let total = 0, answered = 0;
  const html = S.selectedParts.map(pKey => {
    const part = S.currentTest.parts[pKey];
    if (!part) return '';
    const nums = part.questions.map(q => {
      total++;
      const isAns = !!S.answers[q.id];
      if (isAns) answered++;
      const isCurrent = q.id === S.activeQId;
      const isFlagged = S.flagged.has(q.id);
      return `<div class="p-num ${isAns ? 'answered' : ''} ${isCurrent ? 'current' : ''} ${isFlagged ? 'flagged' : ''}"
                   onclick="jumpToQuestion(${q.id}, '${pKey}')">${q.id}</div>`;
    }).join('');
    return `
      <div class="palette-part-group">
        <div class="palette-part-name">${part.name.split(' - ')[0]}</div>
        <div class="palette-nums">${nums}</div>
      </div>`;
  }).join('');

  container.innerHTML = html;
  const status = $('paletteStatus');
  if (status) status.textContent = `Đã trả lời: ${answered}/${total}`;
}

function jumpToQuestion(qId, partKey) {
  if (partKey !== S.activePart) {
    S.activePart = partKey;
    renderWorkspace();
  }
  S.activeQId = qId;
  const part = S.currentTest?.parts[S.activePart];
  if (part) renderMediaPanel(part, qId);
  renderPalette();
  const el = $(`qcard-${qId}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ── Part navigation ───────────────────────────────────── */
function navPart(dir) {
  const idx = S.selectedParts.indexOf(S.activePart);
  const next = idx + dir;
  if (next >= 0 && next < S.selectedParts.length) {
    S.activePart = S.selectedParts[next];
    AP.pause();
    renderWorkspace();
    window.scrollTo(0, 60);
    saveSession();  // Lưu khi chuyển part
  }
}

/* ── Audio controls ────────────────────────────────────── */
function bindAudioControls() {
  $('audioPlayBtn')?.addEventListener('click', () => AP.toggle());

  const seekbar = $('audioSeekbar');
  seekbar?.addEventListener('input', () => AP.seek(parseFloat(seekbar.value)));

  $('audioSpeedSelect')?.addEventListener('change', e => AP.setSpeed(e.target.value));

  AP.onUpdate = (cur, dur) => {
    if (seekbar && dur > 0) {
      seekbar.max = dur;
      seekbar.value = cur;
    }
    const td = $('audioTimeDisplay');
    if (td) td.textContent = `${TOEICAudioPlayer_fmt(cur)} / ${TOEICAudioPlayer_fmt(dur)}`;
  };
}

/* ============================================================
   SUBMIT & RESULTS
   ============================================================ */
function confirmSubmit() {
  const answered = Object.keys(S.answers).length;
  let total = 0;
  S.selectedParts.forEach(pk => {
    total += S.currentTest.parts[pk]?.questions.length || 0;
  });
  const unanswered = total - answered;
  const msg = unanswered > 0
    ? `Bạn còn ${unanswered} câu chưa trả lời. Xác nhận nộp bài?`
    : 'Bạn đã trả lời tất cả câu hỏi. Xác nhận nộp bài?';
  if (confirm(msg)) submitTest();
}

function submitTest() {
  clearInterval(S.timerInterval);
  S.submitted = true;
  clearSession();  // Xóa session khi nộp bài
  AP.pause();

  // Calculate scores
  let total = 0, correct = 0, wrong = 0, skipped = 0;
  const catStats = {};

  S.selectedParts.forEach(pKey => {
    const part = S.currentTest.parts[pKey];
    if (!part) return;
    part.questions.forEach(q => {
      total++;
      const cat = q.category || 'Khác';
      if (!catStats[cat]) catStats[cat] = { total: 0, correct: 0, wrong: 0, skipped: 0, qs: [] };
      catStats[cat].total++;

      const ua = S.answers[q.id];

      if (!ua) {
        skipped++; catStats[cat].skipped++;
        catStats[cat].qs.push({ id: q.id, status: 'skip' });
      } else if (ua === q.answer) {
        correct++; catStats[cat].correct++;
        catStats[cat].qs.push({ id: q.id, status: 'right' });
      } else {
        wrong++; catStats[cat].wrong++;
        catStats[cat].qs.push({ id: q.id, status: 'wrong' });
      }
    });
  });

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const elapsed = S.startTime ? Math.floor((new Date() - S.startTime) / 1000) : 0;

  // Render result page
  $('resTitle').textContent = S.currentTest.title || S.currentTestMeta.title;
  $('resElapsed').textContent = `⏱️ ${TOEICAudioPlayer_fmt(elapsed)}`;
  $('resDate').textContent = `📅 ${new Date().toLocaleDateString('vi-VN')}`;
  $('resTotal').textContent   = total;
  $('resCorrect').textContent = correct;
  $('resWrong').textContent   = wrong;
  $('resSkipped').textContent = skipped;
  $('resPct').textContent     = pct + '%';
  $('resFill').style.width    = pct + '%';

  // Category table
  const tbody = $('catTableBody');
  if (tbody) {
    tbody.innerHTML = Object.entries(catStats).map(([cat, st]) => {
      const dots = st.qs.map(q =>
        `<span class="q-dot ${q.status}" onclick="jumpToQInResult(${q.id})">${q.id}</span>`
      ).join('');
      return `<tr>
        <td>${cat}</td>
        <td class="td-right">${st.correct}</td>
        <td class="td-wrong">${st.wrong}</td>
        <td class="td-skip">${st.skipped}</td>
        <td>${dots}</td>
      </tr>`;
    }).join('');
  }

  showView('viewResult');
}

/* ============================================================
   REVIEW PAGE – Ôn lại câu sai / bỏ qua
   ============================================================ */

// Review state
const R = {
  items: [],           // { q, pKey, status: 'wrong'|'skip' }
  filter: 'all',       // 'all'|'wrong'|'skip'
  activePart: 'all',   // 'all'|'part1'...'part7'
  activeQId: null,
};

/**
 * Mở trang Review từ trang kết quả.
 * Tập hợp tất cả câu sai và bỏ qua từ S.answers.
 */
function openReview() {
  if (!S.currentTest) return;

  R.items = [];
  R.filter = 'all';
  R.activePart = 'all';
  R.activeQId = null;

  S.selectedParts.forEach(pKey => {
    const part = S.currentTest.parts[pKey];
    if (!part) return;
    part.questions.forEach(q => {
      const ua = S.answers[q.id];
      if (!ua) {
        R.items.push({ q, pKey, status: 'skip' });
      } else if (ua !== q.answer) {
        R.items.push({ q, pKey, status: 'wrong' });
      }
    });
  });

  // Update navbar title
  const wrongCount = R.items.filter(i => i.status === 'wrong').length;
  const skipCount  = R.items.filter(i => i.status === 'skip').length;
  const navTitle = $('reviewNavTitle');
  if (navTitle) navTitle.textContent = `📖 Ôn lại – ${wrongCount} sai, ${skipCount} bỏ qua`;

  renderReviewPartTabs();
  renderReviewQList();
  renderReviewProgress();
  $('reviewMediaPanel').innerHTML = `<div class="review-media-placeholder"><div>📄</div><div>Chọn câu để xem passage</div></div>`;
  $('reviewQDetail').innerHTML = `<div class="review-qdetail-placeholder"><div style="font-size:40px;margin-bottom:8px;">👆</div><div>Chọn một câu bên trên để xem chi tiết</div></div>`;

  showView('viewReview');
}

/** Render các tab Part filter */
function renderReviewPartTabs() {
  const container = $('reviewPartTabs');
  if (!container) return;

  // Tập hợp các Part có câu sai/bỏ qua
  const partsWithIssues = [...new Set(R.items.map(i => i.pKey))];
  const partNames = { part1:'P1', part2:'P2', part3:'P3', part4:'P4', part5:'P5', part6:'P6', part7:'P7' };

  const allTab = `<button class="review-part-tab ${R.activePart === 'all' ? 'active' : ''}" onclick="setReviewPart('all')">Tất cả</button>`;
  const partTabs = partsWithIssues.map(pk =>
    `<button class="review-part-tab ${R.activePart === pk ? 'active' : ''}" onclick="setReviewPart('${pk}')">${partNames[pk] || pk}</button>`
  ).join('');

  container.innerHTML = allTab + partTabs;
}

/** Lọc câu theo filter và part hiện tại */
function getFilteredItems() {
  return R.items.filter(item => {
    const statusOk = R.filter === 'all' || item.status === R.filter;
    const partOk   = R.activePart === 'all' || item.pKey === R.activePart;
    return statusOk && partOk;
  });
}

/** Cập nhật counter progress */
function renderReviewProgress() {
  const filtered = getFilteredItems();
  const prog = $('reviewProgress');
  if (prog) prog.textContent = `${filtered.length} câu`;
}

/** Render danh sách chip câu hỏi */
function renderReviewQList() {
  const container = $('reviewQList');
  if (!container) return;

  const filtered = getFilteredItems();
  renderReviewProgress();

  if (filtered.length === 0) {
    container.innerHTML = `<div class="review-qlist-empty">Không có câu nào theo bộ lọc này 🎉</div>`;
    return;
  }

  container.innerHTML = filtered.map(item =>
    `<button class="review-q-chip ${item.status} ${R.activeQId === item.q.id ? 'active' : ''}"
             onclick="selectReviewQ(${item.q.id})">
       ${item.q.id}
     </button>`
  ).join('');
}

/** Chọn 1 câu để xem chi tiết */
function selectReviewQ(qId) {
  R.activeQId = qId;
  renderReviewQList(); // refresh chip active state

  const item = R.items.find(i => i.q.id === qId);
  if (!item) return;

  renderReviewMediaPanel(item);
  renderReviewQDetail(item);
}

/** Hiển thị passage image bên trái */
function renderReviewMediaPanel(item) {
  const panel = $('reviewMediaPanel');
  if (!panel) return;

  const q = item.q;
  const imgSrc = q.passageImage || q.image || null;

  if (imgSrc) {
    const title = q.passageTitle || q.category || '';
    panel.innerHTML = `
      ${title ? `<div class="review-passage-title">${title}</div>` : ''}
      <img class="review-passage-img" src="${imgSrc}" alt="Passage" onclick="openImageFull('${imgSrc}')" />`;
  } else {
    // Part 5 hoặc Part 1 (không có passage image)
    const icon = item.pKey === 'part1' ? '🖼️' : '📝';
    const label = item.pKey === 'part1' ? 'Ảnh Part 1 – Xem trong bài thi' : 'Part 5 – Câu độc lập';
    panel.innerHTML = `<div class="review-media-placeholder"><div>${icon}</div><div>${label}</div></div>`;
  }
}

/** Render chi tiết câu hỏi bên phải */
function renderReviewQDetail(item) {
  const container = $('reviewQDetail');
  if (!container) return;

  const q = item.q;
  const ua = S.answers[q.id];   // user's answer (may be undefined)
  const correct = q.answer;      // correct answer letter

  // Question text (Part 6/7 dùng text là toàn bộ đoạn, quá dài → tóm tắt)
  const displayText = (q.text && q.text.length > 300)
    ? q.text.substring(0, 300) + '…'
    : (q.text || '(Xem passage bên trái)');

  // Build options HTML
  const letters = ['A','B','C','D'];
  const optionsHtml = (q.options || []).map((opt, idx) => {
    const letter = letters[idx];
    const isCorrect  = letter === correct;
    const isSelected = letter === ua;
    let rowClass = '';
    if (isCorrect) rowClass = 'opt-correct';
    else if (isSelected) rowClass = 'opt-selected';
    const badge = isCorrect
      ? `<span class="review-opt-badge correct">✓ Đúng</span>`
      : (isSelected ? `<span class="review-opt-badge wrong">✗ Bạn chọn</span>` : '');
    return `<div class="review-opt-row ${rowClass}">
      <span class="review-opt-letter">${letter}</span>
      <span class="review-opt-text">${opt}</span>
      ${badge}
    </div>`;
  }).join('');

  // Status badge
  const statusLabel = item.status === 'wrong'
    ? `<span class="review-status-badge wrong">🔴 Sai (bạn chọn ${ua || '–'})</span>`
    : `<span class="review-status-badge skip">⚪ Bỏ qua</span>`;

  const expHtml = q.explanation
    ? `<div class="review-exp-section">
         <div class="review-exp-label">📘 Giải thích</div>
         <div class="review-exp-text">${q.explanation}</div>
       </div>`
    : '';

  const hintHtml = q.hint
    ? `<div class="review-exp-section hint-section">
         <div class="review-exp-label">💡 Chiến lược giải</div>
         <div class="review-exp-text hint-text">${q.hint}</div>
       </div>`
    : '';

  container.innerHTML = `
    <div class="review-detail-card">
      <div class="review-detail-header">
        <span class="review-detail-qnum">${q.id}</span>
        <span class="review-detail-cat">${q.category || ''}</span>
        ${statusLabel}
      </div>
      <div class="review-detail-body">
        <div class="review-qtext">${displayText}</div>
        <div class="review-options-list">${optionsHtml}</div>
        ${expHtml}
        ${hintHtml}
      </div>
    </div>`;
}

function setReviewFilter(filter) {
  R.filter = filter;
  R.activeQId = null;
  ['rfAll','rfWrong','rfSkip'].forEach(id => $(`${id}`)?.classList.remove('active'));
  const map = { all: 'rfAll', wrong: 'rfWrong', skip: 'rfSkip' };
  $(map[filter])?.classList.add('active');
  renderReviewQList();
  // Reset detail
  $('reviewQDetail').innerHTML = `<div class="review-qdetail-placeholder"><div style="font-size:40px;margin-bottom:8px;">👆</div><div>Chọn một câu bên trên để xem chi tiết</div></div>`;
  $('reviewMediaPanel').innerHTML = `<div class="review-media-placeholder"><div>📄</div><div>Chọn câu để xem passage</div></div>`;
}

function setReviewPart(partKey) {
  R.activePart = partKey;
  R.activeQId = null;
  renderReviewPartTabs();
  renderReviewQList();
  $('reviewQDetail').innerHTML = `<div class="review-qdetail-placeholder"><div style="font-size:40px;margin-bottom:8px;">👆</div><div>Chọn một câu bên trên để xem chi tiết</div></div>`;
  $('reviewMediaPanel').innerHTML = `<div class="review-media-placeholder"><div>📄</div><div>Chọn câu để xem passage</div></div>`;
}

function jumpToQInResult(qId) {
  // Find which part this q belongs to
  for (const pKey of S.selectedParts) {
    const part = S.currentTest?.parts[pKey];
    if (part?.questions.find(q => q.id === qId)) {
      S.activePart = pKey;
      renderWorkspace();
      showView('viewWorkspace');
      setTimeout(() => jumpToQuestion(qId, pKey), 300);
      return;
    }
  }
}

function exitTest() {
  if (confirm('Bạn có chắc muốn thoát khỏi bài làm không? Tiến độ sẽ bị mất.')) {
    clearInterval(S.timerInterval);
    AP.pause();
    clearSession();  // Xóa session khi thoát
    showView('viewHome');
  }
}

function backToHome() {
  clearInterval(S.timerInterval);
  AP.pause();
  clearSession();  // Xóa session khi về home
  S.currentTest = null;
  S.answers = {};
  S.flagged.clear();
  showView('viewHome');
}

/* ============================================================
   SESSION PERSISTENCE – localStorage
   ============================================================ */

/**
 * Lưu trạng thái bài làm hiện tại vào localStorage.
 * Gọi sau mỗi lần chọn đáp án, flag câu, hoặc mỗi 30 giây.
 */
function saveSession() {
  if (!S.currentTest || !S.currentTestMeta || S.submitted) return;
  try {
    const session = {
      testMetaId: S.currentTestMeta.id,
      testNumber: S.currentTestMeta.testNumber,
      testTitle: S.currentTestMeta.title,
      dataFile: S.currentTestMeta.dataFile,
      mode: S.mode,
      selectedParts: S.selectedParts,
      activePart: S.activePart,
      activeQId: S.activeQId,
      answers: S.answers,
      flagged: Array.from(S.flagged),
      timerSeconds: S.timerSeconds,
      startTime: S.startTime ? S.startTime.toISOString() : null,
      savedAt: new Date().toISOString(),
      appVersion: APP_VERSION
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('[Session] Could not save:', e);
  }
}

/**
 * Xóa session đã lưu (sau khi nộp bài hoặc thoát).
 */
function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    // Xóa các key session cũ từ version trước
    Object.keys(localStorage)
      .filter(k => k.startsWith('toeic_session_v'))
      .forEach(k => { if (k !== SESSION_KEY) localStorage.removeItem(k); });
  } catch (e) {}
}

/**
 * Kiểm tra xem có session dở dang không.
 * Nếu có, hiện banner "Tiếp tục làm bài".
 */
function checkAndRestoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw);
    if (!session || !session.testMetaId || !session.savedAt) return;

    // Tính thời gian đã qua kể từ lần lưu cuối
    const savedAt = new Date(session.savedAt);
    const elapsedMs = Date.now() - savedAt.getTime();
    const elapsedSec = Math.floor(elapsedMs / 1000);

    // Trừ thời gian đã qua (tab đóng) khỏi timer
    const adjustedTimer = Math.max(0, session.timerSeconds - elapsedSec);

    // Format thời gian còn lại
    const h = Math.floor(adjustedTimer / 3600);
    const m = Math.floor((adjustedTimer % 3600) / 60);
    const s = adjustedTimer % 60;
    const timeStr = h > 0
      ? `${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(m)}:${pad(s)}`;

    const answeredCount = Object.keys(session.answers || {}).length;

    // Hiển thị banner
    showResumeBanner(session, adjustedTimer, timeStr, answeredCount);
  } catch (e) {
    console.warn('[Session] Could not restore:', e);
    clearSession();
  }
}

/**
 * Hiển thị banner gợi ý tiếp tục làm bài.
 */
function showResumeBanner(session, adjustedTimer, timeStr, answeredCount) {
  const banner = document.createElement('div');
  banner.id = 'resume-banner';
  banner.innerHTML = `
    <div class="resume-banner-content">
      <div class="resume-banner-icon">🔄</div>
      <div class="resume-banner-info">
        <div class="resume-banner-title">Bạn có bài làm dở dang!</div>
        <div class="resume-banner-sub">
          ${session.testTitle} · ${answeredCount} câu đã làm · Còn lại: <strong>${timeStr}</strong>
        </div>
      </div>
      <div class="resume-banner-actions">
        <button class="btn-resume-continue" onclick="resumeSession()">▶ Tiếp tục</button>
        <button class="btn-resume-discard" onclick="discardSession()">✕ Bỏ qua</button>
      </div>
    </div>
  `;
  banner.style.cssText = `
    position:fixed; bottom:0; left:0; right:0; z-index:9999;
    background:linear-gradient(135deg,#1d4ed8,#2563eb);
    color:#fff; padding:14px 24px;
    box-shadow:0 -4px 24px rgba(0,0,0,.25);
    animation: slideUpIn 0.4s cubic-bezier(.22,1,.36,1);
  `;
  document.body.appendChild(banner);

  // Store session for resume
  window._pendingSession = { session, adjustedTimer };
}

/**
 * Tiếp tục bài làm từ session đã lưu.
 */
async function resumeSession() {
  const pending = window._pendingSession;
  if (!pending) return;
  const { session, adjustedTimer } = pending;

  // Ẩn banner
  document.getElementById('resume-banner')?.remove();
  window._pendingSession = null;

  // Tìm testMeta
  const testMeta = TESTS_META.find(t => t.id === session.testMetaId);
  if (!testMeta) {
    alert('Không tìm thấy bài thi trong danh sách. Session sẽ bị xóa.');
    clearSession();
    return;
  }

  // Restore state
  S.currentTestMeta = testMeta;
  S.mode = session.mode || 'practice';
  S.selectedParts = session.selectedParts || ['part1','part2','part3','part4','part5','part6','part7'];
  S.activePart = session.activePart || S.selectedParts[0];
  S.activeQId = session.activeQId || null;
  S.answers = session.answers || {};
  S.flagged = new Set(session.flagged || []);
  S.timerSeconds = adjustedTimer;
  S.startTime = session.startTime ? new Date(session.startTime) : new Date();
  S.submitted = false;

  // Load test data
  try {
    $('loadingSpinner')?.classList.remove('hidden');
    const dataUrl = `${testMeta.dataFile}?v=${APP_VERSION}`;
    const resp = await fetch(dataUrl, { cache: 'no-store' });
    S.currentTest = await resp.json();
    $('loadingSpinner')?.classList.add('hidden');
  } catch (err) {
    $('loadingSpinner')?.classList.add('hidden');
    alert('Không thể tải dữ liệu. Vui lòng thử lại.');
    clearSession();
    return;
  }

  showView('viewWorkspace');
  startTimer();
  renderWorkspace();
}

/**
 * Bỏ qua session cũ và bắt đầu mới.
 */
function discardSession() {
  document.getElementById('resume-banner')?.remove();
  window._pendingSession = null;
  clearSession();
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  renderHome();
  showView('viewHome');
  bindAudioControls();
  checkAndRestoreSession();  // Kiểm tra session dở dang khi load

  // Modal close on overlay click
  $('setupModal')?.addEventListener('click', e => {
    if (e.target === $('setupModal')) closeSetupModal();
  });

  // Part navigation buttons
  $('btnPrevPart')?.addEventListener('click', () => navPart(-1));
  $('btnNextPart')?.addEventListener('click', () => navPart(+1));

  // Submit / Exit
  $('btnSubmitTest')?.addEventListener('click', confirmSubmit);
  $('btnExitTest')?.addEventListener('click', exitTest);
  $('btnBackHome')?.addEventListener('click', backToHome);

  // Modal tab buttons
  $('tabModePractice')?.addEventListener('click', () => selectModalTab('practice'));
  $('tabModeExam')?.addEventListener('click',     () => selectModalTab('exam'));

  // Select All / Clear All parts in modal
  $('btnSelectAll')?.addEventListener('click', selectAllParts);
  $('btnClearAll')?.addEventListener('click',  clearAllParts);

  // Start buttons
  $('btnStartPractice')?.addEventListener('click', startTest);
  $('btnStartExam')?.addEventListener('click',     startTest);

  // Review page buttons
  $('btnReviewWrong')?.addEventListener('click', openReview);
  $('btnReviewBack')?.addEventListener('click', () => showView('viewResult'));

  // Loading spinner init
  $('loadingSpinner')?.classList.add('hidden');
});
