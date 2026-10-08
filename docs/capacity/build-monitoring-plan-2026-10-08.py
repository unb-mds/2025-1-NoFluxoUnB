#!/usr/bin/env python3
"""Regenera o LaTeX standalone a partir do plano Markdown; requer Pandoc.

Execute de qualquer diretório. Não compila PDF nem acessa serviços.
O preâmbulo vem do relatório anterior preservado na mesma pasta.
"""
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

folder = Path(__file__).resolve().parent
pandoc = shutil.which('pandoc')
if not pandoc:
    raise SystemExit('Pandoc é necessário para regenerar o LaTeX.')
work = tempfile.TemporaryDirectory(prefix='nofluxo-monitoring-plan-')
body_path = Path(work.name) / 'body.tex'
subprocess.run([pandoc,str(folder/'plano-monitoramento-capacidade-2026-10-08.md'),'--from','markdown','--to','latex','--syntax-highlighting=none','--output',str(body_path)],check=True)
old=(folder/'relatorio-capacidade-nofluxo-2026-10-07.tex').read_text()
preamble=old.split('\\begin{document}',1)[0]
preamble=preamble.replace('NoFluxoUNB — Uso de recursos e avaliação de capacidade','NoFluxo — Plano de monitoramento e capacidade')
preamble=preamble.replace('Cluster K3s, Supabase, Darcy e limites de crescimento','Plano de implementação, métricas de uso, retenção, validação e custo')
preamble=preamble.replace('RECURSOS E CAPACIDADE','MONITORAMENTO E CAPACIDADE')
preamble=preamble.replace('Recursos: 07/10/2026 · Atualização: 08/10/2026','Plano revisado · 8 de outubro de 2026')
preamble+='''\n\\usepackage{longtable,calc,fancyvrb}\n\\DefineVerbatimEnvironment{verbatim}{Verbatim}{fontsize=\\scriptsize}\n\\providecommand{\\tightlist}{\\setlength{\\itemsep}{1pt}\\setlength{\\parskip}{0pt}}\n\\setcounter{tocdepth}{1}\n\\setlength{\\LTpre}{5pt}\n\\setlength{\\LTpost}{5pt}\n\\setlength{\\tabcolsep}{4pt}\n\\renewcommand{\\arraystretch}{1.2}\n'''
cover=r'''\begin{document}
\begin{titlepage}
\thispagestyle{empty}
\begin{tikzpicture}[remember picture,overlay]
\fill[NFDark] (current page.north west) rectangle ([yshift=-95mm]current page.north east);
\fill[NFPrimary] ([yshift=-94mm]current page.north west) rectangle ([yshift=-95mm]current page.north east);
\end{tikzpicture}
\vspace*{1mm}
{\colorlet{NFLogoInk}{white}\NFWordmark{67mm}}\par
\vspace{8mm}
{\footnotesize\bfseries\color{white!65}DEMANDA · QUALIDADE · HISTÓRICO · CAPACIDADE\par}
\vspace{4mm}
{\fontsize{29}{33}\selectfont\bfseries\color{white}Plano de monitoramento\\e capacidade\par}
\vspace{5mm}
{\normalsize\color{white!80}NoFluxo · by Crianex · UnB · Plano v1.1 · 8 de outubro de 2026\par}
\vspace{16mm}
\tagline{MEDIR O ATENDIMENTO, PRESERVAR O HISTÓRICO E VALIDAR OS LIMITES}
Plano de implementação fundamentado no código, em leitura do monitoramento existente e na auditoria de recursos. Inclui definições de usuários, instrumentação, retenção, recuperação, testes de capacidade, custos e revisão adversarial do desenho.
\vspace{3mm}
\par\noindent\begin{minipage}[t]{.315\linewidth}\metriccard{REFERÊNCIA ATUAL}{60/dia}{contas autenticadas\newline indicador aproximado}\end{minipage}\hfill
\begin{minipage}[t]{.315\linewidth}\metriccard{HISTÓRICO PROPOSTO}{7 / 400 dias}{eventos brutos / agregados\newline com expurgo e recuperação}\end{minipage}\hfill
\begin{minipage}[t]{.315\linewidth}\metriccard{CUSTO DE OBJETOS}{US\$0–5,18}{por mês, nos cenários R2\newline disco/CPU a confirmar}\end{minipage}
\vspace{5mm}
\begin{NFBox}{Estado do plano}
Desenho revisado em três passagens, com gates explícitos para infraestrutura, privacidade, persistência e ensaio. Implementação não iniciada. Os cenários de armazenamento não certificam quantos usuários o produto suporta.
\end{NFBox}
\vspace{2mm}
\begin{center}
\begin{tikzpicture}[x=1mm,y=1mm,>=Stealth,
every node/.style={draw=NFBorder,fill=white,rounded corners=2mm,align=center,font=\small,text=NFInk,minimum height=15mm}]
\node[minimum width=39mm] (a) at (20,0) {Frontend\\Backend · Darcy};
\node[minimum width=39mm,draw=NFPrimary,fill=NFAccent] (b) at (80,0) {Coletor\\métricas e atividade};
\node[minimum width=39mm] (c) at (140,0) {Histórico\\SQLite · R2};
\draw[->,NFPrimary,thick] (a)--(b);
\draw[->,NFPrimary,thick] (b)--(c);
\node[minimum width=105mm] (d) at (80,-24) {Grafana · Alertmanager · Dashboard administrativo};
\draw[->,NFPrimary,thick] (b)--(d);
\end{tikzpicture}
\end{center}
\vfill
\smallnote{Documento técnico em português · Fonte Markdown e LaTeX editáveis\newline
Custo reproduzível, dados agregados de infraestrutura e recibo de revisão anexos.}
\end{titlepage}
\setcounter{page}{2}
\section*{Roteiro do plano}
\begingroup
\setlength{\parskip}{0pt}
\fontsize{9}{11.5}\selectfont
\makeatletter
\renewcommand{\l@section}{\@dottedtocline{1}{0pt}{1.7em}}
\makeatother
\tableofcontents
\endgroup
\clearpage
\fontsize{9.5}{12.1}\selectfont
'''
body=body_path.read_text()
body=body.replace('\\section{','\\clearpage\n\\section{')
def breakable_code(match):
    value=match.group(1).replace(r'\ ', ' ')
    for escaped,plain in [(r'\_', '_'),(r'\%', '%'),(r'\&','&'),(r'\#','#'),(r'\$','$')]:
        value=value.replace(escaped,plain)
    return r'{\footnotesize\ttfamily'+r'\ '.join(r'\nolinkurl{'+token+'}' for token in value.split(' '))+'}'
