/* ============================================================
   READFOLIO — reader.js (Max 7 Words, Custom Delete Modal, Ghost Highlight, Focus Themes, Clickable Highlights, Dual Accent TTS)
   ============================================================ */

'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc        = null;
let currentPage   = 1;
let totalPages    = 0;
let isRendering   = false;
let docData       = null;
let currentHighlightColor = 'rgba(255, 255, 0, 0.7)';
let colorIndex = 0; 

const DOCUMENT_ID = window.DOCUMENT_ID;

const pdfLoading     = document.getElementById('pdf-loading');
const htmlContainer  = document.getElementById('html-text-container');
const centerWrapper  = document.getElementById('center-reader-wrapper'); 
const prevBtn        = document.getElementById('prev-page-btn');
const nextBtn        = document.getElementById('next-page-btn');
const pageInput      = document.getElementById('current-page-input');
const totalPagesEl   = document.getElementById('total-pages');
const docTitleEl     = document.getElementById('doc-title');
const hlToggleBtn    = document.getElementById('highlights-toggle-btn');
const hlSidebar      = document.getElementById('highlights-sidebar');

document.addEventListener('DOMContentLoaded', async () => {
  await loadDocument();
  bindNav();
  bindHighlightsSidebar();
  bindDeleteNotes();
  bindDeleteAllNotes(); 
  bindSidebarAudio();
  initResizableSidebars(); 
  bindFocusThemes();
  
  bindHighlightClicks();

  const style = document.createElement('style');
  style.innerHTML = `mark::selection, span.temp-highlight::selection { background: transparent; }`;
  document.head.appendChild(style);
});

