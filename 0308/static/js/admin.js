// 图表实例
let cpuChart, memoryChart, latencyChart, usersChart;
let refreshInterval;
let refreshTime = 1000; // 默认1秒
const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
        duration: 500  // 减少动画时间
    },
    scales: {
        y: {
            beginAtZero: true,
            max: 100
        }
    }
};

// 初始化图表
function initCharts() {
    // CPU使用率图表
    cpuChart = new Chart(document.getElementById('cpuChart'), {
        type: 'line',
        data: {
            labels: Array(10).fill(''),
            datasets: [{
                label: 'CPU使用率 (%)',
                data: Array(10).fill(0),
                borderColor: '#2ecc71',
                tension: 0.4
            }]
        },
        options: chartOptions
    });

    // 内存使用率图表
    memoryChart = new Chart(document.getElementById('memoryChart'), {
        type: 'line',
        data: {
            labels: Array(10).fill(''),
            datasets: [{
                label: '内存使用率 (%)',
                data: Array(10).fill(0),
                borderColor: '#3498db',
                tension: 0.4
            }]
        },
        options: chartOptions
    });

    // 服务器延迟图表
    latencyChart = new Chart(document.getElementById('latencyChart'), {
        type: 'line',
        data: {
            labels: Array(10).fill(''),
            datasets: [{
                label: '延迟 (ms)',
                data: Array(10).fill(0),
                borderColor: '#e74c3c',
                tension: 0.4
            }]
        },
        options: {
            ...chartOptions,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 1000
                }
            }
        }
    });

    // 在线用户图表
    usersChart = new Chart(document.getElementById('usersChart'), {
        type: 'line',
        data: {
            labels: Array(10).fill(''),
            datasets: [{
                label: '在线用户数',
                data: Array(10).fill(0),
                borderColor: '#9b59b6',
                tension: 0.4
            }]
        },
        options: {
            ...chartOptions,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 50
                }
            }
        }
    });
}

// 更新图表数据
function updateCharts(data) {
    const now = new Date().toLocaleTimeString();
    
    // 更新CPU图表
    cpuChart.data.labels.shift();
    cpuChart.data.labels.push(now);
    cpuChart.data.datasets[0].data.shift();
    cpuChart.data.datasets[0].data.push(data.cpu);
    cpuChart.update();

    // 更新内存图表
    memoryChart.data.labels.shift();
    memoryChart.data.labels.push(now);
    memoryChart.data.datasets[0].data.shift();
    memoryChart.data.datasets[0].data.push(data.memory);
    memoryChart.update();

    // 更新延迟图表
    latencyChart.data.labels.shift();
    latencyChart.data.labels.push(now);
    latencyChart.data.datasets[0].data.shift();
    latencyChart.data.datasets[0].data.push(data.latency);
    latencyChart.update();

    // 更新用户图表
    usersChart.data.labels.shift();
    usersChart.data.labels.push(now);
    usersChart.data.datasets[0].data.shift();
    usersChart.data.datasets[0].data.push(data.online_users);
    usersChart.update();

    // 更新统计信息
    document.getElementById('uptime').textContent = data.uptime;
    document.getElementById('total-users').textContent = data.total_users;
    document.getElementById('total-groups').textContent = data.total_groups;
    document.getElementById('today-messages').textContent = data.today_messages;
}

// 获取服务器状态
async function fetchServerStatus() {
    try {
        const response = await fetch('/admin/status');
        const data = await response.json();
        updateCharts(data);
        
        // 更新倒计时显示
        const countdown = document.getElementById('refresh-countdown');
        if (countdown) {
            countdown.textContent = (refreshTime / 1000).toString();
        }
    } catch (error) {
        console.error('Error fetching server status:', error);
    }
}

