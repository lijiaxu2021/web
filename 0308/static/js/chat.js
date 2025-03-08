// 全局变量
const currentUser = document.querySelector('meta[name="current-user"]').content;
let currentGroup = null;
let pollingInterval = null;
let messageCache = new Set(); // 用于缓存已显示的消息ID
let membersVisible = true;
let currentGroupData = null;
let activeContextMenu = null;
let longPressTimer = null;
const mediaPreviewModal = new bootstrap.Modal(document.getElementById('mediaPreviewModal'));

// 轮询新消息
function startPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    pollingInterval = setInterval(async () => {
        if (!currentGroup) return;
        
        try {
            const response = await fetch(`/get_messages/${currentGroup}`);
            const messages = await response.json();
            
            // 按时间戳排序消息
            messages.sort((a, b) => {
                return new Date(a.timestamp) - new Date(b.timestamp);
            });
            
            // 检查并显示新消息
            messages.forEach(message => {
                const messageKey = `${message.id}-${message.timestamp}`;
                if (!messageCache.has(messageKey)) {
                    messageCache.add(messageKey);
                    appendMessage(message);
                }
            });
        } catch (error) {
            console.error('Error polling messages:', error);
        }
    }, 3000); // 3秒轮询一次
}

// 添加移动端相关函数
function isMobile() {
    return window.innerWidth < 768;
}

function showMobileGroups() {
    document.querySelector('.mobile-groups').style.display = 'block';
    document.querySelector('.chat-area').style.display = 'none';
}

function showMobileChat() {
    document.querySelector('.mobile-groups').style.display = 'none';
    document.querySelector('.chat-area').style.display = 'flex';
}

// 修改切换群组函数
function switchGroup(groupId) {
    if (!groupId) return;
    
    currentGroup = groupId;
    messageCache.clear();
    
    // 更新活动群组状态
    document.querySelectorAll('.group-item, .group-card').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.groupId === groupId) {
            item.classList.add('active');
        }
    });
    
    // 更新移动端标题
    const group = document.querySelector(`[data-group-id="${groupId}"]`);
    if (group) {
        document.querySelector('.current-group-name').textContent = 
            group.querySelector('.group-name')?.textContent || 
            group.textContent.split('(')[0].trim();
    }
    
    // 清空并重新加载消息
    const messageList = document.getElementById('message-list');
    if (messageList) {
        messageList.innerHTML = '';
        loadGroupMessages(groupId);
    }
    
    // 加载成员列表
    loadGroupMembers(groupId);
    
    // 在移动端显示聊天界面
    if (isMobile()) {
        showMobileChat();
    }
}

