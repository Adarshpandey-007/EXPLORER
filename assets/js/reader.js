// Dedicated Reader Page Logic
(function(){
  const DB_NAME = 'book_shelf_explorer_library';
  const DB_VERSION = 1;
  const STORE = 'files';

  class ReaderDB {
    constructor(){ this.dbPromise = this.open(); }
    open(){
      return new Promise((resolve,reject)=>{
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e)=>{
          const db = e.target.result;
          if(!db.objectStoreNames.contains(STORE)){
            const store = db.createObjectStore(STORE, { keyPath:'id' });
            store.createIndex('by_user','userEmail');
          }
        };
        req.onsuccess = ()=> resolve(req.result);
        req.onerror = ()=> reject(req.error);
      });
    }
    async get(id){
      const db = await this.dbPromise;
      return new Promise((resolve,reject)=>{
        const tx = db.transaction(STORE,'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = ()=> resolve(req.result || null);
        req.onerror = ()=> reject(req.error);
      });
    }
  }

  class ReaderApp {
    constructor(){
      this.db = new ReaderDB();
      this.currentRecord = null;
      this.mode = 'paginated';
      this.pages = [];
      this.currentPage = 0;
  this.fullText = '';
  this.contextSummary = '';
  this.pdfTextPages = null; // array of extracted text per PDF page
      // Fixed page pixel height (A4 proportion) computed per viewport width
      this.pagePixelHeight = null;
      this.user = window.loginManager && window.loginManager.currentUser;
      document.addEventListener('DOMContentLoaded', ()=> this.init());
    }

    init(){
      this.cacheDom();
      const id = this.getParam('id');
      if(!id){ this.statusEl.textContent='Missing file id'; return; }
      this.loadRecord(id);
      this.bindEvents();
      // Force start in focus mode (user request) while keeping controls visible
      this.toggleFocusMode(true);
      try { localStorage.setItem('reader_focus_mode','1'); } catch(e){ /* ignore */ }
      this.restorePreferences();
      this.initChat();
    }

    cacheDom(){
      this.toolbar = document.getElementById('reader-toolbar');
      this.stage = document.getElementById('reader-stage');
      this.pageArea = document.getElementById('page-area');
      this.pageInner = document.getElementById('page-area-inner');
      this.pageFooter = document.getElementById('page-footer');
      this.statusEl = document.getElementById('reader-status');
      this.titleEl = document.getElementById('reader-title');
      this.indicator = document.getElementById('page-indicator');
      this.prevBtn = document.getElementById('prev-page');
      this.nextBtn = document.getElementById('next-page');
      this.slider = document.getElementById('page-slider');
      this.viewMode = document.getElementById('view-mode');
      // Chat drawer elements (new UI)
      this.chatToggle = document.getElementById('chat-tab-toggle');
      this.chatPanel = document.getElementById('chat-drawer');
      this.chatClose = document.getElementById('chat-close');
      this.themeMode = document.getElementById('theme-mode');
      this.fontSizeSel = document.getElementById('font-size');
      this.backBtn = document.getElementById('back-to-library');
      this.zoomMode = document.getElementById('zoom-mode');
      this.focusToggle = document.getElementById('focus-toggle');
      this.chatClearBtn = document.getElementById('chat-clear');
      this.chatInsertPageBtn = document.getElementById('chat-insert-page');
      this.chatEmpty = document.getElementById('chat-empty');
      this._focusHideTimer = null;
      this.floatingBack = document.getElementById('floating-back');
      // Sidebar controls
      this.sidebar = document.getElementById('control-sidebar');
      this.sidePrev = document.getElementById('side-prev');
      this.sideNext = document.getElementById('side-next');
      this.sideSlider = document.getElementById('side-slider');
      this.sideIndicator = document.getElementById('side-page-indicator');
      this.sideZoom = document.getElementById('side-zoom');
      this.sideMode = document.getElementById('side-mode');
  // Removed theme & font selectors from sidebar per simplification
  this.sideTheme = null;
  this.sideFont = null;
  this.sidebarCollapseBtn = document.getElementById('sidebar-collapse');
      this.tagListEl = document.getElementById('tag-list');
      this.newTagInput = document.getElementById('new-tag-input');
      this.addTagBtn = document.getElementById('add-tag-btn');
      this.tags = [];
      // Chat elements detailed
      this.chatMessages = document.getElementById('chat-messages');
      this.chatInput = document.getElementById('chat-input');
      this.chatSend = document.getElementById('chat-send');
      this.chatApiKeyInput = document.getElementById('chat-api-key');
      this.chatSaveKeyBtn = document.getElementById('save-api-key');
      this.chatRemoveKeyBtn = document.getElementById('remove-api-key');
      this.chatToggleKeyBtn = document.getElementById('toggle-api-key');
      this.apiKeyStatus = document.getElementById('api-key-status');
      this.chatManageKeyBtn = document.getElementById('manage-key');
      this.chatKeyStatusPill = document.getElementById('chat-key-status-pill');
      this.chatKeyBrief = document.getElementById('chat-key-brief');
      this.chatApiRow = document.getElementById('chat-apikey-row');
      this.chatModelSel = document.getElementById('chat-model');
      this.chatState = { sending:false, history:[] };
    }

    bindEvents(){
      this.prevBtn.addEventListener('click', ()=> this.gotoPage(this.currentPage-1));
      this.nextBtn.addEventListener('click', ()=> this.gotoPage(this.currentPage+1));
      this.slider.addEventListener('input', ()=> this.gotoPage(parseInt(this.slider.value,10)-1));
      this.viewMode.addEventListener('change', ()=> this.switchMode(this.viewMode.value));
      this.themeMode.addEventListener('change', ()=> this.applyTheme());
      this.fontSizeSel.addEventListener('change', ()=> this.applyFontSize());
      this.backBtn.addEventListener('click', ()=> window.location.href='my_library.html');
  if(this.floatingBack){ this.floatingBack.addEventListener('click', ()=> window.location.href='my_library.html'); }
  if(this.zoomMode){ this.zoomMode.addEventListener('change', ()=> this.applyZoom()); }
      if(this.focusToggle){ this.focusToggle.addEventListener('click', ()=> this.toggleFocusMode()); }
  // Sidebar events
  if(this.sidebar){
    this.sidebar.style.display='flex';
    if(this.sidePrev) this.sidePrev.addEventListener('click', ()=> this.gotoPage(this.currentPage-1));
    if(this.sideNext) this.sideNext.addEventListener('click', ()=> this.gotoPage(this.currentPage+1));
    if(this.sideSlider) this.sideSlider.addEventListener('input', ()=> this.gotoPage(parseInt(this.sideSlider.value,10)-1));
    if(this.sideZoom) this.sideZoom.addEventListener('change', ()=> { if(this.zoomMode){ this.zoomMode.value=this.sideZoom.value; } this.applyZoom(); this.savePreferences(); });
    if(this.sideMode) this.sideMode.addEventListener('change', ()=> { this.viewMode.value=this.sideMode.value; this.switchMode(this.sideMode.value); this.savePreferences(); });
    // Theme & font controls removed from compact sidebar (still available via hidden toolbar if needed)
    if(this.sidebarCollapseBtn){
      this.sidebarCollapseBtn.addEventListener('click', ()=> this.toggleSidebarCollapse());
    }
    if(this.addTagBtn) this.addTagBtn.addEventListener('click', ()=> this.addTag());
    if(this.newTagInput) this.newTagInput.addEventListener('keypress', e=> { if(e.key==='Enter'){ e.preventDefault(); this.addTag(); }});
  }
      document.addEventListener('keydown', (e)=>{
        if(e.key==='f' || e.key==='F'){ this.toggleFocusMode(); }
        if(e.key==='Escape' && document.body.classList.contains('focus-mode')){ this.toggleFocusMode(false); }
        if(e.key==='ArrowRight') this.gotoPage(this.currentPage+1);
        else if(e.key==='ArrowLeft') this.gotoPage(this.currentPage-1);
        else if(e.key==='Home') this.gotoPage(0);
        else if(e.key==='End') this.gotoPage(this.pages.length-1);
      });
      // Reveal toolbar temporarily on mouse move in focus mode
      document.addEventListener('mousemove', ()=>{
        if(!document.body.classList.contains('focus-mode')) return;
        const toolbar = this.toolbar;
        if(toolbar.style.display==='none'){
          toolbar.style.display='flex';
        }
        clearTimeout(this._focusHideTimer);
        this._focusHideTimer = setTimeout(()=>{
          if(document.body.classList.contains('focus-mode')){
            toolbar.style.display='none';
          }
        }, 1800);
      }, { passive:true });
      let resizeT;
      window.addEventListener('resize', ()=>{
        if(this.mode==='paginated' || this.mode==='spread'){
          clearTimeout(resizeT);
          const prevTotal = this.pages.length;
          const prevIndex = this.currentPage;
          resizeT = setTimeout(()=>{
            if(!this.currentRecord) return;
            // Recompute fixed page height so pages stay consistent with new viewport
            this.computePageHeight();
            const decoder = new TextDecoder();
            let text = '';
            if(this.currentRecord.type.startsWith('text') || this.currentRecord.type==='application/json'){
              text = decoder.decode(new Uint8Array(this.currentRecord.blob));
            } else { return; }
            const approxRatio = prevTotal>1 ? (prevIndex / (prevTotal-1)) : 0;
            this.pages = this.paginateLayout(text);
            this.slider.max = this.pages.length;
            const newIndex = Math.min(this.pages.length-1, Math.round(approxRatio * (this.pages.length-1)) );
            this.currentPage = newIndex;
            if(this.mode==='paginated') this.renderPage(); else if(this.mode==='spread') this.renderSpread();
            this.applyZoom();
          }, 220);
        }
        else {
          clearTimeout(resizeT);
          resizeT = setTimeout(()=>{ this.computePageHeight(); this.applyZoom(); }, 160);
        }
      });
      // Chat events
      if(this.chatToggle){ this.chatToggle.addEventListener('click', ()=> this.toggleChat()); }
      if(this.chatClose){ this.chatClose.addEventListener('click', ()=> this.toggleChat(false)); }
      if(this.chatSend){ this.chatSend.addEventListener('click', ()=> this.handleChatSend()); }
      if(this.chatInput){ this.chatInput.addEventListener('keydown', e=>{ if(e.key==='Enter' && (e.ctrlKey||e.metaKey)){ e.preventDefault(); this.handleChatSend(); } }); }
      if(this.chatSaveKeyBtn){ this.chatSaveKeyBtn.addEventListener('click', ()=> this.saveApiKey()); }
  if(this.chatRemoveKeyBtn){ this.chatRemoveKeyBtn.addEventListener('click', ()=> this.removeApiKey()); }
  if(this.chatToggleKeyBtn){ this.chatToggleKeyBtn.addEventListener('click', ()=> this.toggleApiKeyVisibility()); }
  if(this.chatManageKeyBtn){ this.chatManageKeyBtn.addEventListener('click', ()=> this.toggleKeyPanel()); }
      if(this.chatModelSel){
        this.chatModelSel.addEventListener('change', ()=>{
          try { localStorage.setItem('gemini_model', this.chatModelSel.value); } catch(e){}
        });
      }
        if(this.chatClearBtn){ this.chatClearBtn.addEventListener('click', ()=> this.clearChat()); }
        if(this.chatInsertPageBtn){ this.chatInsertPageBtn.addEventListener('click', ()=> this.insertCurrentPage()); }
    }

    async loadRecord(id){
      const rec = await this.db.get(id);
      if(!rec){ this.statusEl.textContent='File not found'; return; }
      // Basic auth guard: ensure user matches
      if(this.user && rec.userEmail && rec.userEmail !== this.user.email){
        this.statusEl.textContent='Access denied for this file.'; return;
      }
      this.currentRecord = rec;
      this.statusEl.style.display='none';
      this.toolbar.style.display='flex';
      this.stage.style.display='flex';
  if(this.sidebar) this.sidebar.style.display='flex';
      this.titleEl.textContent = rec.title;
      // Decide mode defaults
      if(rec.type==='application/pdf'){
        this.mode='pdf';
        this.viewMode.value='pdf';
        this.renderPDF();
      } else if(rec.type.startsWith('text') || rec.type==='application/json'){
        this.mode='paginated';
        await this.prepareTextPages(rec);
        this.restoreProgress();
        this.renderPage();
      } else {
        this.mode='scroll';
        await this.prepareTextFallback(rec);
        this.renderScroll();
        this.restoreProgress();
      }
    // Capture full text for context enrichment
    try { this.fullText = this.pages.join('\n\n'); this.generateInitialSummary(); } catch(e) { this.fullText=''; }
      this.applyTheme();
      this.applyFontSize();
      // Restore tags after pages available
      this.restoreTags();
      this.renderTags();
      this.syncSidebarMeta();
    }

    async prepareTextPages(rec){
      const decoder = new TextDecoder();
      let text = decoder.decode(new Uint8Array(rec.blob));
      // Ensure page height computed before paginating
      this.computePageHeight();
      this.pages = this.paginateLayout(text);
      this.slider.max = this.pages.length;
      this.updateIndicator();
      // Update sidebar controls now that pages count is known
      this.syncSidebarMeta();
    }

    async prepareTextFallback(rec){
      const decoder = new TextDecoder();
      let text = decoder.decode(new Uint8Array(rec.blob));
      this.pages = [text];
      this.slider.max = 1;
      this.updateIndicator();
      this.syncSidebarMeta();
    }

    paginate(text){
      const target = window.innerWidth < 640 ? 1600 : 2600;
      const paragraphs = text.split(/\n{2,}/);
      const pages=[]; let buf='';
      for(const p of paragraphs){
        if((buf+'\n\n'+p).length > target && buf.length>0){ pages.push(buf.trim()); buf=p; }
        else { buf = buf ? buf+'\n\n'+p : p; }
        if(buf.length > target*1.35){ pages.push(buf.trim()); buf=''; }
      }
      if(buf.trim()) pages.push(buf.trim());
      return pages.length?pages:[text];
    }

    paginateLayout(text){
      // Convert text into paragraphs preserving blank lines
      const paras = text.split(/\n{2,}/).map(p=>p.trim()).filter(p=>p.length);
      if(!paras.length) return [text];
      if(!this.pagePixelHeight){ this.computePageHeight(); }
      // Create offscreen measurer
      const measurer = document.createElement('div');
      measurer.style.position='absolute';
      measurer.style.left='-9999px';
      measurer.style.top='0';
  measurer.style.width='920px';
  measurer.style.padding='46px 48px 60px';
      measurer.style.boxSizing='border-box';
      measurer.style.lineHeight='1.55';
      measurer.style.fontSize='.9rem';
      measurer.style.fontFamily='Georgia, serif';
      document.body.appendChild(measurer);
      // Use fixed page pixel height (includes padding already in measurer)
      const pageLimit = this.pagePixelHeight || Math.max(400, window.innerHeight - 220);
      let pages=[]; let currentHTML='';
      for(let i=0;i<paras.length;i++){
        const candidate = currentHTML ? currentHTML + '\n\n' + paras[i] : paras[i];
        // Set measurer content
        measurer.innerHTML = '<div style="white-space:pre-wrap;">' + this.escape(candidate).replace(/\n/g,'<br/>') + '</div>';
        const h = measurer.getBoundingClientRect().height;
        if(h > pageLimit && currentHTML){
          pages.push(currentHTML.trim());
          currentHTML = paras[i];
          measurer.innerHTML = '<div style="white-space:pre-wrap;">' + this.escape(currentHTML).replace(/\n/g,'<br/>') + '</div>';
          // If single paragraph overflows drastically, force split by character slice
          if(measurer.getBoundingClientRect().height > pageLimit){
            const hardSplit = this.splitOversizeParagraph(currentHTML, pageLimit, measurer);
            pages = pages.concat(hardSplit.slice(0,-1));
            currentHTML = hardSplit[hardSplit.length-1];
          }
        } else {
          currentHTML = candidate;
        }
      }
      if(currentHTML.trim()) pages.push(currentHTML.trim());
      measurer.remove();
      return pages.length?pages:[text];
    }

    splitOversizeParagraph(paragraph, viewportHeight, measurer){
      const chunks=[];
      let start=0;
      while(start < paragraph.length){
        let end = Math.min(paragraph.length, start + 1500); // start guess
        let slice = paragraph.slice(start,end);
        measurer.innerHTML = '<div style="white-space:pre-wrap;">' + this.escape(slice).replace(/\n/g,'<br/>') + '</div>';
        // Expand until near limit
        while(end < paragraph.length && measurer.getBoundingClientRect().height < viewportHeight){
          const step = 200;
            end = Math.min(paragraph.length, end + step);
            slice = paragraph.slice(start,end);
            measurer.innerHTML = '<div style="white-space:pre-wrap;">' + this.escape(slice).replace(/\n/g,'<br/>') + '</div>';
        }
        // Back off if overflow
        while(end > start+50 && measurer.getBoundingClientRect().height > viewportHeight){
          end -= 50;
          slice = paragraph.slice(start,end);
          measurer.innerHTML = '<div style="white-space:pre-wrap;">' + this.escape(slice).replace(/\n/g,'<br/>') + '</div>';
        }
        chunks.push(slice.trim());
        start = end;
      }
      return chunks;
    }

    switchMode(mode){
      this.mode = mode;
      if(mode==='paginated'){ this.renderPage(); }
      else if(mode==='scroll'){ this.renderScroll(); }
      else if(mode==='spread'){ this.renderSpread(); }
      else if(mode==='pdf'){ this.renderPDF(); }
      this.saveProgress();
    }

    renderPage(){
      const idx = this.currentPage;
      const safe = this.escape(this.pages[idx]).replace(/\n/g,'<br/>');
      this.pageInner.className='page-area-inner spread';
      this.pageInner.innerHTML = this.wrapA4(`<div class=\"a4-content-flow\"><div style=\"max-width:720px;margin:0 auto;\">${safe}</div></div>`);
      this.updateIndicator();
      this.updateNavState();
      this.applyZoom();
    }

    renderSpread(){
      const idx = this.currentPage;
      const safe = this.escape(this.pages[idx]).replace(/\n/g,'<br/>');
      this.pageInner.className='page-area-inner spread twocol';
      this.pageInner.innerHTML = this.wrapA4(`<div class=\"a4-content-flow\"><div style=\"column-count:2;column-gap:56px;\">${safe}</div></div>`);
      this.updateIndicator();
      this.updateNavState();
      this.applyZoom();
    }

    renderScroll(){
      const joined = this.pages.join('\n\n');
      const safe = this.escape(joined).replace(/\n/g,'<br/>');
      this.pageInner.className='page-area-inner';
      this.pageInner.innerHTML = this.wrapA4(`<div class=\"a4-content-flow\"><div style=\"max-width:820px;margin:0 auto;\">${safe}</div></div>`);
      this.updateIndicator();
      this.updateNavState();
      this.applyZoom();
    }

    async renderPDF(){
      // Lazy load pdf.js from CDN (no network calls instruction? If offline already cached? We'll attempt simple iframe fallback)
      try {
        if(!window.pdfjsLib){
          await this.loadPdfJs();
        }
        if(!window.pdfjsLib){ throw new Error('pdf.js not available'); }
        const blob = new Blob([this.currentRecord.blob], { type: this.currentRecord.type });
        const url = URL.createObjectURL(blob);
        const pdf = await window.pdfjsLib.getDocument(url).promise;
        this.pages = Array.from({length: pdf.numPages}, (_,i)=>`PDF Page ${i+1}`);
        this.slider.max = pdf.numPages;
        const pageNum = this.currentPage+1;
        const page = await pdf.getPage(pageNum);
          // Extract text for this page (lazy populate)
          try {
            if(!this.pdfTextPages) this.pdfTextPages = new Array(pdf.numPages).fill(null);
            if(!this.pdfTextPages[pageNum-1]){
              const txtContent = await page.getTextContent();
              const strings = txtContent.items.map(it=>it.str).join(' ');
              const cleaned = strings.replace(/\s+/g,' ').trim();
              this.pdfTextPages[pageNum-1] = cleaned;
              // Build up fullText incrementally for summaries
              this.fullText = (this.pdfTextPages.filter(Boolean).join('\n')); 
              this.generateInitialSummary();
            }
          } catch(e){ console.warn('PDF text extraction failed', e); }
  // Scale based on desired A4 width (~920px inside padding). Compute scale from original width.
  const baseViewport = await page.getViewport({ scale:1 });
  const targetWidth = 920 - 96; // updated sheet width minus new horizontal padding approx
  const scale = Math.min(2.0, targetWidth / baseViewport.width);
  const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        canvas.className='pdf-page';
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        this.pageInner.className='page-area-inner';
        const pdfInner = document.createElement('div');
        pdfInner.className = 'pdf-canvas-wrapper';
        pdfInner.appendChild(canvas);
        this.pageInner.innerHTML = this.wrapA4(pdfInner.outerHTML);
        URL.revokeObjectURL(url);
        this.updateIndicator();
        this.updateNavState(pdf.numPages);
        this.applyZoom();
      } catch(err){
        console.warn('PDF render failed, fallback iframe', err);
        const blob = new Blob([this.currentRecord.blob], { type: this.currentRecord.type });
        const url = URL.createObjectURL(blob);
        this.pageInner.innerHTML = this.wrapA4(`<embed src=\"${url}\" type=\"application/pdf\" style=\"width:100%;height:100%;border-radius:8px;\" />`);
        this.indicator.textContent = 'PDF Document';
        this.prevBtn.disabled = this.nextBtn.disabled = true;
        this.applyZoom();
      }
    }

    gotoPage(idx){
      if(idx<0 || idx>=this.pages.length) return;
      this.currentPage = idx;
      if(this.mode==='paginated') this.renderPage();
      else if(this.mode==='spread') this.renderSpread();
      else if(this.mode==='scroll') { /* scroll mode uses single flow; maybe jump anchor later */ this.updateIndicator(); this.updateNavState(); }
      else if(this.mode==='pdf') this.renderPDF();
      this.slider.value = (this.currentPage+1).toString();
      this.saveProgress();
      this.updateRollingSummary();
    }

    updateIndicator(){
      if(this.pages.length>1){
        this.indicator.textContent = `Page ${this.currentPage+1} / ${this.pages.length}`;
        this.slider.disabled = false;
      } else {
        this.indicator.textContent = 'Single Page';
        this.slider.disabled = true;
      }
      this.pageFooter.textContent = this.mode === 'pdf' ? 'PDF Mode' : (this.mode==='spread' ? 'Spread Mode' : (this.mode==='scroll' ? 'Scroll Mode' : 'Paginated Mode'));
    }

    updateNavState(totalOverride){
      const total = totalOverride || this.pages.length;
      this.prevBtn.disabled = this.currentPage===0;
      this.nextBtn.disabled = this.currentPage >= total-1;
    }

    applyTheme(){
      const theme = this.themeMode.value;
      // Reset inline styles
      this.pageArea.style.background='';
      this.pageArea.style.color='';
      const sheet = this.pageInner.querySelector('.a4-sheet');
      if(sheet){
        sheet.classList.remove('dark','sepia');
        if(theme==='dark') sheet.classList.add('dark');
        else if(theme==='sepia') sheet.classList.add('sepia');
      }
    }

    applyFontSize(){
      const val = this.fontSizeSel.value;
      let size = '.9rem';
      if(val==='small') size='.8rem';
      else if(val==='large') size='1rem';
      const sheet = this.pageInner.querySelector('.a4-sheet');
      if(sheet) sheet.style.fontSize = size;
      this.applyZoom();
    }

    saveProgress(){
      if(!this.currentRecord) return;
      const key = this.progressKey();
      const data = { mode:this.mode, page:this.currentPage, ts:Date.now() };
      localStorage.setItem(key, JSON.stringify(data));
    }

    restoreProgress(){
      const key = this.progressKey();
      const raw = localStorage.getItem(key);
      if(!raw) return;
      try {
        const data = JSON.parse(raw);
        if(typeof data.page === 'number' && data.page >=0 && data.page < this.pages.length){
          this.currentPage = data.page;
        }
        if(data.mode){ this.mode = data.mode; this.viewMode.value = data.mode; }
      } catch(err){ /* ignore */ }
    }

    progressKey(){
      const user = this.user ? this.user.email : 'anon';
      return `reader_progress_${user}_${this.currentRecord.id}`;
    }

    escape(str){ return str.replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

    wrapA4(innerHTML){
      // Ensure page height fixed; compute if not present
      if(!this.pagePixelHeight){ this.computePageHeight(); }
      return `<div class=\"a4-container\"><div class=\"a4-sheet\" style=\"height:${this.pagePixelHeight}px;\">${innerHTML}</div></div>`;
    }

    applyZoom(){
      if(!this.zoomMode) return;
      const sheet = this.pageInner.querySelector('.a4-sheet');
      if(!sheet) return;
      sheet.style.transformOrigin='top center';
      sheet.style.transform='';
      sheet.style.margin='0 auto';
      const mode = this.zoomMode.value;
      if(mode==='fit'){
        const sidebarWidth = (this.sidebar && this.sidebar.offsetParent !== null) ? (this.sidebar.getBoundingClientRect().width + 40) : 0;
        const availWidth = window.innerWidth - sidebarWidth - 60;
        const availH = window.innerHeight - 160;
        const targetH = this.pagePixelHeight || sheet.getBoundingClientRect().height;
  const targetW = Math.min(920, sheet.getBoundingClientRect().width || 920);
        if(targetH>0){
          const scale = Math.min(1, availH / targetH, availWidth / targetW);
          sheet.style.transform = `scale(${scale.toFixed(3)})`;
        }
      } else {
        const pct = parseInt(mode,10);
        if(!isNaN(pct)){
          sheet.style.transform = `scale(${(pct/100).toFixed(3)})`;
        }
      }
    }

    computePageHeight(){
  // Derive an A4-proportional height based on intended max width (920px) or current viewport
  const MAX_WIDTH = 920;
      const ratio = 297/210; // A4 portrait ratio ~1.414
      const effectiveWidth = Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.95));
      // At very small screens enforce a minimum width for ratio so page isn't absurdly tall
      const baseWidth = Math.max(500, effectiveWidth);
      this.pagePixelHeight = Math.round(baseWidth * ratio);
    }

    toggleFocusMode(force){
      const enable = (typeof force==='boolean') ? force : !document.body.classList.contains('focus-mode');
      if(enable){
        document.body.classList.add('focus-mode');
        // Hide toolbar after small delay to let user know mode changed
        clearTimeout(this._focusHideTimer);
        this._focusHideTimer = setTimeout(()=>{ if(document.body.classList.contains('focus-mode')) this.toolbar.style.display='none'; }, 900);
        this.injectFocusHint();
        // Keep sidebar visible (user wants all control options in focus)
        if(this.sidebar) this.sidebar.style.display='flex';
      } else {
        document.body.classList.remove('focus-mode');
        clearTimeout(this._focusHideTimer);
        this.toolbar.style.display='flex';
        if(this.sidebar) this.sidebar.style.display='flex';
        const hint = document.querySelector('.focus-hint'); if(hint) hint.remove();
      }
      try { localStorage.setItem('reader_focus_mode', enable? '1':'0'); } catch(e){ /* ignore */ }
    }

    injectFocusHint(){
      if(document.querySelector('.focus-hint')) return;
      const hint = document.createElement('div');
      hint.className='focus-hint';
      hint.textContent='Focus Mode (press f or Esc)';
      document.body.appendChild(hint);
    }

    // ----- Sidebar / Tags / Preferences -----
    syncSidebarMeta(){
      if(!this.sidebar) return;
      if(this.sideSlider){ this.sideSlider.max=this.pages.length; this.sideSlider.value=(this.currentPage+1).toString(); }
      if(this.sideIndicator){ this.sideIndicator.textContent = `${this.currentPage+1}/${this.pages.length||1}`; }
      if(this.sideMode){ this.sideMode.value=this.mode; }
      if(this.sideTheme){ this.sideTheme.value=this.themeMode.value; }
      if(this.sideFont){ this.sideFont.value=this.fontSizeSel.value; }
      if(this.sideZoom && this.zoomMode){ this.sideZoom.value=this.zoomMode.value; }
      this.renderTags();
    }

    addTag(){
      if(!this.newTagInput) return;
      const val = (this.newTagInput.value||'').trim();
      if(!val) return;
      if(!this.tags.includes(val)) this.tags.push(val);
      this.newTagInput.value='';
      this.persistTags();
      this.renderTags();
    }

    removeTag(tag){
      this.tags = this.tags.filter(t=>t!==tag);
      this.persistTags();
      this.renderTags();
    }

    renderTags(){
      if(!this.tagListEl) return;
      this.tagListEl.innerHTML = '';
      this.tags.forEach(t=>{
        const pill = document.createElement('span');
        pill.className='tag-pill';
        pill.innerHTML = `${this.escape(t)} <button aria-label="Remove tag ${this.escape(t)}">×</button>`;
        pill.querySelector('button').addEventListener('click', ()=> this.removeTag(t));
        this.tagListEl.appendChild(pill);
      });
    }

    toggleSidebarCollapse(force){
      if(!this.sidebar) return;
      const collapsed = this.sidebar.classList.toggle('collapsed', force === true ? true : (force === false ? false : undefined));
      const btn = this.sidebarCollapseBtn;
      if(this.sidebar.classList.contains('collapsed')){
        this.sidebar.style.width='42px';
        this.sidebar.querySelectorAll('.control-group').forEach(g=> g.style.display='none');
        if(btn){ btn.textContent='⮞'; btn.style.transform='rotate(180deg)'; }
        try { localStorage.setItem('reader_sidebar_collapsed','1'); } catch(e){}
      } else {
        this.sidebar.style.width='';
        this.sidebar.querySelectorAll('.control-group').forEach(g=> g.style.display='');
        if(btn){ btn.textContent='⮜'; btn.style.transform=''; }
        try { localStorage.removeItem('reader_sidebar_collapsed'); } catch(e){}
      }
    }

    persistTags(){
      if(!this.currentRecord) return;
      try { localStorage.setItem('tags_'+this.currentRecord.id, JSON.stringify(this.tags)); } catch(e){ /* ignore */ }
    }

    restoreTags(){
      if(!this.currentRecord) return;
      try { const raw = localStorage.getItem('tags_'+this.currentRecord.id); if(raw){ const arr = JSON.parse(raw); if(Array.isArray(arr)) this.tags=arr.slice(0,100); } } catch(e){ /* ignore */ }
    }

    savePreferences(){
      try { localStorage.setItem('reader_prefs', JSON.stringify({ zoom:this.zoomMode?this.zoomMode.value:null, theme:this.themeMode.value, font:this.fontSizeSel.value, mode:this.mode })); } catch(e){ /* ignore */ }
    }

    restorePreferences(){
      try { const raw = localStorage.getItem('reader_prefs'); if(!raw) return; const p = JSON.parse(raw); if(p.zoom && this.zoomMode) { this.zoomMode.value=p.zoom; if(this.sideZoom) this.sideZoom.value=p.zoom; }
        if(p.theme){ this.themeMode.value=p.theme; if(this.sideTheme) this.sideTheme.value=p.theme; }
        if(p.font){ this.fontSizeSel.value=p.font; if(this.sideFont) this.sideFont.value=p.font; }
        if(p.mode){ this.mode=p.mode; if(this.viewMode) this.viewMode.value=p.mode; if(this.sideMode) this.sideMode.value=p.mode; }
      } catch(e){ /* ignore */ }
    }

    getParam(name){
      const url = new URL(window.location.href);
      return url.searchParams.get(name);
    }

    injectScript(src){
      return new Promise((resolve,reject)=>{
        const s = document.createElement('script');
        s.src = src; s.onload=()=>resolve(); s.onerror=()=>reject();
        document.head.appendChild(s);
      });
    }

    async loadPdfJs(){
      const candidates = [
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js',
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.js',
        'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.js'
      ];
      for(const url of candidates){
        try { await this.injectScript(url); if(window.pdfjsLib) return; } catch(e){ /* try next */ }
      }
    }

    // ----- Chat Feature -----
    initChat(){
      this.chatApiRow = document.getElementById('chat-apikey-row');
      // Load stored key
      try { const k = localStorage.getItem('gemini_api_key'); if(k && this.chatApiKeyInput){ this.chatApiKeyInput.value=k; if(this.chatApiRow) this.chatApiRow.style.display='none'; } } catch(e){ /* ignore */ }
      // Restore minimal history
      try { const raw = localStorage.getItem('reader_chat_history'); if(raw){ const h = JSON.parse(raw); if(Array.isArray(h)) { this.chatState.history = h.slice(-100); this.chatState.history.forEach(msg=> this.renderChatMessage(msg.role,msg.content)); this.updateChatEmptyState(); } } } catch(e){ /* ignore */ }
      this.updateApiKeyStatus();
      // Restore model preference
      if(this.chatModelSel){
        const m = localStorage.getItem('gemini_model');
        if(m && Array.from(this.chatModelSel.options).some(o=>o.value===m)) this.chatModelSel.value=m;
      }
      // Global Esc to close chat if open
      document.addEventListener('keydown', (e)=>{
        if(e.key==='Escape' && this.chatPanel && this.chatPanel.classList.contains('open')){ this.toggleChat(false); }
      });
      // Dynamic retrofit if updated markup not present (ensures visibility of new controls)
      if(this.chatApiRow && !document.getElementById('api-key-status')){
        const status = document.createElement('div');
        status.id='api-key-status';
        status.style.cssText='font-size:.5rem;opacity:.7;margin-top:4px;';
        status.textContent='(Initializing key status...)';
        this.chatApiRow.insertBefore(status, this.chatApiRow.querySelector('.chat-mini-hint'));
        this.apiKeyStatus = status;
        this.updateApiKeyStatus();
      }
      if(this.chatApiRow && this.chatApiKeyInput && !document.getElementById('toggle-api-key')){
        // Wrap input
        const wrapper = document.createElement('div');
        wrapper.style.cssText='position:relative;display:flex;align-items:center;gap:4px;width:100%;';
        this.chatApiKeyInput.parentNode.insertBefore(wrapper, this.chatApiKeyInput);
        wrapper.appendChild(this.chatApiKeyInput);
        const btn = document.createElement('button');
        btn.id='toggle-api-key';
        btn.type='button';
        btn.textContent='👁';
        btn.setAttribute('aria-label','Show or hide API key');
        btn.style.cssText='background:#e9ecef;border:1px solid #ced4da;padding:4px 8px;font-size:.55rem;border-radius:4px;cursor:pointer;';
        wrapper.appendChild(btn);
        this.chatToggleKeyBtn = btn;
        btn.addEventListener('click', ()=> this.toggleApiKeyVisibility());
      }
    }

    toggleChat(force){
      if(!this.chatPanel || !this.chatToggle) return;
      const isOpen = this.chatPanel.classList.contains('open');
      const open = typeof force==='boolean' ? force : !isOpen;
      if(open){
        this.chatPanel.classList.add('open');
        this.chatPanel.setAttribute('aria-hidden','false');
        this.chatToggle.setAttribute('aria-expanded','true');
        this.chatToggle.textContent = 'Chat ◁';
        setTimeout(()=>{ this.chatInput && this.chatInput.focus(); }, 80);
      } else {
        this.chatPanel.classList.remove('open');
        this.chatPanel.setAttribute('aria-hidden','true');
        this.chatToggle.setAttribute('aria-expanded','false');
        this.chatToggle.textContent = 'Chat ▷';
      }
    }

    clearChat(){
      if(!this.chatMessages) return;
      this.chatState.history = [];
      this.chatMessages.innerHTML = '<div class="chat-empty" id="chat-empty">Conversation cleared. Start a new prompt.</div>';
      this.chatEmpty = document.getElementById('chat-empty');
      try { localStorage.removeItem('reader_chat_history'); } catch{}
    }

    insertCurrentPage(){
      if(!this.chatInput) return;
      const ctx = this.buildContext();
      if(!ctx){ return; }
      const snippet = ctx.length>1200? ctx.slice(0,1200)+"…" : ctx;
      this.chatInput.value = (this.chatInput.value? this.chatInput.value + '\n' : '') + snippet;
      this.chatInput.focus();
    }

    updateChatEmptyState(){
      if(!this.chatEmpty) return;
      if(this.chatState.history.length){ this.chatEmpty.style.display='none'; }
      else { this.chatEmpty.style.display='block'; }
    }

    saveApiKey(){
      if(!this.chatApiKeyInput) return;
      const key = this.chatApiKeyInput.value.trim();
      if(!key){ alert('Please enter a key'); return; }
      try { localStorage.setItem('gemini_api_key', key); } catch(e){ /* ignore */ }
      if(this.chatApiRow) this.chatApiRow.style.display='none';
      this.updateApiKeyStatus();
    }

    removeApiKey(){
      try { localStorage.removeItem('gemini_api_key'); } catch(e){}
      if(this.chatApiKeyInput){ this.chatApiKeyInput.value=''; }
      if(this.chatApiRow){ this.chatApiRow.style.display=''; }
      this.renderChatMessage('assistant','API key removed locally. You must enter a new key to continue asking questions.');
      this.updateApiKeyStatus();
    }

    updateApiKeyStatus(){
      if(!this.apiKeyStatus) return;
      const has = !!localStorage.getItem('gemini_api_key');
      this.apiKeyStatus.textContent = has ? 'Key saved (stored only in this browser)' : 'No key saved';
      this.apiKeyStatus.style.color = has ? '#198754' : '#6c757d';
      if(this.chatKeyBrief){
        const k = localStorage.getItem('gemini_api_key') || '';
        this.chatKeyBrief.textContent = has ? (k.slice(0,4)+'…'+k.slice(-3)) : '(none)';
        if(this.chatKeyStatusPill){ this.chatKeyStatusPill.style.background = has ? 'rgba(25,135,84,.25)' : 'rgba(255,255,255,.25)'; }
      }
    }

    toggleKeyPanel(){
      if(!this.chatApiRow) return;
      const visible = this.chatApiRow.style.display !== 'none';
      this.chatApiRow.style.display = visible ? 'none' : '';
      if(!visible && this.chatApiKeyInput){ this.chatApiKeyInput.focus(); }
    }

    toggleApiKeyVisibility(){
      if(!this.chatApiKeyInput) return;
      if(this.chatApiKeyInput.type==='password'){
        this.chatApiKeyInput.type='text';
        if(this.chatToggleKeyBtn) this.chatToggleKeyBtn.textContent='🙈';
      } else {
        this.chatApiKeyInput.type='password';
        if(this.chatToggleKeyBtn) this.chatToggleKeyBtn.textContent='👁';
      }
    }

    buildContext(){
      // Enhanced context strategy:
      // 1. Current page (or visible pages in spread)
      // 2. Rolling summary of prior pages
      // 3. Optional user selection (if selection length > 0)
      // 4. Safety truncation to ~10k chars
      let current = '';
      try {
        if(this.mode==='paginated') current = this.pages[this.currentPage] || '';
        else if(this.mode==='spread') current = [this.pages[this.currentPage], this.pages[this.currentPage+1]].filter(Boolean).join('\n\n');
        else if(this.mode==='scroll') current = (this.pages.join('\n\n')).slice(0,6000);
        else if(this.mode==='pdf') {
          if(this.pdfTextPages && this.pdfTextPages[this.currentPage]){
            current = `PDF page ${this.currentPage+1} text:\n` + this.pdfTextPages[this.currentPage];
          } else {
            current = `PDF page ${this.currentPage+1}. (Text not yet extracted.)`;
          }
        }
      } catch(e){ /* ignore */ }
      let selection = '';
      try {
        const sel = window.getSelection && window.getSelection();
        if(sel && sel.toString().trim().length > 25){ selection = sel.toString().trim().slice(0,3000); }
      } catch(e){ /* ignore */ }
      const summary = this.contextSummary ? `Summary so far: ${this.contextSummary}` : '';
      const parts = [summary, selection?`User selected excerpt:\n${selection}`:'', `Current view:\n${current}`].filter(Boolean);
      let merged = parts.join('\n\n');
      if(merged.length>10000) merged = merged.slice(-10000); // keep tail (recent)
      return merged;
    }

    generateInitialSummary(){
      // Simple heuristic summary: first 1200 chars + page count metadata
      if(!this.fullText) { this.contextSummary=''; return; }
      const first = this.fullText.slice(0,1200).replace(/\s+/g,' ').trim();
      this.contextSummary = `Document length ~${this.fullText.length} chars, pages: ${this.pages.length}. Intro snippet: ${first}`;
    }

    updateRollingSummary(){
      // Called on page change to append brief gist every N pages
      if(!this.fullText || !this.pages.length) return;
      const idx = this.currentPage;
      if(idx % 5 !== 0) return; // update every 5 pages for efficiency
      try {
        const sliceStart = Math.max(0, idx-2);
        const windowText = this.pages.slice(sliceStart, idx+1).join(' ').slice(0,800);
        const cleaned = windowText.replace(/\s+/g,' ').trim();
        if(!cleaned) return;
        const addition = `P${sliceStart+1}-${idx+1}: ${cleaned}`;
        const existing = this.contextSummary || '';
        const joined = existing + '\n' + addition;
        this.contextSummary = joined.split('\n').slice(-30).join('\n'); // keep last 30 blocks
        try { localStorage.setItem('doc_summary_cache', this.contextSummary); } catch(e){/* ignore */}
      } catch(e){/* ignore */}
    }

    async handleChatSend(){
      if(!this.chatInput || !this.chatSend) return;
      const question = this.chatInput.value.trim();
      if(!question) return;
      if(this.chatState.sending) return;
      this.chatState.sending = true;
      this.chatSend.disabled = true; this.chatSend.textContent='...';
      this.renderChatMessage('user', question);
      this.chatInput.value='';
      const apiKey = (this.chatApiKeyInput && this.chatApiKeyInput.value.trim()) || localStorage.getItem('gemini_api_key');
      if(!apiKey){ this.renderChatMessage('error','Missing Gemini API key. Enter and save your key.'); this.chatState.sending=false; this.chatSend.disabled=false; this.chatSend.textContent='Send'; return; }
      const context = this.buildContext();
      // Retry logic (simple): attempt up to 2 times on network errors (>=500 or fetch failure)
      let attempts=0; let answered=false; let lastErr=null;
      while(attempts<2 && !answered){
        try {
          attempts++;
          const answer = await this.callGemini(apiKey, question, context);
          this.renderChatMessage('assistant', answer || '(No answer)');
          answered=true;
        } catch(err){
          lastErr=err;
          if(!(err && /5\d{2}/.test(err.message||''))){ break; }
        }
      }
      if(!answered){
        console.warn('Chat error', lastErr);
        if(lastErr && lastErr.message && /404/.test(lastErr.message)){
          this.renderChatMessage('error','Gemini endpoint returned 404. Double-check model name or that your key has access.');
        } else if(lastErr){
          this.renderChatMessage('error','Error: '+ (lastErr.message||'failed'));
        } else {
          this.renderChatMessage('error','Unknown error.');
        }
      }
      this.chatState.sending=false; this.chatSend.disabled=false; this.chatSend.textContent='Send';
      this.persistChatHistory();
      this.updateChatEmptyState();
    }

    renderChatMessage(role, content){
      if(!this.chatMessages) return;
      const div = document.createElement('div');
      let cls='assistant';
      if(role==='user') cls='user'; else if(role==='error') cls='error';
      div.className='chat-msg '+cls;
      div.textContent=content;
      this.chatMessages.appendChild(div);
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
      this.chatState.history.push({ role, content });
    }

    persistChatHistory(){
      try { localStorage.setItem('reader_chat_history', JSON.stringify(this.chatState.history.slice(-100))); } catch(e){ /* ignore */ }
    }

    async callGemini(apiKey, question, context){
      if(!this._geminiClient){ this._geminiClient = new (window.GeminiClient||function(){ throw new Error('GeminiClient missing'); }) (apiKey); }
      else { this._geminiClient.setApiKey(apiKey); }
      // Normalize stored legacy model values like gemini-2.5-flash-latest
      let selModel = (this.chatModelSel && this.chatModelSel.value) || 'gemini-2.5-flash';
      if(selModel.endsWith('-latest')) selModel = selModel.replace('-latest','');
      return await this._geminiClient.ask(question, context, { model: selModel });
    }
  }

  window.readerApp = new ReaderApp();
})();