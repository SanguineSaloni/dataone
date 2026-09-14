import os
import re

emoji_svg_map = {
    '⚡': '<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>',
    '🤖': '<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>',
    '🛡': '<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.956 11.956 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>',
    '📊': '<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>',
    '🧠': '<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>',
    '🪟': '<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg>',
    '📐': '<svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>',
    '🧱': '<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>'
}

def fix_colors(text):
    text = re.sub(r'bg-gradient-to-r from-violet-500 to-purple-600', 'bg-white', text)
    text = re.sub(r'bg-gradient-to-r from-violet-500 to-blue-600', 'bg-white', text)
    text = re.sub(r'bg-gradient-to-br from-violet-500 to-blue-600', 'bg-white', text)
    text = re.sub(r'bg-violet-500/15', 'bg-white/10', text)
    text = re.sub(r'bg-violet-500/10', 'bg-white/5', text)
    text = re.sub(r'text-violet-300', 'text-white/80', text)
    text = re.sub(r'border-violet-500/30', 'border-white/20', text)
    text = re.sub(r'border-violet-500/25', 'border-white/10', text)
    text = re.sub(r'border-violet-500/20', 'border-white/10', text)
    text = re.sub(r'text-violet-400', 'text-white', text)
    text = re.sub(r'bg-violet-400', 'bg-white', text)
    return text

def fix_emojis(text):
    for emoji, svg in emoji_svg_map.items():
        if f'"{emoji}"' in text:
            text = text.replace(f'"{emoji}"', svg)
        # Also handle bare emojis like >⚡<
        if f'>{emoji}<' in text:
            text = text.replace(f'>{emoji}<', f'>{svg}<')
        if f' {emoji} ' in text:
            text = text.replace(f' {emoji} ', f' {svg} ')
        if f'⚡ ' in text:
            text = text.replace(f'⚡ ', f'{svg} ')
    return text

def process_dir(d):
    for root, _, files in os.walk(d):
        for f in files:
            if f.endswith('.tsx') or f.endswith('.ts'):
                path = os.path.join(root, f)
                with open(path, 'r') as file:
                    content = file.read()
                
                new_content = fix_colors(content)
                new_content = fix_emojis(new_content)
                
                if content != new_content:
                    with open(path, 'w') as file:
                        file.write(new_content)

process_dir("frontend/src")
