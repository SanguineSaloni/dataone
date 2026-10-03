const fs = require('fs');
const file = 'frontend/src/app/dashboard/schema-mapper/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add target states
content = content.replace(
  `const [selectedTable, setSelectedTable] = useState<CatalogTable | null>(null);`,
  `const [selectedTable, setSelectedTable] = useState<CatalogTable | null>(null);
  const [targetTables, setTargetTables] = useState<CatalogTable[]>([]);
  const [targetExpandedNodes, setTargetExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedTargetTable, setSelectedTargetTable] = useState<CatalogTable | null>(null);`
);

// 2. Add targetHierarchy
const hierarchyLogic = `
  const targetHierarchy = useMemo(() => {
    const root: Record<string, any> = {};
    targetTables.forEach(t => {
      const parts = t.table_name.split('.');
      if (parts.length >= 3) {
        const catalog = parts[0];
        const db = parts[1];
        const table = parts.slice(2).join('.');
        
        if (!root[catalog]) root[catalog] = {};
        if (!root[catalog][db]) root[catalog][db] = [];
        root[catalog][db].push({ ...t, displayName: table });
      } else if (parts.length === 2) {
        const catalog = "default";
        const db = parts[0];
        const table = parts[1];
        
        if (!root[catalog]) root[catalog] = {};
        if (!root[catalog][db]) root[catalog][db] = [];
        root[catalog][db].push({ ...t, displayName: table });
      } else {
        const catalog = "default";
        const db = "default";
        const table = parts[0];
        if (!root[catalog]) root[catalog] = {};
        if (!root[catalog][db]) root[catalog][db] = [];
        root[catalog][db].push({ ...t, displayName: table });
      }
    });
    return root;
  }, [targetTables]);
`;
content = content.replace(
  `  // Step 1: pick the source connector`,
  hierarchyLogic + `\n  // Step 1: pick the source connector`
);

// 3. Add target schema fetch effect
const targetFetchEffect = `
  // Fetch Target Schema (Databricks)
  useEffect(() => {
    if (!sparkConnId) return;
    
    api.get<{ schema: Record<string, SparkColumn[]> }>(\`/api/v1/connectors/\${sparkConnId}/schema\`)
      .then(res => {
        const schema = res.schema ?? {};
        let uid = 10000;
        const formatted: CatalogTable[] = Object.entries(schema).map(([tableName, cols]) => ({
          id: uid++,
          table_name: tableName,
          columns: (cols || []).map(c => ({
            id: uid++,
            column_name: c.name,
            data_type: c.type ?? "",
            nullable: c.nullable ?? true,
            is_primary_key: c.primary_key ?? false,
          }))
        }));
        setTargetTables(formatted);
        if (formatted.length > 0) {
          const firstTable = formatted[0];
          const parts = firstTable.table_name.split('.');
          let initNodes: Record<string, boolean> = {};
          if (parts.length >= 3) {
            initNodes[\`cat:\${parts[0]}\`] = true;
            initNodes[\`db:\${parts[0]}.\${parts[1]}\`] = true;
          } else if (parts.length === 2) {
            initNodes[\`cat:default\`] = true;
            initNodes[\`db:default.\${parts[0]}\`] = true;
          } else {
            initNodes[\`cat:default\`] = true;
            initNodes[\`db:default.default\`] = true;
          }
          initNodes[firstTable.table_name] = true;
          setTargetExpandedNodes(initNodes);
          setSelectedTargetTable(firstTable);
        }
      })
      .catch(err => console.error("Target schema fetch failed", err));
  }, [sparkConnId]);
`;
content = content.replace(
  `  const generatedMappings: Array<{`,
  targetFetchEffect + `\n  const generatedMappings: Array<{`
);

