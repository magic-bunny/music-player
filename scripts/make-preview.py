# coding: utf-8
"""Save real NetEase playlist metadata for an explicitly labelled browser preview."""
import base64,json,pathlib,subprocess
from urllib.parse import urlencode
ROOT=pathlib.Path(__file__).resolve().parents[1]
def request(url,fields=None):
    args=['curl','-fsS','--max-time','20','-e','https://music.163.com/',url]
    for k,v in (fields or {}).items():args+=['--data-urlencode',f'{k}={v}']
    return subprocess.check_output(args)
def api(path,fields=None):
    d=json.loads(request('https://music.163.com'+path,fields))
    if d.get('code')!=200:raise RuntimeError(f'NetEase returned {d.get("code")} for {path}')
    return d
playlists=api('/api/search/get/web',{'s':'欧美流行','type':'1000','limit':'40','offset':'0'})['result']['playlists']
collections=[dict(id=f"playlist:{p['id']}",title=p['name'],artist=p['creator']['nickname'],track_count=p['trackCount']) for p in playlists]
first=playlists[0]
detail=api('/api/v6/playlist/detail',{'id':str(first['id']),'n':'100000','s':'0'})['playlist']
ids=[t['id'] for t in detail['trackIds']];songs={};allowed=set()
for start in range(0,len(ids),80):
    batch=ids[start:start+80]
    data=api('/api/song/detail/?'+urlencode({'ids':json.dumps(batch)}))
    songs.update({s['id']:s for s in data['songs']})
    avail=api('/api/song/enhance/player/url',{'ids':json.dumps(batch),'br':'128000'})['data']
    allowed.update(s['id'] for s in avail if s.get('code')==200 and s.get('url') and s.get('fee') not in (1,4) and not s.get('freeTrialInfo') and not s.get('freeTimeTrialPrivilege',{}).get('type'))
tracks=[dict(id=f'netease:{i}',title=songs[i]['name'],artist=' / '.join(a['name'] for a in songs[i]['artists']),album=songs[i]['album']['name'],seconds=songs[i].get('duration',0)/1000,local=False) for i in ids if i in allowed and i in songs]
art={};cache={}
def cover(key,url):
    if not url:return
    url=url.replace('http://','https://')+'?param=400y400'
    try:
        if url not in cache:cache[url]='data:image/jpeg;base64,'+base64.b64encode(request(url)).decode()
        art[key]=cache[url]
    except subprocess.CalledProcessError:pass
for p in playlists[:15]:cover(f"playlist:{p['id']}",p['coverImgUrl'])
for t in tracks[:10]:cover(t['id'],songs[int(t['id'].split(':')[1])]['album'].get('picUrl'))
(ROOT/'web'/'testing'/'preview-data.json').write_text(json.dumps(dict(collections=collections,tracks=tracks,playlistTracks={collections[0]['id']:tracks},art=art),ensure_ascii=False))
print(f'{len(collections)} real playlists; {len(ids)} source tracks, {len(tracks)} playable; {len(art)} artwork entries')