// ── UTILITIES: Toast & Modal UI ────────────────────────────────
function showToast(message, type = 'warning') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span style="margin-right:8px; font-size:16px;">${type === 'warning' ? '⚠️' : type === 'error' ? '❌' : '✅'}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toast-out 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showConfirmModal(title, message, confirmText, onConfirm) {
    const existing = document.getElementById('custom-confirm-modal');
    if (existing) existing.remove();

    const modalHtml = `
    <div class="modal-backdrop" id="custom-confirm-modal" style="z-index: 10005;">
        <div class="modal" style="max-width: 400px; padding:0; animation: modal-slide-in 0.2s ease;">
            <div class="modal-header" style="border-bottom: 1px solid var(--border); padding-bottom: 15px;">
                <h3 class="modal-title" style="color:var(--danger);">${title}</h3>
                <button class="modal-close" onclick="document.getElementById('custom-confirm-modal').remove()">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body" style="padding: 20px 24px;">
                <p style="font-size: 14.5px; color: var(--text-secondary); line-height: 1.6; margin:0;">${message}</p>
            </div>
            <div class="modal-footer" style="background: var(--bg-warm); border-top: 1px solid var(--border); border-radius: 0 0 var(--radius-xl) var(--radius-xl);">
                <button class="btn btn-ghost" onclick="document.getElementById('custom-confirm-modal').remove()">Batal</button>
                <button class="btn btn-primary" id="confirm-modal-btn" style="background: var(--danger); border-color: var(--danger);">${confirmText}</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('confirm-modal-btn').addEventListener('click', () => {
        onConfirm();
        document.getElementById('custom-confirm-modal').remove();
    });
}

function bindHighlightClicks() {
  const container = document.getElementById('html-text-container');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const mark = e.target.closest('mark.saved-highlight-mark');
    if (mark) {
      const noteId = mark.getAttribute('data-note-id');
      if (noteId) {
        const noteCard = document.getElementById(`note-card-${noteId}`);
        if (noteCard) {
          const hlSidebar = document.getElementById('highlights-sidebar');
          const hlToggleBtn = document.getElementById('highlights-toggle-btn');
          if (hlSidebar && hlSidebar.classList.contains('collapsed')) {
              if(hlToggleBtn) hlToggleBtn.click();
          }

          setTimeout(() => {
              noteCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              noteCard.classList.remove('flash-highlight');
              void noteCard.offsetWidth;
              noteCard.classList.add('flash-highlight');
          }, 150);
        }
      }
    }
  });
}

function applySavedHighlightsToText(notes) {
  let containerHtml = htmlContainer.innerHTML;
  notes.forEach(note => {
    if (note.selected_text && note.selected_text.trim().length > 2) {
      const rawText = note.selected_text.trim();
      const escapedText = rawText.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const startBoundary = /^\w/.test(rawText) ? '\\b' : '';
      const endBoundary   = /\w$/.test(rawText) ? '\\b' : '';
      const regex = new RegExp(`${startBoundary}(${escapedText})${endBoundary}`, 'gi');
      let bgColor = note.color || 'rgba(255, 255, 0, 0.7)';
      
      containerHtml = containerHtml.replace(regex, `<mark class="saved-highlight-mark" data-note-id="${note.id}" style="background-color: ${bgColor}; color: #000; border-radius: 4px; padding: 2px 0; font-weight: 500; cursor: pointer; transition: all 0.2s ease;" title="Klik untuk melihat catatan">$1</mark>`);
    }
  });
  htmlContainer.innerHTML = containerHtml;
}

async function loadSidebarNotes(pageNum) {
  try {
    const res  = await fetch(`/api/highlights/document/${DOCUMENT_ID}`);
    const json = await res.json();
    const hlList  = document.getElementById('hl-list');
    const hlCount = document.getElementById('hl-count');

    if (json.data && json.data.length > 0) {
      if (hlCount) hlCount.textContent = json.data.length;

      let html = '';
      json.data.forEach(note => {
        let badgeColor = note.color;
        if (!badgeColor || badgeColor === 'blue') badgeColor = 'rgba(255, 255, 0, 0.7)';

        const safeSelectedText = encodeURIComponent(note.selected_text || '');
        const safeExplanation  = encodeURIComponent(note.ai_explanation || '');

        let details = {};
        try { if (note.ai_details) details = JSON.parse(note.ai_details); } catch (e) { details = {}; }

        const grammar    = details.grammar    || note.ai_grammar    || null;
        const idiomNote  = details.idiom_note || note.ai_idiom_note || null;
        const vocabulary = details.vocabulary || note.ai_vocabulary || [];
        const tip        = details.tip        || null;

        let vocabHtml = '';
        if (vocabulary && vocabulary.length > 0) {
          vocabHtml = `<ul class="snc-vocab-list">`;
          vocabulary.forEach(v => {
            vocabHtml += `<li><span class="snc-vocab-word">${v.word}</span> <span class="snc-vocab-type">(${v.type})</span> <span class="snc-vocab-meaning">${v.meaning}</span> <span class="snc-vocab-example">✏️ "${v.example}"</span></li>`;
          });
          vocabHtml += `</ul>`;
        }

        html += `
          <div class="sidebar-note-card ai-saved-note" id="note-card-${note.id}">
            <div class="snc-header">
              <div class="snc-badge"><span>🧠</span> AI Analysis</div>
              <div class="snc-actions">
                <span class="snc-page-badge">Hal. ${note.page_number}</span>
                <button class="delete-note-btn snc-delete-btn" data-id="${note.id}" title="Hapus Catatan">🗑️</button>
              </div>
            </div>

            <div class="snc-selected-text" style="display:flex; justify-content:space-between; align-items:center;">
              <p style="margin:0;"><mark style="background:${badgeColor}; border-radius:3px; color:#000; padding:2px 4px;">"${note.selected_text}"</mark></p>
              <div style="display:flex; gap:4px;">
                  <button class="snc-audio-btn play-sidebar-btn" data-text="${safeSelectedText}" data-accent="american" title="Dengarkan (US)">🇺🇸</button>
                  <button class="snc-audio-btn play-sidebar-btn" data-text="${safeSelectedText}" data-accent="british" title="Dengarkan (UK)">🇬🇧</button>
              </div>
            </div>

            <div class="snc-accordion">
              <details class="snc-details">
                <summary>🧠 English Explanation <span class="snc-arrow">▼</span></summary>
                <div class="snc-details-body">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-weight:700; font-size:0.9em; color:var(--primary);">AI Explanation</span>
                    <div style="display:flex; gap:4px;">
                        <button class="snc-audio-btn play-sidebar-btn" data-text="${safeExplanation}" data-accent="american" title="Penjelasan (US)">🇺🇸</button>
                        <button class="snc-audio-btn play-sidebar-btn" data-text="${safeExplanation}" data-accent="british" title="Penjelasan (UK)">🇬🇧</button>
                    </div>
                  </div>
                  <p style="margin:0; font-style:italic;">${note.ai_explanation || 'Tidak ada penjelasan.'}</p>
                </div>
              </details>
              <details class="snc-details">
                <summary>🇮🇩 Terjemahan Indonesia <span class="snc-arrow">▼</span></summary>
                <div class="snc-details-body">
                  <p style="margin:0;">${note.ai_translation || 'Tidak ada terjemahan.'}</p>
                </div>
              </details>
              <details class="snc-details">
                <summary>✨ More Details <span class="snc-arrow">▼</span></summary>
                <div class="snc-details-body">
                  ${grammar ? `<div style="margin-bottom:12px;"><div style="font-size:0.82em; font-weight:700; color:var(--primary); margin-bottom:5px; text-transform:uppercase; letter-spacing:0.4px;">⚙️ Grammar Context</div><div style="margin:0; line-height:1.55; white-space: pre-line;">${grammar}</div></div>` : ''}
                  ${vocabHtml ? `<div style="margin-bottom:12px;"><div style="font-size:0.82em; font-weight:700; color:var(--primary); margin-bottom:5px; text-transform:uppercase; letter-spacing:0.4px;">📚 Key Vocabulary</div>${vocabHtml}</div>` : ''}
                  ${idiomNote ? `<div style="margin-bottom:6px;"><div style="font-size:0.82em; font-weight:700; color:var(--primary); margin-bottom:5px; text-transform:uppercase; letter-spacing:0.4px;">🗣️ Idioms / Phrases</div><p style="margin:0; line-height:1.55;">${idiomNote}</p></div>` : ''}
                  ${tip ? `<div style="margin-bottom:6px;"><div style="font-size:0.82em; font-weight:700; color:var(--success); margin-bottom:5px; text-transform:uppercase; letter-spacing:0.4px;">💡 Pro Tip</div><p style="margin:0; line-height:1.55; font-style:italic;">${tip}</p></div>` : ''}
                  ${!grammar && !vocabHtml && !idiomNote && !tip ? `<p style="margin:0; color:var(--text-muted); font-size:0.88em; font-style:italic; text-align:center; padding:8px 0;">💡 Detail belum tersedia.</p>` : ''}
                </div>
              </details>
            </div>
          </div>`;
      });

      if (hlList) hlList.innerHTML = html;
      const currentPageNotes = json.data.filter(n => n.page_number === currentPage);
      applySavedHighlightsToText(currentPageNotes);

    } else {
      if (hlCount) hlCount.textContent = '0';
      if (hlList) hlList.innerHTML = `<div class="hl-empty" style="text-align:center; padding:2rem 1rem; color:var(--text-muted);"><span style="font-size:2em;">📚</span><p>Belum ada catatan.</p></div>`;
    }
  } catch (err) { console.error('Gagal memuat catatan', err); }
}
window.loadHighlightsForPage = loadSidebarNotes;

let currentAudio = null;
async function playAudio(text, accent = 'american') {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); }
  try {
    const response = await fetch('/api/ai/tts', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ text: text, accent: accent }) 
    });
    if (!response.ok) throw new Error('Gagal memuat suara');
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    currentAudio = new Audio(audioUrl);
    const speedSelect = document.getElementById('tts-speed');
    if (speedSelect) currentAudio.playbackRate = parseFloat(speedSelect.value);
    currentAudio.play();
  } catch (error) {
    showToast('Gagal memuat suara. Periksa koneksi internet.', 'error');
  }
}

function bindSidebarAudio() {
  const hlList = document.getElementById('hl-list');
  if (!hlList) return;
  hlList.addEventListener('click', (e) => {
    const btn = e.target.closest('.play-sidebar-btn');
    if (btn) {
      const textToPlay = decodeURIComponent(btn.getAttribute('data-text'));
      const accent = btn.getAttribute('data-accent') || 'american';
      if (textToPlay) playAudio(textToPlay, accent);
    }
  });
}

function bindDeleteNotes() {
  const hlList = document.getElementById('hl-list');
  if (!hlList) return;
  hlList.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-note-btn');
    if (btn) {
      const noteId = btn.getAttribute('data-id');
      showConfirmModal(
        'Hapus Catatan',
        'Apakah Anda yakin ingin menghapus catatan dan stabilo ini? Tindakan ini tidak dapat dibatalkan.',
        'Hapus',
        async () => {
            btn.innerHTML = '⏳';
            try {
              const res = await fetch(`/api/highlights/${noteId}`, { method: 'DELETE' });
              if (res.ok) { 
                  showToast('Catatan berhasil dihapus.', 'success');
                  isRendering = false; renderPage(currentPage); 
              } else throw new Error('Gagal');
            } catch (err) { 
                showToast('Gagal menghapus catatan.', 'error'); 
                btn.innerHTML = '🗑️'; 
            }
        }
      );
    }
  });
}

function bindDeleteAllNotes() {
    const btnAll = document.getElementById('delete-all-notes-btn');
    if (!btnAll) return;
    
    btnAll.addEventListener('click', () => {
        const deleteBtns = document.querySelectorAll('.delete-note-btn');
        if (deleteBtns.length === 0) {
            showToast('Tidak ada catatan di dokumen ini untuk dihapus.', 'warning');
            return;
        }
        
        showConfirmModal(
            'Hapus SEMUA Catatan',
            `Anda akan menghapus <b style="color:var(--text-primary);">${deleteBtns.length} catatan</b> beserta stabilo di dokumen ini secara permanen.<br><br>Apakah Anda sangat yakin?`,
            'Ya, Hapus Semua',
            async () => {
                btnAll.innerHTML = '⏳'; btnAll.disabled = true;
                try {
                    const ids = Array.from(deleteBtns).map(b => b.getAttribute('data-id'));
                    await Promise.all(ids.map(id => fetch(`/api/highlights/${id}`, { method: 'DELETE' })));
                    showToast('Semua catatan berhasil dibersihkan.', 'success');
                    isRendering = false; renderPage(currentPage);
                } catch (err) {
                    showToast('Beberapa catatan gagal dihapus.', 'error');
                } finally {
                    btnAll.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>`;
                    btnAll.disabled = false;
                }
            }
        );
    });
}

