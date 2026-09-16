import re

with open('frontend/src/app/dashboard/connectors/page.tsx', 'r') as f:
    content = f.read()

# Remove the Target panel
content = re.sub(r'<DBFormPanel\s+title="Target \(Databricks\)".*?/>', '', content, flags=re.DOTALL)

with open('frontend/src/app/dashboard/connectors/page.tsx', 'w') as f:
    f.write(content)