// 加载群组历史消息
async function loadGroupMessages(groupId) {
    if (!groupId) return;
    
    try {
        const response = await fetch(`/get_messages/${groupId}`);
        if (!response.ok) {
            const error = await response.json();
            console.error('Error:', error);
            return;
        }
        
        const messages = await response.json();
        const messageList = document.getElementById('message-list');
        
        // 清空现有消息
        messageList.innerHTML = '';
        messageCache.clear();
        
        // 按时间戳排序并显示消息
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .forEach(message => {
                const messageKey = `${message.id}-${message.timestamp}`;
                if (!messageCache.has(messageKey)) {
                    messageCache.add(messageKey);
                    appendMessage(message);
                }
            });
        
        messageList.scrollTop = messageList.scrollHeight;
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// 发送消息
document.getElementById('message-form').onsubmit = async function(e) {
    e.preventDefault();
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (!currentGroup) {
        alert('请先选择或创建一个群组');
        return;
    }
    
    if (message) {
        try {
            const response = await fetch('/send_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `group_id=${currentGroup}&message=${encodeURIComponent(message)}`
            });
            
            const data = await response.json();
            if (response.ok) {
                input.value = '';
                const messageKey = `${data.id}-${data.timestamp}`;
                if (!messageCache.has(messageKey)) {
                    messageCache.add(messageKey);
                    appendMessage(data);
                }
            } else {
                alert(data.error || '发送失败');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('发送失败');
        }
    }
};

// 添加心跳检测
function startHeartbeat() {
    setInterval(async () => {
        try {
            await fetch('/heartbeat');
        } catch (error) {
            console.error('Heartbeat failed:', error);
        }
    }, 15000); // 每15秒发送一次心跳
}

// 修改创建群聊函数
document.getElementById('create-group-form').onsubmit = async function(e) {
    e.preventDefault();
    const name = document.getElementById('group-name').value.trim();
    const passwordEnabled = document.getElementById('password-enabled').checked;
    const password = document.getElementById('group-password').value;
    
    if (!name) {
        alert('群组名称不能为空');
        return;
    }
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('password_enabled', passwordEnabled);
    if (passwordEnabled) {
        formData.append('password', password);
    }
    
    try {
        const response = await fetch('/create_group', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('创建群组失败');
        }
        
        location.reload();
    } catch (error) {
        console.error('Error:', error);
        alert('创建群组失败');
    }
};

// 修改加入群聊函数
async function joinGroup(groupId, hasPassword) {
    if (hasPassword) {
        const passwordModal = new bootstrap.Modal(document.getElementById('passwordModal'));
        document.getElementById('join-group-id').value = groupId;
        passwordModal.show();
        return;
    }
    
    try {
        const response = await fetch('/join_group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `group_id=${groupId}`
        });
        
        if (response.ok) {
            location.reload();
        } else {
            const data = await response.json();
            alert(data.error || '加入失败');
        }
    } catch (error) {
        console.error('Error joining group:', error);
    }
}

// 添加密码表单提交处理
document.getElementById('password-form').onsubmit = async function(e) {
    e.preventDefault();
    const groupId = document.getElementById('join-group-id').value;
    const password = document.getElementById('join-password').value;
    
    try {
        const response = await fetch('/join_group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `group_id=${groupId}&password=${encodeURIComponent(password)}`
        });
        
        if (response.ok) {
            location.reload();
        } else {
            const data = await response.json();
            alert(data.error || '密码错误');
        }
    } catch (error) {
        console.error('Error joining group:', error);
    }
};

