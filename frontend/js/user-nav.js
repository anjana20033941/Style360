/* =====================================================
   Style360 — Header User Avatar & Dropdown Controller (user-nav.js)
   - Synchronizes user login state across all pages
   - Displays User Avatar with initials
   - Handles Profile Dropdown toggling & actions:
     • Edit Profile (profile.html)
     • My Try-On History (history.html)
     • My 3D Models (my-3d-models.html)
     • Sign Out (resets user session)
   ===================================================== */

(function () {
    'use strict';

    function getCurrentUser() {
        try {
            var raw = localStorage.getItem('style360_user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setCurrentUser(userData) {
        if (userData) {
            localStorage.setItem('style360_user', JSON.stringify(userData));
        } else {
            localStorage.removeItem('style360_user');
        }
    }

    function signOut() {
        if (window.Style360Auth && typeof window.Style360Auth.signOut === 'function') {
            window.Style360Auth.signOut();
            return;
        }

        // Complete UI reset
        initUserNav(null);

        // Complete Cache Purge
        try { localStorage.clear(); } catch (e) {}
        try { sessionStorage.clear(); } catch (e) {}

        var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';
        var redirected = false;

        function doHardRedirect() {
            if (redirected) return;
            redirected = true;
            try { localStorage.clear(); } catch (e) {}
            try { sessionStorage.clear(); } catch (e) {}
            window.location.href = 'index.html';
        }

        var safetyTimeout = setTimeout(doHardRedirect, 600);

        fetch(prefix + '/backend/logout.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            },
            credentials: 'same-origin'
        })
        .then(function () {
            clearTimeout(safetyTimeout);
            doHardRedirect();
        })
        .catch(function () {
            clearTimeout(safetyTimeout);
            doHardRedirect();
        });
    }

    function initUserNav(explicitUser) {
        var user = (explicitUser !== undefined) ? explicitUser : getCurrentUser();
        var userMenuWrap = document.getElementById('user-menu-wrap');
        var avatarBtn    = document.getElementById('btn-user-avatar');
        var avatarInitials = document.getElementById('header-avatar-initials');
        var dropdownMenu = document.getElementById('user-dropdown-menu');
        var btnSignIn    = document.getElementById('btn-header-signin');
        var btnSignUp    = document.getElementById('btn-header-signup');
        var authBtns     = document.getElementById('header-auth-btns');

        var dropAvatarCircle = document.getElementById('drop-avatar-circle');
        var dropUserName     = document.getElementById('drop-user-name');
        var dropUserEmail    = document.getElementById('drop-user-email');
        var btnSignOut       = document.getElementById('btn-dropdown-signout');
        var notifWrap        = document.getElementById('notification-menu-wrap');

        // Restricted navigation links (History, 3D Models, Profile)
        var restrictedNavLinks = document.querySelectorAll(
            '.nav-link-history, .nav-link-studio, #nav-history-link, #nav-studio-link, ' +
            '#main-nav a[href*="history.html"], #main-nav a[href*="my-3d-models.html"]'
        );

        // Ensure "Sign Up" button exists in DOM if not present
        if (!btnSignUp && btnSignIn) {
            var targetParent = btnSignIn.parentNode || document.querySelector('.header-actions');
            if (targetParent) {
                btnSignUp = document.createElement('a');
                btnSignUp.id = 'btn-header-signup';
                btnSignUp.className = 'btn-header-signup';
                btnSignUp.href = 'auth.html?mode=signup';
                btnSignUp.textContent = 'Sign Up';
                if (btnSignIn.nextSibling) {
                    targetParent.insertBefore(btnSignUp, btnSignIn.nextSibling);
                } else {
                    targetParent.appendChild(btnSignUp);
                }
            }
        }

        if (user && user.id) {
            // ── LOGGED IN / AUTHENTICATED STATE ──
            var fullName = (user.first_name ? (user.first_name + ' ' + (user.last_name || '')).trim() : (user.username || 'Style Enthusiast'));
            var initials = (user.first_name ? user.first_name.charAt(0) : 'U').toUpperCase();
            if (user.last_name) {
                initials += user.last_name.charAt(0).toUpperCase();
            }

            if (avatarInitials) avatarInitials.textContent = initials;
            if (dropAvatarCircle) dropAvatarCircle.textContent = initials;
            if (dropUserName) dropUserName.textContent = fullName;
            if (dropUserEmail) dropUserEmail.textContent = user.email || 'Member';

            // Show Avatar container
            if (userMenuWrap) userMenuWrap.style.setProperty('display', 'inline-block', 'important');

            // Show History & Studio links in navbar
            restrictedNavLinks.forEach(function (el) {
                el.style.removeProperty('display');
            });

            // Hide "Sign In" and "Sign Up" buttons
            if (btnSignIn) btnSignIn.style.setProperty('display', 'none', 'important');
            if (btnSignUp) btnSignUp.style.setProperty('display', 'none', 'important');
            if (authBtns) authBtns.style.setProperty('display', 'none', 'important');

            // Initialize User Notification Bell
            initNotificationBell(user);
        } else {
            // ── GUEST / NOT SIGNED IN STATE ──
            // Permanently HIDE Profile Avatar container & Initials badge
            if (userMenuWrap) userMenuWrap.style.setProperty('display', 'none', 'important');
            if (avatarInitials) avatarInitials.textContent = '👤';

            // Permanently HIDE Notification Bell icon
            if (notifWrap) notifWrap.style.setProperty('display', 'none', 'important');

            // Permanently HIDE History and Studio links in the navbar
            restrictedNavLinks.forEach(function (el) {
                el.style.setProperty('display', 'none', 'important');
            });

            // Render ONLY "Sign In" and "Sign Up" buttons
            if (btnSignIn) {
                btnSignIn.style.removeProperty('display');
                btnSignIn.style.setProperty('display', 'inline-flex', 'important');
            }
            if (btnSignUp) {
                btnSignUp.style.removeProperty('display');
                btnSignUp.style.setProperty('display', 'inline-flex', 'important');
            }
            if (authBtns) {
                authBtns.style.removeProperty('display');
                authBtns.style.setProperty('display', 'inline-flex', 'important');
            }
        }

        // Role-Based Access Control (RBAC): Show Admin Console ONLY if user.role === 'admin'
        var dropAdminLink = document.getElementById('drop-admin-link');
        if (dropAdminLink) {
            var isAdmin = !!(user && (user.role === 'admin' || user.is_admin === true || user.is_admin === 1 || user.is_admin === '1'));
            dropAdminLink.style.display = isAdmin ? 'flex' : 'none';
        }

        // Toggle dropdown on avatar click
        avatarBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = dropdownMenu.classList.contains('show');
            if (isOpen) {
                dropdownMenu.classList.remove('show');
            } else {
                dropdownMenu.classList.add('show');
            }
        });

        // Close on clicking outside
        document.addEventListener('click', function (e) {
            if (userMenuWrap && !userMenuWrap.contains(e.target)) {
                dropdownMenu.classList.remove('show');
            }
        });

        // Sign Out action
        if (btnSignOut) {
            btnSignOut.addEventListener('click', function (e) {
                e.preventDefault();
                signOut();
            });
        }

        // Initialize User Notification Bell
        initNotificationBell(user);
    }

    function initNotificationBell(user) {
        var notificationWrap = document.getElementById('notification-menu-wrap');
        var bellBtn          = document.getElementById('notification-bell') || document.getElementById('btn-notification-bell');
        var notifBadge       = document.getElementById('notification-badge');
        var notifDropdown    = document.getElementById('notification-dropdown') || document.getElementById('notification-dropdown-menu');
        var notifList        = document.getElementById('notif-list-container');
        var btnMarkAllRead   = document.getElementById('btn-mark-all-read');

        if (!notificationWrap || !bellBtn || !notifDropdown) return;

        user = user || getCurrentUser();
        if (!user || !user.id) {
            notificationWrap.style.display = 'none';
            return;
        }

        notificationWrap.style.display = 'inline-block';

        function getNotifApiUrl() {
            var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';
            return prefix + '/backend/get_notifications.php';
        }

        function fetchNotifications() {
            var url = getNotifApiUrl() + '?user_id=' + encodeURIComponent(user.id);
            fetch(url)
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data && data.status === 'success') {
                        var unread = parseInt(data.unread_count) || 0;
                        if (notifBadge) {
                            if (unread > 0) {
                                notifBadge.textContent = unread > 99 ? '99+' : unread;
                                notifBadge.style.display = 'inline-flex';
                            } else {
                                notifBadge.style.display = 'none';
                            }
                        }

                        if (!notifList) return;
                        var notifs = Array.isArray(data.notifications) ? data.notifications : [];
                        if (notifs.length === 0) {
                            notifList.innerHTML = '<div class="notif-empty-state">No notifications yet. Status updates for your bespoke outfit requests will appear here.</div>';
                            return;
                        }

                        notifList.innerHTML = '';
                        notifs.forEach(function (n) {
                            var isRead = !!parseInt(n.is_read);
                            var item = document.createElement('div');
                            item.className = 'notif-item' + (isRead ? '' : ' unread');
                            item.setAttribute('data-id', n.id);

                            var timeStr = n.created_at ? formatTimeAgo(new Date(n.created_at)) : 'Recently';

                            item.innerHTML = 
                                '<span class="notif-item-icon">👗</span>' +
                                '<div class="notif-item-content">' +
                                    '<div class="notif-item-title">' + escapeHtml(n.title || 'Notification') + '</div>' +
                                    '<div class="notif-item-msg">' + escapeHtml(n.message || '') + '</div>' +
                                    '<div class="notif-item-time">' + timeStr + '</div>' +
                                '</div>' +
                                (isRead ? '' : '<span class="notif-unread-dot"></span>');

                            item.onclick = function () {
                                if (!isRead) {
                                    markNotificationRead(n.id);
                                }
                                window.location.href = 'history.html?tab=custom-requests';
                            };

                            notifList.appendChild(item);
                        });
                    }
                })
                .catch(function (err) {
                    console.error('Failed to load user notifications:', err);
                });
        }

        function markNotificationRead(id) {
            fetch(getNotifApiUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark_read', id: id, user_id: user.id })
            }).then(function () {
                fetchNotifications();
            }).catch(function (e) { console.error(e); });
        }

        function markAllNotificationsRead() {
            fetch(getNotifApiUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark_all_read', user_id: user.id })
            }).then(function () {
                fetchNotifications();
            }).catch(function (e) { console.error(e); });
        }

        // Toggle dropdown on bell button click
        bellBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            // Close user menu if open
            var userDropdownMenu = document.getElementById('user-dropdown-menu');
            if (userDropdownMenu) userDropdownMenu.classList.remove('show');

            var isOpen = notifDropdown.classList.contains('show');
            if (isOpen) {
                notifDropdown.classList.remove('show');
            } else {
                notifDropdown.classList.add('show');
                fetchNotifications();
            }
        });

        // Close on clicking outside
        document.addEventListener('click', function (e) {
            if (notificationWrap && !notificationWrap.contains(e.target)) {
                notifDropdown.classList.remove('show');
            }
        });

        if (btnMarkAllRead) {
            btnMarkAllRead.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                markAllNotificationsRead();
            });
        }

        // Initial fetch and poll periodically (every 30 seconds)
        fetchNotifications();
        setInterval(fetchNotifications, 30000);
    }

    function formatTimeAgo(date) {
        var now = new Date();
        var diffSec = Math.floor((now - date) / 1000);
        if (diffSec < 60) return 'Just now';
        var diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return diffMin + 'm ago';
        var diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return diffHr + 'h ago';
        var diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7) return diffDay + 'd ago';
        return date.toLocaleDateString();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    document.addEventListener('DOMContentLoaded', function () {
        initUserNav();
    });

    window.Style360Auth = Object.assign(window.Style360Auth || {}, {
        getCurrentUser: getCurrentUser,
        setCurrentUser: setCurrentUser,
        signOut: signOut,
        initUserNav: initUserNav,
        initNotificationBell: initNotificationBell
    });

    window.Style360 = window.Style360 || {};
    window.Style360.initNotificationBell = initNotificationBell;

})();
