/* ============================================================
   READFOLIO — index.js
   Library page: list, upload, delete documents
   ============================================================ */

'use strict';

// ── State ─────────────────────────────────────────────────────
let allDocuments = [];
let selectedFile = null;

// ── DOM refs ──────────────────────────────────────────────────
const uploadModal    = document.getElementById('upload-modal');
const dropZone       = document.getElementById('drop-zone');
const fileInput      = document.getElementById('file-input');
const fileSelected   = document.getElementById('file-selected');
const filePreviewName = document.getElementById('file-preview-name');
const filePreviewSize = document.getElementById('file-preview-size');
const fileRemoveBtn  = document.getElementById('file-remove-btn');
const docTitleInput  = document.getElementById('doc-title');
const confirmUploadBtn = document.getElementById('confirm-upload-btn');
const uploadBtnText  = document.getElementById('upload-btn-text');
const uploadSpinner  = document.getElementById('upload-spinner');
const docGrid        = document.getElementById('doc-grid');
const emptyState     = document.getElementById('empty-state');
const searchInput    = document.getElementById('search-input');

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadDocuments();
  bindUploadModal();
  bindSearch();
  bindDeleteDocument(); // BARIS YANG DITAMBAHKAN UNTUK MENGAKTIFKAN TOMBOL HAPUS
});

// ── Load Documents ────────────────────────────────────────────
async function loadDocuments() {
  try {
    const res = await api.get('/api/documents/');
    allDocuments = res.data || [];
    
    // Logika Filter dari URL (?filter=...)
    const urlParams = new URLSearchParams(window.location.search);
    const filter = urlParams.get('filter');
    
    let filteredDocs = allDocuments;
    if (filter === 'reading') {
      // Sedang dibaca = progress > 0 dan < 100
      filteredDocs = allDocuments.filter(doc => {
        const progress = doc.total_pages > 0 ? Math.round((doc.last_page / doc.total_pages) * 100) : 0;
        return progress > 0 && progress < 100;
      });
    } else if (filter === 'finished') {
      // Selesai = progress == 100
      filteredDocs = allDocuments.filter(doc => {
        const progress = doc.total_pages > 0 ? Math.round((doc.last_page / doc.total_pages) * 100) : 0;
        return progress === 100;
      });
    }

    renderDocuments(filteredDocs);
    setActiveNav(filter); // Set warna menu aktif
  } catch (err) {
    showToast('Gagal memuat dokumen. Cek koneksi.', 'error');
  }
}

function setActiveNav(filter) {
  document.querySelectorAll('.lib-nav-item').forEach(el => el.classList.remove('active'));
  if (filter === 'reading') {
    document.getElementById('nav-reading').classList.add('active');
  } else if (filter === 'finished') {
    document.getElementById('nav-finished').classList.add('active');
  } else {
    document.getElementById('nav-all').classList.add('active');
  }
}

function renderDocuments(docs) {
  // Clear existing cards
  const cards = docGrid.querySelectorAll('.doc-card');
  cards.forEach(c => c.remove());

  if (docs.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  docs.forEach(doc => {
    const progress = doc.total_pages > 0
      ? Math.round((doc.last_page / doc.total_pages) * 100)
      : 0;

    const card = document.createElement('div'); // Ubah dari 'a' menjadi 'div'
    card.className = 'doc-card';
    card.dataset.id = doc.id;
    card.innerHTML = `
      <a href="/reader/${doc.id}" style="text-decoration: none; color: inherit; display: block; flex-grow: 1;">
          <div class="doc-card-icon">📄</div>
          <p class="doc-card-title">${escapeHtml(doc.title)}</p>
          <div class="doc-progress-wrap">
            <div class="doc-progress-bar">
              <div class="doc-progress-fill" style="width: ${progress}%"></div>
            </div>
            <p class="doc-progress-label">
              ${doc.total_pages > 0
                ? `Hal. ${doc.last_page} / ${doc.total_pages} · ${progress}%`
                : 'Belum dibaca'}
            </p>
          </div>
      </a>
      
      <div class="doc-meta" style="position: relative; z-index: 10; display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 10px;">
        <span class="doc-date">${formatDate(doc.last_read_at || doc.created_at)}</span>
        <button class="doc-delete-btn" data-id="${doc.id}" title="Hapus Dokumen">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          Hapus
        </button>
      </div>`;

    docGrid.appendChild(card);
  });
}

// ── Search ────────────────────────────────────────────────────
function bindSearch() {
  searchInput.addEventListener('input', debounce(() => {
    const q = searchInput.value.toLowerCase().trim();
    const filtered = q
      ? allDocuments.filter(d => d.title.toLowerCase().includes(q))
      : allDocuments;
    renderDocuments(filtered);
  }, 250));
}

// ── Delete ────────────────────────────────────────────────────
async function deleteDocument(id, cardEl) {
  if (!confirm('Hapus dokumen ini? Semua highlights juga akan terhapus.')) return;
  try {
    await api.delete(`/api/documents/${id}`);
    allDocuments = allDocuments.filter(d => d.id !== id);
    cardEl.style.animation = 'toast-out 0.25s ease forwards';
    setTimeout(() => { cardEl.remove(); renderDocuments(allDocuments); }, 250);
    showToast('Dokumen berhasil dihapus.', 'success');
  } catch (err) {
    showToast('Gagal menghapus dokumen.', 'error');
  }
}

// ── Upload Modal ──────────────────────────────────────────────
function bindUploadModal() {
  // Open
  document.getElementById('upload-btn').addEventListener('click', openModal);

  // Close
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('cancel-upload-btn').addEventListener('click', closeModal);
  uploadModal.addEventListener('click', (e) => { if (e.target === uploadModal) closeModal(); });

  // File input (klik Choose File)
  fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
  fileRemoveBtn.addEventListener('click', clearFile);

  // Drag & Drop event listeners
  dropZone.addEventListener('dragover', (e) => { 
    e.preventDefault(); 
    dropZone.classList.add('drag-over'); 
  });
  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });

  // Confirm upload
  confirmUploadBtn.addEventListener('click', doUpload);
}

