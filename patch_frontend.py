import re

with open('frontend/src/app/dashboard/connectors/page.tsx', 'r') as f:
    content = f.read()

# 1. Remove defaultTarget state
content = re.sub(r'const defaultTarget: DBForm = {[^}]+};\n', '', content)

# 2. Remove target state from ConnectorsPage component
content = re.sub(r'\s*const \[target, setTarget\] = useState<DBForm>\(defaultTarget\);\n', '\n', content)

# 3. Modify handleEstablishConnection
old_handle = '''      let tgtConnId: number | null = null;
      if (target.dbType !== "databricks") {
        const tgtPayload = {
          name: cleanName(`${target.dbType}_target_${target.database || "db"}`),
          type: target.dbType,
          environment: "prod",
          config: { host: target.host, port: target.port, dbname: target.database, user: target.username, password: target.password, ssl_mode: target.ssl },
        };
        const tgtConn = await api.post<{ id: number }>("/api/v1/connectors/", tgtPayload);
        tgtConnId = tgtConn.id;
      }

      setRunStatus("triggering");

      const triggerPayload: any = {
        source_connection_id: srcConn.id,
        target_connection_id: tgtConnId,
      };
      if (target.dbType === "databricks") {
        triggerPayload.target_catalog = target.catalog || "workspace";
        triggerPayload.target_schema = target.schema || "default";
      }

      const ingestionRun = await api.post<IngestionRun>("/api/v1/databricks/ingest/trigger", triggerPayload);

      setRunStatus("running");'''

new_handle = '''      // The backend automatically triggers Lakehouse Federation setup
      // when the source connection is created!
      setRunStatus("succeeded");'''

content = content.replace(old_handle, new_handle)

# If the replacement failed because of whitespace or previous modifications, try regex
if old_handle not in content:
    # Use regex to replace everything from "let tgtConnId" down to 'setRunStatus("running");'
    content = re.sub(r'let tgtConnId:.*?setRunStatus\("running"\);', new_handle, content, flags=re.DOTALL)

# 4. Remove Target Connection form panel from rendering
content = re.sub(r'<DBFormPanel\s+title="Target Connection".*?/>', '', content, flags=re.DOTALL)

# 5. Remove TARGET_TYPES definition if not used anymore
content = re.sub(r'const TARGET_TYPES = \[[^\]]+\];\n', '', content, flags=re.DOTALL)

# 6. Change "Establish Connection & Trigger Ingestion" button text to just "Establish Connection"
content = content.replace('Establish Connection &amp; Trigger Ingestion', 'Establish Connection')

with open('frontend/src/app/dashboard/connectors/page.tsx', 'w') as f:
    f.write(content)
