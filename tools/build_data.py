"""Claude版から書き出したJSON（export/plugins/*.json）と画像（blobs/*.jpg）から data.json と images/ を作る。
使い方: python3 tools/build_data.py <exportのpluginsフォルダ> <blobsフォルダ>"""
import json, glob, os, shutil, sys
src, blobs = sys.argv[1], sys.argv[2]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
img_dir = os.path.join(root, 'images')
os.makedirs(img_dir, exist_ok=True)
items, used, missing = [], set(), []
for f in sorted(glob.glob(os.path.join(src, '*.json'))):
    d = json.load(open(f, encoding='utf-8'))
    d['id'] = os.path.splitext(os.path.basename(f))[0]
    img = d.get('img') or ''
    if img.startswith('/_blob/'):
        aid = img.split('/')[-1]
        hits = glob.glob(os.path.join(blobs, aid + '.*'))
        if hits:
            name = d['id'] + os.path.splitext(hits[0])[1]
            shutil.copyfile(hits[0], os.path.join(img_dir, name))
            d['img'] = 'images/' + name; used.add(name)
        else:
            missing.append(d['id']); d.pop('img', None)
    items.append({k: v for k, v in d.items() if k in ('id','kind','name','desc','url','prompt','memo','tags','order','createdAt','img','imgW','imgH')})
for n in os.listdir(img_dir):
    if n not in used: os.remove(os.path.join(img_dir, n))
json.dump(items, open(os.path.join(root, 'data.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(items), 'items,', len(used), 'images', ('missing: ' + ', '.join(missing)) if missing else '')
