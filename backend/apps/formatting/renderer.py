def render_markdown(question, answer, references, style, format_name):
    title='Research Brief' if format_name=='brief' else 'Research Report'
    return f"# {title}\n\n**Question:** {question}\n\n{answer.strip()}\n\n## References ({style})\n\n{references or 'No references available.'}\n"
