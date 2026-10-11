from dataclasses import dataclass
@dataclass(frozen=True)
class Source: marker:str; title:str; url:str; date:str
def cite(source, style='APA'):
    year=(source.date or '')[:4] or 'n.d.'
    if style.upper()=='MLA': return f"{source.title}. {year}. {source.url}" if source.url else f"{source.title}. {year}."
    if style.upper()=='CHICAGO': return f"{source.title}. {year}. {source.url}" if source.url else f"{source.title}. {year}."
    if style.upper()=='HARVARD': return f"{source.title} ({year}). {source.url}" if source.url else f"{source.title} ({year})."
    return f"{source.title}. ({year}). {source.url}" if source.url else f"{source.title}. ({year})."
def render_references(sources, style): return '\n'.join(f"[{s.marker}] {cite(s,style)}" for s in sources)
