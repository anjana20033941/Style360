/**
 * Style360 — Main Application Entry Point (main.js)
 * Bridges application modules, navbar rendering, notification bell dropdown,
 * and bespoke progress tracker lifecycle states.
 */
(function (window) {
    'use strict';

    window.Style360 = window.Style360 || {};
    window.Style360.version = '2.2.0';

    /**
     * Ensure Notification Bell Dropdown is active and bound to backend/get_notifications.php
     */
    function setupNotificationBell() {
        var bellBtn = document.getElementById('notification-bell') || document.getElementById('btn-notification-bell');
        var notifDropdown = document.getElementById('notification-dropdown') || document.getElementById('notification-dropdown-menu');
        var notifBadge = document.getElementById('notification-badge');
        var notifList = document.getElementById('notif-list-container');
        var btnMarkAllRead = document.getElementById('btn-mark-all-read');

        if (!bellBtn || !notifDropdown) return;

        // If user-nav.js has already initialized it, we don't re-attach duplicates
        if (bellBtn.dataset.bellInitialized === 'true') return;
        bellBtn.dataset.bellInitialized = 'true';

        function getUserId() {
            try {
                var raw = localStorage.getItem('style360_user');
                var u = raw ? JSON.parse(raw) : null;
                return (u && u.id) ? u.id : 0;
            } catch (e) {
                return 0;
            }
        }

        var uid = getUserId();
        if (!uid) return;

        function fetchAlerts() {
            var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';
            fetch(prefix + '/backend/get_notifications.php?user_id=' + encodeURIComponent(uid))
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (!data || data.status !== 'success') return;
                    var unread = parseInt(data.unread_count) || 0;
                    if (notifBadge) {
                        if (unread > 0) {
                            notifBadge.textContent = unread > 99 ? '99+' : unread;
                            notifBadge.style.display = 'inline-flex';
                        } else {
                            notifBadge.style.display = 'none';
                        }
                    }

                    if (notifList && Array.isArray(data.notifications)) {
                        if (data.notifications.length === 0) {
                            notifList.innerHTML = '<div class="notif-empty-state">No new notifications</div>';
                            return;
                        }

                        notifList.innerHTML = '';
                        data.notifications.forEach(function (n) {
                            var isRead = !!parseInt(n.is_read);
                            var item = document.createElement('div');
                            item.className = 'notif-item' + (isRead ? '' : ' unread');
                            item.setAttribute('data-id', n.id);

                            var timeStr = n.created_at || 'Recently';

                            item.innerHTML =
                                '<span class="notif-item-icon">👗</span>' +
                                '<div class="notif-item-content">' +
                                    '<div class="notif-item-title">' + escapeHtml(n.title || 'Notification') + '</div>' +
                                    '<div class="notif-item-msg">' + escapeHtml(n.message || '') + '</div>' +
                                    '<div class="notif-item-time">' + escapeHtml(timeStr) + '</div>' +
                                '</div>' +
                                (isRead ? '' : '<span class="notif-unread-dot"></span>');

                            item.onclick = function () {
                                if (!isRead) {
                                    markSingleRead(n.id);
                                }
                                window.location.href = 'history.html?tab=custom-requests';
                            };

                            notifList.appendChild(item);
                        });
                    }
                })
                .catch(function (e) { console.error('Notification fetch error:', e); });
        }

        function markSingleRead(id) {
            var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';
            fetch(prefix + '/backend/get_notifications.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark_read', id: id, user_id: uid })
            }).then(function () {
                fetchAlerts();
            }).catch(function (e) { console.error(e); });
        }

        function markAllRead() {
            var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';
            fetch(prefix + '/backend/get_notifications.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark_all_read', user_id: uid })
            }).then(function () {
                fetchAlerts();
            }).catch(function (e) { console.error(e); });
        }

        bellBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = notifDropdown.classList.contains('show');
            if (isOpen) {
                notifDropdown.classList.remove('show');
            } else {
                notifDropdown.classList.add('show');
                fetchAlerts();
            }
        });

        if (btnMarkAllRead) {
            btnMarkAllRead.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                markAllRead();
            });
        }

        document.addEventListener('click', function (e) {
            var container = bellBtn.closest('.notification-menu-container');
            if (container && !container.contains(e.target)) {
                notifDropdown.classList.remove('show');
            }
        });

        fetchAlerts();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (window.Style360Auth && typeof window.Style360Auth.checkSession === 'function') {
            window.Style360Auth.checkSession();
        }

        setupNotificationBell();
    });

    window.Style360.setupNotificationBell = setupNotificationBell;

})(window);