// 加载用户列表
async function loadUsers() {
    try {
        const response = await fetch('/admin/users');
        const users = await response.json();
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.username}</td>
                <td>
                    <select class="form-select form-select-sm" onchange="updateUserRole('${user.id}', this.value)">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>用户</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
                    </select>
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm" 
                        value="${user.title || ''}" 
                        onchange="updateUserTitle('${user.id}', this.value)"
                        placeholder="设置称号">
                </td>
                <td>${new Date(user.created_at).toLocaleString()}</td>
                <td>${new Date(user.last_seen).toLocaleString()}</td>
                <td>
                    <span class="badge ${user.is_online ? 'bg-success' : 'bg-secondary'}">
                        ${user.is_online ? '在线' : '离线'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="resetPassword('${user.id}')">
                        重置密码
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')">
                        删除
                    </button>
                </td>
            `;
            usersList.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// 更新用户角色
async function updateUserRole(userId, newRole) {
    try {
        const response = await fetch('/update_user_role', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                role: newRole
            })
        });
        
        if (!response.ok) throw new Error('更新失败');
        
    } catch (error) {
        console.error('Error:', error);
        alert('更新用户角色失败');
        loadUsers(); // 刷新列表
    }
}

// 更新用户称号
async function updateUserTitle(userId, newTitle) {
    try {
        const response = await fetch('/update_user_title', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                title: newTitle
            })
        });
        
        if (!response.ok) throw new Error('更新失败');
        
    } catch (error) {
        console.error('Error:', error);
        alert('更新用户称号失败');
        loadUsers(); // 刷新列表
    }
}

// 重置用户密码
async function resetPassword(userId) {
    if (!confirm('确定要重置该用户的密码吗？')) return;
    
    try {
        const response = await fetch('/admin/reset_password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId })
        });
        
        const data = await response.json();
        if (response.ok) {
            alert(data.message);
        } else {
            throw new Error(data.error || '重置密码失败');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('重置密码失败');
    }
}

// 加载所有群聊
async function loadGroups() {
    try {
        const response = await fetch('/admin/get_all_groups');
        const groups = await response.json();
        const groupsList = document.getElementById('groups-list');
        groupsList.innerHTML = '';
        
        groups.forEach(group => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <input type="text" class="form-control form-control-sm" 
                        value="${group.name}" 
                        onchange="updateGroup(${group.id}, 'name', this.value)">
                </td>
                <td>${new Date(group.created_at).toLocaleString()}</td>
                <td>${group.member_count}</td>
                <td>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" 
                            ${group.has_password ? 'checked' : ''}
                            onchange="toggleGroupPassword(${group.id}, this.checked)">
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteGroup(${group.id})">
                        删除群聊
                    </button>
                </td>
            `;
            groupsList.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

// 更新群组信息
async function updateGroup(groupId, field, value) {
    try {
        const response = await fetch('/admin/update_group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                group_id: groupId,
                [field]: value
            })
        });
        
        if (!response.ok) throw new Error('更新失败');
        
    } catch (error) {
        console.error('Error:', error);
        alert('更新群组失败');
        loadGroups(); // 刷新列表
    }
}

// 切换群组密码保护
async function toggleGroupPassword(groupId, enabled) {
    const password = enabled ? prompt('请输入新的群聊密码：') : '';
    await updateGroup(groupId, 'password', password);
}

// 删除群组
async function deleteGroup(groupId) {
    if (!confirm('确定要删除该群聊吗？所有消息记录都将被删除！')) return;
    
    try {
        const response = await fetch('/admin/delete_group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ group_id: groupId })
        });
        
        if (response.ok) {
            loadGroups(); // 刷新列表
        } else {
            throw new Error('删除失败');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('删除群聊失败');
    }
}

// 保存系统设置
document.getElementById('system-settings-form').onsubmit = async function(e) {
    e.preventDefault();
    
    const settings = {
        server_name: document.getElementById('server-name').value,
        max_users: parseInt(document.getElementById('max-users').value),
        message_history_days: parseInt(document.getElementById('message-history-days').value),
        enable_registration: document.getElementById('enable-registration').checked,
        enable_file_upload: document.getElementById('enable-file-upload').checked
    };
    
    try {
        const response = await fetch('/admin/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            alert('设置已保存');
        } else {
            throw new Error('保存设置失败');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('保存设置失败');
    }
};

// 添加更新刷新间隔的函数
function updateRefreshInterval(seconds) {
    refreshTime = seconds * 1000;
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(fetchServerStatus, refreshTime);
    
    // 保存设置
    fetch('/admin/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            refresh_interval: seconds
        })
    }).catch(error => console.error('Error saving settings:', error));
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化图表
    initCharts();
    
    // 添加刷新间隔更改监听
    const refreshIntervalInput = document.getElementById('refresh-interval');
    if (refreshIntervalInput) {
        refreshIntervalInput.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            if (value >= 1 && value <= 60) {
                updateRefreshInterval(value);
            } else {
                e.target.value = refreshTime / 1000;
                alert('请输入1-60之间的数字');
            }
        });
    }
    
    // 开始定时刷新
    fetchServerStatus();
    refreshInterval = setInterval(fetchServerStatus, refreshTime);
    
    // 加载用户列表
    loadUsers();
    
    // 加载群聊列表
    loadGroups();
    
    // 标签页切换
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const tabId = item.dataset.tab;
            document.querySelectorAll('.admin-tab').forEach(tab => {
                tab.style.display = tab.id === tabId ? 'block' : 'none';
            });
        });
    });
});

// 清理定时器
window.addEventListener('beforeunload', () => {
    clearInterval(refreshInterval);
}); 