body=re.sub(r'\\texttt\{([^{}]*)\}',breakable_code,body)
from decimal import Decimal
def fix_table_width(match):
    table=match.group(0)
    widths=list(re.finditer(r'\\real\{([0-9.]+)\}',table))
    if widths:
        last=widths[-1]
        remaining=Decimal(1)-sum(Decimal(w.group(1)) for w in widths[:-1])
        table=table[:last.start(1)]+format(remaining,'.4f')+table[last.end(1):]
    return table
body=re.sub(r'\\begin\{longtable\}[\s\S]*?\\toprule',fix_table_width,body)
body=body.replace('\\begin{quote}','\\begin{NFBox}{Diretriz do plano}').replace('\\end{quote}','\\end{NFBox}')
body=body.replace('\\begin{longtable}', '\\small\n\\begin{longtable}')
body=body.replace('\\toprule\\noalign{}', '\\toprule\\noalign{}\n\\rowcolor{NFAccent}')
body=body.replace('\\begin{longtable}', '\\rowcolors{2}{NFSoft}{white}\n\\begin{longtable}')
# Keep the complete adversarial matrix and its note together at a legible size.
matrix_start=body.index('\\section{Matriz de testes')
matrix_end=body.index('\\clearpage\n\\section{Dimensionamento de armazenamento',matrix_start)
matrix=body[matrix_start:matrix_end]
matrix=matrix.replace('\\small\n\\rowcolors', '\\fontsize{8.5}{10}\\selectfont\n\\renewcommand{\\arraystretch}{1.0}\n\\rowcolors')
matrix=matrix.replace('\\end{longtable}', '\\end{longtable}\n\\renewcommand{\\arraystretch}{1.2}\n\\fontsize{9.5}{12.1}\\selectfont')
body=body[:matrix_start]+matrix+body[matrix_end:]
tex=folder/'plano-monitoramento-capacidade-2026-10-08.tex'
tex.write_text('% Gerado do Markdown pelo Pandoc; preâmbulo e marca seguem o relatório NoFluxo.\n'+preamble+cover+body+'\n\\end{document}\n')
print('Generated standalone LaTeX:',tex)

work.cleanup()
