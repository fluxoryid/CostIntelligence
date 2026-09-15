#!/usr/bin/env python3
"""Bundle HPS Intelligence frontend/client source while excluding serverless backend functions."""
import sys, zipfile
from pathlib import Path
FRONTEND_ALLOWLIST={
 'index.html','style.css','app.js','calc-core.js','source-engine.js','providers.js','config.js',
 'auth-sync.js','cloud-sync.js','manifest.json','sw.js','README.md','SOURCE-GOVERNANCE.md'
}
BACKEND_DIR_KEYWORDS={'functions','api','server','backend','node_modules'}
LANG_MAP={'.js':'javascript','.html':'html','.css':'css','.json':'json','.md':'markdown'}
def is_frontend_file(filepath):
 p=Path(filepath); parts=[x.lower() for x in p.parts]
 if any(k in parts for k in BACKEND_DIR_KEYWORDS): return False
 return p.name in FRONTEND_ALLOWLIST or (len(parts)<=2 and p.suffix in {'.html','.css','.js'})
def bundle_frontend(zip_path,output_file):
 with zipfile.ZipFile(zip_path,'r') as zf, open(output_file,'w',encoding='utf-8') as out:
  entries=[i for i in zf.infolist() if not i.is_dir() and is_frontend_file(i.filename)]
  out.write('# HPS Intelligence — Frontend & Interface Source Code\n\n')
  out.write('> Backend Cloudflare Pages Functions are deliberately excluded.\n\n## Included Files\n\n')
  for i in entries: out.write(f'- `{i.filename}` ({i.file_size:,} bytes)\n')
  out.write('\n---\n\n')
  for i in entries:
   raw=zf.read(i)
   try: content=raw.decode('utf-8')
   except UnicodeDecodeError: content=raw.decode('latin-1',errors='replace')
   out.write(f"## File: `{i.filename}`\n\n```{LANG_MAP.get(Path(i.filename).suffix.lower(),'')}\n{content.rstrip()}\n```\n\n---\n\n")
 print(f"Bundled {len(entries)} frontend files into '{output_file.name}'")
if __name__=='__main__':
 target=Path(sys.argv[1]) if len(sys.argv)>1 else Path('HPS-Intelligence-Production-Fresh-v1.zip')
 output=Path(sys.argv[2]) if len(sys.argv)>2 else Path('hps_frontend_for_gpt.md')
 if not target.exists(): raise SystemExit(f'Error: {target} not found.')
 bundle_frontend(target,output)
