/**
 * Style360 — Authentication & Dynamic Navbar Controller (auth.js)
 * Manages:
 * 1. Dynamic Navbar Rendering for Authenticated vs Unauthenticated (Guest) users
 * 2. Session verification against backend/check_session.php on page load
 * 3. Access Control & Login Modal prompt on protected action clicks
 * 4. Sign In, Sign Up, and Sign Out operations
 */

(function (window, document) {
    'use strict';

    function getApiUrl(endpoint) {
        var prefix = (window.location.pathname.indexOf('/style360') === 0) ? '/style360' : '';
        return prefix + endpoint;
    }

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
            localStorage.removeItem('active_user_session');
        }
    }

    function isGuest() {
        var u = getCurrentUser();
        return !u || !u.id;
    }

    // ─── 1. DYNAMIC NAVBAR RENDERING ───
    function renderNavbar(user) {
        var authenticated = !!(user && user.id);

        // A. Profile Avatar & User Menu
        var userMenuWrap = document.getElementById('user-menu-wrap');
        var avatarBtn    = document.getElementById('btn-user-avatar');
        var avatarInitials = document.getElementById('header-avatar-initials');
        var dropAvatarCircle = document.getElementById('drop-avatar-circle');
        var dropUserName     = document.getElementById('drop-user-name');
        var dropUserEmail    = document.getElementById('drop-user-email');
        var dropAdminLink    = document.getElementById('drop-admin-link');

        // B. Notification Bell Icon
        var notifWrap = document.getElementById('notification-menu-wrap');

        // C. Auth Action Buttons
        var btnSignIn = document.getElementById('btn-header-signin');
        var btnSignUp = document.getElementById('btn-header-signup');
        var authBtnsContainer = document.getElementById('header-auth-btns');

        // Ensure "Sign Up" button exists in DOM if not present in static markup
        if (!btnSignUp) {
            var targetParent = (btnSignIn && btnSignIn.parentNode) || document.querySelector('.header-actions');
            if (targetParent) {
                btnSignUp = document.createElement('a');
                btnSignUp.id = 'btn-header-signup';
                btnSignUp.className = 'btn-header-signup';
                btnSignUp.href = 'auth.html?mode=signup';
                btnSignUp.textContent = 'Sign Up';
                if (btnSignIn && btnSignIn.nextSibling) {
                    targetParent.insertBefore(btnSignUp, btnSignIn.nextSibling);
                } else if (btnSignIn) {
                    targetParent.appendChild(btnSignUp);
                }
            }
        }

        // D. History & Studio restricted links in navbar
        var restrictedNavLinks = document.querySelectorAll(
            '.nav-link-history, .nav-link-studio, #nav-history-link, #nav-studio-link, ' +
            '#main-nav a[href*="history.html"], #main-nav a[href*="my-3d-models.html"], #main-nav a[href*="profile.html"]'
        );

        if (authenticated) {
            // ── USER IS SIGNED IN ──
            var fullName = (user.first_name ? (user.first_name + ' ' + (user.last_name || '')).trim() : (user.username || 'Fashion Enthusiast'));
            var initials = (user.first_name ? user.first_name.charAt(0) : 'U').toUpperCase();
            if (user.last_name) {
                initials += user.last_name.charAt(0).toUpperCase();
            }

            if (avatarInitials) avatarInitials.textContent = initials;
            if (dropAvatarCircle) dropAvatarCircle.textContent = initials;
            if (dropUserName) dropUserName.textContent = fullName;
            if (dropUserEmail) dropUserEmail.textContent = user.email || 'Member';

            // Show Avatar & User Menu
            if (userMenuWrap) userMenuWrap.style.setProperty('display', 'inline-block', 'important');

            // Show Bell Icon
            if (notifWrap) notifWrap.style.setProperty('display', 'inline-block', 'important');

            // Show History & Studio links in navbar
            restrictedNavLinks.forEach(function (el) {
                el.style.removeProperty('display');
            });

            // Show/Hide Admin console based on role
            if (dropAdminLink) {
                var isAdmin = (user.role === 'admin' || user.is_admin === true || user.is_admin === 1 || user.is_admin === '1');
                dropAdminLink.style.display = isAdmin ? 'flex' : 'none';
            }

            // Hide "Sign In" and "Sign Up" buttons
            if (btnSignIn) btnSignIn.style.setProperty('display', 'none', 'important');
            if (btnSignUp) btnSignUp.style.setProperty('display', 'none', 'important');
            if (authBtnsContainer) authBtnsContainer.style.setProperty('display', 'none', 'important');

        } else {
            // ── USER IS NOT SIGNED IN (GUEST) ──
            // Hide Profile Avatar container & Initials
            if (userMenuWrap) userMenuWrap.style.setProperty('display', 'none', 'important');
            if (avatarInitials) avatarInitials.textContent = '👤';

            // Hide Notification Bell icon
            if (notifWrap) notifWrap.style.setProperty('display', 'none', 'important');

            // Hide History & Studio links in navbar
            restrictedNavLinks.forEach(function (el) {
                el.style.setProperty('display', 'none', 'important');
            });

            // Render ONLY the "Sign In" and "Sign Up" buttons
            if (btnSignIn) {
                btnSignIn.style.removeProperty('display');
                btnSignIn.style.setProperty('display', 'inline-flex', 'important');
            }
            if (btnSignUp) {
                btnSignUp.style.removeProperty('display');
                btnSignUp.style.setProperty('display', 'inline-flex', 'important');
            }
            if (authBtnsContainer) {
                authBtnsContainer.style.removeProperty('display');
                authBtnsContainer.style.setProperty('display', 'inline-flex', 'important');
            }
        }
    }

    // ─── 2. CHECK SESSION ON PAGE LOAD ───
    function checkSession(callback) {
        var apiUrl = getApiUrl('/api/check_session');

        fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            credentials: 'same-origin'
        })
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function (data) {
            if (data && data.authenticated && data.user && data.user.id) {
                setCurrentUser(data.user);
                renderNavbar(data.user);
                if (typeof callback === 'function') callback(null, data.user);
            } else {
                // Completely unauthenticated: wipe any stale local cache and force guest state
                try { localStorage.clear(); } catch (e) {}
                try { sessionStorage.clear(); } catch (e) {}
                renderNavbar(null);
                handleProtectedPageAccess();
                if (typeof callback === 'function') callback(null, null);
            }
        })
        .catch(function (err) {
            console.warn('[Style360Auth] Session unauthenticated or check failed:', err);
            // Strictly reset to guest on error — NEVER resurrect stale/mock user data
            try { localStorage.clear(); } catch (e) {}
            try { sessionStorage.clear(); } catch (e) {}
            renderNavbar(null);
            handleProtectedPageAccess();
            if (typeof callback === 'function') callback(null, null);
        });
    }

    // ─── 3. PROTECTED PAGE ACCESS CHECK ───
    function handleProtectedPageAccess() {
        var path = window.location.pathname.toLowerCase();
        var isProtected = (
            path.indexOf('history.html') !== -1 ||
            path.indexOf('my-3d-models.html') !== -1 ||
            path.indexOf('profile.html') !== -1
        );

        if (isProtected && isGuest()) {
            openLoginModal(window.location.href, 'Please sign in to access your saved Virtual Try-Ons, 3D Studio, and personal profile.');
        }
    }

    // ─── 4. GLOBAL LOGIN MODAL ───
    var loginModalInstance = null;
    var redirectTargetUrl = null;

    function createLoginModal() {
        if (document.getElementById('style360-login-modal')) {
            return document.getElementById('style360-login-modal');
        }

        var modal = document.createElement('div');
        modal.id = 'style360-login-modal';
        modal.className = 'style360-login-modal';
        modal.setAttribute('aria-hidden', 'true');

        modal.innerHTML =
            '<div class="login-modal-backdrop" id="login-modal-backdrop"></div>' +
            '<div class="login-modal-card" role="dialog" aria-modal="true">' +
                '<button type="button" class="login-modal-close" id="btn-login-modal-close" aria-label="Close">&times;</button>' +
                '<div class="login-modal-badge">✨ Style360 Member Access</div>' +
                '<h2 class="login-modal-title">Sign In Required</h2>' +
                '<p class="login-modal-desc" id="login-modal-desc">Please sign in to access your try-on history, 3D models, and bespoke fittings.</p>' +
                '<div class="login-form-error" id="login-modal-error"></div>' +
                '<form id="login-modal-form">' +
                    '<div class="login-form-group">' +
                        '<label class="login-form-label" for="login-modal-email">Email Address</label>' +
                        '<input type="email" id="login-modal-email" class="login-form-input" placeholder="name@example.com" required autocomplete="email" />' +
                    '</div>' +
                    '<div class="login-form-group">' +
                        '<label class="login-form-label" for="login-modal-password">Password</label>' +
                        '<input type="password" id="login-modal-password" class="login-form-input" placeholder="••••••••" required autocomplete="current-password" />' +
                    '</div>' +
                    '<button type="submit" class="btn-modal-submit" id="btn-modal-submit">' +
                        '<span>Sign In &amp; Continue</span>' +
                    '</button>' +
                '</form>' +
                '<div class="login-modal-footer">' +
                    'Don\'t have an account? <a href="auth.html?mode=signup" id="link-modal-signup">Create one now &rarr;</a>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        // Bind Close handlers
        var btnClose = modal.querySelector('#btn-login-modal-close');
        var backdrop = modal.querySelector('#login-modal-backdrop');
        if (btnClose) btnClose.addEventListener('click', closeLoginModal);
        if (backdrop) backdrop.addEventListener('click', closeLoginModal);

        // Bind Form Submit
        var form = modal.querySelector('#login-modal-form');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                submitLoginModal();
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('is-open')) {
                closeLoginModal();
            }
        });

        return modal;
    }

    function openLoginModal(redirectUrl, customMessage) {
        redirectTargetUrl = redirectUrl || null;
        var modal = createLoginModal();

        var descEl = modal.querySelector('#login-modal-desc');
        if (descEl && customMessage) {
            descEl.textContent = customMessage;
        }

        var errEl = modal.querySelector('#login-modal-error');
        if (errEl) {
            errEl.textContent = '';
            errEl.style.display = 'none';
        }

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        var emailInput = modal.querySelector('#login-modal-email');
        if (emailInput) setTimeout(function () { emailInput.focus(); }, 100);
    }

    function closeLoginModal() {
        var modal = document.getElementById('style360-login-modal');
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function submitLoginModal() {
        var modal = document.getElementById('style360-login-modal');
        if (!modal) return;

        var emailInput = modal.querySelector('#login-modal-email');
        var passInput  = modal.querySelector('#login-modal-password');
        var errEl      = modal.querySelector('#login-modal-error');
        var submitBtn  = modal.querySelector('#btn-modal-submit');

        var email = emailInput ? emailInput.value.trim() : '';
        var pass  = passInput ? passInput.value.trim() : '';

        if (!email || !pass) {
            if (errEl) {
                errEl.textContent = 'Please enter both your email address and password.';
                errEl.style.display = 'block';
            }
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Signing In...</span>';
        }

        var apiUrl = getApiUrl('/api/auth');
        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'signin', email: email, password: pass })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>Sign In &amp; Continue</span>';
            }

            if (data && data.status === 'success' && data.user) {
                setCurrentUser(data.user);
                renderNavbar(data.user);
                closeLoginModal();

                // If redirected target is specified, navigate there
                if (redirectTargetUrl) {
                    window.location.href = redirectTargetUrl;
                } else if (window.location.pathname.indexOf('history.html') !== -1 || window.location.pathname.indexOf('my-3d-models.html') !== -1) {
                    window.location.reload();
                }
            } else {
                if (errEl) {
                    errEl.textContent = (data && data.message) ? data.message : 'Invalid email or password.';
                    errEl.style.display = 'block';
                }
            }
        })
        .catch(function (err) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>Sign In &amp; Continue</span>';
            }
            if (errEl) {
                errEl.textContent = 'Unable to connect to authentication server. Please try again.';
                errEl.style.display = 'block';
            }
        });
    }

    // ─── 5. COMPLETE SESSION & CACHE PURGE ON SIGN OUT ───
    function signOut() {
        // Step 1: Immediate UI reset (hide avatar, show sign in / sign up)
        renderNavbar(null);

        // Step 2: Clear all frontend cached data
        try { localStorage.clear(); } catch (e) {}
        try { sessionStorage.clear(); } catch (e) {}

        // Step 3: Destroy PHP session via backend/logout.php & hard redirect to index.html
        var apiUrl = getApiUrl('/backend/logout.php');
        var redirected = false;

        function doHardRedirect() {
            if (redirected) return;
            redirected = true;
            try { localStorage.clear(); } catch (e) {}
            try { sessionStorage.clear(); } catch (e) {}
            window.location.href = 'index.html';
        }

        // Safety fallback timer: force redirect within 600ms even if network hangs
        var safetyTimeout = setTimeout(doHardRedirect, 600);

        fetch(apiUrl, {
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
        .catch(function (err) {
            console.warn('[Style360Auth] Logout network error:', err);
            clearTimeout(safetyTimeout);
            doHardRedirect();
        });
    }

    // ─── 6. INTERCEPT CLICKS ON SIGN OUT & RESTRICTED LINKS ───
    function setupAccessControlInterception() {
        document.addEventListener('click', function (e) {
            // A. Intercept Sign Out clicks everywhere
            var signoutBtn = e.target.closest('#btn-dropdown-signout, .signout-item, [data-action="signout"]');
            if (signoutBtn) {
                e.preventDefault();
                e.stopPropagation();
                signOut();
                return;
            }

            var link = e.target.closest('a, button');
            if (!link) return;

            // Check if link targets protected resource
            var href = link.getAttribute('href') || '';
            var isProtectedTarget = (
                href.indexOf('history.html') !== -1 ||
                href.indexOf('my-3d-models.html') !== -1 ||
                href.indexOf('profile.html') !== -1 ||
                link.classList.contains('auth-required') ||
                link.getAttribute('data-require-auth') === 'true'
            );

            // Don't intercept if link is a download link or lightbox button
            if (link.hasAttribute('download') || link.classList.contains('btn-history-dl')) {
                return;
            }

            if (isProtectedTarget && isGuest()) {
                e.preventDefault();
                e.stopPropagation();
                openLoginModal(link.href || href, 'Please sign in to access this feature and view your personal wardrobe.');
            }
        }, true);
    }

    // ─── 7. INITIALIZE ON DOM READY ───
    document.addEventListener('DOMContentLoaded', function () {
        setupAccessControlInterception();
        checkSession();
    });

    // Global Namespace Export
    window.Style360Auth = {
        getCurrentUser: getCurrentUser,
        setCurrentUser: setCurrentUser,
        isGuest: isGuest,
        renderNavbar: renderNavbar,
        checkSession: checkSession,
        openLoginModal: openLoginModal,
        closeLoginModal: closeLoginModal,
        signOut: signOut
    };

})(window, document);
