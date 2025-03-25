document.addEventListener('DOMContentLoaded', function() {
    // Elementos da interface
    const botaoTema = document.getElementById('botao-tema');
    const botoesArquivo = document.querySelectorAll('.botao-arquivo');
    const botaoLimpar = document.getElementById('botao-limpar');
    const inputsArquivo = document.querySelectorAll('.input-arquivo');
    
    // Verificar preferência de tema
    if (localStorage.getItem('modoEscuro') === 'true') {
        document.body.classList.add('modo-escuro');
        atualizarIconeTema(true);
    }
    
    // Event listeners
    botaoTema.addEventListener('click', alternarTema);
    botaoLimpar.addEventListener('click', limparTudo);
    
    botoesArquivo.forEach(botao => {
        botao.addEventListener('click', function() {
            const tipo = this.getAttribute('data-tipo');
            document.getElementById(`entrada-${tipo}`).click();
        });
    });
    
    // Processar INSERT
    document.getElementById('entrada-insert').addEventListener('change', function(e) {
        processarArquivos(e, 'INSERT', 'resultado-insert');
    });
    
    // Processar UPDATE
    document.getElementById('entrada-update').addEventListener('change', function(e) {
        processarArquivos(e, 'UPDATE', 'resultado-update');
    });
    
    // Processar CARDAP
    document.getElementById('entrada-cardap').addEventListener('change', function(e) {
        processarCardap(e);
    });
    
    // Funções
    function alternarTema() {
        const estaModoEscuro = document.body.classList.toggle('modo-escuro');
        localStorage.setItem('modoEscuro', estaModoEscuro);
        atualizarIconeTema(estaModoEscuro);
    }
    
    function atualizarIconeTema(modoEscuro) {
        const icone = botaoTema.querySelector('i');
        icone.classList.toggle('fa-moon', !modoEscuro);
        icone.classList.toggle('fa-sun', modoEscuro);
    }
    
    function limparTudo() {
        inputsArquivo.forEach(input => input.value = '');
        document.querySelectorAll('.conteudo-resultado').forEach(div => {
            div.innerHTML = '';
        });
    }
    
    async function processarArquivos(evento, tipo, idResultado) {
        const arquivos = evento.target.files;
        if (!arquivos || arquivos.length === 0) return;
        
        const container = document.querySelector(`#${idResultado} .conteudo-resultado`);
        container.innerHTML = '<p class="processando"><i class="fas fa-spinner fa-spin"></i> Processando arquivos...</p>';
        
        try {
            for (let arquivo of arquivos) {
                const dados = await lerArquivo(arquivo);
                const comandos = gerarComandos(dados, tipo);
                
                const blob = new Blob([comandos], { type: 'text/plain' });
                const link = criarLinkDownload(blob, `${arquivo.name.split('.')[0]}_${tipo}`, 'sql');
                
                container.appendChild(link);
            }
        } catch (erro) {
            console.error(`Erro ao processar ${tipo}:`, erro);
            container.innerHTML = `<p class="erro"><i class="fas fa-exclamation-circle"></i> ${erro.message}</p>`;
        }
    }
    
    async function processarCardap(evento) {
        const arquivos = evento.target.files;
        if (!arquivos || arquivos.length === 0) return;
        
        const container = document.querySelector('#resultado-cardap .conteudo-resultado');
        container.innerHTML = '<p class="processando"><i class="fas fa-spinner fa-spin"></i> Processando arquivo CARDAP...</p>';
        
        try {
            const arquivo = arquivos[0];
            const dados = await lerArquivo(arquivo);
            const comandos = gerarUpdatesCardap(dados);
            
            container.innerHTML = '';
            const blob = new Blob([comandos], { type: 'text/plain' });
            const link = criarLinkDownload(blob, 'CARDAP_UPDATES', 'sql');
            container.appendChild(link);
            
            // Botão para copiar tudo
            const botaoCopiar = document.createElement('button');
            botaoCopiar.innerHTML = '<i class="far fa-copy"></i> Copiar Todos os Comandos';
            botaoCopiar.className = 'botao-copiar';
            botaoCopiar.onclick = () => copiarParaAreaTransferencia(comandos);
            container.appendChild(botaoCopiar);
            
        } catch (erro) {
            console.error('Erro ao processar CARDAP:', erro);
            container.innerHTML = `<p class="erro"><i class="fas fa-exclamation-circle"></i> ${erro.message}</p>`;
        }
    }
    
    function lerArquivo(arquivo) {
        return new Promise((resolve, reject) => {
            const leitor = new FileReader();
            leitor.onload = function(e) {
                const dados = new Uint8Array(e.target.result);
                resolve(XLSX.read(dados, { type: 'array' }));
            };
            leitor.onerror = reject;
            leitor.readAsArrayBuffer(arquivo);
        });
    }
    
    function gerarComandos(dados, tipo) {
        let comandos = [];
        
        dados.SheetNames.forEach(nomePlanilha => {
            const planilha = dados.Sheets[nomePlanilha];
            const json = XLSX.utils.sheet_to_json(planilha);
            const nomeTabela = nomePlanilha.replace(/\s+/g, '_');
            const colunas = Object.keys(json[0] || {});
            
            if (tipo === 'INSERT') {
                json.forEach(linha => {
                    const valores = colunas.map(col => formatarValorSQL(linha[col]));
                    comandos.push(`INSERT INTO ${nomeTabela} (${colunas.join(', ')}) VALUES (${valores.join(', ')});`);
                });
            } else if (tipo === 'UPDATE') {
                json.forEach(linha => {
                    const sets = colunas.slice(1).map(col => `${col} = ${formatarValorSQL(linha[col])}`).join(', ');
                    const where = `${colunas[0]} = ${formatarValorSQL(linha[colunas[0]])}`;
                    comandos.push(`UPDATE ${nomeTabela} SET ${sets} WHERE ${where};`);
                });
            }
        });
        
        return comandos.join('\n');
    }
    
    function gerarUpdatesCardap(dados) {
        const planilha = dados.Sheets[dados.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(planilha);
        
        // Agrupa por combinação de ALIQUOTA, CST e CODNATOPERACAOSAI
        const grupos = {};
        
        json.forEach(linha => {
            const chave = `${linha.ALIQUOTA}|${linha.CST}|${linha.CODNATOPERACAOSAI}`;
            if (!grupos[chave]) {
                grupos[chave] = {
                    ALIQUOTA: linha.ALIQUOTA,
                    CST: linha.CST,
                    CODNATOPERACAOSAI: linha.CODNATOPERACAOSAI,
                    PRODUTOS: []
                };
            }
            grupos[chave].PRODUTOS.push(linha.PROD_COD);
        });
        
        // Gera os comandos SQL
        let comandos = [];
        for (const chave in grupos) {
            const grupo = grupos[chave];
            const produtos = grupo.PRODUTOS.join(',\n    ');
            
            comandos.push(
`UPDATE CARDAP
SET ALIQUOTA = '${grupo.ALIQUOTA}',
    CST = '${grupo.CST}',
    CODNATOPERACAOSAI = '${grupo.CODNATOPERACAOSAI}'
WHERE PROD_COD IN (
    ${produtos}
);`
            );
        }
        
        return comandos.join('\n\n');
    }
    
    function formatarValorSQL(valor) {
        if (valor === null || valor === undefined || valor === '') return 'NULL';
        const strValor = valor.toString().trim();
        return `'${strValor.replace(/'/g, "''")}'`;
    }
    
    function criarLinkDownload(blob, nome, extensao) {
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `${nome}.${extensao}`;
        link.className = 'link-download';
        link.innerHTML = `
            <i class="fas fa-download"></i> 
            ${nome}.${extensao}
            <span class="tamanho-arquivo">(${formatarTamanho(blob.size)})</span>
        `;
        
        return link;
    }
    
    function formatarTamanho(bytes) {
        if (bytes < 1024) return `${bytes} bytes`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }
    
    function copiarParaAreaTransferencia(texto) {
        navigator.clipboard.writeText(texto).then(() => {
            alert('Comandos copiados para a área de transferência!');
        }).catch(err => {
            console.error('Falha ao copiar: ', err);
            alert('Erro ao copiar. Consulte o console para detalhes.');
        });
    }
});