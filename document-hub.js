/* document-hub.js — Phase 11 Document Evidence Hub.
 * Uploads private evidence to Supabase Storage, hashes content, detects tenant
 * duplicates, versions references, extracts text where technically safe, and
 * links each document to an HPS cost component. No OCR or inferred pricing.
 */
(function(){
  'use strict';
  var initialized=false, docs=[];
  var MAX_EXTRACT_CHARS=200000;
  var JSZIP_URL='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  var PDF_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDF_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  function byId(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function fmtBytes(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB';}
  function today(){return new Date().toISOString().slice(0,10);}
  function cloudReady(){return !!(window.HPSAuth&&window.HPSAuth.isConfigured&&window.HPSAuth.isConfigured());}

  function loadScript(src,globalName){
    if(globalName&&window[globalName])return Promise.resolve(window[globalName]);
    return new Promise(function(resolve,reject){var s=document.createElement('script');s.src=src;s.async=true;s.onload=function(){resolve(globalName?window[globalName]:true);};s.onerror=function(){reject(new Error('Failed to load '+src));};document.head.appendChild(s);});
  }

  function sha256(file){
    if(!window.crypto||!window.crypto.subtle)return Promise.reject(new Error('WebCrypto SHA-256 is unavailable'));
    return file.arrayBuffer().then(function(buf){return window.crypto.subtle.digest('SHA-256',buf);}).then(function(d){return Array.from(new Uint8Array(d)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');});
  }
  function truncate(s){s=String(s||'').replace(/\u0000/g,'');return s.length>MAX_EXTRACT_CHARS?s.slice(0,MAX_EXTRACT_CHARS):s;}
  function xmlText(xml){
    try{var doc=new DOMParser().parseFromString(xml,'application/xml');return truncate(Array.from(doc.querySelectorAll('w\\:t, t, a\\:t, v, si')).map(function(n){return n.textContent||'';}).join(' '));}
    catch(e){return '';}
  }

  function extractOffice(file,ext){
    return loadScript(JSZIP_URL,'JSZip').then(function(JSZip){return file.arrayBuffer().then(function(buf){return JSZip.loadAsync(buf);});}).then(function(zip){
      var names=Object.keys(zip.files).filter(function(name){
        if(ext==='docx')return name==='word/document.xml'||/^word\/header\d+\.xml$/.test(name)||/^word\/footer\d+\.xml$/.test(name);
        if(ext==='xlsx')return name==='xl/sharedStrings.xml'||/^xl\/worksheets\/sheet\d+\.xml$/.test(name);
        if(ext==='pptx')return /^ppt\/slides\/slide\d+\.xml$/.test(name);
        return false;
      }).slice(0,100);
      return Promise.all(names.map(function(name){return zip.files[name].async('text').then(xmlText);}));
    }).then(function(parts){return {status:'EXTRACTED',text:truncate(parts.join('\n')),mode:'OFFICE_XML',notes:'Client-side XML text extraction; layout/formulas/macros are not interpreted.'};});
  }

  function extractPdf(file){
    return loadScript(PDF_URL,'pdfjsLib').then(function(pdfjs){pdfjs.GlobalWorkerOptions.workerSrc=PDF_WORKER;return file.arrayBuffer().then(function(buf){return pdfjs.getDocument({data:buf}).promise;});}).then(function(pdf){
      var max=Math.min(pdf.numPages,60),jobs=[];
      for(var i=1;i<=max;i++)jobs.push(pdf.getPage(i).then(function(page){return page.getTextContent();}).then(function(tc){return tc.items.map(function(x){return x.str||'';}).join(' ');}));
      return Promise.all(jobs).then(function(parts){return {status:'EXTRACTED',text:truncate(parts.join('\n')),mode:'PDF_TEXT_LAYER',notes:'Extracted from PDF text layer; scanned-image PDFs require human review and are not OCRed automatically.'};});
    });
  }

  function extract(file){
    var name=String(file.name||''),ext=(name.split('.').pop()||'').toLowerCase();
    var meta={name:name,type:file.type||null,size:file.size,lastModified:file.lastModified||null,extension:ext};
    if(['txt','csv','json','md','xml'].indexOf(ext)!==-1){return file.text().then(function(t){return {status:'EXTRACTED',text:truncate(t),mode:'PLAIN_TEXT',metadata:meta};});}
    if(['docx','xlsx','pptx'].indexOf(ext)!==-1){return extractOffice(file,ext).then(function(r){r.metadata=meta;return r;}).catch(function(e){return {status:'EXTRACTION_UNAVAILABLE',text:null,mode:'OFFICE_XML_FAILED',metadata:meta,error:e.message};});}
    if(ext==='pdf'){return extractPdf(file).then(function(r){r.metadata=meta;return r;}).catch(function(e){return {status:'EXTRACTION_UNAVAILABLE',text:null,mode:'PDF_TEXT_LAYER_FAILED',metadata:meta,error:e.message};});}
    return Promise.resolve({status:'METADATA_ONLY',text:null,mode:'NO_SAFE_EXTRACTOR',metadata:meta,notes:'Binary/image format retained as evidence; human review required.'});
  }

  function profile(){var p=byId('categoryCostProfilePanel'),key=p&&p.dataset.profileKey;var all=window.HPSCategoryCostUX&&window.HPSCategoryCostUX.PROFILES;return all&&(all[key]||all['services|Other']);}
  function componentOptions(){var pr=profile();return '<option value="">Package-level evidence</option>'+((pr&&pr.components)||[]).map(function(c){return '<option value="'+esc(c.key)+'">'+esc(c.label)+'</option>';}).join('');}

  function panel(){
    var x=byId('documentEvidenceHub');if(x)return x;var anchor=byId('componentEvidencePanel')||byId('categoryCostProfilePanel');if(!anchor||!anchor.parentElement)return null;
    x=document.createElement('div');x.id='documentEvidenceHub';x.className='p-4 rounded-lg border border-slate-800 bg-slate-950/30';
    if(anchor.nextSibling)anchor.parentElement.insertBefore(x,anchor.nextSibling);else anchor.parentElement.appendChild(x);return x;
  }

  function docStatus(d){if(d.status==='REVOKED')return 'REVOKED';if(d.valid_until&&d.valid_until<today())return 'EXPIRED';return d.status||'ACTIVE';}
  function docsHtml(){
    if(!docs.length)return '<div class="text-[10px] text-slate-500">No cloud evidence documents linked to this request yet.</div>';
    return docs.map(function(d){var st=docStatus(d),tone=st==='ACTIVE'?'text-emerald-300':st==='EXPIRED'?'text-amber-300':'text-rose-300';return '<div class="rounded border border-slate-800 bg-slate-900/40 px-3 py-2"><div class="flex flex-wrap items-start justify-between gap-2"><div><div class="text-[10px] font-medium text-slate-300">'+esc(d.file_name)+'</div><div class="mt-0.5 text-[9px] text-slate-500">'+esc(d.document_type)+' · v'+esc(d.version)+' · '+fmtBytes(d.size_bytes)+' · SHA-256 '+esc(String(d.sha256||'').slice(0,16))+'…</div><div class="mt-0.5 text-[9px] text-slate-500">Ref: '+esc(d.reference||'—')+' · Component: '+esc(d.component_key||'Package')+' · Extract: '+esc(d.extraction_status||'—')+'</div></div><span class="text-[9px] font-semibold '+tone+'">'+st+'</span></div></div>';}).join('');
  }

  function render(){
    var x=panel();if(!x)return;var connected=cloudReady();
    x.innerHTML='<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="font-semibold text-slate-200"><i class="fa-solid fa-folder-tree mr-1.5 text-cyan-400"></i>Document Evidence Hub</div><div class="mt-1 text-[10px] text-slate-500">Private Contract / PO / Invoice / Quotation / BOQ / SOW / Rate Card evidence. SHA-256 duplicate control, reference versioning, validity tracking and safe text extraction.</div></div><span class="rounded border px-2 py-1 text-[9px] '+(connected?'border-emerald-800 text-emerald-300':'border-amber-800 text-amber-300')+'">'+(connected?'SUPABASE PRIVATE STORAGE':'CLOUD BACKEND REQUIRED')+'</span></div>'+ 
      '<div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2"><input id="docFile" type="file" class="field compact" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.png,.jpg,.jpeg" /><select id="docType" class="field compact"><option>Quotation</option><option>Contract</option><option>Purchase Order</option><option>Invoice</option><option>BOQ</option><option>SOW / TOR</option><option>Rate Card</option><option>Principal Price List</option><option>Regulation / Decree</option><option>Other</option></select><select id="docComponent" class="field compact">'+componentOptions()+'</select><input id="docReference" class="field compact" placeholder="Document / contract / quotation reference" /><div><label class="text-[9px] text-slate-500">Issue / Source Date</label><input id="docIssueDate" type="date" class="field compact" /></div><div><label class="text-[9px] text-slate-500">Valid Until</label><input id="docValidUntil" type="date" class="field compact" /></div></div>'+ 
      '<div class="mt-3 flex items-center gap-2"><button id="btnDocUpload" type="button" class="px-3 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-[10px]"><i class="fa-solid fa-shield-arrow-up mr-1"></i>Hash, Extract & Upload</button><span id="docUploadStatus" class="text-[10px] text-slate-500"></span></div>'+ 
      '<details class="mt-3" open><summary class="cursor-pointer text-[10px] font-medium text-slate-400">Linked evidence documents</summary><div class="mt-2 space-y-2">'+docsHtml()+'</div></details>';
    var b=byId('btnDocUpload');if(b)b.addEventListener('click',upload);
  }

  function refresh(){
    if(!cloudReady()||!window.HPSCloud||!window.HPSCloud.listDocuments){docs=[];render();return Promise.resolve([]);}
    return window.HPSCloud.listDocuments().then(function(rows){docs=rows||[];render();return docs;});
  }

  function upload(){
    var file=byId('docFile')&&byId('docFile').files&&byId('docFile').files[0],status=byId('docUploadStatus');
    if(!file){if(status)status.textContent='Select a file.';return;}
    if(file.size>20*1024*1024){if(status)status.textContent='File exceeds 20 MB policy.';return;}
    if(!cloudReady()){if(status)status.textContent='Configure Supabase and sign in before uploading production evidence.';return;}
    if(status)status.textContent='Computing SHA-256…';
    sha256(file).then(function(hash){
      if(status)status.textContent='Checking duplicate hash…';
      return window.HPSCloud.findDocumentByHash(hash).then(function(dupe){if(dupe)throw new Error('Duplicate content already exists as '+dupe.file_name+' (reference '+(dupe.reference||'—')+').');return Promise.all([Promise.resolve(hash),extract(file)]);});
    }).then(function(v){
      var hash=v[0],ex=v[1];if(status)status.textContent='Uploading private evidence…';
      return window.HPSCloud.uploadEvidenceDocument(file,{sha256:hash,documentType:byId('docType').value,componentKey:byId('docComponent').value||null,reference:byId('docReference').value.trim()||null,issueDate:byId('docIssueDate').value||null,validUntil:byId('docValidUntil').value||null,extractionStatus:ex.status,extractedText:ex.text,extractedMetadata:Object.assign({},ex.metadata||{},{extractionMode:ex.mode,extractionNotes:ex.notes||null,extractionError:ex.error||null})});
    }).then(function(r){if(r&&r.error)throw new Error(r.error);if(status)status.textContent='Uploaded and registered.';return refresh();}).catch(function(e){if(status)status.textContent=e.message||String(e);});
  }

  function bind(){document.addEventListener('change',function(ev){var id=ev&&ev.target&&ev.target.id;if(id==='projCategory'||id==='engineCategory'||id==='subCategory')setTimeout(render,30);});}
  function init(){if(initialized)return;if(!byId('componentEvidencePanel')){setTimeout(init,150);return;}initialized=true;bind();render();refresh();}

  window.HPSDocumentHub={init:init,refresh:refresh,getDocuments:function(){return docs.slice();},sha256:sha256,extract:extract};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();