// 修改加载可用群组函数
function loadAvailableGroups() {
    fetch('/get_all_groups')
        .then(response => response.json())
        .then(groups => {
            const groupsList = document.getElementById('available-groups-list');
            groupsList.innerHTML = '';
            
            if (groups.length === 0) {
                groupsList.innerHTML = '<div class="p-3 text-center text-muted">暂无可加入的群聊</div>';
                return;
            }
            
            groups.forEach(group => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'available-group-item';
                groupDiv.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
                        <div>
                            <strong>${group.name}</strong>
                            <small class="text-muted">(${group.member_count}人)</small>
                            ${group.has_password ? '<span class="badge bg-warning ms-2">密码保护</span>' : ''}
                        </div>
                        <button class="btn btn-sm btn-primary join-group-btn">
                            加入
                        </button>
                    </div>
                `;
                groupsList.appendChild(groupDiv);
                
                groupDiv.querySelector('.join-group-btn').onclick = () => joinGroup(group.id, group.has_password);
            });
        });
}

// 修改消息显示函数
function appendMessage(data) {
    const messageList = document.getElementById('message-list');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.user === currentUser ? 'sent' : 'received'}`;
    
    let content = '';
    if (data.file_path) {
        const fileUrl = `/uploads/${data.file_path}`;
        switch (data.file_type) {
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'gif':
                content = `<img src="${fileUrl}" class="media-preview" alt="图片" loading="lazy">`;
                break;
            case 'mp4':
                content = `
                    <video class="media-preview" controls preload="metadata">
                        <source src="${fileUrl}" type="video/mp4">
                        您的浏览器不支持视频播放
                    </video>`;
                break;
            case 'mp3':
            case 'wav':
                content = `
                    <audio class="media-preview" controls preload="metadata">
                        <source src="${fileUrl}" type="audio/${data.file_type}">
                        您的浏览器不支持音频播放
                    </audio>`;
                break;
            default:
                content = `<a href="${fileUrl}" target="_blank" class="file-link">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-earmark" viewBox="0 0 16 16">
                        <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                    </svg>
                    ${data.message}
                </a>`;
        }
    } else {
        content = `<p>${data.message}</p>`;
    }
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <strong>${data.user}</strong>
            ${content}
            <small>${data.timestamp}</small>
        </div>
    `;
    messageList.appendChild(messageDiv);
    messageList.scrollTop = messageList.scrollHeight;
    
    // 添加媒体点击事件
    messageDiv.querySelectorAll('img, video, audio').forEach(media => {
        media.addEventListener('click', () => handleMediaClick(media));
    });
    
    // 添加上下文菜单事件
    if (isMobile()) {
        messageDiv.addEventListener('touchstart', (e) => handleTouchStart(e, messageDiv));
        messageDiv.addEventListener('touchend', () => handleTouchEnd(messageDiv));
        messageDiv.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
            messageDiv.classList.remove('press-active');
        });
    } else {
        messageDiv.addEventListener('contextmenu', (e) => showContextMenu(e, messageDiv));
    }
    
    // 检查是否可删除
    const messageTime = new Date(data.timestamp);
    if (Date.now() - messageTime.getTime() <= 180000) { // 3分钟内
        messageDiv.classList.add('deletable');
    }
}

// 修改成员列表切换函数
function toggleMembers() {
    const membersSidebar = document.getElementById('members-sidebar');
    const toggleBtn = document.getElementById('toggle-members-btn');
    const chatArea = document.querySelector('.chat-area');
    
    membersSidebar.classList.toggle('hidden');
    toggleBtn.classList.toggle('hidden');
    chatArea.classList.toggle('members-hidden');
    
    // 保存状态到 localStorage
    membersVisible = !membersSidebar.classList.contains('hidden');
    localStorage.setItem('membersVisible', membersVisible);
}

async function loadGroupMembers(groupId) {
    try {
        const response = await fetch(`/get_group_members/${groupId}`);
        const members = await response.json();
        const membersList = document.getElementById('members-list');
        const memberCount = document.querySelector('.members-header .member-count');
        
        membersList.innerHTML = '';
        memberCount.textContent = `(${members.length})`;
        
        members.forEach(member => {
            const memberDiv = document.createElement('div');
            memberDiv.className = 'member-item';
            memberDiv.innerHTML = `
                <div class="member-status ${member.status}"></div>
                <div class="member-info">
                    <div class="member-name">${member.username}</div>
                    <small class="text-muted">加入于 ${member.joined_at}</small>
                </div>
            `;
            membersList.appendChild(memberDiv);
        });
    } catch (error) {
        console.error('Error loading group members:', error);
    }
}

// 添加文件上传处理
document.getElementById('file-form').onsubmit = async function(e) {
    e.preventDefault();
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    
    if (file && currentGroup) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('group_id', currentGroup);
        
        try {
            const response = await fetch('/upload_file', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                appendMessage(data);
                fileInput.value = '';
            }
        } catch (error) {
            console.error('Error uploading file:', error);
        }
    }
};

// 添加返回按钮事件
document.getElementById('backToGroups')?.addEventListener('click', () => {
    if (isMobile()) {
        showMobileGroups();
    }
});

// 添加侧边栏折叠功能
document.getElementById('toggle-sidebar-btn')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        // 保存状态到 localStorage
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    }
});

// 修改初始化
document.addEventListener('DOMContentLoaded', function() {
    // 启动轮询
    startPolling();
    
    // 绑定群组点击事件
    document.querySelectorAll('.group-item, .group-card').forEach(item => {
        item.onclick = () => switchGroup(item.dataset.groupId);
    });
    
    // 加载可用群组
    document.getElementById('joinGroupModal').addEventListener('show.bs.modal', loadAvailableGroups);
    
    // 在移动端显示群组列表，在桌面端自动选择第一个群组
    if (isMobile()) {
        showMobileGroups();
    } else {
        const firstGroup = document.querySelector('.group-item');
        if (firstGroup) {
            switchGroup(firstGroup.dataset.groupId);
        }
    }
    
    // 启动心跳检测
    startHeartbeat();
    
    // 恢复侧边栏状态
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
        }
    }
    
    // 恢复成员列表状态
    const membersSidebar = document.getElementById('members-sidebar');
    const toggleBtn = document.getElementById('toggle-members-btn');
    const chatArea = document.querySelector('.chat-area');
    
    if (membersSidebar && toggleBtn && chatArea) {
        const savedMembersVisible = localStorage.getItem('membersVisible');
        if (savedMembersVisible === 'false') {
            membersSidebar.classList.add('hidden');
            toggleBtn.classList.add('hidden');
            chatArea.classList.add('members-hidden');
            membersVisible = false;
        }
    }
});

// 清理
window.addEventListener('beforeunload', () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
});

// 打开群聊设置时加载数据
document.getElementById('groupSettingsModal').addEventListener('show.bs.modal', async function() {
    if (!currentGroup) {
        alert('请先选择一个群组');
        return;
    }
    
    try {
        const response = await fetch(`/get_group_settings/${currentGroup}`);
        if (!response.ok) {
            throw new Error('获取群组设置失败');
        }
        
        currentGroupData = await response.json();
        
        // 显示/隐藏管理员功能
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = currentGroupData.is_admin ? 'block' : 'none';
        });
        
        // 填充表单
        document.getElementById('settings-group-name').value = currentGroupData.name;
        document.getElementById('settings-password-enabled').checked = currentGroupData.has_password;
        document.getElementById('settings-group-password').value = '';
        
        // 显示/隐藏密码字段
        const passwordField = document.querySelector('#groupSettingsModal .password-field');
        passwordField.style.display = currentGroupData.has_password ? 'block' : 'none';
        
        // 加载成员列表
        const container = document.querySelector('.member-list-container');
        container.innerHTML = '';
        
        currentGroupData.members.forEach(member => {
            const div = document.createElement('div');
            div.className = 'member-item-settings';
            div.innerHTML = `
                <div class="member-info-settings">
                    <span class="member-status-dot ${member.status}"></span>
                    <span>${member.username}</span>
                    ${member.is_admin ? '<span class="admin-badge">管理员</span>' : ''}
                </div>
                ${member.can_remove ? `
                    <i class="bi bi-dash-circle remove-member-btn" 
                       data-user-id="${member.id}" 
                       title="移除成员"></i>
                ` : ''}
            `;
            container.appendChild(div);
        });
        
        // 绑定移除成员事件
        document.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.onclick = async () => {
                if (confirm('确定要移除该成员吗？')) {
                    await removeMember(btn.dataset.userId);
                }
            };
        });
        
    } catch (error) {
        console.error('Error:', error);
        alert('加载群组设置失败');
    }
});

// 修改保存群组设置
document.getElementById('saveGroupSettings').onclick = async function() {
    const name = document.getElementById('settings-group-name').value.trim();
    const passwordEnabled = document.getElementById('settings-password-enabled').checked;
    const password = document.getElementById('settings-group-password').value;
    
    if (!name) {
        alert('群组名称不能为空');
        return;
    }
    
    try {
        const response = await fetch(`/update_group_settings/${currentGroup}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name,
                password_enabled: passwordEnabled,
                password: password || null
            })
        });
        
        if (!response.ok) {
            throw new Error('更新群组设置失败');
        }
        
        location.reload();
        
    } catch (error) {
        console.error('Error:', error);
        alert('保存设置失败');
    }
};

