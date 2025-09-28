// Login functionality for Book Shelf Explorer
class LoginManager {
    constructor() {
        this.users = this.getStoredUsers();
        this.currentUser = this.getCurrentUser();
        this.init();
    }

    init() {
        this.bindLoginForm();
        this.bindRegisterForm();
        this.bindLogoutButtons();
        this.updateUIForUser();
        this.initPasswordStrength();
        this.initRememberMe();
    }

    bindLoginForm() {
        const legacy = document.querySelector('#loginForm, .login-form');
        const modern = document.getElementById('login-form');
        const form = modern || legacy;
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin(form);
            });
        }
    }

    bindRegisterForm() {
        const legacy = document.querySelector('#registerForm, .register-form');
        const modern = document.getElementById('register-form');
        const form = modern || legacy;
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister(form);
            });
        }
    }

    bindLogoutButtons() {
        document.querySelectorAll('.logout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        });
    }

    handleLogin(form) {
        const formData = new FormData(form);
        const email = formData.get('email') || formData.get('uname') || document.getElementById('login-username')?.value;
        const password = formData.get('password') || formData.get('psw') || document.getElementById('login-password')?.value;
        const rememberMe = formData.get('remember') === 'on' || document.getElementById('remember-me')?.checked;

        const submitBtn = form.querySelector('button[type="submit"]');
        if (!submitBtn) return;
        const originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<div class="loading" style="width:16px;height:16px;border:3px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;vertical-align:middle;animation:spin 0.8s linear infinite"></div> Logging in...';
        submitBtn.disabled = true;

        const showInline = (msg, type='error') => {
            const alertBox = document.getElementById('login-alert');
            if (alertBox) {
                alertBox.className = `auth-alert ${type==='success'?'success':'error'}`;
                alertBox.textContent = msg;
                alertBox.style.display = 'block';
            } else {
                (type==='success'?this.showSuccessMessage:this.showErrorMessage).call(this, msg);
            }
        };

        setTimeout(async () => {
            const loginResult = await this.authenticateUser(email, password);
            if (loginResult.success) {
                this.setCurrentUser(loginResult.user, rememberMe);
                showInline('Login successful! Redirecting...', 'success');
                if (window.refreshAuthUI) window.refreshAuthUI();
                setTimeout(() => {
                    const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '../index.html';
                    window.location.href = redirectUrl;
                }, 900);
            } else {
                showInline(loginResult.message, 'error');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                form.classList.add('shake');
                setTimeout(() => form.classList.remove('shake'), 500);
            }
        }, 650);
    }

    handleRegister(form) {
        const formData = new FormData(form);
        const userData = {
            name: formData.get('name') || document.getElementById('reg-username')?.value,
            email: formData.get('email') || document.getElementById('reg-email')?.value,
            password: formData.get('password') || document.getElementById('reg-password')?.value,
            confirmPassword: formData.get('confirmPassword') || document.getElementById('reg-password2')?.value
        };
        const alertBox = document.getElementById('register-alert');
        const showInline = (msg, type='error') => {
            if (alertBox) {
                alertBox.className = `auth-alert ${type==='success'?'success':'error'}`;
                alertBox.textContent = msg;
                alertBox.style.display = 'block';
            } else {
                (type==='success'?this.showSuccessMessage:this.showErrorMessage).call(this, msg);
            }
        };
        const validation = this.validateRegistration(userData);
        if (!validation.isValid) { showInline(validation.message, 'error'); return; }
        const submitBtn = form.querySelector('button[type="submit"]');
        if (!submitBtn) return;
        const originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<div class="loading" style="width:16px;height:16px;border:3px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;vertical-align:middle;animation:spin 0.8s linear infinite"></div> Creating...';
        submitBtn.disabled = true;
        setTimeout(async () => {
            const registerResult = await this.registerUser(userData);
            if (registerResult.success) {
                showInline('Registration successful! You can login now.', 'success');
                form.reset();
                // Flip to login if toggle function present
                if (typeof toggleAuth === 'function') toggleAuth('login');
            } else {
                showInline(registerResult.message, 'error');
            }
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }, 800);
    }

    handleLogout() {
        this.showConfirmDialog(
            'Logout Confirmation', 
            'Are you sure you want to logout?',
            () => {
                this.clearCurrentUser();
                this.showSuccessMessage('You have been logged out successfully.');
                if (window.refreshAuthUI) window.refreshAuthUI();
                setTimeout(() => {
                    // Redirect to unified auth page
                    const base = window.location.pathname.includes('/pages/') ? 'login_register.html' : 'pages/login_register.html';
                    window.location.href = base;
                }, 1000);
            }
        );
    }

    async authenticateUser(email, password) {
        // For demo purposes, accept any email/password combination
        // In real implementation, this would make an API call
        if (!email || !password) {
            return {
                success: false,
                message: 'Please enter both email and password.'
            };
        }

        if (!this.isValidEmail(email)) {
            return {
                success: false,
                message: 'Please enter a valid email address.'
            };
        }

        if (password.length < 3) {
            return {
                success: false,
                message: 'Password must be at least 3 characters long.'
            };
        }

        // Check against stored users or allow any valid format
        const user = this.users.find(u => u.email === email);
        if (user) {
            // Legacy plaintext support then upgrade
            if (user.password && user.password === password) {
                try {
                    const hash = await this.hashPassword(password);
                    user.passwordHash = hash;
                    delete user.password;
                    this.saveUsers();
                } catch {}
                return { success: true, user: { ...user, password: undefined, passwordHash: undefined } };
            }
            if (user.passwordHash) {
                const hash = await this.hashPassword(password);
                if (hash === user.passwordHash) {
                    return { success: true, user: { ...user, password: undefined, passwordHash: undefined } };
                }
            }
            return { success: false, message: 'Invalid password.' };
        }

        // For demo, create user on first login
        const newUser = {
            id: Date.now(),
            name: email.split('@')[0],
            email: email,
            passwordHash: await this.hashPassword(password),
            joinDate: new Date().toISOString(),
            preferences: {}
        };

        this.users.push(newUser);
        this.saveUsers();

        return { success: true, user: { ...newUser, password: undefined, passwordHash: undefined } };
    }

    async registerUser(userData) {
        // Check if user already exists
        if (this.users.find(u => u.email === userData.email)) {
            return {
                success: false,
                message: 'An account with this email already exists.'
            };
        }

        const newUser = {
            id: Date.now(),
            name: userData.name,
            email: userData.email,
            passwordHash: await this.hashPassword(userData.password),
            joinDate: new Date().toISOString(),
            preferences: {}
        };

        this.users.push(newUser);
        this.saveUsers();

        return { success: true, user: { ...newUser, password: undefined, passwordHash: undefined } };
    }

    validateRegistration(userData) {
        if (!userData.name || userData.name.length < 2) {
            return {
                isValid: false,
                message: 'Name must be at least 2 characters long.'
            };
        }

        if (!this.isValidEmail(userData.email)) {
            return {
                isValid: false,
                message: 'Please enter a valid email address.'
            };
        }

        if (!userData.password || userData.password.length < 6) {
            return {
                isValid: false,
                message: 'Password must be at least 6 characters long.'
            };
        }

        if (userData.password !== userData.confirmPassword) {
            return {
                isValid: false,
                message: 'Passwords do not match.'
            };
        }

        return { isValid: true };
    }

    initPasswordStrength() {
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach(input => {
            if (input.name === 'password' || input.name === 'psw') {
                input.addEventListener('input', (e) => {
                    this.updatePasswordStrength(e.target);
                });
            }
        });
    }

    updatePasswordStrength(passwordInput) {
        const password = passwordInput.value;
        const strengthMeter = passwordInput.parentNode.querySelector('.password-strength');
        
        if (!strengthMeter) {
            const meter = document.createElement('div');
            meter.className = 'password-strength';
            passwordInput.parentNode.appendChild(meter);
        }

        const strength = this.calculatePasswordStrength(password);
        const meter = passwordInput.parentNode.querySelector('.password-strength');
        
        meter.innerHTML = `
            <div class="strength-bar">
                <div class="strength-fill strength-${strength.level}" style="width: ${strength.percentage}%"></div>
            </div>
            <span class="strength-text">Password strength: ${strength.text}</span>
        `;
    }

    calculatePasswordStrength(password) {
        let score = 0;
        
        if (password.length >= 8) score += 25;
        if (password.length >= 12) score += 25;
        if (/[a-z]/.test(password)) score += 12.5;
        if (/[A-Z]/.test(password)) score += 12.5;
        if (/[0-9]/.test(password)) score += 12.5;
        if (/[^A-Za-z0-9]/.test(password)) score += 12.5;

        let level, text;
        if (score < 30) {
            level = 'weak';
            text = 'Weak';
        } else if (score < 60) {
            level = 'fair';
            text = 'Fair';
        } else if (score < 90) {
            level = 'good';
            text = 'Good';
        } else {
            level = 'strong';
            text = 'Strong';
        }

        return { score, percentage: score, level, text };
    }

    initRememberMe() {
        const rememberCheckboxes = document.querySelectorAll('input[name="remember"]');
        rememberCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.showInfoMessage('We\'ll keep you logged in on this device.');
                }
            });
        });
    }

    setCurrentUser(user, remember = false) {
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem('bookshelf_current_user', JSON.stringify(user));
        this.currentUser = user;
        this.updateUIForUser();
    }

    getCurrentUser() {
        const sessionUser = sessionStorage.getItem('bookshelf_current_user');
        const localUser = localStorage.getItem('bookshelf_current_user');
        
        try {
            return JSON.parse(sessionUser || localUser);
        } catch {
            return null;
        }
    }

    clearCurrentUser() {
        sessionStorage.removeItem('bookshelf_current_user');
        localStorage.removeItem('bookshelf_current_user');
        this.currentUser = null;
        this.updateUIForUser();
    }

    updateUIForUser() {
        const userElements = document.querySelectorAll('.user-info');
        const loginButtons = document.querySelectorAll('.login-btn');
        const logoutButtons = document.querySelectorAll('.logout-btn');
        const accountWrap = document.getElementById('account-menu-root');
        const acctBtn = document.getElementById('account-btn');
        const dropdown = document.getElementById('account-dropdown');
        const acctInitial = document.getElementById('acct-initial');
        const acctAvatar = document.getElementById('acct-avatar');
        const acctName = document.getElementById('acct-name');
        const acctEmail = document.getElementById('acct-email');

        if (this.currentUser) {
            userElements.forEach(el => {
                el.textContent = `Welcome, ${this.currentUser.name}!`;
                el.style.display = 'block';
            });
            loginButtons.forEach(btn => btn.style.display = 'none');
            logoutButtons.forEach(btn => btn.style.display = 'block');
            if(accountWrap){ accountWrap.style.display='inline-flex'; }
            if(acctBtn && acctInitial){ acctInitial.textContent = (this.currentUser.name || this.currentUser.email || 'U').substring(0,1).toUpperCase(); }
            if(acctAvatar){ acctAvatar.textContent = acctInitial ? acctInitial.textContent : 'U'; }
            if(acctName){ acctName.textContent = this.currentUser.name || 'User'; }
            if(acctEmail){ acctEmail.textContent = this.currentUser.email || ''; }
        } else {
            userElements.forEach(el => el.style.display = 'none');
            loginButtons.forEach(btn => btn.style.display = 'block');
            logoutButtons.forEach(btn => btn.style.display = 'none');
            if(accountWrap){ accountWrap.style.display='none'; }
            if(dropdown){ dropdown.setAttribute('data-open','false'); dropdown.setAttribute('aria-hidden','true'); }
        }
    }

    // Utility methods
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    getStoredUsers() {
        try {
            return JSON.parse(localStorage.getItem('bookshelf_users') || '[]');
        } catch {
            return [];
        }
    }

    saveUsers() {
        localStorage.setItem('bookshelf_users', JSON.stringify(this.users));
    }

    async hashPassword(password){
        const enc = new TextEncoder();
        const data = enc.encode(password);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }

    // UI feedback methods
    showSuccessMessage(message) {
        if (window.bookShelfApp) {
            window.bookShelfApp.showNotification(message, 'success');
        } else {
            alert(message);
        }
    }

    showErrorMessage(message) {
        if (window.bookShelfApp) {
            window.bookShelfApp.showNotification(message, 'error');
        } else {
            alert(message);
        }
    }

    showInfoMessage(message) {
        if (window.bookShelfApp) {
            window.bookShelfApp.showNotification(message, 'info');
        } else {
            alert(message);
        }
    }

    showConfirmDialog(title, message, onConfirm) {
        if (confirm(`${title}\n\n${message}`)) {
            onConfirm();
        }
    }

    // Public API
    isLoggedIn() {
        return !!this.currentUser;
    }

    getUser() {
        return this.currentUser;
    }

    requireLogin(callback) {
        if (this.isLoggedIn()) {
            callback();
        } else {
            this.showErrorMessage('Please login to continue.');
            setTimeout(() => {
                const base = window.location.pathname.includes('/pages/') ? 'login_register.html' : 'pages/login_register.html';
                window.location.href = `${base}?redirect=${encodeURIComponent(window.location.pathname)}`;
            }, 900);
        }
    }
}