async function loadDocument() {
  try {
    const res = await fetch('/api/documents/' + DOCUMENT_ID);
    const jsonRes = await res.json();
    docData = jsonRes.data || jsonRes;
    docTitleEl.textContent = docData.title;

    const loadingTask = pdfjsLib.getDocument({ url: docData.file_url });
    pdfDoc     = await loadingTask.promise;
    totalPages = pdfDoc.numPages;

    if (!docData.total_pages || docData.total_pages !== totalPages) {
      fetch('/api/documents/' + DOCUMENT_ID + '/total-pages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ total_pages: totalPages }) });
    }

    totalPagesEl.textContent = totalPages;
    pageInput.max = totalPages;
    await renderPage(docData.last_page || 1);
  } catch (err) { pdfLoading.innerHTML = '<p style="color:var(--danger);padding:24px;">Gagal memuat dokumen.</p>'; }
}

async function renderPage(pageNum) {
  if (isRendering) return;
  isRendering = true;
  currentPage      = pageNum;
  pageInput.value  = pageNum;
  prevBtn.disabled = pageNum <= 1;
  nextBtn.disabled = pageNum >= totalPages;

  try {
    const page        = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    let textHTML = ''; let currentParagraph = ''; let lastY = null;

    textContent.items.forEach(item => {
      const text = item.str.trim();
      if (!text) return; 
      
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(lastY - y) > 22) { 
        if (currentParagraph) { textHTML += `<p>${currentParagraph}</p>`; currentParagraph = ''; }
      } else if (currentParagraph && lastY !== null && Math.abs(lastY - y) > 5) {
        currentParagraph += ' '; 
      } else if (currentParagraph) {
        currentParagraph += ' '; 
      }
      currentParagraph += text;
      lastY = y;
    });
    
    if (currentParagraph) { textHTML += `<p>${currentParagraph}</p>`; }

    htmlContainer.innerHTML = textHTML || '<p class="text-muted" style="text-align:center;">Halaman ini kosong.</p>';
    
    if(pdfLoading) pdfLoading.style.display = 'none';
    centerWrapper.hidden = false; 
    document.getElementById('pdf-area').scrollTop = 0;

    await loadSidebarNotes(pageNum);

    if (document.body.classList.contains('focus-mode-active')) updateFocusModeText();

    fetch(`/api/documents/${DOCUMENT_ID}/last-page`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: pageNum }) }).catch(() => {});
  } catch (err) { console.error('Render error:', err); } finally { isRendering = false; }
}

