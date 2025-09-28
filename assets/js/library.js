// Library management (client-side IndexedDB) for Book Shelf Explorer
// Supports: upload (multiple), categorization, search, offline access, preview metadata

(function(){
  const DB_NAME = 'book_shelf_explorer_library';
  const DB_VERSION = 1;
  const STORE = 'files';
  // Removed fixed per-file (10MB) and soft total (50MB) limits: now display dynamic usage.
  const MAX_BYTES = Infinity; // No artificial per-file cap
  const TOTAL_SOFT_LIMIT = Infinity; // No soft limit; retained variable names for minimal refactor impact

  class LibraryDB {
    constructor(){
      this.dbPromise = this.open();
    }

    open(){
      return new Promise((resolve, reject)=>{
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e)=>{
          const db = e.target.result;
          if(!db.objectStoreNames.contains(STORE)){
            const store = db.createObjectStore(STORE, { keyPath: 'id' });
            store.createIndex('by_user', 'userEmail');
            store.createIndex('by_category', 'category');
            store.createIndex('by_type', 'type');
            store.createIndex('by_added', 'addedAt');
          }
        };
        req.onsuccess = ()=> resolve(req.result);
        req.onerror = ()=> reject(req.error);
      });
    }

    async put(fileRecord){
      const db = await this.dbPromise;
      return new Promise((resolve,reject)=>{
        const tx = db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put(fileRecord);
        tx.oncomplete = ()=> resolve(fileRecord);
        tx.onerror = ()=> reject(tx.error);
      });
    }

    async getAllByUser(userEmail){
      const db = await this.dbPromise;
      return new Promise((resolve,reject)=>{
        const tx = db.transaction(STORE,'readonly');
        const idx = tx.objectStore(STORE).index('by_user');
        const req = idx.getAll(IDBKeyRange.only(userEmail));
        req.onsuccess = ()=> resolve(req.result || []);
        req.onerror = ()=> reject(req.error);
      });
    }

    async delete(id){
      const db = await this.dbPromise;
      return new Promise((resolve,reject)=>{
        const tx = db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = ()=> resolve();
        tx.onerror = ()=> reject(tx.error);
      });
    }
  }

  class LibraryManager {
    constructor(){
      this.db = new LibraryDB();
      this.currentUser = window.loginManager && window.loginManager.currentUser;
      // Upload queue state
      this.uploadQueue = [];
      this.uploadActive = false;
      this.uploadCancelled = false;
      // Pending (pre-queue) staging
      this.pendingFiles = [];
      document.addEventListener('DOMContentLoaded', ()=> this.init());
    }

    init(){
      this.currentUser = window.loginManager && window.loginManager.currentUser;
      this.cacheDom();
      this.bindEvents();
      if(this.listEl && this.currentUser){
        this.refreshList();
      }
    }

    cacheDom(){
      this.uploadInput = document.getElementById('library-files');
      this.categoryInput = document.getElementById('library-category');
      this.newCategoryInput = document.getElementById('library-new-category');
      this.listEl = document.getElementById('library-items');
      this.searchInput = document.getElementById('library-search');
      this.createCategoryBtn = document.getElementById('create-category-btn');
      // New for tagging
      this.tagsInput = document.getElementById('library-tags');
      this.tagFiltersEl = document.getElementById('library-tag-filters');
      this.activeTag = null;
      // Export/Import
      this.exportMetaBtn = document.getElementById('export-meta-btn');
      this.exportFullBtn = document.getElementById('export-full-btn');
      this.importInput = document.getElementById('import-json-input');
      this.importStatus = document.getElementById('import-status');
      // Quota display
      this.quotaBar = document.getElementById('library-quota-bar');
      this.quotaText = document.getElementById('library-quota-text');
      // Upload progress elements
      this.uploadProgressWrap = document.getElementById('upload-progress-wrapper');
      this.uploadProgressBar = document.getElementById('upload-progress-bar');
      this.uploadProgressText = document.getElementById('upload-progress-text');
      this.uploadCancelBtn = document.getElementById('upload-cancel-btn');
      // Pending UI
      this.pendingWrapper = document.getElementById('pending-files-wrapper');
      this.pendingList = document.getElementById('pending-file-list');
      this.pendingSummary = document.getElementById('pending-summary');
      this.startUploadBtn = document.getElementById('start-upload-btn');
      this.clearPendingBtn = document.getElementById('clear-pending-btn');
      this.triggerFileBtn = document.getElementById('trigger-file-btn');
    }

    bindEvents(){
      if(this.uploadInput){
        this.uploadInput.addEventListener('change',(e)=> this.stagePending(e.target.files));
      }
      if(this.searchInput){
        // Debounce search
        let t;
        this.searchInput.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=> this.filterResults(), 220); });
      }
      if(this.createCategoryBtn){
        this.createCategoryBtn.addEventListener('click', ()=> this.addCategoryFromInput());
      }
      if(this.exportMetaBtn){
        this.exportMetaBtn.addEventListener('click', ()=> this.handleExport(false));
      }
      if(this.exportFullBtn){
        this.exportFullBtn.addEventListener('click', ()=> this.handleExport(true));
      }
      if(this.importInput){
        this.importInput.addEventListener('change', (e)=> this.handleImport(e.target.files));
      }
      if(this.uploadCancelBtn){
        this.uploadCancelBtn.addEventListener('click', ()=> this.cancelUploads());
      }
      if(this.startUploadBtn){
        this.startUploadBtn.addEventListener('click', ()=> this.commitPending());
      }
      if(this.clearPendingBtn){
        this.clearPendingBtn.addEventListener('click', ()=> { this.pendingFiles=[]; this.renderPending(); });
      }
      if(this.triggerFileBtn){
        this.triggerFileBtn.addEventListener('click', ()=> this.uploadInput && this.uploadInput.click());
      }
    }

    stagePending(fileList){
      const files = Array.from(fileList||[]);
      if(!files.length) return;
      // No size filtering now; accept all and rely on underlying browser quota.
      files.forEach(f=> this.pendingFiles.push(f));
      if(this.uploadInput) this.uploadInput.value='';
      this.renderPending();
    }

    renderPending(){
      if(!this.pendingList || !this.pendingWrapper) return;
      if(!this.pendingFiles.length){
        this.pendingWrapper.style.display='none';
        if(this.startUploadBtn) this.startUploadBtn.disabled = true;
        if(this.pendingSummary) this.pendingSummary.textContent='';
        return;
      }
      this.pendingWrapper.style.display='block';
      // Build list items
      this.pendingList.innerHTML = this.pendingFiles.map((f,idx)=>{
        return `<li data-idx="${idx}" style="display:flex;align-items:center;gap:10px;background:#f8f9fb;border:1px solid #e2e6ef;padding:6px 10px;border-radius:8px;font-size:.6rem;">
          <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${this.escapeHTML(f.name)}">${this.escapeHTML(f.name)}</span>
          <span style="color:#666;">${this.bytesToSize(f.size)}</span>
          <button type="button" class="btn btn-outline btn-sm remove-pending" data-remove="${idx}" style="font-size:.55rem;padding:3px 6px;">✕</button>
        </li>`;
      }).join('');
      // Wire remove buttons
      this.pendingList.querySelectorAll('.remove-pending').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const i = parseInt(btn.dataset.remove,10);
          this.pendingFiles.splice(i,1);
          this.renderPending();
        });
      });
      const totalBytes = this.pendingFiles.reduce((s,f)=> s+f.size,0);
      if(this.pendingSummary){
        this.pendingSummary.textContent = `${this.pendingFiles.length} file(s) pending • ${this.bytesToSize(totalBytes)}`;
      }
      if(this.startUploadBtn) this.startUploadBtn.disabled = false;
    }

    commitPending(){
      if(!this.pendingFiles.length) return;
      // Move staged files into upload queue and clear staging
      this.pendingFiles.forEach(f=> this.uploadQueue.push(f));
      this.pendingFiles = [];
      this.renderPending();
      this.processUploadQueue();
    }

    enqueueFiles(fileList){ /* legacy stub not used */ }

    cancelUploads(){
      if(!this.uploadActive) return;
      this.uploadCancelled = true;
      this.updateUploadProgress(0,0,false,'Cancelling…');
    }

    async processUploadQueue(){
      if(this.uploadActive) return;
      if(!this.uploadQueue.length) return;
      this.uploadActive = true;
      this.uploadCancelled = false;
      if(this.uploadProgressWrap) this.uploadProgressWrap.style.display='block';
      const tagsRaw = (this.tagsInput && this.tagsInput.value) || '';
      const parsedTags = tagsRaw.split(',').map(t=>t.trim().toLowerCase()).filter(t=>t).filter((v,i,a)=>a.indexOf(v)===i);
      const startingUsage = await this.calculateCurrentUsage();
      let accumulatedNewBytes = 0;
      let processed = 0;
      const total = this.uploadQueue.length;
      for(let i=0;i<total;i++){
        if(this.uploadCancelled) break;
        const file = this.uploadQueue[i];
        // No artificial per-file or soft total guard; rely on quota errors.
        // Read file sequentially (arrayBuffer is already atomic but we can show progress with FileReader for large files)
        const buffer = await this.readFileAsArrayBufferWithProgress(file, (pct)=>{
          this.updateUploadProgress(i, total, false, `Reading ${file.name} (${pct}%)`);
        });
        if(this.uploadCancelled) break;
        const record = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: file.name,
          category: this.categoryInput && this.categoryInput.value || 'Uncategorized',
          tags: parsedTags,
          type: file.type || 'application/octet-stream',
          size: file.size,
          addedAt: new Date().toISOString(),
          userEmail: this.currentUser.email,
          blob: buffer
        };
        try {
          await this.db.put(record);
        } catch(err){
          console.warn('Put failed (likely quota)', err);
          alert(`Storage full or write failed while storing "${file.name}". Remaining files skipped.`);
          break;
        }
        accumulatedNewBytes += file.size;
        processed++;
        this.updateUploadProgress(i+1, total, false, `Stored ${file.name}`);
      }
      // Cleanup
      this.uploadQueue = [];
      this.uploadActive = false;
      if(this.tagsInput) this.tagsInput.value='';
      if(this.uploadCancelled){
        this.updateUploadProgress(0,0,false,'Upload cancelled');
        setTimeout(()=> this.hideUploadProgress(), 2000);
      } else {
        this.updateUploadProgress(1,1,false,'All uploads complete');
        setTimeout(()=> this.hideUploadProgress(), 1600);
      }
      if(this.listEl && this.currentUser) this.refreshList();
    }

    hideUploadProgress(){
      if(this.uploadProgressWrap) this.uploadProgressWrap.style.display='none';
    }

    updateUploadProgress(done, total, appendQueue=false, message){
      if(!this.uploadProgressWrap || !this.uploadProgressBar || !this.uploadProgressText) return;
      if(appendQueue){
        // If queue grows, reflect total
        total = this.uploadQueue.length;
      }
      let pct = total>0 ? Math.min(100, Math.round((done/total)*100)) : 0;
      if(!this.uploadActive && (message||'').includes('complete')) pct=100;
      this.uploadProgressBar.style.width = pct + '%';
      this.uploadProgressBar.style.background = pct===100 ? 'linear-gradient(90deg,#20c997,#0d6efd)' : 'linear-gradient(90deg,#0d6efd,#20c997)';
      this.uploadProgressText.textContent = message || (appendQueue ? `Queued ${total} file(s)…` : `Uploading ${done}/${total}`);
    }

    readFileAsArrayBufferWithProgress(file, onProgress){
      return new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onerror = ()=> reject(reader.error);
        reader.onabort = ()=> reject(new Error('aborted'));
        reader.onload = ()=> resolve(reader.result);
        reader.onprogress = (e)=>{
          if(e.lengthComputable && onProgress){
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }

    // handleFiles replaced by enqueueFiles + processUploadQueue

    async refreshList(){
      const items = await this.db.getAllByUser(this.currentUser.email);
      this.allItems = items.sort((a,b)=> new Date(b.addedAt)-new Date(a.addedAt));
      this.renderActiveTagFilters();
      this.renderList(this.allItems);
      this.updateQuotaDisplay();
    }

    bytesToSize(bytes){
      const sizes=['B','KB','MB','GB'];
      if(bytes===0) return '0 B';
      const i = Math.floor(Math.log(bytes)/Math.log(1024));
      return (bytes/Math.pow(1024,i)).toFixed(1)+' '+sizes[i];
    }

    renderList(items){
      if(!this.listEl) return;
      if(items.length===0){
        this.listEl.innerHTML = '<p style="text-align:center;color:var(--text-light);">No files uploaded yet.</p>';
        return;
      }
      this.listEl.innerHTML = items.map(item=> this.renderCard(item)).join('');
      this.attachCardEvents();
    }

    renderCard(item){
      const readableType = item.type.split('/')[0];
      const q = (this.searchInput && this.searchInput.value.trim().toLowerCase()) || '';
      const highlight = (text)=>{
        if(!q) return this.escapeHTML(text);
        const safe = q.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        return this.escapeHTML(text).replace(new RegExp('(' + safe + ')','ig'), '<mark style="background:#ffec99;color:#222;border-radius:3px;">$1</mark>');
      };
      const titleHTML = highlight(item.title);
      const categoryHTML = highlight(item.category||'');
  const tagsHTML = (item.tags && item.tags.length) ? `<div class="tags" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${item.tags.map(t=>`<span class="tag-badge" data-tag="${this.escapeHTML(t)}" style="background:#e2e8ff;border:1px solid #6c7ab7;color:#1d2a55;padding:3px 8px;border-radius:12px;font-size:.55rem;cursor:pointer;letter-spacing:.5px;line-height:1.2;outline:0;" tabindex="0">${highlight(t)}</span>`).join('')}</div>` : '';
      return `<div class="book-card" data-id="${item.id}" data-type="${readableType}" data-category="${item.category}">
        <div style="font-size:2rem;">${this.iconForType(readableType)}</div>
        <h3>${titleHTML}</h3>
        <p style="font-size:.75rem;">${categoryHTML} • ${this.bytesToSize(item.size)} • ${new Date(item.addedAt).toLocaleDateString()}</p>
        ${tagsHTML}
        <div style="display:flex;justify-content:center;gap:8px;margin-top:10px;">
          <button class="btn btn-secondary btn-preview" data-id="${item.id}" style="padding:6px 10px;font-size:.7rem;">Preview</button>
          <button class="btn btn-outline btn-download" data-id="${item.id}" style="padding:6px 10px;font-size:.7rem;">Download</button>
          <button class="btn btn-outline btn-delete" data-id="${item.id}" style="padding:6px 10px;font-size:.7rem;color:#c33;border-color:#c33;">Delete</button>
        </div>
      </div>`;
    }

    iconForType(type){
      switch(type){
        case 'image': return '🖼️';
        case 'audio': return '🎧';
        case 'video': return '🎬';
        case 'text': return '📄';
        case 'application': return '📦';
        default: return '📁';
      }
    }

    async attachCardEvents(){
      this.listEl.querySelectorAll('.btn-download').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const id = btn.dataset.id;
            const rec = this.allItems.find(i=>i.id===id);
            if(!rec) return;
            const blob = new Blob([rec.blob], { type: rec.type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = rec.title;
            a.click();
            setTimeout(()=> URL.revokeObjectURL(url), 2000);
        });
      });
      this.listEl.querySelectorAll('.btn-delete').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const id = btn.dataset.id;
          if(confirm('Delete this file?')){
            await this.db.delete(id);
            this.refreshList();
          }
        });
      });
      this.listEl.querySelectorAll('.btn-preview').forEach(btn=>{
        btn.addEventListener('click', ()=> {
          const id = btn.dataset.id;
          window.location.href = `reader.html?id=${encodeURIComponent(id)}`;
        });
      });
      // Tag click -> toggle filter
      this.listEl.querySelectorAll('.tag-badge').forEach(badge=>{
        badge.addEventListener('click', ()=>{
          const tag = badge.dataset.tag;
          if(this.activeTag === tag){
            this.activeTag = null;
          } else {
            this.activeTag = tag;
          }
          this.renderActiveTagFilters();
          this.applyFilters();
        });
      });
    }

    filterResults(){
      const q = (this.searchInput && this.searchInput.value.trim().toLowerCase()) || '';
      let results = [...(this.allItems||[])];
      if(q){
        results = results.filter(item=> item.title.toLowerCase().includes(q) || (item.category||'').toLowerCase().includes(q) || (item.tags||[]).some(t=> t.includes(q)));
      }
      if(this.activeTag){
        results = results.filter(item=> (item.tags||[]).includes(this.activeTag));
      }
      this.renderList(results);
    }

    applyFilters(){
      this.filterResults();
    }

    renderActiveTagFilters(){
      if(!this.tagFiltersEl){ return; }
      const uniqueTags = Array.from(new Set((this.allItems||[]).flatMap(i=> i.tags || []))).sort();
      if(uniqueTags.length===0){
        this.tagFiltersEl.innerHTML='';
        return;
      }
  const chips = uniqueTags.map(t=>`<button data-tag="${this.escapeHTML(t)}" class="tag-filter-chip" style="border:1px solid ${this.activeTag===t?'#0b5ed7':'#6c7ab7'};background:${this.activeTag===t?'#0d6efd':'#eef3ff'};color:${this.activeTag===t?'#fff':'#13294b'};padding:5px 11px;border-radius:18px;font-size:.6rem;cursor:pointer;line-height:1.1;outline:0;box-shadow:${this.activeTag===t?'0 0 0 2px rgba(13,110,253,.3)':'none'};" tabindex="0">${this.escapeHTML(t)}</button>`).join('');
      const clearBtn = this.activeTag ? `<button data-clear="1" style="background:#eee;border:1px solid #ccc;padding:4px 10px;border-radius:16px;font-size:.6rem;cursor:pointer;">Clear Tag</button>`: '';
      this.tagFiltersEl.innerHTML = chips + clearBtn;
      this.tagFiltersEl.querySelectorAll('[data-tag]').forEach(btn=> btn.addEventListener('click', ()=>{ this.activeTag = btn.dataset.tag===this.activeTag ? null : btn.dataset.tag; this.renderActiveTagFilters(); this.applyFilters(); }));
      const clear = this.tagFiltersEl.querySelector('[data-clear]');
      if(clear) clear.addEventListener('click', ()=>{ this.activeTag=null; this.renderActiveTagFilters(); this.applyFilters(); });
    }

    addCategoryFromInput(){
      if(!this.newCategoryInput || !this.categoryInput) return;
      const val = this.newCategoryInput.value.trim();
      if(!val) return;
      const option = document.createElement('option');
      option.value = val;
      option.textContent = val;
      this.categoryInput.appendChild(option);
      this.categoryInput.value = val;
      this.newCategoryInput.value='';
    }

    async calculateCurrentUsage(){
      if(!this.currentUser) return 0;
      const items = this.allItems || await this.db.getAllByUser(this.currentUser.email);
      return items.reduce((sum,i)=> sum + (i.size||0), 0);
    }

    async updateQuotaDisplay(){
      if(!this.quotaBar || !this.quotaText || !this.currentUser) return;
      const used = await this.calculateCurrentUsage();
      let quotaTotal = null;
      try {
        if(navigator.storage && navigator.storage.estimate){
          const est = await navigator.storage.estimate();
            if(est && est.quota){ quotaTotal = est.quota; }
        }
      } catch(err){ /* ignore */ }
      if(quotaTotal){
        const pct = Math.min(100, (used / quotaTotal) * 100);
        this.quotaBar.style.width = pct + '%';
        this.quotaBar.style.background = pct > 90 ? '#dc3545' : pct > 75 ? '#fd7e14' : '#198754';
        this.quotaText.textContent = `${this.bytesToSize(used)} of ~${this.bytesToSize(quotaTotal)} (${pct.toFixed(0)}%)`;
        const pb = document.getElementById('quota-progress');
        if(pb){
          pb.setAttribute('aria-valuenow', pct.toFixed(0));
          pb.setAttribute('aria-valuetext', `${pct.toFixed(0)}% of estimated quota`);
        }
      } else {
        // Fallback: only show used
        this.quotaBar.style.width = '100%';
        this.quotaBar.style.background = '#198754';
        this.quotaText.textContent = `${this.bytesToSize(used)} stored (browser quota unknown)`;
        const pb = document.getElementById('quota-progress');
        if(pb){
          pb.setAttribute('aria-valuenow', '100');
          pb.setAttribute('aria-valuetext', `Quota estimate unavailable`);
        }
      }
    }

    openPreview(id){
      const rec = this.allItems.find(i=>i.id===id);
      if(!rec){ return; }
      const type = rec.type.split('/')[0];
      let content = '';
      // Route text-like types to book reader
      if(type==='text' || rec.type==='application/json'){
        this.openBookReader(rec);
        return;
      } else if(type==='image'){
        const blob = new Blob([rec.blob], { type: rec.type });
        const url = URL.createObjectURL(blob);
        content = `<img src="${url}" style="max-width:100%;border-radius:8px;" />`;
      } else if(type==='audio'){
        const blob = new Blob([rec.blob], { type: rec.type });
        const url = URL.createObjectURL(blob);
        content = `<audio controls style="width:100%"><source src="${url}" type="${rec.type}">Your browser does not support audio.</audio>`;
      } else if(type==='text' || rec.type==='application/json'){
        const decoder = new TextDecoder();
        let text = decoder.decode(new Uint8Array(rec.blob));
        text = this.escapeHTML(text).slice(0,5000);
        content = `<pre style="white-space:pre-wrap;max-height:60vh;overflow:auto;background:#f8f8f8;padding:14px;border-radius:8px;">${text}</pre>`;
      } else if(rec.type==='application/pdf'){
        const blob = new Blob([rec.blob], { type: rec.type });
        const url = URL.createObjectURL(blob);
        content = `<embed src="${url}" type="application/pdf" style="width:100%;height:70vh;border-radius:8px;" />`;
      } else {
        content = '<p>No inline preview available. Use Download.</p>';
      }
      this.showModal(content, rec.title);

      // After modal render, attach progress tracking for scrollable content
      setTimeout(()=>{
        try {
          const modal = document.getElementById('library-modal');
          if(!modal) return;
          const keyBase = `bse_progress_${rec.id}_${this.currentUser ? this.currentUser.email : 'anon'}`;
          // Text/JSON uses <pre>; PDF uses <embed>
            if(type==='text' || rec.type==='application/json'){
              const pre = modal.querySelector('pre');
              if(pre){
                // Restore
                const saved = localStorage.getItem(keyBase+'_scroll');
                if(saved){ pre.scrollTop = parseInt(saved,10); }
                pre.addEventListener('scroll', this.throttle(()=>{
                  localStorage.setItem(keyBase+'_scroll', pre.scrollTop.toString());
                }, 400));
              }
            } else if(rec.type==='application/pdf'){
              const embed = modal.querySelector('embed');
              if(embed){
                // For PDFs we approximate progress by parent scroll
                const shell = modal.querySelector('.modal-shell');
                if(shell){
                  const saved = localStorage.getItem(keyBase+'_scroll');
                  if(saved){ shell.scrollTop = parseInt(saved,10); }
                  shell.addEventListener('scroll', this.throttle(()=>{
                    localStorage.setItem(keyBase+'_scroll', shell.scrollTop.toString());
                  }, 500));
                }
              }
            }
        } catch(err){ console.warn('Progress attach failed', err); }
      }, 60);
    }

    openBookReader(rec){
      try {
        const decoder = new TextDecoder();
        let text = decoder.decode(new Uint8Array(rec.blob));
        // Basic sanitation (escape later per page)
        // Build pages
        const pages = this.paginateText(text);
        const keyBase = `bse_progress_${rec.id}_${this.currentUser ? this.currentUser.email : 'anon'}`;
        let current = 0;
        const saved = localStorage.getItem(keyBase+'_page');
        if(saved){ const n = parseInt(saved,10); if(!isNaN(n) && n>=0 && n < pages.length) current = n; }
        const bodyHTML = `<div class="book-reader" style="display:flex;flex-direction:column;gap:14px;min-height:60vh;">
          <div class="book-controls-top" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">
            <div id="book-page-indicator" style="font-size:.7rem;font-weight:600;letter-spacing:.5px;">Page 1 / ${pages.length}</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button type="button" class="btn btn-outline btn-sm" id="book-prev-btn" disabled style="font-size:.55rem;padding:4px 8px;">◀ Prev</button>
              <button type="button" class="btn btn-outline btn-sm" id="book-next-btn" style="font-size:.55rem;padding:4px 8px;">Next ▶</button>
            </div>
          </div>
          <div class="book-page-wrapper" style="flex:1;overflow:auto;background:#fdfcf9;border:1px solid #e3d9c9;padding:26px 28px;line-height:1.5;font-size:.85rem;border-radius:14px;box-shadow:inset 0 0 6px rgba(0,0,0,.05);position:relative;">
            <div id="book-page-content" style="column-count:1;column-gap:40px;">
            </div>
            <div style="position:absolute;inset:auto 18px 12px auto;font-size:.55rem;color:#9a8f7d;">Book Mode</div>
          </div>
          <div class="book-controls-bottom" style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;">
            <div style="flex:1;display:flex;align-items:center;gap:6px;">
              <input type="range" id="book-page-slider" min="1" max="${pages.length}" value="${current+1}" style="flex:1;" />
            </div>
            <div style="display:flex;gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="book-scroll-mode" style="font-size:.55rem;padding:4px 10px;">Switch to Scroll Mode</button>
            </div>
          </div>
        </div>`;
        this.showModal(bodyHTML, rec.title);
        const modal = document.getElementById('library-modal');
        if(!modal) return;
        const pageContentEl = modal.querySelector('#book-page-content');
        const prevBtn = modal.querySelector('#book-prev-btn');
        const nextBtn = modal.querySelector('#book-next-btn');
        const indicator = modal.querySelector('#book-page-indicator');
        const slider = modal.querySelector('#book-page-slider');
        const scrollToggle = modal.querySelector('#book-scroll-mode');
        const renderPage = (idx)=>{
          current = idx;
          const safeHTML = this.escapeHTML(pages[idx]).replace(/\n/g,'<br/>');
          pageContentEl.innerHTML = `<div style="max-width:720px;margin:0 auto;">${safeHTML}</div>`;
          indicator.textContent = `Page ${idx+1} / ${pages.length}`;
          prevBtn.disabled = idx===0;
            nextBtn.disabled = idx===pages.length-1;
          if(slider) slider.value = (idx+1).toString();
          localStorage.setItem(keyBase+'_page', idx.toString());
        };
        prevBtn.addEventListener('click', ()=>{ if(current>0){ renderPage(current-1); } });
        nextBtn.addEventListener('click', ()=>{ if(current<pages.length-1){ renderPage(current+1); } });
        slider.addEventListener('input', ()=>{ const v = parseInt(slider.value,10)-1; if(!isNaN(v)) renderPage(v); });
        scrollToggle.addEventListener('click', ()=>{
          // Switch to original scroll mode preview (reuse older logic)
          const plain = this.escapeHTML(text).slice(0,200000); // safety cutoff
          const scrollHTML = `<div style=\"display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;\">\n            <div style=\"font-size:.7rem;font-weight:600;\">Scroll Mode (saved page ${current+1}/${pages.length})</div>\n            <button type=\"button\" class=\"btn btn-outline btn-sm\" id=\"book-paginated-mode\" style=\"font-size:.55rem;padding:4px 8px;\">Switch to Paginated</button>\n          </div>\n          <pre style=\"white-space:pre-wrap;max-height:60vh;overflow:auto;background:#f8f8f8;padding:14px;border-radius:8px;font-size:.8rem;line-height:1.4;\">${plain}</pre>`;
          this.showModal(scrollHTML, rec.title);
          setTimeout(()=>{
            const backBtn = document.getElementById('library-modal').querySelector('#book-paginated-mode');
            if(backBtn){
              backBtn.addEventListener('click', ()=> this.openBookReader(rec));
            }
          },40);
        });
        // Keyboard navigation
        const keyHandler = (e)=>{
          if(e.key==='ArrowRight'){ if(current<pages.length-1){ renderPage(current+1); } }
          else if(e.key==='ArrowLeft'){ if(current>0){ renderPage(current-1); } }
          else if(e.key==='Home'){ renderPage(0); }
          else if(e.key==='End'){ renderPage(pages.length-1); }
        };
        document.addEventListener('keydown', keyHandler, { passive:true });
        // Remove listener when modal closes (hook close button)
        const closeBtn = modal.querySelector('.modal-close');
        const backdrop = modal.querySelector('.modal-backdrop');
        const cleanup = ()=> document.removeEventListener('keydown', keyHandler);
        closeBtn && closeBtn.addEventListener('click', cleanup, { once:true });
        backdrop && backdrop.addEventListener('click', cleanup, { once:true });
        renderPage(current);
      } catch(err){
        console.warn('Book reader failed, fallback to original preview', err);
        // Fallback to original text preview logic
        const decoder = new TextDecoder();
        let text = decoder.decode(new Uint8Array(rec.blob));
        text = this.escapeHTML(text).slice(0,5000);
        const content = `<pre style="white-space:pre-wrap;max-height:60vh;overflow:auto;background:#f8f8f8;padding:14px;border-radius:8px;">${text}</pre>`;
        this.showModal(content, rec.title);
      }
    }

    paginateText(text){
      // Simple heuristic pagination by character buckets respecting paragraph boundaries
      const target = window.innerWidth < 640 ? 1600 : 2600; // chars per page approx
      const paragraphs = text.split(/\n{2,}/);
      const pages = [];
      let buffer = '';
      for(const p of paragraphs){
        if((buffer + '\n\n' + p).length > target && buffer.length>0){
          pages.push(buffer.trim());
          buffer = p;
        } else {
          buffer = buffer ? buffer + '\n\n' + p : p;
        }
        if(buffer.length > target*1.35){ // hard overflow break
          pages.push(buffer.trim());
          buffer='';
        }
      }
      if(buffer.trim()) pages.push(buffer.trim());
      return pages.length ? pages : [text];
    }

    showModal(inner, title){
      let modal = document.getElementById('library-modal');
      const previouslyFocused = document.activeElement;
      if(!modal){
        modal = document.createElement('div');
        modal.id='library-modal';
        modal.innerHTML = `<div class="modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.6);"></div>
          <div class="modal-shell" role="dialog" aria-modal="true" aria-labelledby="library-modal-heading" aria-describedby="library-modal-desc" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:24px;border-radius:14px;max-width:800px;width:90%;max-height:85vh;overflow:auto;box-shadow:0 10px 40px -5px rgba(0,0,0,.3);outline:0;">
            <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:12px;">
              <h3 id="library-modal-heading" style="margin:0;font-size:1.2rem;">Preview</h3>
              <button class="modal-close" aria-label="Close preview" style="background:none;border:none;font-size:1.8rem;line-height:1;cursor:pointer;">&times;</button>
            </div>
            <div id="library-modal-desc" class="modal-title" style="font-weight:600;margin-bottom:6px;font-size:.85rem;color:var(--text-light);"></div>
            <div class="modal-body"></div>
            <div class="sr-only" aria-live="polite"></div>
          </div>`;
        document.body.appendChild(modal);
        const closeModal = ()=>{
          modal.remove();
          if(previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
          document.removeEventListener('keydown', keyHandler);
        };
        modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        const keyHandler = (e)=>{
          if(e.key==='Escape'){ e.preventDefault(); closeModal(); }
          if(e.key==='Tab'){
            // Trap focus within modal-shell
            const shell = modal.querySelector('.modal-shell');
            const focusables = shell.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if(!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length-1];
            if(e.shiftKey && document.activeElement === first){
              e.preventDefault(); last.focus();
            } else if(!e.shiftKey && document.activeElement === last){
              e.preventDefault(); first.focus();
            }
          }
        };
        document.addEventListener('keydown', keyHandler);
      }
      modal.querySelector('.modal-body').innerHTML = inner;
      modal.querySelector('.modal-title').textContent = title;
      // Focus management
      const shell = modal.querySelector('.modal-shell');
      setTimeout(()=>{
        const preferred = shell.querySelector('.modal-close');
        if(preferred) preferred.focus(); else shell.setAttribute('tabindex','-1'), shell.focus();
      }, 30);
    }

    escapeHTML(str){
      return str.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }

    // Simple throttle (local to manager)
    throttle(fn, wait){
      let last=0, t; return function(){
        const now=Date.now();
        if(now-last>=wait){ last=now; fn.apply(this, arguments); }
        else { clearTimeout(t); t=setTimeout(()=>{ last=Date.now(); fn.apply(this, arguments); }, wait-(now-last)); }
      };
    }
  }

  window.libraryManager = new LibraryManager();
})();

// Utility throttle (duplicate minimal helper for progress if main.js not loaded yet in some contexts)
if(!window._bseThrottle){
  window._bseThrottle = function(fn, wait){
    let last=0, t; return function(){ const now=Date.now(); const ctx=this, args=arguments; if(now-last>=wait){ last=now; fn.apply(ctx,args);} else { clearTimeout(t); t=setTimeout(()=>{ last=Date.now(); fn.apply(ctx,args); }, wait-(now-last)); } };
  };
}