function openModal() {
  uploadModal.hidden = false;
  clearFile();
}

function closeModal() {
  uploadModal.hidden = true;
  clearFile();
}

function handleFileSelect(file) {
  if (!file) return;
  if (!file.name.endsWith('.pdf')) {
    showToast('Hanya file PDF yang diizinkan.', 'error');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('Ukuran file maksimal 50 MB.', 'error');
    return;
  }
  selectedFile = file;
  filePreviewName.textContent = file.name;
  filePreviewSize.textContent = formatFileSize(file.size);
  
  // Tampilkan preview, sembunyikan dropzone
  dropZone.hidden = true;
  fileSelected.hidden = false;
  confirmUploadBtn.disabled = false;

  // Pre-fill title
  if (!docTitleInput.value) {
    docTitleInput.value = file.name.replace('.pdf', '');
  }
}

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  docTitleInput.value = '';
  
  // Kembalikan ke tampilan dropzone
  dropZone.hidden = false;
  fileSelected.hidden = true;
  confirmUploadBtn.disabled = true;
}

async function doUpload() {
  if (!selectedFile) return;

  // Loading state
  confirmUploadBtn.disabled = true;
  uploadBtnText.textContent  = 'Uploading...';
  uploadSpinner.hidden        = false;

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    const title = docTitleInput.value.trim() || selectedFile.name;
    formData.append('title', title);

    const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
    const json = await res.json();

    if (json.error) throw new Error(json.error);

    allDocuments.unshift(json.data);
    renderDocuments(allDocuments);
    closeModal();
    showToast('Dokumen berhasil diupload! 🎉', 'success');
  } catch (err) {
    showToast('Upload gagal: ' + err.message, 'error');
  } finally {
    uploadBtnText.textContent = 'Upload';
    uploadSpinner.hidden      = true;
    confirmUploadBtn.disabled = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ── Delete Document Delegation ────────────────────────────────
function bindDeleteDocument() {
  docGrid.addEventListener('click', async (e) => {
    const btn = e.target.closest('.doc-delete-btn');
    if (!btn) return;
    
    e.preventDefault(); // Mencegah navigasi tak terduga
    
    const docId = btn.getAttribute('data-id');
    const cardEl = btn.closest('.doc-card');
    
    if (!confirm('Apakah Anda yakin ingin menghapus dokumen ini secara permanen beserta semua catatannya?')) return;
    
    btn.innerHTML = '⏳...';
    btn.disabled = true;
    
    try {
      await api.delete(`/api/documents/${docId}`);
      allDocuments = allDocuments.filter(d => d.id !== docId);
      
      cardEl.style.animation = 'toast-out 0.3s ease forwards';
      setTimeout(() => { 
          cardEl.remove(); 
          if(allDocuments.length === 0) emptyState.hidden = false;
      }, 300);
      
      showToast('Dokumen berhasil dihapus.', 'success');
    } catch (err) {
      showToast('Gagal menghapus dokumen. Silakan coba lagi.', 'error');
      btn.innerHTML = 'Hapus';
      btn.disabled = false;
    }
  });
}