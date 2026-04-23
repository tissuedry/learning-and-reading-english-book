from flask import Blueprint, request, jsonify
from models import db, Highlight
import json  # Tambahkan import json di bagian atas

highlights_bp = Blueprint('highlights', __name__)

# ── GET /api/highlights/document/<document_id> ────────────────────────────────
@highlights_bp.route('/document/<document_id>', methods=['GET'])
def get_highlights(document_id):
    try:
        page = request.args.get('page')
        
        query = Highlight.query.filter_by(document_id=document_id)
        
        if page is not None:
            query = query.filter_by(page_number=int(page))
            
        highlights = query.order_by(Highlight.created_at).all()
        
        data = [h.to_dict() for h in highlights]
        return jsonify({'data': data, 'error': None})
        
    except Exception as e:
        return jsonify({'data': None, 'error': str(e)}), 500


# ── POST /api/highlights/ (Highlight Manual Biasa) ────────────────────────────
@highlights_bp.route('/', methods=['POST'])
def create_highlight():
    try:
        body = request.get_json()
        required = ['document_id', 'page_number', 'selected_text',
                    'position_x', 'position_y', 'position_width', 'position_height']

        for field in required:
            if field not in body:
                return jsonify({'error': f'Missing field: {field}'}), 400

        new_highlight = Highlight(
            document_id=body['document_id'],
            page_number=body['page_number'],
            selected_text=body['selected_text'],
            position_x=body['position_x'],
            position_y=body['position_y'],
            position_width=body['position_width'],
            position_height=body['position_height'],
            color=body.get('color', 'amber')
        )

        db.session.add(new_highlight)
        db.session.commit()
        
        return jsonify({'data': new_highlight.to_dict(), 'error': None}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'data': None, 'error': str(e)}), 500


# ── POST /api/highlights/ai-note (KHUSUS UNTUK MENYIMPAN HASIL AI) ────────────
@highlights_bp.route('/ai-note', methods=['POST'])
def create_ai_note():
    try:
        body = request.get_json()
        required = ['document_id', 'page_number', 'selected_text']

        for field in required:
            if field not in body:
                return jsonify({'error': f'Missing field: {field}'}), 400

        # Ekstrak data 'ai_details' yang dikirimkan oleh frontend
        ai_details_str = body.get('ai_details')
        ai_grammar = None
        ai_vocabulary = '[]'
        ai_idiom_note = None

        if ai_details_str:
            try:
                details = json.loads(ai_details_str)
                ai_grammar = details.get('grammar')
                
                # Vocabulary dikirim sebagai list, simpan sebagai JSON string
                vocab = details.get('vocabulary', [])
                ai_vocabulary = json.dumps(vocab) if vocab else '[]'
                
                ai_idiom_note = details.get('idiom_note')
            except Exception:
                pass

        # Buat instansiasi catatan AI dengan menyertakan detail tambahan
        new_ai_note = Highlight(
            document_id=body['document_id'],
            page_number=body['page_number'],
            selected_text=body['selected_text'],
            position_x=0.0,
            position_y=0.0,
            position_width=0.0,
            position_height=0.0,
            ai_explanation=body.get('ai_explanation'),
            ai_translation=body.get('ai_translation'),
            ai_grammar=ai_grammar,
            ai_vocabulary=ai_vocabulary,
            ai_idiom_note=ai_idiom_note,
            color=body.get('color', 'blue') # Ambil warna dari body request jika ada
        )

        db.session.add(new_ai_note)
        db.session.commit()
        
        return jsonify({'data': new_ai_note.to_dict(), 'error': None}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'data': None, 'error': str(e)}), 500


# ── GET /api/highlights/<id> ──────────────────────────────────────────────────
@highlights_bp.route('/<highlight_id>', methods=['GET'])
def get_highlight(highlight_id):
    try:
        highlight = Highlight.query.get(highlight_id)
        if not highlight:
             return jsonify({'data': None, 'error': 'Highlight not found'}), 404
             
        return jsonify({'data': highlight.to_dict(), 'error': None})
    except Exception as e:
        return jsonify({'data': None, 'error': str(e)}), 500


# ── DELETE /api/highlights/<id> ───────────────────────────────────────────────
@highlights_bp.route('/<highlight_id>', methods=['DELETE'])
def delete_highlight(highlight_id):
    try:
        highlight = Highlight.query.get(highlight_id)
        if highlight:
            db.session.delete(highlight)
            db.session.commit()
            
        return jsonify({'data': 'Deleted', 'error': None})
    except Exception as e:
        db.session.rollback()
        return jsonify({'data': None, 'error': str(e)}), 500