function bindNav() {
  prevBtn.addEventListener('click', () => { if (currentPage > 1) renderPage(currentPage - 1); });
  nextBtn.addEventListener('click', () => { if (currentPage < totalPages) renderPage(currentPage + 1); });
  pageInput.addEventListener('change', () => {
    const p = parseInt(pageInput.value, 10);
    if (p >= 1 && p <= totalPages) renderPage(p); else pageInput.value = currentPage;
  });

  const toggleHighlightsBtn = document.getElementById('toggle-highlights-btn');
  if (toggleHighlightsBtn) {
    toggleHighlightsBtn.addEventListener('click', () => {
      const temporaryHighlights = document.querySelectorAll('span.temp-highlight');
      temporaryHighlights.forEach(span => {
          const parent = span.parentNode;
          while (span.firstChild) {
              parent.insertBefore(span.firstChild, span);
          }
          parent.removeChild(span);
          parent.normalize(); 
      });
      window.getSelection().removeAllRanges(); 
        
      const isHidden = htmlContainer.classList.toggle('hide-highlights');
      const icon = toggleHighlightsBtn.querySelector('svg');
      
      if (isHidden) {
        icon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
        toggleHighlightsBtn.title = "Tampilkan Stabilo";
      } else {
        icon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
        toggleHighlightsBtn.title = "Sembunyikan Stabilo";
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight') { if (currentPage < totalPages) renderPage(currentPage + 1); return; }
    if (e.key === 'ArrowLeft') { if (currentPage > 1) renderPage(currentPage - 1); return; }
    if (e.key === 'Escape' && document.getElementById('focus-overlay').classList.contains('active')) { closeFocusMode(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const isFocus = document.getElementById('focus-overlay').classList.contains('active');
      const container = isFocus ? document.getElementById('focus-text-container') : document.getElementById('pdf-area');
      if (container) {
        e.preventDefault(); 
        container.scrollBy({ top: e.key === 'ArrowDown' ? 50 : -50, behavior: 'smooth' });
      }
    }
  });
}

function bindHighlightsSidebar() {
  if (hlToggleBtn && hlSidebar) {
    hlToggleBtn.addEventListener('click', () => {
      const collapsed = hlSidebar.classList.toggle('collapsed');
      hlToggleBtn.classList.toggle('active', !collapsed);
    });
  }
}

function applyHighlightMarker() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (range.toString().trim() === '') return;

  const span = document.createElement('span');
  span.className = 'temp-highlight';

  const neonColors = [
    'rgba(255, 255, 0, 0.7)', 'rgba(0, 255, 0, 0.5)', 'rgba(0, 255, 255, 0.6)',
    'rgba(255, 0, 255, 0.5)', 'rgba(255, 153, 0, 0.7)', 'rgba(186, 85, 211, 0.6)'
  ];

  currentHighlightColor = neonColors[colorIndex];
  colorIndex = (colorIndex + 1) % neonColors.length;

  span.style.backgroundColor = currentHighlightColor;
  span.style.color            = '#000';
  span.style.borderRadius     = '3px';
  span.style.padding          = '2px 0';

  try { range.surroundContents(span); selection.removeAllRanges(); } 
  catch (e) { console.warn('Highlight melintasi paragraf, dibatalkan.'); }
}

document.addEventListener('DOMContentLoaded', () => {
  const tooltip      = document.getElementById('selection-tooltip');
  const analyzeBtn   = document.getElementById('analyze-btn');
  const aiPanel      = document.getElementById('ai-panel');
  const aiPanelClose = document.getElementById('ai-panel-close');
  const aiPanelBody  = document.getElementById('ai-panel-body');
  const pdfArea      = document.getElementById('pdf-area');

  let selectedText = ''; let contextText  = '';

  document.addEventListener('mouseup', (e) => {
    if (analyzeBtn && analyzeBtn.classList.contains('loading-magic')) return;

    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text.length > 0 && tooltip && !tooltip.contains(e.target) && aiPanel && !aiPanel.contains(e.target)) {
      
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount > 7) {
          showToast(`Terlalu panjang (${wordCount} kata). AI khusus untuk frasa pendek / vocab (Maks: 7 kata).`, 'warning');
          selection.removeAllRanges(); 
          tooltip.hidden = true;
          return;
      }

      selectedText = text;
      contextText  = (selection.anchorNode && selection.anchorNode.parentNode) ? selection.anchorNode.parentNode.textContent.trim() : text;
      
      tooltip.style.position = 'fixed';
      tooltip.style.left     = `${e.clientX}px`;
      tooltip.style.top      = `${e.clientY + 15}px`;
      tooltip.hidden = false;
    } else if (text.length === 0 && tooltip) { 
      tooltip.hidden = true; 
    }
  });

  if (pdfArea && tooltip) pdfArea.addEventListener('scroll', () => { 
    if (analyzeBtn && !analyzeBtn.classList.contains('loading-magic')) tooltip.hidden = true; 
  });
  
  if (aiPanelClose && aiPanel) aiPanelClose.addEventListener('click', () => { 
    aiPanel.hidden = true; 
    if ('speechSynthesis' in window) window.speechSynthesis.cancel(); 
    if (currentAudio) currentAudio.pause(); 
  });

  if (analyzeBtn && aiPanel && aiPanelBody) {
    analyzeBtn.addEventListener('click', async () => {
      analyzeBtn.classList.add('loading-magic');
      applyHighlightMarker();

      try {
        const response = await fetch('/api/ai/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: selectedText, context: contextText }) });
        const result = await response.json();

        analyzeBtn.classList.remove('loading-magic');
        if (tooltip) tooltip.hidden = true;
        aiPanel.hidden = false;

        if (response.ok && result.data) {
          const data = result.data;
          
          let htmlContent = `
            <div class="ai-stack">
              <div class="ai-selected-text-box">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <span style="font-size:0.85em; color:var(--text-muted); font-weight:600;">Teks Terpilih:</span>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <select id="tts-speed" style="font-size:0.8em; padding:2px 5px; border-radius:4px; border:1px solid var(--border); outline:none; background:var(--bg-panel); color:var(--text-primary);"><option value="1.0">1.0x (Normal)</option><option value="0.8">0.8x (Lambat)</option><option value="0.5">0.5x (Sangat Lambat)</option></select>
                    <div style="display:flex; gap:4px;">
                        <button id="play-selected-us-btn" class="play-audio-btn" title="Dengarkan (US)">🇺🇸</button>
                        <button id="play-selected-uk-btn" class="play-audio-btn" title="Dengarkan (UK)">🇬🇧</button>
                    </div>
                  </div>
                </div>
                <p style="margin:0; font-size:0.95em; line-height:1.5; color:var(--text-primary); font-style:italic;"><mark style="background:${currentHighlightColor}; border-radius:3px; color:#000; padding:2px 4px;">"${selectedText}"</mark></p>
              </div>

              <div style="margin-bottom:1.5rem; padding:0 5px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <h4 style="margin:0; color:var(--primary,#0d6efd); font-size:1.1em;">🧠 English Explanation</h4>
                  <div style="display:flex; gap:4px;">
                      <button id="play-exp-us-btn" class="play-audio-btn" title="Dengarkan Penjelasan (US)">🇺🇸</button>
                      <button id="play-exp-uk-btn" class="play-audio-btn" title="Dengarkan Penjelasan (UK)">🇬🇧</button>
                  </div>
                </div>
                <p style="font-size:0.95em; line-height:1.6; color:var(--text-primary);">${data.explanation}</p>
              </div>

              <div id="unlock-gate" style="margin:0 0 12px 0; border:2px dashed var(--border,#dee2e6); border-radius:10px; padding:14px 16px; background:rgba(13,110,253,0.03); text-align:center;">
                <p style="margin:0 0 10px 0; font-size:0.88em; color:var(--text-muted); line-height:1.4;">🔒 Baca dan pahami penjelasan di atas terlebih dahulu.</p>
                <button id="unlock-btn" style="background:var(--primary,#0d6efd); color:#fff; border:none; border-radius:8px; padding:9px 22px; font-size:0.9em; font-weight:700; cursor:pointer;">✅ Saya Sudah Paham — Buka Terjemahan</button>
              </div>

              <div id="locked-section" style="pointer-events:none; opacity:0.35; filter:blur(2px); transition:all 0.4s ease;">
                <details open><summary>🇮🇩 Indonesian Translation</summary><div class="details-content"><p style="margin-bottom:0;">${data.translation}</p></div></details>
                <details><summary>✨ More Details</summary><div class="details-content">`;
          
          if (data.grammar) htmlContent += `<h5 style="margin-top:0; color:var(--primary);">⚙️ Grammar Context</h5><div style="margin-bottom:15px; white-space: pre-line; line-height: 1.6; font-size: 0.95em;">${data.grammar}</div>`;
          if (data.vocabulary && data.vocabulary.length > 0) {
            htmlContent += `<h5 style="color:var(--primary);">📚 Key Vocabulary</h5><ul style="padding-left:20px; margin:0; margin-bottom:15px;">`;
            data.vocabulary.forEach(v => htmlContent += `<li style="margin-bottom:8px;"><b>${v.word}</b> <i>(${v.type})</i>: ${v.meaning}<br><span style="color:var(--text-muted); font-size:0.9em;">Ex: "${v.example}"</span></li>`);
            htmlContent += `</ul>`;
          }
          if (data.idiom_note) htmlContent += `<h5 style="color:var(--primary);">🗣️ Idioms / Phrases</h5><p style="margin-bottom:15px;">${data.idiom_note}</p>`;
          if (data.tip) htmlContent += `<h5 style="color:var(--success);">💡 Pro Tip</h5><p style="font-style:italic;">${data.tip}</p>`;

          htmlContent += `</div></details></div></div><button id="save-ai-note-btn" class="save-note-btn"><span>📝</span> Simpan Catatan</button>`;
          
          aiPanelBody.innerHTML = htmlContent;

          // Event Listener Audio Panel AI
          document.getElementById('play-selected-us-btn')?.addEventListener('click', () => playAudio(selectedText, 'american'));
          document.getElementById('play-selected-uk-btn')?.addEventListener('click', () => playAudio(selectedText, 'british'));
          document.getElementById('play-exp-us-btn')?.addEventListener('click', () => playAudio(data.explanation, 'american'));
          document.getElementById('play-exp-uk-btn')?.addEventListener('click', () => playAudio(data.explanation, 'british'));

          const unlockBtn = document.getElementById('unlock-btn'); const lockedSec = document.getElementById('locked-section');
          if (unlockBtn && lockedSec) unlockBtn.addEventListener('click', () => { lockedSec.style.pointerEvents = 'auto'; lockedSec.style.opacity = '1'; lockedSec.style.filter = 'none'; document.getElementById('unlock-gate').innerHTML = `<span style="font-size:0.82em; color:var(--success); font-weight:600;">✅ Terbuka</span>`; });

          const saveNoteBtn = document.getElementById('save-ai-note-btn');
          if (saveNoteBtn) saveNoteBtn.addEventListener('click', async () => {
            saveNoteBtn.innerHTML = '⏳ Menyimpan...'; saveNoteBtn.disabled = true;
            try {
              const res = await fetch('/api/highlights/ai-note', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document_id: DOCUMENT_ID, page_number: currentPage, selected_text: selectedText, ai_explanation: data.explanation || '', ai_translation: data.translation || '', color: currentHighlightColor, ai_details: JSON.stringify({ grammar: data.grammar, vocabulary: data.vocabulary, idiom_note: data.idiom_note, tip: data.tip }) })
              });
              if (res.ok) { 
                  saveNoteBtn.innerHTML = '✅ Tersimpan'; 
                  showToast('Catatan berhasil disimpan.', 'success');
                  const tempHl = document.querySelector('span.temp-highlight');
                  if(tempHl) {
                      tempHl.classList.remove('temp-highlight');
                      tempHl.classList.add('saved-highlight');
                  }
                  isRendering = false; await renderPage(currentPage); 
              } 
              else throw new Error('Gagal');
            } catch (error) { 
                saveNoteBtn.innerHTML = '❌ Gagal Menyimpan'; saveNoteBtn.disabled = false; 
                showToast('Gagal menyimpan catatan.', 'error');
            }
          });
        } else { 
            aiPanelBody.innerHTML = `<div style="text-align:center; padding:2rem 1rem;"><h4 style="color:#dc3545;">Gagal Menganalisis</h4></div>`; 
            showToast('AI gagal memproses teks.', 'error');
        }
      } catch (error) { 
        analyzeBtn.classList.remove('loading-magic');
        if (tooltip) tooltip.hidden = true;
        aiPanel.hidden = false;
        aiPanelBody.innerHTML = `<div style="text-align:center; padding:2rem 1rem;"><h4 style="color:#dc3545;">Koneksi Gagal</h4></div>`; 
        showToast('Koneksi internet terputus.', 'error');
      }
    });
  }
});

