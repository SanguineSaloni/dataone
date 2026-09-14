import re

with open("frontend/src/app/signin/page.tsx", "r") as f:
    content = f.read()

# Gradients & backgrounds
content = content.replace("bg-gradient-to-br from-[#0f0f1a] via-[#0d0d1f] to-[#09090b]", "bg-gradient-to-br from-[#1a1a1a] via-[#0a0a0a] to-[#000000]")
content = content.replace("bg-gradient-to-tr from-indigo-900/20 via-transparent to-violet-900/10", "bg-gradient-to-tr from-white/10 via-transparent to-white/5")
content = content.replace("bg-indigo-600/10", "bg-white/5")
content = content.replace("bg-violet-600/10", "bg-white/5")
content = content.replace("from-indigo-500 to-violet-600", "from-white to-gray-300")
content = content.replace("shadow-indigo-500/25", "shadow-white/10")
content = content.replace("bg-indigo-500/10", "bg-white/10")
content = content.replace("border-indigo-500/20", "border-white/20")
content = content.replace("text-indigo-400", "text-white")
content = content.replace("bg-indigo-400", "bg-white")
content = content.replace("from-indigo-400 via-violet-400 to-purple-400", "from-white via-gray-300 to-gray-500")
content = content.replace("bg-indigo-600/5", "bg-white/5")
content = content.replace("border-indigo-500/60", "border-white/40")
content = content.replace("bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-indigo-900/40", "bg-white text-black hover:bg-gray-200 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-white/10")
content = content.replace('className="text-white text-lg font-bold">D<', 'className="text-black text-lg font-bold">D<')
content = content.replace('className="text-white font-bold">D<', 'className="text-black font-bold">D<')

# Icons in Feature pills
content = content.replace('icon: "⚡"', 'icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>')
content = content.replace('icon: "🧠"', 'icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>')
content = content.replace('icon: "🛡"', 'icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.956 11.956 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>')
content = content.replace('icon: "📊"', 'icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>')

# Error banners
content = content.replace('<span className="text-base">⚠️</span>', '<svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>')
# Wait, red banner has text-red-400
content = content.replace('<span className="text-base">⚠️</span>', '<svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>')

# Databricks Sign In Button (Glass / Aesthetic)
databricks_btn_orig = '''            <a
              id="databricks-signin-btn"
              href={`${api.base}/api/v1/auth/databricks/login`}
              className="w-full py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-orange-500 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-3"
            >
              <span className="text-lg">🧱</span>
              Sign in with Databricks
            </a>'''
databricks_btn_new = '''            <a
              id="databricks-signin-btn"
              href={`${api.base}/api/v1/auth/databricks/login`}
              className="w-full py-3.5 text-sm font-semibold text-white bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 backdrop-blur-md active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              <svg role="img" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-[#FF3621]">
                <path d="M11.996 0L.925 5.253v13.528L11.996 24l11.07-5.22V5.253zM18.89 16.634l-6.894 3.242-6.894-3.242V9.014l6.894-3.242 6.894 3.242zM11.996 11.365l-4.174-1.956 4.174-1.957 4.174 1.957z"/>
              </svg>
              Sign in with Databricks
            </a>'''
content = content.replace(databricks_btn_orig, databricks_btn_new)

# Microsoft Sign In Button (Glass / Aesthetic)
ms_btn_orig = '''                <a
                  href={`${api.base}/api/v1/auth/entra/login`}
                  className="w-full py-3 text-sm font-semibold text-white/90 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <span>🪟</span> Sign in with Microsoft
                </a>'''
ms_btn_new = '''                <a
                  href={`${api.base}/api/v1/auth/entra/login`}
                  className="w-full py-3 text-sm font-semibold text-white/90 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/></svg>
                  Sign in with Microsoft
                </a>'''
content = content.replace(ms_btn_orig, ms_btn_new)

with open("frontend/src/app/signin/page.tsx", "w") as f:
    f.write(content)