// Reusable wiring for account dropdown (works even if header injected later)
function wireAccountDropdown(){
    // Avoid double-binding using a marker on root container
    const root = document.getElementById('account-menu-root');
    if(!root || root.dataset.bound) return;
    const acctBtn = document.getElementById('account-btn');
    const dropdown = document.getElementById('account-dropdown');
    const pwOpen = document.getElementById('acct-open-password');
    const unameOpen = document.getElementById('acct-open-username');
    const pwForm = document.getElementById('password-update-form');
    const unameForm = document.getElementById('username-update-form');
    const pwCancel = document.getElementById('pw-cancel');
    const unameCancel = document.getElementById('username-cancel');
    const pwNew = document.getElementById('pw-new');
    const unameNew = document.getElementById('username-new');
    const pwConfirm = document.getElementById('pw-confirm');
    const pwFeedback = document.getElementById('pw-feedback');
    const unameFeedback = document.getElementById('username-feedback');
    const logoutBtn = document.getElementById('acct-logout');

    function toggleDropdown(force){
        if(!dropdown || !acctBtn) return;
        const open = typeof force==='boolean' ? force : dropdown.getAttribute('data-open')!=='true';
        dropdown.setAttribute('data-open', open?'true':'false');
        dropdown.setAttribute('aria-hidden', open?'false':'true');
        acctBtn.setAttribute('aria-expanded', open?'true':'false');
    }
    if(acctBtn){ acctBtn.addEventListener('click', ()=> toggleDropdown()); }
    document.addEventListener('click', e=>{
        if(!dropdown || !acctBtn) return;
        if(!dropdown.contains(e.target) && !acctBtn.contains(e.target) && dropdown.getAttribute('data-open')==='true'){
            toggleDropdown(false);
        }
    });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape' && dropdown && dropdown.getAttribute('data-open')==='true') toggleDropdown(false); });
    if(pwOpen){
        pwOpen.addEventListener('click', ()=>{
            if(!pwForm) return;
            // Hide username form if open
            if(unameForm) unameForm.style.display='none';
            pwForm.classList.toggle('hidden');
            if(!pwForm.classList.contains('hidden')){ pwNew && pwNew.focus(); toggleDropdown(true); }
        });
    }
    if(unameOpen){
        unameOpen.addEventListener('click', ()=>{
            if(!unameForm) return;
            // Hide password form if open
            if(pwForm) pwForm.classList.add('hidden');
            const showing = unameForm.style.display!=='none';
            if(showing){ unameForm.style.display='none'; }
            else {
                unameForm.style.display='block';
                unameFeedback && (unameFeedback.textContent='');
                if(unameNew){ unameNew.value = loginManager?.currentUser?.name || ''; unameNew.focus(); }
                toggleDropdown(true);
            }
        });
    }
    if(pwCancel){ pwCancel.addEventListener('click', ()=> { pwForm.classList.add('hidden'); pwFeedback.textContent=''; }); }
    if(unameCancel){ unameCancel.addEventListener('click', ()=> { if(unameForm){ unameForm.style.display='none'; unameFeedback.textContent=''; } }); }
    if(pwForm){
        pwForm.addEventListener('submit', async e=>{
            e.preventDefault();
            if(!loginManager || !loginManager.currentUser){ pwFeedback.textContent='Not logged in.'; return; }
            const n = pwNew.value.trim();
            const c = pwConfirm.value.trim();
            if(n.length < 6){ pwFeedback.textContent='Password must be at least 6 characters.'; return; }
            if(n!==c){ pwFeedback.textContent='Passwords do not match.'; return; }
            pwFeedback.textContent='Saving…';
            try {
                const users = loginManager.getStoredUsers();
                const idx = users.findIndex(u=> u.email===loginManager.currentUser.email);
                if(idx===-1){ pwFeedback.textContent='User not found.'; return; }
                const hash = await loginManager.hashPassword(n);
                users[idx].passwordHash = hash;
                localStorage.setItem('bookshelf_users', JSON.stringify(users));
                pwFeedback.textContent='Updated successfully';
                setTimeout(()=>{ pwForm.classList.add('hidden'); pwFeedback.textContent=''; pwForm.reset(); }, 1200);
            } catch(err){ pwFeedback.textContent='Error updating password'; }
        });
    }
    if(unameForm){
        unameForm.addEventListener('submit', e=>{
            e.preventDefault();
            if(!loginManager || !loginManager.currentUser){ unameFeedback.textContent='Not logged in.'; return; }
            const val = (unameNew.value||'').trim();
            if(val.length < 2){ unameFeedback.textContent='Name too short.'; return; }
            if(val.length > 40){ unameFeedback.textContent='Name too long.'; return; }
            unameFeedback.textContent='Saving…';
            try {
                const users = loginManager.getStoredUsers();
                const idx = users.findIndex(u=> u.email===loginManager.currentUser.email);
                if(idx===-1){ unameFeedback.textContent='User not found.'; return; }
                users[idx].name = val;
                localStorage.setItem('bookshelf_users', JSON.stringify(users));
                // Update current user object in storage(s)
                loginManager.currentUser.name = val;
                const rawSession = sessionStorage.getItem('bookshelf_current_user');
                if(rawSession){
                    try { const obj = JSON.parse(rawSession); obj.name=val; sessionStorage.setItem('bookshelf_current_user', JSON.stringify(obj)); } catch {}
                }
                const rawLocal = localStorage.getItem('bookshelf_current_user');
                if(rawLocal){
                    try { const obj = JSON.parse(rawLocal); obj.name=val; localStorage.setItem('bookshelf_current_user', JSON.stringify(obj)); } catch {}
                }
                // Refresh visible UI
                try { loginManager.updateUIForUser(); } catch {}
                unameFeedback.textContent='Updated';
                setTimeout(()=>{ unameFeedback.textContent=''; unameForm.style.display='none'; }, 1000);
            } catch(err){ unameFeedback.textContent='Error saving name'; }
        });
    }
    if(logoutBtn){ logoutBtn.addEventListener('click', ()=> { loginManager && loginManager.handleLogout(); }); }
    root.dataset.bound='1';
}

document.addEventListener('DOMContentLoaded', wireAccountDropdown);

// Initialize login manager
const loginManager = new LoginManager();

// Export for global use
window.LoginManager = LoginManager;
window.loginManager = loginManager;

// Fallback: if header partial injected after login manager constructed, observe and update account UI when elements appear
(()=>{
    if(document.getElementById('account-menu-root')) return; // already present
    const headerEl = document.querySelector('header');
    if(!headerEl || !window.MutationObserver) return;
        const observer = new MutationObserver((mutations, obs)=>{
        if(document.getElementById('account-menu-root')){
                try { loginManager.updateUIForUser(); wireAccountDropdown(); } catch {}
            obs.disconnect();
        }
    });
    observer.observe(headerEl, {childList:true, subtree:true});
})();