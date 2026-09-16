import tarfile, io, urllib.request, json
url = "https://pypi.org/pypi/databricks-sdk/0.33.0/json"
data = json.loads(urllib.request.urlopen(url).read())
tar_url = next(u['url'] for u in data['urls'] if u['filename'].endswith('.tar.gz'))
tar = tarfile.open(fileobj=io.BytesIO(urllib.request.urlopen(tar_url).read()), mode="r:gz")
for member in tar.getmembers():
    if "jobs.py" in member.name and "service" in member.name:
        content = tar.extractfile(member).read().decode("utf-8")
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if "class JobEnvironment" in line:
                print("\n".join(lines[i:i+30]))
                break
