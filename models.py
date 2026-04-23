from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
import json

db = SQLAlchemy()

def generate_uuid():
    return str(uuid.uuid4())

class User(db.Model, UserMixin):
    __tablename__ = 'users'
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    is_online = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Document(db.Model):
    __tablename__ = 'documents'
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    
    # KUNCI PRIVASI: Mengikat dokumen dengan user_id
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    title = db.Column(db.String(255), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    total_pages = db.Column(db.Integer, default=0)
    last_page = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_read_at = db.Column(db.DateTime, onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'filename': self.filename,
            'file_url': f"/static/uploads/{self.filename}",
            'total_pages': self.total_pages,
            'last_page': self.last_page,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_read_at': self.last_read_at.isoformat() if self.last_read_at else None
        }

class Highlight(db.Model):
    __tablename__ = 'highlights'
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    document_id = db.Column(db.String(36), db.ForeignKey('documents.id'), nullable=False)
    page_number = db.Column(db.Integer, nullable=False)
    selected_text = db.Column(db.Text, nullable=False)
    
    # Kolom untuk posisi stabilo manual
    position_x = db.Column(db.Float, default=0.0)
    position_y = db.Column(db.Float, default=0.0)
    position_width = db.Column(db.Float, default=0.0)
    position_height = db.Column(db.Float, default=0.0)
    
    # Kolom hasil AI
    ai_translation = db.Column(db.Text)
    ai_explanation = db.Column(db.Text)
    ai_vocabulary = db.Column(db.Text) # Stored as JSON string
    ai_grammar = db.Column(db.Text)
    ai_idiom_note = db.Column(db.Text)
    
    color = db.Column(db.String(50), default='rgba(255, 213, 79, 0.3)')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'document_id': self.document_id,
            'page_number': self.page_number,
            'selected_text': self.selected_text,
            'position_x': self.position_x,
            'position_y': self.position_y,
            'position_width': self.position_width,
            'position_height': self.position_height,
            'ai_translation': self.ai_translation,
            'ai_explanation': self.ai_explanation,
            'ai_vocabulary': json.loads(self.ai_vocabulary) if self.ai_vocabulary else [],
            'ai_grammar': self.ai_grammar,
            'ai_idiom_note': self.ai_idiom_note,
            'color': self.color,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }