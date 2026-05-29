import express from 'express'
import { GoogleGenAI, Type } from '@google/genai'
import 'dotenv/config'
import { atividades } from './atividades.js'

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())

// inicializa o gemini usando a chave guardada no .env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

app.post('/api/atividade', async (req, res) => {
    try {
        //pega os dados que o usuário enviou do formulário do site
        const perfilCrianca = req.body;
        const idade = perfilCrianca.idade;
        const nivelTea = perfilCrianca.nivel_tea;
        const interesses = perfilCrianca.interesses || [];
        const evitacoes = perfilCrianca.evitacoes || [];
        // FALTA objetivos da familia

        // busca no arquivo local pra ver se da match
        const atividadeLocalEncontrada = atividades.filter(ativ => {
            // regra 1: A idade da criança precisa estar dentro da faixa etária da atividade
            const idadeCompativel = idade >= ativ.faixa_etaria.min && idade <= ativ.faixa_etaria.max;

            // regra 2: A atividade precisa suportar o nível de TEA da criança
            const nivelTeaCompativel = ativ.nivel_tea.includes(nivelTea);

            // regra 3: A atividade NÃO pode conter coisas que a criança evitar
            // se alguma tag ou material da atividade estiver na lista de 'evitacoes', descarta
            const listaEvitacoesMinusculo = evitacoes.map(e => e.toLowerCase().trim());
            const contemAlgoAEvitar = ativ.evitar_se.some(e => listaEvitacoesMinusculo.includes(e.toLowerCase().trim())) || 
                                      ativ.tags.some(t => listaEvitacoesMinusculo.includes(t.toLowerCase().trim()));

            // regra 4: verifica se tem alguma área de interesse batendo com os interesses da criança
            let interesseCompativel = true;
            if (interesses.length > 0) {
                const listaInteressesMinusculo = interesses.map(i => i.toLowerCase().trim());
                interesseCompativel = ativ.areas_interesse.some(area => 
                    listaInteressesMinusculo.includes(area.toLowerCase().trim())
                ) || ativ.tags.some(tag => 
                    listaInteressesMinusculo.includes(tag.toLowerCase().trim())
                ); 
            }

            // regra 5: verifica os objetivos da familia ------- FALTA

            // retorna verdadedeiro se a idade e nivel TEA forem compatíveis, não for perigoso E bater o interesse
            return idadeCompativel && nivelTeaCompativel && !contemAlgoAEvitar && interesseCompativel;
        })

        // se encontrou o arquivo devolve ela e encerra requisição
        if (atividadeLocalEncontrada) {
            console.log(`[Sucesso] Atividade(s) encontrada(s) no arquivo local: ${atividadeLocalEncontrada.length}`)

            return res.status(200).json({...atividadeLocalEncontrada, gerado_por: "Banco de Dados Local (atividades.js)"})
        }

        console.log("[Aviso] Nenhuma atividade local serviu perfeitamente. Gemini acionado.")

        //esquema de validação do JSON
        const esquemaJsonAtividade = {
            type: Type.OBJECT,
            properties: {
                nome: { type: Type.STRING },
                descricao: { type: Type.STRING },
                como_fazer: { type: Type.STRING },
                faixa_etaria: {
                    type: Type.OBJECT,
                    properties: { min: { type: Type.INTEGER }, max: { type: Type.INTEGER } },
                    required: ["min", "max"]
                },
                nivel_tea: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                beneficios: { type: Type.ARRAY, items: { type: Type.STRING} },
                evitar_se: { type: Type.ARRAY, items: { type: Type.STRING } },
                nivel_barulho: { type: Type.STRING },
                nivel_baguncia: { type: Type.STRING },
                tempo_minutos: { type: Type.INTEGER },
                materiais: { type: Type.ARRAY, items: { type: Type.STRING} },
                areas_interesse: { type: Type.ARRAY, items: { type: Type.STRING } },
                objetivos: { type: Type.ARRAY, items: { type: Type.STRING } },
                fonte: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: [
                "nome", "descricao", "como_fazer", "faixa_etaria", "nivel_tea", "beneficios", "evitar_se", "nivel_barulho", "nivel_baguncia", "tempo_minutos", "materiais", "areas_interesse", "objetivos", "fonte", "tags"
            ]
        }

        // chamada ao gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            config: {
                responseMimeType: "application/json",
                responseSchema: esquemaJsonAtividade,
                systemInstruction: 'Você é um especialista em terapia ocupacional infantil e neurodesenvolvimento. Crie atividades altamente personalizadas para crianças atípicas baseando-se em protocolos sérios como Jean Ayres.'
            },
            contents: `Gere uma atividade com os critérios:
            - Idade: ${perfilCrianca.idade} anos
            - Nível de TEA: ${perfilCrianca.nivelTea}
            - Interesses: ${perfilCrianca.interesses?.join(", ")}
            - Evitar: ${perfilCrianca.evitacoes?.join(", ")}`
        })

        // converte o texto que o gemini mandou em JSON
        const atividadeFinal = JSON.parse(response.text)

        // devolve o JSON preenchido
        return res.status(200).json(atividadeFinal)

    } catch (error) {
        console.error("Erro no servidor: ", error)
        return res.status(500).json({ error: "Erro ao gerar a atividade." })
    }
})

// inicializa o servidor na porta 3000
app.listen(port, () => {
    console.log(`Servidor rodando com sucesso em http://localhost:${port}`)
})