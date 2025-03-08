from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, send_from_directory
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from config import Config
from models import db, User, Group, GroupMember, Message
import os
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import psutil
import time
import socket

app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# 配置文件上传
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mp3', 'wav'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max-limit

# 服务器启动时间
SERVER_START_TIME = time.time()

# 默认管理员账户
DEFAULT_ADMIN = {
    'username': 'lijiaxu',
    'password': 'lijiaxu2011@'  # 修改密码
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@login_manager.user_loader
def load_user(id):
    return db.session.get(User, int(id))

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username']).first()
        if user and user.check_password(request.form['password']):
            login_user(user)
            return redirect(url_for('chat'))
        flash('用户名或密码错误')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    if request.method == 'POST':
        if User.query.filter_by(username=request.form['username']).first():
            flash('用户名已存在')
            return redirect(url_for('register'))
        user = User(username=request.form['username'])
        user.set_password(request.form['password'])
        db.session.add(user)
        db.session.commit()
        flash('注册成功')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/chat')
@login_required
def chat():
    user_groups = [member.group for member in current_user.groups]
    return render_template('chat.html', groups=user_groups)

@app.route('/create_group', methods=['POST'])
@login_required
def create_group():
    name = request.form.get('name')
    password = request.form.get('password')
    password_enabled = request.form.get('password_enabled') == 'true'
    
    if not name:
        return jsonify({'error': '群组名称不能为空'}), 400
        
    group = Group(name=name)
    if password_enabled and password:
        group.set_password(password)
    
    member = GroupMember(user=current_user, group=group, is_admin=True)  # 创建者设为管理员
    db.session.add(group)
    db.session.add(member)
    
    try:
        db.session.commit()
        return jsonify({
            'id': group.id,
            'name': group.name
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/join_group', methods=['POST'])
@login_required
def join_group():
    group_id = request.form.get('group_id')
    password = request.form.get('password')
    group = Group.query.get_or_404(group_id)
    
    if not group.check_password(password):
        return jsonify({'error': '密码错误'}), 403
    
    if not GroupMember.query.filter_by(user=current_user, group=group).first():
        member = GroupMember(user=current_user, group=group)
        db.session.add(member)
        db.session.commit()
    
    return jsonify({'success': True})

@app.route('/get_all_groups')
@login_required
def get_all_groups():
    user_groups = [member.group_id for member in current_user.groups]
    available_groups = Group.query.filter(~Group.id.in_(user_groups)).all()
    return jsonify([{
        'id': group.id,
        'name': group.name,
        'member_count': len(group.members),
        'has_password': bool(group.password_hash)
    } for group in available_groups])

@app.route('/send_message', methods=['POST'])
@login_required
def send_message():
    group_id = request.form.get('group_id')
    message_text = request.form.get('message')
    
    if not group_id or not message_text:
        return jsonify({'error': '消息不能为空'}), 400
        
    # 检查用户是否是群组成员
    member = GroupMember.query.filter_by(user_id=current_user.id, group_id=group_id).first()
    if not member:
        return jsonify({'error': '您不是该群组成员'}), 403
    
    message = Message(
        content=message_text,
        author=current_user,
        group_id=group_id
    )
    db.session.add(message)
    
    try:
        db.session.commit()
        return jsonify({
            'id': message.id,
            'user': current_user.username,
            'message': message_text,
            'timestamp': message.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'group_id': group_id
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/get_messages/<int:group_id>')
@login_required
def get_messages(group_id):
    # 检查用户是否是群组成员
    member = GroupMember.query.filter_by(user_id=current_user.id, group_id=group_id).first()
    if not member:
        return jsonify({'error': '您不是该群组成员'}), 403
    
    try:
        messages = Message.query.filter_by(group_id=group_id).order_by(Message.timestamp.desc()).limit(50).all()
        return jsonify([{
            'id': msg.id,
            'user': msg.author.username,
            'message': msg.content,
            'file_path': msg.file_path,
            'file_type': msg.file_type,
            'timestamp': msg.timestamp.strftime('%Y-%m-%d %H:%M:%S')
        } for msg in messages])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stream')
@login_required
def stream():
    # 重定向到聊天页面
    return redirect(url_for('chat'))

@app.route('/socket.io/', defaults={'path': ''})
@app.route('/socket.io/<path:path>')
def socket_io_handler(path):
    # 返回 404，但同时设置一些头部来阻止重试
    response = jsonify({'error': 'WebSocket not supported'})
    response.headers['Connection'] = 'close'
    response.headers['X-WebSocket-Reject-Reason'] = 'WebSocket not supported'
    return response, 404

@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': '页面不存在'}), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'error': '服务器内部错误'}), 500

@app.after_request
def add_header(response):
    # 添加缓存控制头
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    # 添加安全头
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'same-origin'
    return response

@app.route('/get_group_members/<int:group_id>')
@login_required
def get_group_members(group_id):
    if not GroupMember.query.filter_by(user_id=current_user.id, group_id=group_id).first():
        return jsonify({'error': '您不是该群组成员'}), 403
    
    # 更新离线状态
    offline_threshold = datetime.utcnow() - timedelta(seconds=30)
    User.query.filter(User.last_seen < offline_threshold).update({User.is_online: False})
    db.session.commit()
    
    members = GroupMember.query.filter_by(group_id=group_id).all()
    return jsonify([{
        'id': member.user.id,
        'username': member.user.username,
        'status': 'online' if member.user.is_online else 'offline',
        'joined_at': member.joined_at.strftime('%Y-%m-%d %H:%M:%S')
    } for member in members])

@app.route('/heartbeat')
@login_required
def heartbeat():
    current_user.last_seen = datetime.utcnow()
    current_user.is_online = True
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/upload_file', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': '没有文件'}), 400
        
    file = request.files['file']
    group_id = request.form.get('group_id')
    
    if not file or not group_id:
        return jsonify({'error': '参数错误'}), 400
        
    if not GroupMember.query.filter_by(user_id=current_user.id, group_id=group_id).first():
        return jsonify({'error': '您不是该群组成员'}), 403
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # 使用时间戳确保文件名唯一
        filename = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        # 获取文件类型
        file_type = filename.rsplit('.', 1)[1].lower()
        
        # 创建消息
        message = Message(
            content=filename,
            file_path=filename,
            file_type=file_type,
            author=current_user,
            group_id=group_id
        )
        db.session.add(message)
        db.session.commit()
        
        return jsonify({
            'id': message.id,
            'user': current_user.username,
            'message': filename,
            'file_path': filename,
            'file_type': file_type,
            'timestamp': message.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'group_id': group_id
        })
        
    return jsonify({'error': '不支持的文件类型'}), 400

@app.route('/uploads/<filename>')
@login_required
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/get_group_settings/<int:group_id>')
@login_required
def get_group_settings(group_id):
    group = Group.query.get_or_404(group_id)
    member = GroupMember.query.filter_by(user_id=current_user.id, group_id=group_id).first()
    
    if not member:
        return jsonify({'error': '您不是该群组成员'}), 403
    
    members = GroupMember.query.filter_by(group_id=group_id).all()
    return jsonify({
        'name': group.name,
        'has_password': bool(group.password_hash),
        'is_admin': member.is_admin,
        'members': [{
            'id': m.user.id,
            'username': m.user.username,
            'status': 'online' if m.user.is_online else 'offline',
            'is_admin': m.is_admin,
            'can_remove': member.is_admin and current_user.id != m.user.id
        } for m in members]
    })

@app.route('/update_group_settings/<int:group_id>', methods=['POST'])
@login_required
def update_group_settings(group_id):
    data = request.get_json()
    group = Group.query.get_or_404(group_id)
    member = GroupMember.query.filter_by(user_id=current_user.id, group_id=group_id).first()
    
    if not member or not member.is_admin:
        return jsonify({'error': '您不是群组管理员'}), 403
    
    if not data.get('name'):
        return jsonify({'error': '群组名称不能为空'}), 400
    
    group.name = data['name']
    
    # 处理密码设置
    password_enabled = data.get('password_enabled', False)
    if not password_enabled:
        group.password_hash = None  # 清除密码
    elif data.get('password'):  # 只有在启用密码且提供了新密码时才设置
        group.set_password(data['password'])
    
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/remove_group_member/<int:group_id>', methods=['POST'])
@login_required
def remove_group_member(group_id):
    data = request.get_json()
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'error': '未指定要移除的成员'}), 400
    
    member = GroupMember.query.filter_by(
        group_id=group_id,
        user_id=user_id
    ).first_or_404()
    
    db.session.delete(member)
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/clear_group_messages/<int:group_id>', methods=['POST'])
@login_required
def clear_group_messages(group_id):
    Message.query.filter_by(group_id=group_id).delete()
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/leave_group/<int:group_id>', methods=['POST'])
@login_required
def leave_group(group_id):
    member = GroupMember.query.filter_by(
        group_id=group_id,
        user_id=current_user.id
    ).first_or_404()
    
    db.session.delete(member)
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/dissolve_group/<int:group_id>', methods=['POST'])
@login_required
def dissolve_group(group_id):
    # 检查是否是群管理员
    member = GroupMember.query.filter_by(
        group_id=group_id,
        user_id=current_user.id,
        is_admin=True
    ).first_or_404()
    
    group = Group.query.get_or_404(group_id)
    
    try:
        # 删除所有消息
        Message.query.filter_by(group_id=group_id).delete()
        # 删除所有成员关系
        GroupMember.query.filter_by(group_id=group_id).delete()
        # 删除群组
        db.session.delete(group)
        db.session.commit()
        return jsonify({'status': 'ok'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/get_profile')
@login_required
def get_profile():
    # 获取用户管理的群聊
    admin_groups = GroupMember.query.filter_by(
        user_id=current_user.id,
        is_admin=True
    ).all()
    
    return jsonify({
        'motto': current_user.motto,
        'contact': current_user.contact,
        'admin_groups': [{
            'id': member.group.id,
            'name': member.group.name,
            'member_count': len(member.group.members)
        } for member in admin_groups]
    })

@app.route('/update_profile', methods=['POST'])
@login_required
def update_profile():
    data = request.get_json()
    current_user.motto = data.get('motto')
    current_user.contact = data.get('contact')
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/change_password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json()
    
    if not current_user.check_password(data['current_password']):
        return jsonify({'error': '当前密码错误'}), 400
    
    current_user.set_password(data['new_password'])
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/delete_account', methods=['POST'])
@login_required
def delete_account():
    try:
        # 删除用户的所有消息
        Message.query.filter_by(user_id=current_user.id).delete()
        # 删除用户的所有群组成员关系
        GroupMember.query.filter_by(user_id=current_user.id).delete()
        # 删除用户
        db.session.delete(current_user)
        db.session.commit()
        return jsonify({'status': 'ok'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/delete_message/<int:message_id>', methods=['POST'])
@login_required
def delete_message(message_id):
    message = Message.query.get_or_404(message_id)
    
    # 检查是否是消息作者且在3分钟内
    if (message.user_id != current_user.id or 
        datetime.utcnow() - message.timestamp > timedelta(minutes=3)):
        return jsonify({'error': '无法删除此消息'}), 403
    
    try:
        # 如果有媒体文件，删除文件
        if message.file_path:
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], message.file_path)
            if os.path.exists(file_path):
                os.remove(file_path)
        
        db.session.delete(message)
        db.session.commit()
        return jsonify({'status': 'ok'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/verify_admin', methods=['POST'])
@login_required
def verify_admin():
    # 如果用户名是 lijiaxu，直接通过验证
    if current_user.username == DEFAULT_ADMIN['username']:
        current_user.role = 'admin'
        db.session.commit()
        return jsonify({'status': 'ok'})
    return jsonify({'error': '验证失败'}), 403

@app.route('/admin')
@login_required
def admin():
    # 如果用户名是 lijiaxu，直接允许访问
    if current_user.username == DEFAULT_ADMIN['username']:
        return render_template('admin.html')
    return redirect(url_for('chat'))

# 添加延迟测试函数
def check_latency():
    start_time = time.time()
    try:
        # 创建一个socket连接到本地服务器
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        sock.connect(('localhost', 5000))
        sock.close()
        return int((time.time() - start_time) * 1000)  # 转换为毫秒
    except:
        return 0

@app.route('/admin/status')
@login_required
def admin_status():
    if current_user.username != DEFAULT_ADMIN['username']:
        return jsonify({'error': '无权限'}), 403
        
    # 获取系统信息
    cpu_percent = psutil.cpu_percent()
    memory = psutil.virtual_memory()
    memory_percent = memory.percent
    latency = check_latency()  # 获取延迟
    
    # 计算在线用户数
    online_users = User.query.filter_by(is_online=True).count()
    total_users = User.query.count()
    total_groups = Group.query.count()
    
    # 计算今日消息数
    today = datetime.utcnow().date()
    today_messages = Message.query.filter(
        Message.timestamp >= today
    ).count()
    
    # 计算运行时间
    uptime = time.time() - SERVER_START_TIME
    uptime_str = str(timedelta(seconds=int(uptime)))
    
    return jsonify({
        'cpu': cpu_percent,
        'memory': memory_percent,
        'latency': latency,
        'online_users': online_users,
        'total_users': total_users,
        'total_groups': total_groups,
        'today_messages': today_messages,
        'uptime': uptime_str
    })

@app.route('/admin/users')
@login_required
def admin_users():
    if current_user.username != DEFAULT_ADMIN['username']:
        return jsonify({'error': '无权限'}), 403
        
    users = User.query.all()
    return jsonify([{
        'id': user.id,
        'username': user.username,
        'created_at': user.created_at.isoformat() if user.created_at else None,
        'last_seen': user.last_seen.isoformat() if user.last_seen else None,
        'is_online': user.is_online
    } for user in users])

@app.route('/admin/settings', methods=['POST'])
@login_required
def admin_settings():
    if current_user.username != DEFAULT_ADMIN['username']:
        return jsonify({'error': '无权限'}), 403
        
    data = request.get_json()
    
    # 验证刷新间隔
    refresh_interval = data.get('refresh_interval', 1)
    if not isinstance(refresh_interval, int) or refresh_interval < 1 or refresh_interval > 60:
        return jsonify({'error': '无效的刷新间隔'}), 400
    
    # 保存设置到数据库或配置文件
    # 这里可以添加实际的保存逻辑
    
    return jsonify({'status': 'ok'})

@app.route('/update_user_role', methods=['POST'])
@login_required
def update_user_role():
    if current_user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
        
    user_id = request.json.get('user_id')
    new_role = request.json.get('role')
    user = User.query.get_or_404(user_id)
    
    if new_role not in ['admin', 'user']:
        return jsonify({'error': '无效的角色'}), 400
        
    user.role = new_role
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/update_user_title', methods=['POST'])
@login_required
def update_user_title():
    if current_user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
        
    user_id = request.json.get('user_id')
    new_title = request.json.get('title')
    user = User.query.get_or_404(user_id)
    
    user.title = new_title
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/admin/reset_password', methods=['POST'])
@login_required
def admin_reset_password():
    if current_user.username != DEFAULT_ADMIN['username']:
        return jsonify({'error': '无权限'}), 403
        
    user_id = request.json.get('user_id')
    new_password = request.json.get('password', '123456')  # 默认密码为123456
    user = User.query.get_or_404(user_id)
    
    user.set_password(new_password)
    db.session.commit()
    return jsonify({'status': 'ok', 'message': f'密码已重置为: {new_password}'})

@app.route('/admin/get_all_groups')
@login_required
def admin_get_all_groups():
    if current_user.username != DEFAULT_ADMIN['username']:
        return jsonify({'error': '无权限'}), 403
        
    groups = Group.query.all()
    return jsonify([{
        'id': group.id,
        'name': group.name,
        'created_at': group.created_at.isoformat(),
        'member_count': len(group.members),
        'has_password': bool(group.password_hash)
    } for group in groups])

@app.route('/admin/update_group', methods=['POST'])
@login_required
def admin_update_group():
    if current_user.username != DEFAULT_ADMIN['username']:
        return jsonify({'error': '无权限'}), 403
        
    group_id = request.json.get('group_id')
    group = Group.query.get_or_404(group_id)
    
    # 更新群组信息
    if 'name' in request.json:
        group.name = request.json['name']
    if 'password' in request.json:
        group.set_password(request.json['password'])
        
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/admin/delete_group', methods=['POST'])
@login_required
def admin_delete_group():
    if current_user.username != DEFAULT_ADMIN['username']:
        return jsonify({'error': '无权限'}), 403
        
    group_id = request.json.get('group_id')
    group = Group.query.get_or_404(group_id)
    
    # 删除所有相关消息
    Message.query.filter_by(group_id=group.id).delete()
    # 删除所有成员关系
    GroupMember.query.filter_by(group_id=group.id).delete()
    # 删除群组
    db.session.delete(group)
    db.session.commit()
    
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    # 创建上传目录
    os.makedirs('uploads', exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # 确保在应用上下文中创建数据库
    with app.app_context():
        # 删除旧数据库文件（如果存在）
        if os.path.exists('app.db'):
            print('已检测到服务器数据库')
        # 创建新的数据库结构
        db.create_all()
        
        # 可以在这里添加一些初始数据
        # 例如创建测试用户等
    
    # 启动应用
    app.run(debug=True, host='127.0.0.1', port=5000) 