function updateFocusModeText() {
  if (focusCurrentPageEl) focusCurrentPageEl.textContent = currentPage;
  if (focusTotalPagesEl) focusTotalPagesEl.textContent = totalPages;

  if (!htmlContainer.innerHTML || htmlContainer.innerHTML.includes('Halaman ini kosong')) {
       focusTextContent.innerHTML = '<p style="text-align:center; color: rgba(255,255,255,0.5);">Teks tidak ditemukan di halaman ini.</p>';
       return;
  }

  const clone = htmlContainer.cloneNode(true);
  const paragraphs = clone.querySelectorAll('p');
  paragraphs.forEach(p => {
      p.style.marginBottom = '1.5em';
      p.style.textAlign = 'justify';
      p.style.lineHeight = '1.8';
  });

  focusTextContent.innerHTML = clone.innerHTML;
  focusTextContainer.scrollTop = 0; 
}

const startFocusBtn = document.getElementById('start-focus-btn');
const closeFocusBtn = document.getElementById('close-focus-btn');
const focusOverlay = document.getElementById('focus-overlay');
const focusTextContainer = document.getElementById('focus-text-container');
const focusTextContent = document.getElementById('focus-text-content');
const focusCurrentPageEl = document.getElementById('focus-current-page');
const focusTotalPagesEl = document.getElementById('focus-total-pages');

