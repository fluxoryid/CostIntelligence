from pathlib import Path
root=Path(__file__).parent
required=['index.html','app.js','calc-core.js','source-engine.js','providers.js','config.js','SOURCE-GOVERNANCE.md','DEPLOYMENT.md','SUPABASE-SETUP.sql']
for f in required:
    assert (root/f).exists(), f'Missing {f}'
html=(root/'index.html').read_text()
for token in ['sourceGovernanceRows','btnRecordOutcome','source-engine.js','providers.js']:
    assert token in html, f'Missing UI/integration token {token}'
for api in ['fx-usd-idr.js','bi-rate.js','kurs-pajak.js','wb-indicator.js','lkpp-status.js','esdm-electricity.js','eia-brent.js']:
    assert (root/'functions/api'/api).exists(), f'Missing API {api}'
print('Package contract checks passed.')
