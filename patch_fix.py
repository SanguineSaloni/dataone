import re

with open('frontend/src/app/dashboard/connectors/page.tsx', 'r') as f:
    content = f.read()

content = content.replace("startPolling(ingestionRun.id);", "// startPolling no longer needed")

with open('frontend/src/app/dashboard/connectors/page.tsx', 'w') as f:
    f.write(content)
