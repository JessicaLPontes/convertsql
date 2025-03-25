// Função principal para processar arquivos
function handleFiles(event, mode) {
    const files = event.target.files;
    if (!files || files.length === 0) {
        alert('Por favor, selecione pelo menos um arquivo.');
        return;
    }

    const resultsContainer = document.getElementById(
        mode === 'INSERT' ? 'insert-results' : 
        mode === 'UPDATE' ? 'update-results' :
        'cardap-results'
    );
    const contentDiv = resultsContainer.querySelector('.result-content');
    contentDiv.innerHTML = '';

    const processingMsg = document.createElement('p');
    processingMsg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando arquivos...';
    processingMsg.classList.add('processing');
    contentDiv.appendChild(processingMsg);

    // Processar cada arquivo
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                let allCommands = '';

                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false });
                    
                    if (jsonData.length === 0) {
                        throw new Error('A planilha está vazia.');
                    }

                    if (mode === 'CARDAP') {
                        // Processamento específico para CARDAP
                        const commands = jsonData.map(row => {
                            return `UPDATE CARDAP SET ALIQUOTA='${row.ALIQUOTA || ''}', CST='${row.CST || ''}', CODNATOPERACAOSAI='${row.CODNATOPERACAOSAI || ''}' WHERE PROD_COD IN (\n${row.PROD_COD}\n);`;
                        }).join('\n\n');
                        
                        allCommands += commands;
                    } else {
                        // Processamento genérico para INSERT/UPDATE
                        const columns = Object.keys(jsonData[0]);
                        const tableName = sheetName.replace(/\s+/g, '_');
                        
                        const commands = jsonData.map(row => {
                            if (mode === 'INSERT') {
                                const values = columns.map(col => {
                                    const value = row[col]?.toString().trim();
                                    return value === undefined || value === '' ? 'NULL' : `'${value.replace(/'/g, "''")}'`;
                                }).join(', ');
                                return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values});`;
                            } else { // UPDATE
                                const setClauses = columns.slice(1).map(col => {
                                    const value = row[col]?.toString().trim();
                                    return `${col} = ${value === undefined || value === '' ? 'NULL' : `'${value.replace(/'/g, "''")}'`}`;
                                }).join(', ');
                                
                                const keyValue = row[columns[0]]?.toString().trim();
                                if (!keyValue) {
                                    throw new Error(`Valor chave vazio para ${columns[0]}`);
                                }
                                return `UPDATE ${tableName} SET ${setClauses} WHERE ${columns[0]} = '${keyValue.replace(/'/g, "''")}';`;
                            }
                        }).join('\n');
                        
                        allCommands += `-- Tabela: ${tableName}\n${commands}\n\n`;
                    }
                });

                // Remover mensagem de processamento
                contentDiv.removeChild(processingMsg);

                // Criar link de download
                const blob = new Blob([allCommands], { type: 'text/plain' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${mode}_commands.sql`;
                link.className = 'sql-link';
                link.innerHTML = `<i class="fas fa-download"></i> Download ${file.name.replace('.xlsx', '')}_${mode}.sql`;
                contentDiv.appendChild(link);

                // Botão para copiar
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-button';
                copyBtn.innerHTML = '<i class="far fa-copy"></i> Copiar Comandos';
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(allCommands).then(() => {
                        alert('Comandos copiados para a área de transferência!');
                    }).catch(err => {
                        alert('Erro ao copiar: ' + err);
                    });
                };
                contentDiv.appendChild(copyBtn);

            } catch (error) {
                console.error(`Erro ao processar ${mode}:`, error);
                contentDiv.removeChild(processingMsg);
                const errorMsg = document.createElement('p');
                errorMsg.className = 'error';
                errorMsg.innerHTML = `<i class="fas fa-exclamation-circle"></i> Erro no arquivo ${file.name}: ${error.message}`;
                contentDiv.appendChild(errorMsg);
            }
        };

        reader.readAsArrayBuffer(file);
    });
}

// Limpar arquivos
function clearFiles() {
    // Limpar inputs
    document.getElementById('insert-input').value = '';
    document.getElementById('update-input').value = '';
    document.getElementById('cardap-input').value = '';
    
    // Limpar resultados
    document.querySelectorAll('.result-content').forEach(div => {
        div.innerHTML = '';
    });
}

// Alternar tema
function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    const icon = document.querySelector('#theme-toggle i');
    
    if (body.classList.contains('dark-mode')) {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
        localStorage.setItem('theme', 'dark');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
        localStorage.setItem('theme', 'light');
    }
}

// Verificar tema ao carregar
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = document.querySelector('#theme-toggle i');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    }
});
