import os
import asyncio
import edge_tts
from flask import Blueprint, request, jsonify, Response
from config import Config
from groq import Groq
import json
import re

ai_bp = Blueprint('ai', __name__)

def _clean_json(text: str) -> str:
    """Ekstraksi objek JSON dari teks secara aman."""
    text = text.strip()
    match = re.search(r'(\{.*\})', text, re.DOTALL)
    if match:
        return match.group(1)
    return text

@ai_bp.route('/explain', methods=['POST'])
def explain_text():
    try:
        if not Config.GROQ_API_KEY:
            return jsonify({'error': 'GROQ_API_KEY is not configured'}), 500

        body = request.get_json(silent=True) or {}
        text = body.get('text', '').strip()
        context = body.get('context', '').strip()

        if not text:
            return jsonify({'error': 'No text provided'}), 400

        client = Groq(api_key=Config.GROQ_API_KEY)

        word_count = len(text.split())
        is_single_word = word_count == 1

        # =====================================================================
        # GRAMMAR INSTRUCTION: Adaptif berdasarkan jumlah kata
        # =====================================================================
        if is_single_word:
            grammar_instruction = """3. Grammar — ANALISIS 6 DIMENSI LINGUISTIK (in Indonesian):
   Berikan analisis mendalam mencakup SEMUA dimensi berikut:

   [MORFOLOGI]
   - Akar kata (root/base form) dan asal bahasa (Latin, Greek, Anglo-Saxon, dll.)
   - Proses pembentukan kata: prefix/suffix/infix yang ada dan maknanya
   - Word family lengkap: sebutkan noun, verb, adjective, adverb dari akar yang sama
   - Bentuk kata saat ini: plural, past tense, gerund, participle, komparatif, dll.

   [SINTAKSIS]
   - Part of Speech utama + sub-kategori (contoh: abstract noun / transitive verb)
   - Jika noun: countable/uncountable, concrete/abstract, common/proper + pengecualian
   - Jika verb: transitif/intransitif, reguler/ireguler, apakah linking verb
   - Jika adjective: posisi attributive vs predicative, bisa dibandingkan atau tidak
   - Jika adverb: memodifikasi apa, posisi lazim dalam kalimat
   - Jika preposition: relasi yang dibentuk (tempat, waktu, arah, cara)
   - Fungsi sintaksis kata ini dalam kalimat sumbernya (dari FULL CONTEXT)

   [SEMANTIK]
   - Makna denotatif (makna kamus yang tepat)
   - Makna konotatif: positif/negatif/netral? Nuansa emosi apa yang dibawa?
   - Polisemi: apakah ada makna ganda? Sebutkan makna lain jika ada
   - Sinonim 2-3 kata + perbedaan nuansa di antara mereka
   - Antonim jika relevan

   [LEKSIKAL]
   - Kolokasi paling umum (3-4 contoh nyata dalam bentuk frasa lengkap)
     Format: "burning curiosity", "out of curiosity", "satisfy one's curiosity"
   - Idiom atau fixed expression yang mengandung kata ini, jika ada

   [REGISTER & PRAGMATIK]
   - Register: formal / informal / akademik / sastra / teknis / sehari-hari
   - Perkiraan CEFR level (A1–C2)
   - Konteks penggunaan yang paling lazim

   [AKUISISI BAHASA — khusus pelajar Indonesia]
   - Kesalahan ejaan atau pengucapan yang sering dibuat pelajar Indonesia
   - False friend atau kemiripan dengan kata Indonesia yang perlu diwaspadai
   - 1 mnemonic atau trik mengingat yang spesifik dan praktis"""
        else:
            grammar_instruction = """3. Grammar — ANALISIS GRAMATIKAL FRASA/KALIMAT (in Indonesian):
   Berikan analisis mendalam mencakup:

   [STRUKTUR KALIMAT]
   - Jenis: simple / compound / complex / compound-complex
   - Identifikasi klausa (main clause, subordinate clause)

   [KOMPONEN KALIMAT]
   - Uraikan: Subject, Predicate, Object (direct/indirect), Complement, Adverbial
   - Identifikasi frasa penting: Noun Phrase, Verb Phrase, Prepositional Phrase

   [TENSE & ASPEK]
   - Tense yang digunakan dan alasannya dalam konteks ini
   - Aspek: simple / continuous / perfect / perfect continuous

   [FITUR GRAMATIKAL KHUSUS]
   - Catat jika ada: passive voice, conditional, relative clause, participle phrase, inversion, ellipsis
   - Jelaskan fungsi dan efek stilistika dari fitur tersebut

   [HUBUNGAN ANTAR BAGIAN]
   - Modifier → headword: kata mana memodifikasi kata mana
   - Fungsi conjunction atau connecting word jika ada"""

        # =====================================================================
        # PROMPT UTAMA
        # =====================================================================
        prompt = f"""
You are a world-class English Professor from Oxford. Your mission is to provide elite-level linguistic analysis for an Indonesian student mastering English.

---
SELECTED TEXT: "{text}"
FULL CONTEXT: "{context}"
---

CORE INSTRUCTIONS:
1. ZERO-HISTORY: Analyze ONLY the text above. Fresh isolated analysis every time.

2. Explanation (in English, 4-6 sentences): Sophisticated academic explanation of the selected text's meaning and nuance. Use FULL CONTEXT only to clarify meaning — do NOT retell the story.

{grammar_instruction}

4. Translation (in Indonesian) — STRICT LITERAL RULE:
   Translate ONLY the direct, literal meaning of the SELECTED TEXT.
   - DO NOT explain story context, characters, or narrative.
   - DO NOT add "kata ini menggambarkan..." or any contextual explanation.
   - 1 word → give direct dictionary meaning(s): e.g. "curiosity" = "rasa ingin tahu; keingintahuan"
   - phrase/sentence → clean literal Indonesian translation only.
   FORBIDDEN: "Rasa ingin tahu yang mendorong Marco untuk menjelajahi dunia"
   CORRECT: "rasa ingin tahu; keingintahuan"

5. Vocabulary (in Indonesian): For EVERY significant word in the selected text:
   - type: Part of Speech
   - meaning: contextual meaning (boleh pakai FULL CONTEXT untuk konteks, tapi jelaskan MAKNA KATA, bukan cerita)
   - note: linguistic features — kolokasi, register, word family, hal menarik lainnya
   - example: 1 original sophisticated sentence in ENGLISH ONLY (completely unrelated to the story)

6. Idiom Note (in Indonesian): If the selected text IS or CONTAINS an idiom or fixed expression, explain in detail. Otherwise return JSON null.

7. Tip (in Indonesian): 1 expert-level practical tip for an Indonesian learner — mnemonic, common mistake warning, or key usage pattern.

STRICT OUTPUT RULES:
- Return ONLY a valid JSON object. No prose, no markdown, no code fences.
- All fields in Bahasa Indonesia EXCEPT: 'explanation' and all 'example' fields (must be in English).
- The 'translation' field MUST be a direct literal translation ONLY — never story context.
- The 'grammar' field for a single word MUST cover all 6 dimensions as instructed.
- max_tokens is enough — do not truncate or shorten the grammar field.

JSON STRUCTURE:
{{
  "explanation": "",
  "translation": "",
  "grammar": "",
  "vocabulary": [
    {{
      "word": "",
      "type": "",
      "meaning": "",
      "note": "",
      "example": ""
    }}
  ],
  "idiom_note": null,
  "tip": ""
}}
"""

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a world-class linguistics professor providing precise, academic, comprehensive analysis. "
                        "Follow the JSON format strictly. No prose, no code fences. "
                        "CRITICAL RULE 1 — 'translation' field: direct literal translation ONLY. "
                        "Never include story context, characters, or narrative explanation. "
                        "CRITICAL RULE 2 — 'grammar' field for single words: MUST cover all 6 dimensions: "
                        "morfologi, sintaksis, semantik, leksikal, register/pragmatik, akuisisi bahasa. "
                        "Do not skip or abbreviate any dimension."
                    )
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1,
            max_tokens=3000,
            response_format={"type": "json_object"}
        )

        result_json = _clean_json(completion.choices[0].message.content)
        result = json.loads(result_json)
        return jsonify({'data': result, 'error': None})

    except Exception as e:
        return jsonify({'data': None, 'error': str(e)}), 500


# --- TTS Logic (Streaming Audio) ---
async def get_edge_tts_audio_bytes(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice)
    audio_data = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])
    return bytes(audio_data)

@ai_bp.route('/tts', methods=['POST'])
def edge_tts_endpoint():
    try:
        data = request.get_json(silent=True) or {}
        text = data.get('text', '').strip()
        accent = data.get('accent', 'american') # Default ke American
        
        if not text:
            return jsonify({'error': 'Teks kosong'}), 400
            
        # Pilihan Suara Berdasarkan Request
        if accent == 'british':
            VOICE_ID = "en-GB-SoniaNeural" # Suara British UK
        else:
            VOICE_ID = "en-US-JennyNeural" # Suara American US
            
        audio_bytes = asyncio.run(get_edge_tts_audio_bytes(text, VOICE_ID))
        return Response(audio_bytes, mimetype="audio/mpeg")
    except Exception as e:
        return jsonify({'error': str(e)}), 500