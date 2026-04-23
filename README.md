# 📖 Readfolio

**Belajar Bahasa Inggris dari PDF — Highlight, Analisis AI, & Catat Progress Bacaan**

> UI/UX yang tenang dan nyaman di mata, seperti membaca di buku catatan favoritmu.

---

## Fitur

| Fase | Status | Fitur |
|------|--------|-------|
| 1 | ✅ | Database Supabase (documents + highlights) & Storage bucket |
| 2 | ✅ | Upload PDF → Render di browser via PDF.js |
| 3 | ✅ | Last Read tracking + Toast notifikasi "Lanjutkan membaca?" |
| 4 | ✅ | Blok teks → Analisis AI (Gemini) → Terjemahan + Grammar + Kosakata |
| 5 | ✅ | Persistent highlight overlay (stabilo kuning permanen) |

---

## Tech Stack

- **Backend**: Python Flask
- **Database & Storage**: Supabase (PostgreSQL + Object Storage)
- **PDF Rendering**: PDF.js (Mozilla)
- **AI**: Google Gemini 1.5 Flash
- **Frontend**: Vanilla HTML/CSS/JS (tanpa framework)

---

## Setup (Step-by-Step)

### 1. Clone & Install

```bash
git clone <your-repo>
cd readfolio

python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### 2. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Buka **SQL Editor** → paste isi `supabase_schema.sql` → Run
3. Buka **Storage** → New Bucket:
   - Name: `pdf-documents`
   - Public: ✅ ON
   - Max file size: 50 MB

### 3. Konfigurasi Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
SECRET_KEY=ganti-dengan-random-string-panjang
FLASK_ENV=development

SUPABASE_URL=https://xxxxxx.supabase.co
SUPABASE_KEY=eyJxxxx...   # Ambil dari Project Settings → API → anon public
SUPABASE_BUCKET=pdf-documents

GEMINI_API_KEY=AIzaSy...  # Dari Google AI Studio: aistudio.google.com
```

### 4. Jalankan

```bash
python app.py
```

Buka: **http://localhost:5000**

---

## Struktur Proyek

```
readfolio/
├── app.py                  # Entry point Flask
├── config.py               # Konfigurasi dari .env
├── supabase_client.py      # Singleton Supabase client
├── supabase_schema.sql     # SQL untuk setup database
├── requirements.txt
├── .env.example
│
├── routes/
│   ├── documents.py        # CRUD dokumen + upload storage
│   ├── highlights.py       # CRUD highlights
│   └── ai.py               # Endpoint analisis Gemini
│
├── templates/
│   ├── base.html           # Layout dasar + font import
│   ├── index.html          # Halaman perpustakaan
│   └── reader.html         # Halaman baca PDF
│
└── static/
    ├── css/main.css        # Seluruh styling (warm notable theme)
    └── js/
        ├── app.js          # Shared utils (toast, api, debounce)
        ├── index.js        # Logic perpustakaan
        ├── reader.js       # PDF.js render + navigasi + last-read
        └── highlight.js    # Seleksi teks + AI + overlay permanen
```

---

## API Endpoints

### Documents
| Method | URL | Deskripsi |
|--------|-----|-----------|
| GET | `/api/documents/` | List semua dokumen |
| GET | `/api/documents/<id>` | Detail satu dokumen |
| POST | `/api/documents/upload` | Upload PDF baru |
| PUT | `/api/documents/<id>/last-page` | Update halaman terakhir |
| PUT | `/api/documents/<id>/total-pages` | Update total halaman |
| DELETE | `/api/documents/<id>` | Hapus dokumen + file |

### Highlights
| Method | URL | Deskripsi |
|--------|-----|-----------|
| GET | `/api/highlights/document/<id>` | Semua highlight dokumen |
| GET | `/api/highlights/document/<id>?page=3` | Highlight halaman tertentu |
| POST | `/api/highlights/` | Simpan highlight baru |
| DELETE | `/api/highlights/<id>` | Hapus highlight |

### AI
| Method | URL | Deskripsi |
|--------|-----|-----------|
| POST | `/api/ai/explain` | Analisis teks dengan Gemini |

**Body `/api/ai/explain`:**
```json
{
  "text": "The serendipitous encounter led to...",
  "context": "(kalimat sekitar, opsional)"
}
```

---

## Cara Pakai

1. **Upload PDF** → Klik tombol "Upload PDF" di halaman perpustakaan
2. **Buka & Baca** → Klik kartu dokumen untuk membuka reader
3. **Navigasi** → Tombol ◀ ▶, input nomor halaman, atau tombol keyboard ← →
4. **Analisis Teks** → Blok/seleksi teks bahasa Inggris → Klik "Analisis & Terjemahkan"
5. **Simpan Highlight** → Klik "Simpan sebagai Highlight" di panel AI
6. **Lihat Catatan** → Klik stabilo kuning atau panel "Catatan Bacaan" di kiri
7. **Lanjutkan Baca** → Saat membuka ulang, akan muncul toast "Lanjutkan membaca?"

---

## Deploy ke Production

```bash
# Pakai gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 app:app

# Atau dengan Railway / Render:
# Set environment variables di dashboard mereka
# Start command: gunicorn app:app
```

---

## Tips & Catatan

- **Gemini API** gratis dengan batas generous di Google AI Studio
- **Supabase** free tier cukup untuk penggunaan pribadi (500 MB storage)
- Semua font di-load dari Google Fonts (Lora + DM Sans + Source Serif 4)
- PDF.js di-load dari CDN Cloudflare, tidak perlu install terpisah