// 移除成员
async function removeMember(userId) {
    try {
        const response = await fetch(`/remove_group_member/${currentGroup}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId })
        });
        
        if (!response.ok) {
            throw new Error('移除成员失败');
        }
        
        // 重新加载成员列表
        document.getElementById('groupSettingsModal').dispatchEvent(
            new Event('show.bs.modal')
        );
        
    } catch (error) {
        console.error('Error:', error);
        alert('移除成员失败');
    }
}

// 清空聊天记录
document.getElementById('clearMessages').onclick = async function() {
    if (!confirm('确定要清空所有聊天记录吗？此操作不可恢复！')) {
        return;
    }
    
    try {
        const response = await fetch(`/clear_group_messages/${currentGroup}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('清空聊天记录失败');
        }
        
        // 清空成功后刷新页面
        location.reload();
        
    } catch (error) {
        console.error('Error:', error);
        alert('清空聊天记录失败');
    }
};

// 退出群聊
document.getElementById('leaveGroup').onclick = async function() {
    if (!confirm('确定要退出该群聊吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`/leave_group/${currentGroup}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('退出群聊失败');
        }
        
        // 退出成功后返回群聊列表
        location.href = '/chat';
        
    } catch (error) {
        console.error('Error:', error);
        alert('退出群聊失败');
    }
};

