// Dynamic layout injection using external partials (header/footer) and breadcrumb support
(function(){
  const NAV_MAP = {
    'index.html':'home',
    'history.html':'history',
    'fiction.html':'fiction',
    'science.html':'science',
    'poetry.html':'poetry',
    'selfhelp.html':'selfhelp',
    'childrens.html':'children',
    'read-online.html':'read',
    'features.html':'features',
    'my_library.html':'library',
    'contact.html':'contact'
  };
  const TITLE_MAP = {
    'history.html':'History & Biography',
    'fiction.html':'Fiction & Literature',
    'science.html':'Science & Discovery',
    'poetry.html':'Poetry',
    'selfhelp.html':'Self-Help',
    'childrens.html':'Children\'s Books',
    'read-online.html':'Read Online',
  'features.html':'Platform Features',
    'my_library.html':'My Library',
    'contact.html':'Contact'
  };

  function rootPath(){
    return /\/pages\//.test(location.pathname) ? '../' : '';
  }

  async function fetchPartial(name){
    const rp = rootPath();
    const url = rp + 'assets/partials/' + name + '.html';
    try {
      const res = await fetch(url);
      if(!res.ok) throw new Error(res.status+' '+res.statusText);
      let text = await res.text();
      text = text.replace(/\{\{root}}/g, rp);
      return text;
    } catch(err){
      console.warn('Partial load failed:', name, err);
      return ''; // fail soft
    }
  }

  function ensureBreadcrumb(){
    // Skip on index
    if(location.pathname.endsWith('index.html') || location.pathname === '/' ) return;
    if(document.querySelector('.breadcrumb')) return; // already present
    const rp = rootPath();
    const file = Object.keys(NAV_MAP).find(f=> location.pathname.endsWith(f));
    if(!file) return;
    const label = TITLE_MAP[file] || file.replace('.html','');
    const navEl = document.createElement('nav');
  navEl.className = 'breadcrumb';
  navEl.setAttribute('aria-label','Breadcrumb');
  navEl.innerHTML = `<div class="container"><ul class="breadcrumb-list">\n      <li class="breadcrumb-item"><a href="${rp}index.html" class="breadcrumb-link">Home</a></li>\n      <li class="breadcrumb-item" aria-current="page"><span class="breadcrumb-current">${label}</span></li>\n      <li class="breadcrumb-item" style="margin-left:auto;"><a href="${rp}pages/my_library.html" class="breadcrumb-link" style="font-weight:600;display:inline-flex;align-items:center;gap:6px;"><span style="opacity:.8;">🗂️</span> <span>Your Personal Library</span></a></li>\n    </ul></div>`;
    const main = document.querySelector('main');
    if(main) main.parentNode.insertBefore(navEl, main);
  }

  function highlightActiveNav(){
    const current = Object.keys(NAV_MAP).find(k=> location.pathname.endsWith(k));
    if(!current) return;
    const activeKey = NAV_MAP[current];
    const link = document.querySelector(`nav a[data-nav="${activeKey}"]`);
    if(link) link.classList.add('active');
  }

  function wireQuickSearch(){
    const quickBtn = document.getElementById('quick-search-btn');
    const quickInput = document.getElementById('quick-search');
    if(quickBtn && quickInput && window.bookSearch){
      quickBtn.addEventListener('click', ()=> window.bookSearch.performSearch(quickInput.value));
      quickInput.addEventListener('keypress', e=> { if(e.key==='Enter') quickBtn.click(); });
    }
  }

  function authRefresh(){
    // Ensure both legacy auth UI and new account dropdown get updated after partial injection
    try {
      if(window.loginManager && typeof window.loginManager.updateUIForUser === 'function'){
        window.loginManager.updateUIForUser();
      }
      if(window.refreshAuthUI){
        window.refreshAuthUI();
      } else {
        setTimeout(()=> {
          if(window.refreshAuthUI) window.refreshAuthUI();
          if(window.loginManager && typeof window.loginManager.updateUIForUser === 'function'){
            window.loginManager.updateUIForUser();
          }
        }, 400);
      }
    } catch(err){
      console.warn('Auth refresh failed', err);
    }
  }

  function wireInstallButton(){
    const installBtn = document.getElementById('install-footer-btn');
    if(!installBtn) return;
    let bipEvt = null;
    window.addEventListener('beforeinstallprompt', e=>{ bipEvt = e; });
    installBtn.addEventListener('click', ()=>{
      if(bipEvt){
        bipEvt.prompt();
        bipEvt.userChoice.finally(()=> bipEvt=null);
      } else {
        installBtn.textContent='Use browser menu to install';
        setTimeout(()=> installBtn.textContent='📥 Install App', 4200);
      }
    });
  }

  async function injectLayout(){
    const rp = rootPath();
    const headerEl = document.querySelector('header');
    const footerEl = document.querySelector('footer');
    const [headerHTML, footerHTML] = await Promise.all([
      headerEl ? fetchPartial('header') : Promise.resolve(''),
      footerEl ? fetchPartial('footer') : Promise.resolve('')
    ]);
    if(headerEl && !headerEl.dataset.enhanced){ headerEl.innerHTML = headerHTML; headerEl.dataset.enhanced='1'; }
    if(footerEl && !footerEl.dataset.enhanced){ footerEl.innerHTML = footerHTML; footerEl.dataset.enhanced='1'; }

    // Post injection tasks
    highlightActiveNav();
    ensureBreadcrumb();
    const y=document.getElementById('year'); if(y) y.textContent=new Date().getFullYear();
    wireQuickSearch();
    authRefresh();
    wireInstallButton();
  }

  document.addEventListener('DOMContentLoaded', injectLayout);

  // Global keyboard shortcuts (after DOM ready but independent of partial fetch timing)
  document.addEventListener('keydown', (e)=>{
    if(e.target && (/input|textarea|select/i).test(e.target.tagName)) return; // ignore when typing in fields
    // Focus main search with '/'
    if(e.key === '/'){ 
      const mainSearch = document.getElementById('search-input') || document.getElementById('library-search');
      if(mainSearch){ e.preventDefault(); mainSearch.focus(); }
    }
  });

  // Attach Enter binding for main search if not already bound (id=search-input)
  document.addEventListener('DOMContentLoaded', ()=>{
    const si = document.getElementById('search-input');
    if(si && !si.dataset.enhanced){
      si.addEventListener('keydown', ev=>{ if(ev.key==='Enter' && window.bookSearch){ ev.preventDefault(); window.bookSearch.performSearch(si.value); }});
      si.dataset.enhanced='1';
    }
  });
})();