if(startFocusBtn) {
    startFocusBtn.addEventListener('click', () => {
      document.body.classList.add('focus-mode-active');
      focusOverlay.classList.add('active'); 
      updateFocusModeText();
    });
}

function closeFocusMode() { 
  focusOverlay.classList.remove('active'); 
  document.body.classList.remove('focus-mode-active');
  if (document.getElementById('ai-panel')) document.getElementById('ai-panel').hidden = true;
}

if (closeFocusBtn) closeFocusBtn.addEventListener('click', closeFocusMode);

function bindFocusThemes() {
    const themeBtns = document.querySelectorAll('.focus-theme-btn');
    themeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const themeClass = btn.getAttribute('data-theme');
            focusOverlay.className = `active ${themeClass}`;
        });
    });
}

function initResizableSidebars() {
    const leftResizer = document.getElementById('left-resizer');
    const rightResizer = document.getElementById('right-resizer');
    const leftSidebar = document.getElementById('highlights-sidebar');
    const aiPanel = document.getElementById('ai-panel');
    const wrapper = document.getElementById('center-reader-wrapper');
    const centerResizerLeft = document.getElementById('center-resizer-left');
    const centerResizerRight = document.getElementById('center-resizer-right');

    function setupResizer(resizer, targetElement, isLeftEdge, isCenter = false) {
        if (!resizer || !targetElement) return;
        let startX, startWidth;

        resizer.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startWidth = targetElement.offsetWidth;
            resizer.classList.add('dragging');
            document.addEventListener('mousemove', doDrag);
            document.addEventListener('mouseup', stopDrag);
            document.body.style.userSelect = 'none'; 
        });

        function doDrag(e) {
            if (isCenter) {
                let diff = e.clientX - startX;
                let newWidth = isLeftEdge ? startWidth - (diff * 2) : startWidth + (diff * 2);
                if (newWidth >= 400 && newWidth <= 1200) { targetElement.style.width = `${newWidth}px`; }
            } else {
                let newWidth = isLeftEdge ? startWidth + (e.clientX - startX) : startWidth - (e.clientX - startX);
                if (newWidth > 200 && newWidth < 600) { targetElement.style.width = `${newWidth}px`; }
            }
        }

        function stopDrag() {
            resizer.classList.remove('dragging');
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.body.style.userSelect = 'auto';
        }
    }

    setupResizer(leftResizer, leftSidebar, true, false);
    setupResizer(rightResizer, aiPanel, false, false);
    setupResizer(centerResizerLeft, wrapper, true, true);
    setupResizer(centerResizerRight, wrapper, false, true);
}