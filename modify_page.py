import re

with open("frontend/src/app/dashboard/schema-mapper/page.tsx", "r") as f:
    content = f.read()

# 1. Add React Flow imports
imports_insert = """import ReactFlow, { Background, Controls, Handle, Position, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';"""

content = content.replace('import { api } from "@/lib/api";', 'import { api } from "@/lib/api";\n' + imports_insert)

# 2. Add TableNode component
table_node_code = """
// ─── ERD Node ────────────────────────────────────────────────────────────────
const TableNode = ({ data }: any) => {
  const { title, columns, isSource } = data;
  return (
    <div className="rounded-xl overflow-hidden shadow-2xl" style={{ border: `1px solid ${isSource ? 'rgba(59,130,246,0.3)' : 'rgba(52,211,153,0.3)'}`, background: '#0a0a0f', width: 240 }}>
      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2" style={{ background: isSource ? 'rgba(59,130,246,0.08)' : 'rgba(52,211,153,0.08)', color: isSource ? '#60a5fa' : '#34d399' }}>
        <Icon name={isSource ? "db" : "table"} size={12} />
        {title}
      </div>
      <div className="py-1 flex flex-col gap-px" style={{ background: 'rgba(0,0,0,0.4)' }}>
        {columns.map((col: any) => (
          <div key={col.id} className="relative px-3 py-1.5 flex justify-between items-center hover:bg-white/[0.03] transition-colors group">
            {!isSource && <Handle type="target" position={Position.Left} id={col.name} className="!w-1.5 !h-1.5 !bg-emerald-400 !border-none !-left-1 opacity-0 group-hover:opacity-100 transition-opacity" />}
            <span className="text-[10px] font-mono text-white/80">{col.name}</span>
            <span className="text-[8px] text-white/30 ml-2">{col.type}</span>
            {isSource && <Handle type="source" position={Position.Right} id={col.name} className="!w-1.5 !h-1.5 !bg-blue-400 !border-none !-right-1 opacity-0 group-hover:opacity-100 transition-opacity" />}
          </div>
        ))}
      </div>
    </div>
  );
};
const nodeTypes = { tableNode: TableNode };
"""

# Insert before "export default function SchemaMapperPage"
content = content.replace("export default function SchemaMapperPage() {", table_node_code + "\nexport default function SchemaMapperPage() {")

# 3. Add activeTab state
content = content.replace('const [mode, setMode] = useState<"cfg" | "run">("cfg");', 'const [mode, setMode] = useState<"cfg" | "run">("cfg");\n  const [activeTab, setActiveTab] = useState<"list" | "erd">("list");')

# 4. Add ERD nodes and edges computation
erd_computation = """
  const erdNodes = useMemo(() => {
    if (!srcObj) return [];
    const nodes = [];
    nodes.push({
      id: "src", type: "tableNode", position: { x: 50, y: 150 },
      data: { title: srcObj.table_name.split(".").pop(), isSource: true, columns: srcObj.columns.map(c => ({ id: c.id, name: c.column_name, type: c.data_type })) }
    });
    tgtTbls.forEach((t, i) => {
      nodes.push({
        id: `tgt-${t.table_name}`, type: "tableNode", position: { x: 500, y: 50 + i * 250 },
        data: { title: t.table_name.split(".").pop(), isSource: false, columns: t.columns.map(c => ({ id: c.id, name: c.column_name, type: c.data_type })) }
      });
    });
    return nodes;
  }, [srcObj, tgtTbls]);

  const erdEdges = useMemo(() => {
    if (!suggestions || suggestions.length === 0 || suggestions[0].status === "error") return [];
    return suggestions.map((s, i) => {
      const pct = s.confidence || 0;
      const color = pct >= 80 ? "rgba(255,255,255,0.7)" : pct >= 60 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)";
      return {
        id: `edge-${i}`, source: "src", sourceHandle: s.source_column,
        target: `tgt-${s.target_table}`, targetHandle: s.target_column,
        animated: true,
        style: { stroke: color, strokeWidth: 1.5, strokeDasharray: "4 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: color, width: 20, height: 20 }
      };
    });
  }, [suggestions]);
"""

content = content.replace('const reset = () => { setMode("cfg"); setSuggestions([]); };', 'const reset = () => { setMode("cfg"); setSuggestions([]); };\n' + erd_computation)

# 5. Modify Header of results panel to include tabs
old_header = """<div className="px-5 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-3">
                  <Icon name="arrows" size={14} className="opacity-40" />
                  <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.75)" }}>Mapping Results</span>"""

new_header = """<div className="px-5 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex bg-white/5 rounded-lg p-0.5">
                    <button onClick={() => setActiveTab('list')} className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors ${activeTab === 'list' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>List View</button>
                    <button onClick={() => setActiveTab('erd')} className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors ${activeTab === 'erd' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>ERD Diagram</button>
                  </div>
                  {!loading && suggestions.length > 0 && suggestions[0].status !== "error" && suggestions[0].target_table !== "ERROR" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-sm font-semibold ml-2" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}>
                      {suggestions.length} match{suggestions.length !== 1 ? "es" : ""}
                    </span>
                  )}
                </div>"""

# Remove the old count span from the code manually using regex, since we added it to new_header
content = re.sub(r'<div className="px-5 py-3 flex items-center justify-between flex-shrink-0".*?</div>\s*<div className="flex items-center gap-1\.5 font-mono"', new_header + '\n                <div className="flex items-center gap-1.5 font-mono"', content, flags=re.DOTALL)

# 6. Add ERD conditional render
erd_jsx = """
                {activeTab === 'erd' && !loading && (
                  <div className="w-full h-full min-h-[500px] relative rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                    <ReactFlow 
                      nodes={erdNodes} 
                      edges={erdEdges} 
                      nodeTypes={nodeTypes}
                      fitView
                      className="bg-[#0a0a0f]"
                    >
                      <Background color="rgba(255,255,255,0.05)" gap={20} size={1} />
                      <Controls className="!bg-black/50 !border-white/10 !fill-white" />
                    </ReactFlow>
                  </div>
                )}
"""

list_start = """                {loading ? ("""
list_wrapped = """                {activeTab === 'list' && (
                  <>
""" + list_start

content = content.replace(list_start, erd_jsx + "\n" + list_wrapped)

# Close the fragment for list tab
list_end = """                  </div>
                )}
              </div>"""

list_end_wrapped = """                  </div>
                )}
                  </>
                )}
              </div>"""
              
content = content.replace(list_end, list_end_wrapped)

with open("frontend/src/app/dashboard/schema-mapper/page.tsx", "w") as f:
    f.write(content)
