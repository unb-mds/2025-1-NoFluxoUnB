// @ts-expect-error -- googlethis não publica tipos
import google from 'googlethis';

export async function searchInternet(query: string): Promise<string> {
    try {
        // Se a busca envolver dificuldade, focar em fóruns ou opiniões para trazer contexto real
        let finalQuery = query;
        if (query.includes('dificuldade')) {
            finalQuery += ' "dificuldade" (site:reddit.com OR site:twitter.com OR forum)';
        }

        console.log(`[Web Search] Realizando busca no Google para: ${finalQuery}`);

        const options = {
            page: 0, 
            safe: false, // Busca irrestrita
            parse_ads: false, 
            additional_params: {
                hl: 'pt-BR'
            }
        };

        // Realiza a busca no Google contornando bloqueios comuns
        const response = await google.search(finalQuery, options);

        console.log(`[Web Search] Busca concluída com ${response.results?.length || 0} resultados.`);

        if (!response.results || response.results.length === 0) {
            return "Nenhuma opinião pública sobre a dificuldade foi encontrada na web para esta pesquisa.";
        }

        // Seleciona os 4 resultados mais relevantes e pega o título e a descrição (snippet)
        const topResults = response.results.slice(0, 4);
        
        return topResults.map((r: any, i: number) => `[Opinião da internet ${i+1}] - ${r.title}: ${r.description}`).join('\n\n');
    } catch (e) {
        console.error("Erro no web search (googlethis):", e);
        return "Erro ao realizar busca na internet.";
    }
}