// 4. Update the Target Schema Panel Rendering
const newTargetPanel = `
            {loading ? (
              <div className="text-white/40 p-4 text-center">Loading schema...</div>
            ) : targetTables.length === 0 ? (
              <div className="text-white/40 p-4 text-center">No target tables found.</div>
            ) : (
              Object.entries(targetHierarchy).map(([catalogName, databases]) => (
                <div key={catalogName} className="mb-2">
                  <div onClick={() => setTargetExpandedNodes(prev => ({ ...prev, [\`cat:\${catalogName}\`]: !prev[\`cat:\${catalogName}\`] }))} className="flex items-center gap-2 text-white/70 mb-2 cursor-pointer hover:text-white transition-colors p-1 rounded">
                    <span className="text-[10px] w-3 text-center">{targetExpandedNodes[\`cat:\${catalogName}\`] ? "▼" : "▶"}</span>
                    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" /><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M12 11v6" /></svg>
                    <span className="truncate">{catalogName}</span>
                  </div>

                  {targetExpandedNodes[\`cat:\${catalogName}\`] && (
                    <div className="ml-4 pl-2 border-l border-white/[0.06] space-y-1.5 mb-2">
                      {Object.entries(databases as Record<string, any[]>).map(([dbName, dbTables]) => (
                        <div key={dbName} className="mb-2">
                          <div onClick={() => setTargetExpandedNodes(prev => ({ ...prev, [\`db:\${catalogName}.\${dbName}\`]: !prev[\`db:\${catalogName}.\${dbName}\`] }))} className="flex items-center gap-2 text-white/70 mb-2 cursor-pointer hover:text-white transition-colors p-1 rounded">
                            <span className="text-[10px] w-3 text-center">{targetExpandedNodes[\`db:\${catalogName}.\${dbName}\`] ? "▼" : "▶"}</span>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                            <span className="truncate">{dbName}</span>
                          </div>

                          {targetExpandedNodes[\`db:\${catalogName}.\${dbName}\`] && (
                            <div className="ml-4 pl-2 border-l border-white/[0.06] space-y-1.5 mb-2">
                              {dbTables.map((t: any) => (
                                <div key={t.id} className="mb-2">
                                  <div onClick={() => { setTargetExpandedNodes(prev => ({ ...prev, [t.table_name]: !prev[t.table_name] })); setSelectedTargetTable(t); }} className={["flex items-center gap-2 text-white/70 mb-2 cursor-pointer hover:text-white transition-colors p-1 rounded", selectedTargetTable?.id === t.id ? "bg-white/10" : ""].join(" ")}>
                                    <span className="text-[10px] w-3 text-center">{targetExpandedNodes[t.table_name] ? "▼" : "▶"}</span>
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                                    <span className="truncate">{t.displayName}</span>
                                  </div>
                                  
                                  {targetExpandedNodes[t.table_name] && (
                                    <div className="ml-4 pl-2 border-l border-white/[0.06] space-y-1.5 mb-2">
                                      {t.columns.map((col: any) => (
                                        <div key={col.id} className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors hover:bg-white/[0.04]">
                                          <div className="flex items-center gap-2">
                                            <span className="text-white/60 truncate max-w-[120px]" title={col.column_name}>{col.column_name}</span>
                                            {col.is_primary_key && <span className="text-amber-400 text-[10px]">🔑</span>}
                                          </div>
                                          <span className="px-1.5 py-0.5 rounded bg-white/[0.03] text-[9px] text-white/30 border border-white/[0.05]">{col.data_type}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
`;

// We replace the block from `{loading ? (` to `)}` in the target schema section.
const regex = /\{loading \? \(\n\s+<div className="text-white\/40 p-4 text-center">Loading schema\.\.\.<\/div>\n\s+\) : selectedTable \? \([\s\S]*?\) : \(\n\s+<div className="text-white\/40 p-4 text-center">Select a source table to view target mapping\.\<\/div>\n\s+\)\}/m;
content = content.replace(regex, newTargetPanel);

fs.writeFileSync(file, content);
console.log("Patched successfully!");
