import os
import re

file_path = "frontend/src/app/dashboard/connectors/page.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Fix the big trigger button
orig_btn_class = 'className="flex items-center gap-3 px-10 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[15px] font-bold hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition-all shadow-xl shadow-indigo-900/40"'
new_btn_class = 'className="flex items-center gap-3 px-10 py-4 rounded-xl bg-white text-black text-[15px] font-bold hover:bg-gray-200 disabled:opacity-50 transition-all shadow-xl shadow-white/10"'
content = content.replace(orig_btn_class, new_btn_class)

orig_btn_text = '<>⚡ Establish Connection &amp; Trigger Ingestion</>'
new_btn_text = '<><svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> Establish Connection &amp; Trigger Ingestion</>'
content = content.replace(orig_btn_text, new_btn_text)

# Fix pulse gradient
content = content.replace('bg-gradient-to-r from-indigo-500 to-violet-500', 'bg-white')

# Fix text colors
content = content.replace('text-violet-400', 'text-white')
content = content.replace('text-violet-400/60', 'text-white/60')
content = content.replace('text-violet-400/80', 'text-white/80')
content = content.replace('text-violet-400/70', 'text-white/70')

with open(file_path, "w") as f:
    f.write(content)

