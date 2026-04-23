import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'default-key')
    
    # AI API Keys
    GROQ_API_KEY = os.environ.get('GROQ_API_KEY')
    ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY')
    
    # Database Lokal menggunakan SQLite
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', f"sqlite:///{os.path.join(BASE_DIR, 'readfolio.db')}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Path untuk menyimpan file PDF secara lokal
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
    
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB
    ALLOWED_EXTENSIONS = {'pdf'}