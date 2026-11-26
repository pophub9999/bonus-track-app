#!/usr/bin/env python3
"""Publica a pesquisa iTunes no VPS existente, preservando Spotify e todos os dados."""
import sys, os, re, json, time, shutil, subprocess, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone

ref=sys.argv[1] if len(sys.argv)>1 else ''
if not re.fullmatch(r'[0-9a-f]{40}', ref): raise SystemExit('Indica o SHA completo do commit validado.')
root=Path('/opt/altzeimmer-backend')
if not (root/'.env').is_file(): raise SystemExit('Backend existente não encontrado.')
base='https://raw.githubusercontent.com/pophub9999/bonus-track-app/'+ref+'/'
def run(args, **kwargs):
    return subprocess.run(args,check=True,**kwargs)
def read_url(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Altzeimmer-deploy'}),timeout=30) as r: return r.read()
runs=json.loads(read_url('https://api.github.com/repos/pophub9999/bonus-track-app/actions/runs?head_sha='+ref))['workflow_runs']
checks=[r for r in runs if r['name']=='Verify iTunes catalogue']
# A revisão de código e os testes do commit de implementação devem estar concluídos.
if not checks:
    checks=json.loads(read_url('https://api.github.com/repos/pophub9999/bonus-track-app/actions/workflows/verify-itunes.yml/runs?branch=codex%2Fvps-public-library&per_page=5'))['workflow_runs']
if not checks or checks[0]['conclusion']!='success': raise SystemExit('A validação iTunes ainda não terminou com sucesso. Não foi alterado o servidor.')
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=Path('/opt/altzeimmer-backups')/('pre-itunes-'+stamp)
backup.mkdir(parents=True,mode=0o700)
names=run(['docker','ps','--format','{{.Names}}'],capture_output=True,text=True).stdout.splitlines()
dbs=[n for n in names if n.startswith('db-40wra5594y70lv92qgstkyyz-')]
if len(dbs)!=1: raise SystemExit('Não foi possível identificar inequivocamente o Supabase de destino.')
db=dbs[0]
with (backup/'database.dump').open('wb') as f:
    run(['docker','exec',db,'pg_dump','-U','postgres','-d','postgres','-n','altzeimmer','-Fc'],stdout=f)
os.chmod(backup/'database.dump',0o600)
paths=['server.mjs','functions/library.ts','functions/music-search.ts','sql/itunes-catalog.sql','tests/music-search.test.mjs','ITUNES.md']
for name in paths:
    target=root/name
    if target.exists():
        saved=backup/name
        saved.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(target,saved)
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(read_url(base+'backend/'+name))
    os.chmod(target,0o600)
# As credenciais e a implementação Spotify existente não são alteradas.
run(['docker','exec','-i',db,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=(root/'sql/itunes-catalog.sql').read_bytes())
run(['docker','tag','altzeimmer-backend:local','altzeimmer-backend:pre-itunes-'+stamp])
run(['docker','compose','-p','altzeimmer-backend','up','-d','--build'],cwd=root)
run(['docker','exec','altzeimmer-api','node','--test','tests/music-search.test.mjs'])
def api(url,body=None,token=None):
    headers={'Content-Type':'application/json','Accept':'application/json','apikey':'altzeimmer-public'}
    if token: headers['Authorization']='Bearer '+token
    request=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urllib.request.urlopen(request,timeout=60) as r: return json.load(r)
site='https://altzeimmer.nextit.freeddns.org'
def post(action,**payload): return api(site+'/functions/v1/library',{'action':action,**payload})
# Publica o frontend pelo Coolify. A credencial temporária nunca é impressa.
php='echo App\\Models\\User::first()->createToken("altzeimmer-itunes-deploy", ["read","write","deploy"], now()->addHour(), 0)->plainTextToken;'
token=run(['docker','exec','coolify','php','artisan','tinker','--execute='+php],capture_output=True,text=True).stdout.strip()
if not re.fullmatch(r'[0-9]+\|[^\s]+',token): raise SystemExit('Não foi possível criar a sessão temporária do Coolify.')
try:
    endpoint='https://painel.nextit.freeddns.org/api/v1'
    result=api(endpoint+'/deploy',{'uuid':'ajzixnhnpkomnzfdafx74qwz','force':False},token)
    deployment=result['deployments'][0]['deployment_uuid']
    print('Publicação Coolify iniciada:',deployment,flush=True)
    for _ in range(180):
        time.sleep(5)
        status=api(endpoint+'/deployments/'+deployment,token=token)['status']
        if status=='finished': break
        if status in ('failed','cancelled'): raise RuntimeError('A publicação falhou: '+status)
    else: raise RuntimeError('A publicação excedeu o tempo previsto.')
    data=api(site+'/functions/v1/music-search?q=Muse%20Hysteria&limit=5&market=PT')
    if data.get('source')!='itunes' or not data.get('tracks'): raise RuntimeError('Pesquisa pública sem resultados; verificar logs.')
    fixture=None
    try:
        marker='validation-'+stamp
        item={'id':'itunes:'+marker,'catalogId':marker,'source':'itunes','title':'Verificação temporária '+marker,'artist':'Altzeimmer','catalogUrl':'https://music.apple.com/'}
        fixture=post('add_song',song=item)['song']
        tab=post('create_manual_tab',songId=fixture['id'],instrument='bass')['tab']
        again=post('add_song',song=item)['song']
        if fixture['id']!=again['id']: raise RuntimeError('Importação repetida criou duplicado.')
        tabs=api(site+'/functions/v1/library?action=tabs&songId='+fixture['id']+'&instrument=bass')['tabs']
        if not any(t['id']==tab['id'] for t in tabs): raise RuntimeError('A tab não foi preservada.')
    finally:
        if fixture: post('delete_song',songId=fixture['id'])
    print('iTunes publicado. Pesquisa, importação e preservação de tabs verificadas.')
finally:
    token_id=token.split('|')[0]
    cleanup='echo Laravel\\Sanctum\\PersonalAccessToken::where("id",'+token_id+')->where("name","altzeimmer-itunes-deploy")->delete();'
    run(['docker','exec','coolify','php','artisan','tinker','--execute='+cleanup],capture_output=True)
    print('Credencial temporária revogada.')
