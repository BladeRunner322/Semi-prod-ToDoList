'use strict';

        // ─── Configuration ───────────────────────────────────────────────
        const API_BASE = '/api/v1';

        // ─── State ──────────────────────────────────────────────────────
        let _taskEditing = false,
            _taskId = null;
        let _userEditing = false,
            _userId = null;
        let _usersCache = [];
        let _justDoneId = null;
        const _pages = { tasks: 0, users: 0 };
        const _cddState = {};

        // ─── API Helper ──────────────────────────────────────────────────
        async function api(path, opts = {}) {
            const url = API_BASE.replace(/\/$/, '') + path;
            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
                ...opts
            }).catch(() => { throw new Error('Нет соединения с API. Сервер запущен?'); });

            if (res.status === 204) return null;
            const text = await res.text();
            let data = null;
            try { data = JSON.parse(text); } catch { data = text; }
            if (!res.ok) {
                throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
            }
            return data;
        }

        // ─── Utils ──────────────────────────────────────────────────────
        const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g,
            '&quot;');
        const fmtDate = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) :
            '';
        const fmtDateTime = s => {
            if (!s) return '';
            const d = new Date(s);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        };

        function fmtAge(from) {
            let sec = Math.round((Date.now() - new Date(from)) / 1000);
            if (sec < 0) sec = 0;
            const d = Math.floor(sec / 86400),
                h = Math.floor((sec % 86400) / 3600),
                m = Math.floor((sec % 3600) / 60);
            if (d > 0) return `${d}д ${h}ч`;
            if (h > 0) return `${h}ч ${m}м`;
            if (m > 0) return `${m}м`;
            return `${sec}с`;
        }

        function fmtDuration(from, to) {
            if (!from || !to) return '';
            let sec = Math.round((new Date(to) - new Date(from)) / 1000);
            if (sec < 0) sec = 0;
            const d = Math.floor(sec / 86400),
                h = Math.floor((sec % 86400) / 3600),
                m = Math.floor((sec % 3600) / 60),
                s = sec % 60;
            if (d > 0) return `${d}d ${h}h ${m}m`;
            if (h > 0) return `${h}h ${m}m ${s}s`;
            if (m > 0) return `${m}m ${s}s`;
            return `${s}s`;
        }

        function getInitials(name) {
            return (name || '?').split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
        }
        const AVATAR_GRADS = [
            'linear-gradient(135deg,#f04e9e,#a855f7)',
            'linear-gradient(135deg,#4ef0e0,#f04e9e)',
            'linear-gradient(135deg,#a855f7,#4ef0e0)',
            'linear-gradient(135deg,#facc15,#f04e9e)',
            'linear-gradient(135deg,#4ade80,#4ef0e0)',
        ];

        function avatarGrad(id) {
            const s = String(id || '');
            let h = 0;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            return AVATAR_GRADS[h % AVATAR_GRADS.length];
        }

        // ─── Theme ──────────────────────────────────────────────────────
        function toggleTheme(isLight) {
            const theme = isLight ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('todo-theme', theme);
            const label = document.getElementById('theme-label');
            if (isLight) {
                label.innerHTML =
                    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Светлая тема`;
            } else {
                label.innerHTML =
                    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Темная тема`;
            }
        }

        (function () {
            const saved = localStorage.getItem('todo-theme') || 'dark';
            document.documentElement.setAttribute('data-theme', saved);
            if (saved === 'light') document.getElementById('theme-toggle').checked = true;
        })();

        // ─── Tabs ──────────────────────────────────────────────────────
        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
            document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
            if (tab === 'tasks') { refreshUserSelects().then(() => loadTasks()); } else if (tab === 'users') loadUsers();
            else if (tab === 'stats') {
                refreshUserSelects();
                loadStats();
            }
        }

        // ─── Modal helpers ────────────────────────────────────────────
        function openModal(id) { document.getElementById(id).classList.add('open'); }

        function closeModal(id, e) {
            if (e && e.target !== e.currentTarget) return;
            document.getElementById(id).classList.remove('open');
        }

        // ─── Toasts ────────────────────────────────────────────────────
        const TOAST_ICONS = {
            success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
            error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
            info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
            warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        };

        function toast(msg, type = 'info') {
            const el = document.createElement('div');
            el.className = `toast ${type}`;
            el.innerHTML = `${TOAST_ICONS[type] || ''}<span class="toast-msg">${esc(msg)}</span>`;
            document.getElementById('toast-container').appendChild(el);
            setTimeout(() => {
                el.style.animation = 'toastOut 0.2s ease forwards';
                setTimeout(() => el.remove(), 200);
            }, 3500);
        }

        // ─── Pagination ────────────────────────────────────────────────
        function setPage(tab, page) { _pages[tab] = page; }

        function renderPagination(tab, currentCount, pageSize, currentPage, hasNextPage) {
            const el = document.getElementById(tab + '-pagination');
            if (!el) return;
            if (currentPage === 0 && !hasNextPage) { el.innerHTML = ''; return; }
            const loadFn = tab === 'tasks' ? 'loadTasks' : 'loadUsers';
            const arrowSvgL =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>';
            const arrowSvgR =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>';
            const btnPrev = currentPage > 0 ?
                `<button class="pg-btn" onclick="setPage('${tab}',${currentPage - 1});${loadFn}()">${arrowSvgL}</button>` :
                `<button class="pg-btn" disabled>${arrowSvgL}</button>`;
            const btnNext = hasNextPage ?
                `<button class="pg-btn" onclick="setPage('${tab}',${currentPage + 1});${loadFn}()">${arrowSvgR}</button>` :
                `<button class="pg-btn" disabled>${arrowSvgR}</button>`;
            const pages = [];
            if (currentPage > 1) pages.push(0);
            if (currentPage > 2) pages.push('…');
            if (currentPage > 0) pages.push(currentPage - 1);
            pages.push(currentPage);
            if (hasNextPage) pages.push(currentPage + 1);
            const pageButtons = pages.map(s => s === '…' ?
                '<span style="padding:0 4px;color:var(--text-muted)">…</span>' :
                `<button class="pg-btn ${s === currentPage ? 'active' : ''}" onclick="setPage('${tab}',${s});${loadFn}()">${s + 1}</button>`
            ).join('');
            el.style.opacity = '0';
            el.innerHTML = `<div class="pagination">${btnPrev}${pageButtons}${btnNext}</div>`;
            requestAnimationFrame(() => { el.style.opacity = ''; });
        }

        // ─── Custom Dropdown ──────────────────────────────────────────
        function cddToggle(id) {
            const el = document.getElementById(id);
            const isOpen = el.classList.contains('open');
            document.querySelectorAll('.cdd.open').forEach(d => { if (d.id !== id) d.classList.remove('open'); });
            if (isOpen) el.classList.remove('open');
            else {
                el.classList.add('open');
                const s = el.querySelector('.cdd-search');
                if (s) setTimeout(() => s.focus(), 50);
            }
        }

        function cddSearch(id, q) {
            if (!_cddState[id]) _cddState[id] = {};
            _cddState[id].search = q.toLowerCase();
            cddRenderList(id);
        }

        function cddSelect(id, value, label, grad, silent = false) {
            if (!_cddState[id]) _cddState[id] = {};
            _cddState[id].value = value;
            const hiddenMap = { 'cdd-filter': 'tf-uid', 'cdd-stats': 'sf-uid', 'cdd-author': 'task-author-id' };
            const hidden = document.getElementById(hiddenMap[id]);
            if (hidden) hidden.value = value;
            const labelEl = document.getElementById(id + '-label');
            if (labelEl) {
                if (value) {
                    labelEl.innerHTML =
                        `<span class="cdd-avatar" style="background:${grad}">${esc(getInitials(label))}</span><span>${esc(label)}</span>`;
                } else {
                    labelEl.innerHTML = id === 'cdd-author' ? '— выберите —' : 'Все пользователи';
                }
            }
            cddRenderList(id);
            document.getElementById(id).classList.remove('open');
            if (!silent) {
                if (id === 'cdd-filter') {
                    cddSelect('cdd-stats', value, label, grad, true);
                    setPage('tasks', 0);
                    loadTasks();
                }
                if (id === 'cdd-stats') {
                    cddSelect('cdd-filter', value, label, grad, true);
                    loadStats();
                }
            }
        }

        function cddRenderList(id) {
            const listEl = document.getElementById(id + '-list');
            if (!listEl) return;
            const state = _cddState[id] || {};
            const q = (state.search || '').toLowerCase();
            const cur = state.value || '';
            const showAll = id !== 'cdd-author';
            let items = [];
            if (showAll) {
                items.push(`
                    <div class="cdd-option all-opt ${cur === '' ? 'selected' : ''}" onclick="cddSelect('${id}','','','')">
                        <span class="cdd-avatar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                        </span>
                        <span class="cdd-opt-text"><span class="cdd-opt-name">Все пользователи</span></span>
                        <svg class="cdd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>`);
            }
            const filtered = _usersCache.filter(u =>
                !q || u.full_name.toLowerCase().includes(q) || String(u.id).includes(q)
            );
            if (filtered.length === 0 && q) {
                items.push(`<div class="cdd-empty">Пользователи не найдены</div>`);
            }
            filtered.forEach(u => {
                const grad = avatarGrad(u.id);
                const initials = getInitials(u.full_name);
                const sel = String(u.id) === String(cur);
                items.push(`
                    <div class="cdd-option ${sel ? 'selected' : ''}" onclick="cddSelect('${id}','${u.id}','${u.full_name.replace(/'/g, "\\'")}','${grad}')">
                        <span class="cdd-avatar" style="background:${grad}">${esc(initials)}</span>
                        <span class="cdd-opt-text">
                            <span class="cdd-opt-name">${esc(u.full_name)}</span>
                            <span class="cdd-opt-sub">ID: ${u.id}</span>
                        </span>
                        <svg class="cdd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>`);
            });
            listEl.innerHTML = items.join('');
        }

        document.addEventListener('click', e => {
            if (!e.target.closest('.cdd')) {
                document.querySelectorAll('.cdd.open').forEach(d => d.classList.remove('open'));
            }
        });

        // ─── Load users for dropdowns ─────────────────────────────────
        async function refreshUserSelects() {
            try {
                const users = await api('/users?' + new URLSearchParams({ limit: 1000, offset: 0 }));
                _usersCache = users || [];
            } catch { _usersCache = []; }
            cddRenderList('cdd-filter');
            cddRenderList('cdd-author');
            cddRenderList('cdd-stats');
        }

        // ─── Loading helpers ──────────────────────────────────────────
        function startLoading(id) {
            const cont = document.getElementById(id);
            const bar = document.getElementById(id.replace('-container', '-loading-bar'));
            if (cont) cont.classList.add('is-loading');
            if (bar) bar.style.display = 'block';
        }

        function stopLoading(id) {
            const cont = document.getElementById(id);
            const bar = document.getElementById(id.replace('-container', '-loading-bar'));
            if (cont) cont.classList.remove('is-loading');
            if (bar) bar.style.display = 'none';
        }

        function showError(id, msg) {
            document.getElementById(id).innerHTML = `
                <div class="error-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <h3>Ошибка загрузки</h3><p>${esc(msg)}</p>
                </div>`;
        }

        // ─── TASKS ────────────────────────────────────────────────────
        async function loadTasks() {
            startLoading('tasks-container');
            const uid = document.getElementById('tf-uid').value.trim();
            const limit = parseInt(document.getElementById('tf-limit').value) || 20;
            const page = _pages.tasks;
            const offset = page * limit;
            const p = new URLSearchParams({ limit, offset });
            if (uid) p.set('user_id', uid);
            const pNext = new URLSearchParams({ limit: 1, offset: offset + limit });
            if (uid) pNext.set('user_id', uid);

            try {
                const [tasks, nextPage] = await Promise.all([
                    api('/tasks?' + p),
                    api('/tasks?' + pNext).catch(() => [])
                ]);
                const list = tasks || [];
                const hasNextPage = (nextPage || []).length > 0;
                renderTasks(list);
                renderPagination('tasks', list.length, limit, page, hasNextPage);
            } catch (e) {
                showError('tasks-container', e.message);
                document.getElementById('tasks-pagination').innerHTML = '';
            } finally { stopLoading('tasks-container'); }
        }

        function renderTasks(tasks) {
            const cont = document.getElementById('tasks-container');
            cont.style.opacity = '0';
            if (!tasks.length) {
                cont.innerHTML = `
                    <div class="empty">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <line x1="9" y1="12" x2="15" y2="12"/>
                        </svg>
                        <h3>Задач пока нет</h3>
                        <p>Нажмите <strong>Новая задача</strong>, чтобы создать первую</p>
                    </div>`;
            } else {
                cont.innerHTML = `<div class="tasks-list">${tasks.map(taskCard).join('')}</div>`;
            }
            if (_justDoneId !== null) {
                const btn = cont.querySelector(`.task-toggle[data-id="${_justDoneId}"]`);
                if (btn) btn.classList.add('just-done');
                _justDoneId = null;
            }
            requestAnimationFrame(() => { cont.style.opacity = ''; });
        }

        function taskCard(t) {
            const done = t.completed;
            const author = _usersCache.find(u => u.id === t.author_user_id);
            const authorLabel = author ?
                `${esc(author.full_name)}<span class="chip-uid">ID: ${t.author_user_id}</span>` :
                `Unknown<span class="chip-uid">ID: ${t.author_user_id}</span>`;
            const duration = done && t.completed_at && t.created_at ? fmtDuration(t.created_at, t.completed_at) : '';
            const completedDate = done && t.completed_at ? fmtDateTime(t.completed_at) : '';
            const pendingAge = !done && t.created_at ? fmtAge(t.created_at) : '';
            return `
            <div class="task-card ${done ? 'is-done' : ''}" data-id="${t.id}">
                <button class="task-toggle ${done ? 'done' : ''}"
                        data-id="${t.id}"
                        onclick="toggleTask(event,'${t.id}',${!done})"
                        title="${done ? 'Отметить как активную' : 'Отметить как выполненную'}">
                    ${done ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                </button>
                <div class="task-body" onclick="editTask('${t.id}')">
                    <div class="task-title">${esc(t.title)}</div>
                    ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ''}
                    <div class="task-meta">
                        <span class="chip">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            ${authorLabel}
                        </span>
                        ${t.created_at ? `<span class="chip">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            ${fmtDate(t.created_at)}</span>` : ''}
                        <span class="chip ${done ? 'chip-success' : 'chip-pending'}">
                            ${done ?
                    `✓ Готово${completedDate ? ' · ' + completedDate : ''}` :
                    `○ В работе${pendingAge ? ' · ' + pendingAge : ''}`}
                        </span>
                        ${duration ? `<span class="chip chip-duration">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            ${duration}
                        </span>` : ''}
                        <span class="chip chip-version">v${t.version}</span>
                    </div>
                </div>
                <div class="task-actions">
                    <button class="btn-icon" onclick="editTask('${t.id}')" title="Редактировать">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon del" onclick="confirmDelete(event,'task','${t.id}')" title="Удалить">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                        </svg>
                    </button>
                </div>
            </div>`;
        }

        async function toggleTask(e, id, completed) {
            e.stopPropagation();
            try {
                await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ completed }) });
                toast(completed ? 'Задача выполнена' : 'Задача возвращена в работу', completed ? 'success' : 'warning');
                if (completed) _justDoneId = id;
                loadTasks();
            } catch (err) { toast(err.message, 'error'); }
        }

        function openTaskModal() {
            _taskEditing = false;
            _taskId = null;
            document.getElementById('task-modal-title').textContent = 'Новая задача';
            document.getElementById('task-submit-btn').textContent = 'Создать';
            document.getElementById('task-title').value = '';
            document.getElementById('task-description').value = '';
            const filteredUid = document.getElementById('tf-uid').value;
            const filteredUser = _usersCache.find(u => String(u.id) === String(filteredUid));
            if (filteredUser) {
                cddSelect('cdd-author', filteredUser.id, filteredUser.full_name, avatarGrad(filteredUser.id));
            } else {
                cddSelect('cdd-author', '', '', '');
            }
            document.getElementById('task-author-group').style.display = 'block';
            document.getElementById('task-status-group').style.display = 'none';
            document.querySelectorAll('input[name="task-status"]')[0].checked = true;
            openModal('task-modal-overlay');
            setTimeout(() => document.getElementById('task-title').focus(), 80);
        }

        async function editTask(id) {
            _taskEditing = true;
            _taskId = id;
            document.getElementById('task-modal-title').textContent = 'Редактировать задачу';
            document.getElementById('task-submit-btn').textContent = 'Сохранить';
            document.getElementById('task-author-group').style.display = 'none';
            document.getElementById('task-status-group').style.display = 'block';
            openModal('task-modal-overlay');
            try {
                const t = await api(`/tasks/${id}`);
                document.getElementById('task-title').value = t.title || '';
                document.getElementById('task-description').value = t.description || '';
                document.querySelectorAll('input[name="task-status"]')[t.completed ? 1 : 0].checked = true;
                setTimeout(() => document.getElementById('task-title').focus(), 80);
            } catch (e) {
                toast('Не удалось загрузить задачу: ' + e.message, 'error');
                closeModal('task-modal-overlay');
            }
        }

        async function submitTask() {
            const title = document.getElementById('task-title').value.trim();
            if (!title) { toast('Заголовок обязателен', 'error'); return; }
            const desc = document.getElementById('task-description').value.trim();

            if (_taskEditing) {
                const completed = document.querySelector('input[name="task-status"]:checked').value === 'true';
                const body = { title, completed };
                if (desc) body.description = desc;
                try {
                    await api(`/tasks/${_taskId}`, { method: 'PATCH', body: JSON.stringify(body) });
                    toast('Задача обновлена', 'success');
                    closeModal('task-modal-overlay');
                    loadTasks();
                } catch (e) { toast(e.message, 'error'); }
            } else {
                // Исправлено: преобразуем author_id в число
                const authorId = parseInt(document.getElementById('task-author-id').value.trim(), 10);
                if (isNaN(authorId)) {
                    toast('Автор обязателен и должен быть числом', 'error');
                    return;
                }
                const body = { title, author_user_id: authorId };
                if (desc) body.description = desc;
                try {
                    await api('/tasks', { method: 'POST', body: JSON.stringify(body) });
                    toast('Задача создана', 'success');
                    closeModal('task-modal-overlay');
                    loadTasks();
                } catch (e) { toast(e.message, 'error'); }
            }
        }

        function clearTaskFilters() {
            cddSelect('cdd-filter', '', '', '', true);
            cddSelect('cdd-stats', '', '', '', true);
            document.getElementById('tf-limit').value = '20';
            setPage('tasks', 0);
            document.getElementById('tasks-pagination').innerHTML = '';
            loadTasks();
        }

        // ─── USERS ────────────────────────────────────────────────────
        async function loadUsers() {
            startLoading('users-container');
            const limit = parseInt(document.getElementById('uf-limit').value) || 20;
            const page = _pages.users;
            const offset = page * limit;
            const pNext = new URLSearchParams({ limit: 1, offset: offset + limit });

            try {
                const [users, nextPage] = await Promise.all([
                    api('/users?' + new URLSearchParams({ limit, offset })),
                    api('/users?' + pNext).catch(() => [])
                ]);
                const list = users || [];
                const hasNextPage = (nextPage || []).length > 0;
                renderUsers(list);
                renderPagination('users', list.length, limit, page, hasNextPage);
            } catch (e) {
                showError('users-container', e.message);
                document.getElementById('users-pagination').innerHTML = '';
            } finally { stopLoading('users-container'); }
        }

        function renderUsers(users) {
            const cont = document.getElementById('users-container');
            cont.style.opacity = '0';
            if (!users.length) {
                cont.innerHTML = `
                    <div class="empty">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                        </svg>
                        <h3>Пользователей пока нет</h3>
                        <p>Нажмите <strong>Новый пользователь</strong>, чтобы создать первого</p>
                    </div>`;
            } else {
                cont.innerHTML = `<div class="users-grid">${users.map(userCard).join('')}</div>`;
            }
            requestAnimationFrame(() => { cont.style.opacity = ''; });
        }

        // Исправленная карточка пользователя
        function userCard(u) {
            return `
            <div class="user-card">
                <div class="user-avatar" style="background:${avatarGrad(u.id)}">${getInitials(u.full_name)}</div>
                <div class="user-body">
                    <div class="user-name">${esc(u.full_name)}</div>
                    <div class="user-phone">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.72a16 16 0 0 0 6 6l.87-1.14a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.46 16"/>
                        </svg>
                        ${u.phone_number ? esc(u.phone_number) : '<em style="opacity:.5">Нет телефона</em>'}
                    </div>
                    <div class="user-meta">
                        <span class="chip">ID: ${u.id}</span>
                        <span class="chip chip-version" style="margin-left:auto;">v${u.version}</span>
                    </div>
                    <div class="user-divider"></div>
                    <div class="user-card-footer">
                        <button class="btn btn-secondary btn-sm" onclick="editUser('${u.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Edit
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="confirmDelete(null,'user','${u.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
            </div>`;
        }

        function openUserModal() {
            _userEditing = false;
            _userId = null;
            document.getElementById('user-modal-title').textContent = 'Новый пользователь';
            document.getElementById('user-submit-btn').textContent = 'Создать';
            document.getElementById('user-fullname').value = '';
            document.getElementById('user-phone').value = '';
            document.getElementById('user-phone').disabled = false;
            document.getElementById('user-phone-null').checked = false;
            document.getElementById('user-phone-null-group').style.display = 'none';
            openModal('user-modal-overlay');
            setTimeout(() => document.getElementById('user-fullname').focus(), 80);
        }

        async function editUser(id) {
            _userEditing = true;
            _userId = id;
            document.getElementById('user-modal-title').textContent = 'Редактировать пользователя';
            document.getElementById('user-submit-btn').textContent = 'Сохранить';
            document.getElementById('user-phone').disabled = false;
            document.getElementById('user-phone-null').checked = false;
            document.getElementById('user-phone-null-group').style.display = 'block';
            openModal('user-modal-overlay');
            try {
                const u = await api(`/users/${id}`);
                document.getElementById('user-fullname').value = u.full_name || '';
                document.getElementById('user-phone').value = u.phone_number || '';
                setTimeout(() => document.getElementById('user-fullname').focus(), 80);
            } catch (e) {
                toast('Не удалось загрузить пользователя: ' + e.message, 'error');
                closeModal('user-modal-overlay');
            }
        }

        function onPhoneNullToggle(el) {
            document.getElementById('user-phone').disabled = el.checked;
            if (el.checked) document.getElementById('user-phone').value = '';
        }

        async function submitUser() {
            const fullName = document.getElementById('user-fullname').value.trim();
            if (!fullName) { toast('Имя обязательно', 'error'); return; }
            if (fullName.length < 3) { toast('Минимум 3 символа', 'error'); return; }

            const phoneNull = document.getElementById('user-phone-null').checked;
            const phone = document.getElementById('user-phone').value.trim();
            const body = { full_name: fullName };
            if (phoneNull) body.phone_number = null;
            else if (phone) body.phone_number = phone;

            try {
                await api(_userEditing ? `/users/${_userId}` : '/users', {
                    method: _userEditing ? 'PATCH' : 'POST',
                    body: JSON.stringify(body)
                });
                toast(_userEditing ? 'Пользователь обновлён' : 'Пользователь создан', 'success');
                closeModal('user-modal-overlay');
                loadUsers();
                refreshUserSelects();
            } catch (e) { toast(e.message, 'error'); }
        }

        // ─── DELETE CONFIRM ──────────────────────────────────────────
        function confirmDelete(e, type, id) {
            if (e) e.stopPropagation();
            document.getElementById('confirm-text').textContent =
                `Удалить ${type === "task" ? "задачу" : "пользователя"} #${id}? Это необратимо.`;
            document.getElementById('confirm-ok-btn').onclick = async () => {
                try {
                    await api(`/${type}s/${id}`, { method: 'DELETE' });
                    toast(`${type === "task" ? "Задача" : "Пользователь"} удал${type === "task" ? "ена" : "ён"}`, 'success');
                    closeModal('confirm-modal-overlay');
                    type === 'task' ? loadTasks() : loadUsers();
                } catch (err) { toast(err.message, 'error'); }
            };
            openModal('confirm-modal-overlay');
        }

        // ─── STATISTICS ──────────────────────────────────────────────
        async function loadStats() {
            startLoading('stats-container');
            const uid = document.getElementById('sf-uid').value.trim();
            const from = document.getElementById('sf-from').value;
            const to = document.getElementById('sf-to').value;
            const p = new URLSearchParams();
            if (uid) p.set('user_id', uid);
            if (from) p.set('from', from);
            if (to) p.set('to', to);
            try {
                const s = await api('/statistics?' + p);
                renderStats(s);
            } catch (e) { showError('stats-container', e.message); } finally { stopLoading('stats-container'); }
        }

        function formatAvgTime(raw) {
            if (!raw) return '—';
            const str = String(raw).trim();
            if (/[hms]/.test(str)) {
                const hm = str.match(/(\d+)h/);
                const mm = str.match(/(\d+)m(?!s)/);
                const sm = str.match(/([\d.]+)s/);
                const h = hm ? parseInt(hm[1]) : 0;
                const m = mm ? parseInt(mm[1]) : 0;
                const s = sm ? Math.round(parseFloat(sm[1])) : 0;
                if (h > 0) return `${h}h ${m}m ${s}s`;
                if (m > 0) return `${m}m ${s}s`;
                return `${s}s`;
            }
            let days = 0,
                h = 0,
                m = 0,
                s = 0;
            const daysMatch = str.match(/(\d+)\s+day/);
            if (daysMatch) days = parseInt(daysMatch[1]);
            const timeMatch = str.match(/(\d+):(\d+):([\d.]+)/);
            if (timeMatch) {
                h = parseInt(timeMatch[1]);
                m = parseInt(timeMatch[2]);
                s = Math.round(parseFloat(timeMatch[3]));
                const total_h = days * 24 + h;
                if (total_h > 0) return `${total_h}h ${m}m ${s}s`;
                if (m > 0) return `${m}m ${s}s`;
                return `${s}s`;
            }
            const n = parseFloat(str);
            if (!isNaN(n)) {
                s = Math.round(n % 60);
                m = Math.floor(n / 60) % 60;
                h = Math.floor(n / 3600) % 24;
                days = Math.floor(n / 86400);
                const total_h = days * 24 + h;
                if (total_h > 0) return `${total_h}h ${m}m ${s}s`;
                if (m > 0) return `${m}m ${s}s`;
                return `${s}s`;
            }
            return str;
        }

        function renderStats(s) {
            const created = s.tasks_created ?? 0;
            const completed = s.tasks_completed ?? 0;
            const rate = typeof s.tasks_created_rate === 'number' ? s.tasks_created_rate : 0;
            const avgTime = formatAvgTime(s.tasks_average_complition_time);
            const pending = Math.max(0, created - completed);
            const pendingPct = created > 0 ? (pending / created * 100) : 0;

            const cont = document.getElementById('stats-container');
            cont.style.opacity = '0';
            cont.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card c-blue">
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                        </div>
                        <div class="stat-label">Создано задач</div>
                        <div class="stat-value">${created}</div>
                        <div class="stat-sub">Всего</div>
                    </div>
                    <div class="stat-card c-green">
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <div class="stat-label">Выполнено</div>
                        <div class="stat-value">${completed}</div>
                        <div class="stat-sub">Успешно</div>
                    </div>
                    <div class="stat-card c-yellow">
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="20" x2="18" y2="10"/>
                                <line x1="12" y1="20" x2="12" y2="4"/>
                                <line x1="6"  y1="20" x2="6"  y2="14"/>
                            </svg>
                        </div>
                        <div class="stat-label">Процент выполнения</div>
                        <div class="stat-value">${rate.toFixed(1)}<span style="font-size:20px;font-weight:400">%</span></div>
                        <div class="stat-sub">От всех созданных</div>
                    </div>
                    <div class="stat-card c-purple">
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                        </div>
                        <div class="stat-label">Среднее время</div>
                        <div class="stat-value">${esc(avgTime)}</div>
                        <div class="stat-sub">От создания до готовности</div>
                    </div>
                </div>

                ${created > 0 ? `
                <div class="progress-card">
                    <div style="font-size:13px;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);margin-bottom:14px;font-weight:700;font-family:var(--font-head)">Прогресс</div>
                    <div class="progress-label-row">
                        <span style="color:var(--text-muted)">Выполнено</span>
                        <span style="color:var(--success);font-weight:600">${completed} / ${created} (${rate.toFixed(1)}%)</span>
                    </div>
                    <div class="progress-bar-track">
                        <div class="progress-bar-fill" style="width:${Math.min(100, rate).toFixed(1)}%;background:var(--success)"></div>
                    </div>
                    <div class="progress-label-row">
                        <span style="color:var(--text-muted)">В работе</span>
                        <span style="color:var(--warning);font-weight:600">${pending} / ${created} (${pendingPct.toFixed(1)}%)</span>
                    </div>
                    <div class="progress-bar-track">
                        <div class="progress-bar-fill" style="width:${Math.min(100, pendingPct).toFixed(1)}%;background:var(--warning)"></div>
                    </div>
                </div>
                ` : `<div class="progress-card"><p style="color:var(--text-muted);font-size:16px">Нет данных для выбранных фильтров.</p></div>`}

                <div style="margin-top:12px;font-size:13px;color:var(--text-muted);text-align:right;font-family:var(--font)">Обновлено: ${new Date().toLocaleTimeString()}</div>
            `;
            requestAnimationFrame(() => { cont.style.opacity = ''; });
        }

        function clearStatsFilters() {
            cddSelect('cdd-stats', '', '', '', true);
            cddSelect('cdd-filter', '', '', '', true);
            document.getElementById('sf-from').value = '';
            document.getElementById('sf-to').value = '';
            loadStats();
        }

        // ─── Mobile sidebar ──────────────────────────────────────────
        function toggleMobileSidebar() {
            document.querySelector('.sidebar').classList.toggle('open');
            document.getElementById('sidebar-overlay').classList.toggle('open');
        }

        function closeMobileSidebar() {
            document.querySelector('.sidebar').classList.remove('open');
            document.getElementById('sidebar-overlay').classList.remove('open');
        }
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', closeMobileSidebar);
        });

        // ─── Keyboard shortcuts ──────────────────────────────────────
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                ['task-modal-overlay', 'user-modal-overlay', 'confirm-modal-overlay']
                    .forEach(id => document.getElementById(id).classList.remove('open'));
                closeMobileSidebar();
            }
        });
        document.getElementById('task-title').addEventListener('keydown', e => { if (e.key === 'Enter') submitTask(); });
        document.getElementById('user-fullname').addEventListener('keydown', e => { if (e.key === 'Enter') submitUser(); });

        // ─── Init ─────────────────────────────────────────────────────
        (function () {
            const saved = localStorage.getItem('todo-theme') || 'dark';
            if (saved === 'light') toggleTheme(true);
        })();

        refreshUserSelects().then(() => loadTasks());