// 处理密码开关
document.getElementById('password-enabled')?.addEventListener('change', function() {
    const passwordField = document.querySelector('#createGroupModal .password-field');
    passwordField.style.display = this.checked ? 'block' : 'none';
});

document.getElementById('settings-password-enabled')?.addEventListener('change', function() {
    const passwordField = document.querySelector('#groupSettingsModal .password-field');
    passwordField.style.display = this.checked ? 'block' : 'none';
});

// 绑定成员列表切换按钮事件
document.getElementById('toggle-members-btn')?.addEventListener('click', toggleMembers);

// 解散群聊
document.getElementById('dissolveGroup').onclick = async function() {
    if (!confirm('确定要解散该群聊吗？此操作不可恢复！')) {
        return;
    }
    
    if (!confirm('再次确认：解散群聊将删除所有聊天记录和成员关系，确定继续吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`/dissolve_group/${currentGroup}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('解散群聊失败');
        }
        
        // 解散成功后返回群聊列表
        location.href = '/chat';
        
    } catch (error) {
        console.error('Error:', error);
        alert('解散群聊失败');
    }
};

// 任务栏切换
document.querySelectorAll('.taskbar-item, .mobile-taskbar .taskbar-item').forEach(item => {
    item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        
        // 更新任务栏激活状态
        document.querySelectorAll('.taskbar-item').forEach(i => {
            i.classList.remove('active');
        });
        document.querySelectorAll(`[data-tab="${tab}"]`).forEach(i => {
            i.classList.add('active');
        });
        
        // 隐藏所有页面
        document.querySelectorAll('.tab-page, .sidebar, .chat-area').forEach(page => {
            page.style.display = 'none';
        });
        
        // 显示选中的页面
        if (tab === 'groups') {
            document.querySelector('.sidebar').style.display = 'flex';
            document.querySelector('.chat-area').style.display = 'flex';
        } else {
            document.querySelector(`.${tab}-page`).style.display = 'block';
        }
    });
});

