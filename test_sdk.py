import urllib.request
import json
import tarfile
import io

url = "https://pypi.org/pypi/databricks-sdk/0.33.0/json"
response = urllib.request.urlopen(url)
data = json.loads(response.read())
tar_url = None
for url_info in data['urls']:
    if url_info['filename'].endswith('.tar.gz'):
        tar_url = url_info['url']

response = urllib.request.urlopen(tar_url)
tar = tarfile.open(fileobj=io.BytesIO(response.read()), mode="r:gz")
for member in tar.getmembers():
    if "compute.py" in member.name and "service" in member.name:
        f = tar.extractfile(member)
        content = f.read().decode("utf-8")
        if "class Library" in content:
            lines = content.split("\n")
            for i, line in enumerate(lines):
                if "class Library" in line:
                    print("\n".join(lines[i:i+30]))
                    break
        if "class MavenLibrary" in content:
            lines = content.split("\n")
            for i, line in enumerate(lines):
                if "class MavenLibrary" in line:
                    print("\n".join(lines[i:i+30]))
                    break
