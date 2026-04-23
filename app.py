import os
import json
from flask import Flask, render_template, redirect, url_for, request, flash, abort, Response, jsonify, session
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_cors import CORS
from config import Config
from models import db, Document, Highlight, User
from sqlalchemy import func

def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)

    db.init_app(app)

    # Initialize Login Manager
    login_manager = LoginManager()
    login_manager.login_view = 'login'
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(user_id)
    
    @app.before_request
    def update_online_status():
        if current_user.is_authenticated and getattr(current_user, 'is_online', None) == False:
            current_user.is_online = True
            db.session.commit()

    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    with app.app_context():
        db.create_all()
        # Create Admin Account if it doesn't exist
        admin = User.query.filter_by(username='Ghanif').first()
        if not admin:
            admin = User(username='Ghanif', is_admin=True)
            admin.set_password('129gaanip11')
            db.session.add(admin)
            db.session.commit()

    # Blueprints
    from routes.documents import documents_bp
    from routes.highlights import highlights_bp
    from routes.ai import ai_bp
    app.register_blueprint(documents_bp, url_prefix='/api/documents')
    app.register_blueprint(highlights_bp, url_prefix='/api/highlights')
    app.register_blueprint(ai_bp,        url_prefix='/api/ai')

    # --- AUTH ROUTES (LOGIN & REGISTER) ---
    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if current_user.is_authenticated:
            return redirect(url_for('index'))
            
        if request.method == 'POST':
            action = request.form.get('action') 
            username = request.form.get('username')
            password = request.form.get('password')
            
            if action == 'register':
                if User.query.filter_by(username=username).first():
                    flash('Username already exists. Please sign in.', 'error')
                else:
                    new_user = User(username=username, is_admin=False)
                    new_user.set_password(password)
                    db.session.add(new_user)
                    db.session.commit()
                    
                    login_user(new_user)
                    flash(f'welcome_beloved:{username}', 'success')
                    return redirect(url_for('index'))
                    
            else:
                user = User.query.filter_by(username=username).first()
                if user and user.check_password(password):
                    login_user(user)
                    flash(f'welcome_beloved:{username}', 'success')
                    return redirect(url_for('index'))
                else:
                    flash('Invalid username or password', 'error')
                    
        return render_template('login.html')

    @app.route('/logout')
    @login_required
    def logout():
        current_user.is_online = False
        db.session.commit()
        logout_user()
        return redirect(url_for('login'))

    # --- ADMIN ROUTE ---
    @app.route('/admin', methods=['GET', 'POST'])
    @login_required
    def admin_page():
        if not current_user.is_admin:
            abort(403)
        
        if request.method == 'POST':
            new_user = request.form.get('username')
            new_pass = request.form.get('password')
            is_adm = True if request.form.get('is_admin') else False
            
            if User.query.filter_by(username=new_user).first():
                flash('User already exists!', 'error')
            else:
                user = User(username=new_user, is_admin=is_adm)
                user.set_password(new_pass)
                db.session.add(user)
                db.session.commit()
                flash(f'User {new_user} created successfully!', 'success')
        
        users = User.query.all()
        return render_template('admin.html', users=users)

    @app.route('/admin/delete_user/<user_id>', methods=['POST'])
    @login_required
    def delete_user(user_id):
        if not current_user.is_admin:
            abort(403)
            
        user_to_delete = User.query.get(user_id)
        if user_to_delete:
            # DEVELOPER RULE: Ghanif memiliki hak mutlak untuk menghapus siapapun (termasuk admin lain)
            if current_user.username == 'Ghanif':
                db.session.delete(user_to_delete)
                db.session.commit()
                flash('User berhasil dihapus oleh Developer!', 'success')
            # ATURAN ADMIN BIASA:
            else:
                if user_to_delete.username == 'Ghanif':
                    flash('User Developer terlindungi dan tidak dapat dihapus.', 'error')
                elif not user_to_delete.is_admin:
                    db.session.delete(user_to_delete)
                    db.session.commit()
                    flash('User berhasil dihapus!', 'success')
                else:
                    flash('Akses ditolak: Anda tidak memiliki akses untuk menghapus admin lain.', 'error')
        else:
            flash('User tidak ditemukan.', 'error')
            
        return redirect(url_for('admin_page'))

    # --- PROFILE ROUTES ---
    @app.route('/profile', methods=['GET'])
    @login_required
    def profile_page():
        return render_template('profile.html')

    @app.route('/api/profile/update', methods=['POST'])
    @login_required
    def update_profile():
        data = request.get_json()
        new_username = data.get('username', '').strip()
        new_password = data.get('new_password', '')

        try:
            # Update Username jika ada perubahan
            if new_username and new_username != current_user.username:
                existing_user = User.query.filter_by(username=new_username).first()
                if existing_user:
                    return jsonify({'error': 'Username sudah digunakan orang lain.'}), 400
                current_user.username = new_username

            # Update Password jika form diisi
            if new_password:
                current_user.set_password(new_password)

            db.session.commit()
            return jsonify({'message': 'Profil berhasil diupdate', 'status': 'success'}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

    # --- MAIN PAGE ROUTES ---
    @app.route('/')
    @login_required
    def index():
        return render_template('index.html')
    
    @app.route('/stats')
    @login_required
    def stats_page():
        try:
            total_notes = db.session.query(Highlight).join(Document, Highlight.document_id == Document.id).filter(Document.user_id == current_user.id).count()
            finished_books = Document.query.filter(Document.user_id == current_user.id, Document.total_pages > 0, Document.last_page >= Document.total_pages).count()
            streak_days = Document.query.filter(Document.user_id == current_user.id, Document.last_read_at.isnot(None)).count()

            active_docs = Document.query.filter(Document.user_id == current_user.id, Document.total_pages > 0).all()
            doc_titles, doc_progress = [], []
            for doc in active_docs:
                progress = round((doc.last_page / doc.total_pages) * 100)
                doc_titles.append(doc.title[:15] + '...' if len(doc.title) > 15 else doc.title) 
                doc_progress.append(progress)

            note_stats = db.session.query(Document.title, func.count(Highlight.id)).join(Highlight, Document.id == Highlight.document_id).filter(Document.user_id == current_user.id).group_by(Document.title).all()
            note_titles, note_counts = [], []
            for stat in note_stats:
                note_titles.append(stat[0][:15] + '...' if stat[0] and len(stat[0]) > 15 else (stat[0] or 'Untitled'))
                note_counts.append(stat[1])

            return render_template('stats.html', total_words=total_notes, finished_books=finished_books, streak_days=streak_days, doc_titles=json.dumps(doc_titles), doc_progress=json.dumps(doc_progress), vocab_titles=json.dumps(note_titles), vocab_counts=json.dumps(note_counts))
        except:
            return render_template('stats.html', total_words=0, finished_books=0, streak_days=0, doc_titles="[]", doc_progress="[]", vocab_titles="[]", vocab_counts="[]")

    @app.route('/notes')
    @login_required
    def notes_page():
        highlights_data = db.session.query(Highlight, Document.title).join(Document, Highlight.document_id == Document.id).filter(Document.user_id == current_user.id).order_by(Highlight.created_at.desc()).all()
        grouped_notes = {}
        for hl, title in highlights_data:
            book_title = title or 'Untitled Document'
            if book_title not in grouped_notes: grouped_notes[book_title] = []
            hl_dict = hl.to_dict()
            hl_dict['parsed_vocab'] = hl_dict.get('ai_vocabulary', [])
            grouped_notes[book_title].append(hl_dict)
        return render_template('notes.html', grouped_notes=grouped_notes)

    @app.route('/reader/<document_id>')
    @login_required
    def reader(document_id):
        doc = Document.query.filter_by(id=document_id, user_id=current_user.id).first()
        if not doc:
            flash('Access Denied. You do not have permission to view this document.', 'error')
            return redirect(url_for('index'))
            
        return render_template('reader.html', document_id=document_id)

    # BARIS INI WAJIB BERADA PALING BAWAH DI DALAM FUNGSI create_app()
    return app

app = create_app()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)