// 加载个人资料
async function loadProfile() {
    try {
        const response = await fetch('/get_profile');
        if (!response.ok) throw new Error('获取个人资料失败');
        
        const data = await response.json();
        document.getElementById('profile-motto').value = data.motto || '';
        document.getElementById('profile-contact').value = data.contact || '';
        
        // 加载管理的群聊
        const adminGroupsList = document.querySelector('.admin-groups-list');
        adminGroupsList.innerHTML = '';
        
        data.admin_groups.forEach(group => {
            const div = document.createElement('div');
            div.className = 'admin-group-item';
            div.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <span>${group.name}</span>
                    <span class="text-muted">${group.member_count}人</span>
                </div>
            `;
            adminGroupsList.appendChild(div);
        });
        
    } catch (error) {
        console.error('Error:', error);
        alert('加载个人资料失败');
    }
}

// 保存个人资料
document.getElementById('profile-form').onsubmit = async function(e) {
    e.preventDefault();
    
    const motto = document.getElementById('profile-motto').value;
    const contact = document.getElementById('profile-contact').value;
    
    try {
        const response = await fetch('/update_profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ motto, contact })
        });
        
        if (!response.ok) throw new Error('更新个人资料失败');
        alert('保存成功');
        
    } catch (error) {
        console.error('Error:', error);
        alert('保存失败');
    }
};

// 修改密码
document.getElementById('password-change-form').onsubmit = async function(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
        alert('两次输入的新密码不一致');
        return;
    }
    
    try {
        const response = await fetch('/change_password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        if (!response.ok) throw new Error('修改密码失败');
        
        alert('密码修改成功，请重新登录');
        location.href = '/logout';
        
    } catch (error) {
        console.error('Error:', error);
        alert('修改密码失败');
    }
};

// 注销账户
document.getElementById('delete-account').onclick = async function() {
    if (!confirm('确定要注销账户吗？此操作不可恢复！')) {
        return;
    }
    
    if (!confirm('再次确认：注销后您的所有数据都将被删除，确定继续吗？')) {
        return;
    }
    
    try {
        const response = await fetch('/delete_account', {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('注销账户失败');
        
        alert('账户已注销');
        location.href = '/logout';
        
    } catch (error) {
        console.error('Error:', error);
        alert('注销账户失败');
    }
};

// 在页面加载时初始化个人资料
document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
});

// 处理媒体消息点击
function handleMediaClick(element) {
    const mediaPreviewContent = document.getElementById('mediaPreviewContent');
    mediaPreviewContent.innerHTML = '';
    
    if (element.tagName === 'IMG') {
        const img = document.createElement('img');
        img.src = element.src;
        mediaPreviewContent.appendChild(img);
    } else if (element.tagName === 'VIDEO') {
        const video = document.createElement('video');
        video.src = element.src;
        video.controls = true;
        video.autoplay = true;
        mediaPreviewContent.appendChild(video);
    } else if (element.tagName === 'AUDIO') {
        const audio = document.createElement('audio');
        audio.src = element.src;
        audio.controls = true;
        audio.autoplay = true;
        mediaPreviewContent.appendChild(audio);
    }
    
    mediaPreviewModal.show();
}

// 显示上下文菜单
function showContextMenu(e, messageElement) {
    e.preventDefault();
    
    const contextMenu = document.getElementById('messageContextMenu');
    const deleteOption = contextMenu.querySelector('.delete-option');
    const messageId = messageElement.dataset.messageId;
    const messageTime = new Date(messageElement.dataset.timestamp);
    const canDelete = (Date.now() - messageTime.getTime()) <= 180000; // 3分钟内
    
    // 显示/隐藏删除选项
    deleteOption.style.display = canDelete ? 'flex' : 'none';
    
    // 设置菜单位置
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.style.display = 'block';
    
    // 保存当前消息信息
    activeContextMenu = {
        messageId,
        messageElement,
        menu: contextMenu
    };
}

// 处理上下文菜单操作
document.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
        if (!activeContextMenu) return;
        
        const { messageId, messageElement } = activeContextMenu;
        const action = item.dataset.action;
        
        if (action === 'copy') {
            const text = messageElement.querySelector('.message-content').textContent;
            await navigator.clipboard.writeText(text);
        } else if (action === 'delete') {
            try {
                const response = await fetch(`/delete_message/${messageId}`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    messageElement.remove();
                } else {
                    throw new Error('删除失败');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('删除消息失败');
            }
        }
        
        hideContextMenu();
    });
});

// 隐藏上下文菜单
function hideContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.menu.style.display = 'none';
        activeContextMenu = null;
    }
}

// 点击其他地方时隐藏上下文菜单
document.addEventListener('click', hideContextMenu);

// 移动端长按处理
function handleTouchStart(e, messageElement) {
    longPressTimer = setTimeout(() => {
        messageElement.classList.add('press-active');
        showContextMenu(e.touches[0], messageElement);
    }, 500);
}

function handleTouchEnd(messageElement) {
    clearTimeout(longPressTimer);
    messageElement.classList.remove('press-active');
}

// 管理员验证
document.getElementById('adminAccess')?.addEventListener('click', async () => {
    try {
        const response = await fetch('/verify_admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({}) // 空对象，不需要密码
        });
        
        if (response.ok) {
            window.location.href = '/admin';
        } else {
            throw new Error('验证失败');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('管理员验证失败');
    }
}); 