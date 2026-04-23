from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from models import db, Document, Highlight
from config import Config
from datetime import datetime, timezone
import os
import uuid

documents_bp = Blueprint('documents', __name__)

def allowed_file(filename: str) -> bool:
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

# ── GET /api/documents/ ────────────────────────────────────────────────────────
@documents_bp.route('/', methods=['GET'])
@login_required
def list_documents():
    try:
        # Hanya tampilkan dokumen milik user yang sedang login
        docs = Document.query.filter_by(user_id=current_user.id).order_by(Document.created_at.desc()).all()
        return jsonify({'data': [doc.to_dict() for doc in docs], 'error': None})
    except Exception as e:
        return jsonify({'data': None, 'error': str(e)}), 500

# ── GET /api/documents/<id> ────────────────────────────────────────────────────
@documents_bp.route('/<document_id>', methods=['GET'])
@login_required
def get_document(document_id):
    try:
        # Pastikan dokumen ini milik user yang sedang login
        doc = Document.query.filter_by(id=document_id, user_id=current_user.id).first()
        if not doc:
            return jsonify({'data': None, 'error': 'Document not found or access denied'}), 404
        return jsonify({'data': doc.to_dict(), 'error': None})
    except Exception as e:
        return jsonify({'data': None, 'error': str(e)}), 500

# ── POST /api/documents/upload ─────────────────────────────────────────────────
@documents_bp.route('/upload', methods=['POST'])
@login_required
def upload_document():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file  = request.files['file']
        title = request.form.get('title', '').strip() or file.filename

        if not file or not allowed_file(file.filename):
            return jsonify({'error': 'Only PDF files are allowed'}), 400

        file_id   = str(uuid.uuid4())
        safe_name = f"{file_id}_{file.filename.replace(' ', '_')}"
        
        upload_folder = current_app.config.get('UPLOAD_FOLDER', 'readfolio/static/uploads')
        os.makedirs(upload_folder, exist_ok=True)
        
        file_path = os.path.join(upload_folder, safe_name)
        
        file.save(file_path)

        # Simpan user_id ke database
        new_doc = Document(
            id=file_id,
            user_id=current_user.id,
            title=title,
            filename=safe_name,
            last_page=1
        )
        db.session.add(new_doc)
        db.session.commit()

        return jsonify({'data': new_doc.to_dict(), 'error': None}), 201

    except Exception as e:
        db.session.rollback()
        print(f"ERROR SAAT UPLOAD: {str(e)}")
        return jsonify({'data': None, 'error': str(e)}), 500

# ── PUT /api/documents/<id>/last-page ─────────────────────────────────────────
@documents_bp.route('/<document_id>/last-page', methods=['PUT'])
@login_required
def update_last_page(document_id):
    try:
        body = request.get_json(silent=True) or {}
        page = int(body.get('page', 1))

        doc = Document.query.filter_by(id=document_id, user_id=current_user.id).first()
        if doc:
            doc.last_page = page
            doc.last_read_at = datetime.now(timezone.utc)
            db.session.commit()

        return jsonify({'data': {'page': page}, 'error': None})
    except Exception as e:
        db.session.rollback()
        return jsonify({'data': None, 'error': str(e)}), 500

# ── PUT /api/documents/<id>/total-pages ───────────────────────────────────────
@documents_bp.route('/<document_id>/total-pages', methods=['PUT'])
@login_required
def update_total_pages(document_id):
    try:
        body        = request.get_json(silent=True) or {}
        total_pages = int(body.get('total_pages', 0))

        doc = Document.query.filter_by(id=document_id, user_id=current_user.id).first()
        if doc:
            doc.total_pages = total_pages
            db.session.commit()

        return jsonify({'data': {'total_pages': total_pages}, 'error': None})
    except Exception as e:
        db.session.rollback()
        return jsonify({'data': None, 'error': str(e)}), 500

# ── DELETE /api/documents/<id> ────────────────────────────────────────────────
@documents_bp.route('/<document_id>', methods=['DELETE'])
@login_required
def delete_document(document_id):
    try:
        doc = Document.query.filter_by(id=document_id, user_id=current_user.id).first()
        if doc:
            upload_folder = current_app.config.get('UPLOAD_FOLDER', 'readfolio/static/uploads')
            file_path = os.path.join(upload_folder, doc.filename)
            if os.path.exists(file_path):
                os.remove(file_path)
            
            db.session.delete(doc)
            db.session.commit()
            
        return jsonify({'data': 'Deleted successfully', 'error': None})
    except Exception as e:
        db.session.rollback()
        return jsonify({'data': None, 'error': str(e)}), 500

#
@documents_bp.route('/bulk-delete', methods=['POST'])
@login_required
def bulk_delete_documents():
    try:
        data = request.get_json()
        doc_ids = data.get('ids', [])
        
        if not doc_ids:
            return jsonify({'error': 'No documents selected'}), 400

        docs = Document.query.filter(Document.id.in_(doc_ids), Document.user_id == current_user.id).all()
        
        upload_folder = current_app.config.get('UPLOAD_FOLDER', 'readfolio/static/uploads')
        for doc in docs:
            file_path = os.path.join(upload_folder, doc.filename)
            if os.path.exists(file_path):
                os.remove(file_path)
            db.session.delete(doc)
            
        db.session.commit()
        return jsonify({'message': f'{len(docs)} documents deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500