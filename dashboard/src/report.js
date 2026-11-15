import '@fontsource-variable/noto-sans-thai'
import '@fontsource-variable/wix-madefor-text'
import '@fontsource-variable/inter-tight'
import './report.css'

// Diagrams are drawn only when the report has them, and only after the text is readable.
const diagrams = document.querySelectorAll('pre.mermaid')
if (diagrams.length) {
  import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'Noto Sans Thai Variable, sans-serif' })
    mermaid.run({ nodes: diagrams }).catch((error) => console.error('Diagram could not be drawn', error))
  })
}
