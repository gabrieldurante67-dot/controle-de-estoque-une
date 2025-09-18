// ====== DADOS GLOBAIS E CONSTANTES ======
const DEFAULT_MIN = 50.0;

/**
 * =================================================================
 * CLASSE STOCKMANAGER
 * =================================================================
 */
class StockManager {
  constructor() {
    this.estoque = [];
    this.sortColumn = 'nome';
    this.sortDirection = 'asc';
  }

  async load() {
    try {
      const response = await fetch('http://localhost:3000/api/produtos');
      const produtosDoBackend = await response.json();
      this.estoque = produtosDoBackend.map(p => ({
        id: p.id,
        nome: p.nome,
        quantidade: parseFloat(p.quantidade),
        estoqueMinimo: parseFloat(p.estoque_minimo),
        price: parseFloat(p.preco)
      }));
    } catch (error) {
      console.error('Falha ao carregar dados do backend:', error);
      this.estoque = [];
    }
  }
  
  async deleteProduct(productId) {
    try {
      const response = await fetch(`http://localhost:3000/api/produtos/${productId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Falha ao deletar o produto no servidor.');
      }
      this.estoque = this.estoque.filter(p => p.id !== productId);
    } catch (error) {
      console.error('Erro ao deletar produto:', error);
      showToast('Não foi possível deletar o produto.', 'error');
    }
  }

  // Funções antigas que ainda vamos conectar
  reset() { console.log('A função reset() precisa ser atualizada para usar a API.'); }
  setAllMinimum(newMin) { this.estoque.forEach(p => (p.estoqueMinimo = newMin)); this.save(); }
  
  // Métodos de cálculo que operam sobre os dados já carregados
  getFilteredProducts(searchTerm = '', filterValue = 'all') { const f = this.estoque.filter(p => { if (!p || typeof p.nome !== 'string') return false; const mS = p.nome.toLowerCase().includes(searchTerm.toLowerCase()); if (!mS) return false; const q = typeof p.quantidade === 'number' ? p.quantidade : 0, m = typeof p.estoqueMinimo === 'number' ? p.estoqueMinimo : 0; if (filterValue === 'low') return q < m; if (filterValue === 'ok') return q >= m; return true; }); return [...f].sort((a, b) => { const vA = a[this.sortColumn], vB = b[this.sortColumn], dir = this.sortDirection === 'asc' ? 1 : -1; if (this.sortColumn === 'price' || this.sortColumn === 'quantidade') { return ((vA || 0) - (vB || 0)) * dir; } if (typeof vA === 'string' && typeof vB === 'string') { return vA.localeCompare(vB) * dir; } return 0; }); }
  getTotalQuantity() { return this.estoque.reduce((sum, p) => sum + (p.quantidade || 0), 0); }
  getTotalStockValue() { return this.estoque.reduce((sum, p) => sum + ((p.quantidade || 0) * (p.price || 0)), 0); }
}

/**
 * =================================================================
 * CÓDIGO DE INICIALIZAÇÃO E MANIPULAÇÃO DO DOM
 * =================================================================
 */
const stockManager = new StockManager();

// --- SELETORES DE ELEMENTOS DOM ---
const searchInput = document.getElementById('searchInput'); const filterSelect = document.getElementById('filterSelect'); const totalDisplay = document.getElementById('totalDisplay'); const tableWrapper = document.getElementById('table-wrapper'); const btnAddProduct = document.getElementById('btnAddProduct'); const btnSetMinAll = document.getElementById('btnSetMinAll'); const btnReset = document.getElementById('btnReset'); const btnExportCsv = document.getElementById('btnExportCsv'); const btnRelatorio = document.getElementById('btnRelatorio'); const editorModalElement = document.getElementById('editorModal'); const editorModal = new bootstrap.Modal(editorModalElement); const editorModalLabel = document.getElementById('editorModalLabel'); const editorName = document.getElementById('editorName'); const editorAction = document.getElementById('editorAction'); const editorValue = document.getElementById('editorValue'); const editorSave = document.getElementById('editorSave'); const confirmationModalElement = document.getElementById('confirmationModal'); const confirmationModal = new bootstrap.Modal(confirmationModalElement); const confirmationModalLabel = document.getElementById('confirmationModalLabel'); const confirmationModalBody = document.getElementById('confirmationModalBody'); const confirmationModalConfirm = document.getElementById('confirmationModalConfirm'); const btnHistory = document.getElementById('btnHistory'); const historyModalElement = document.getElementById('historyModal'); const historyModal = new bootstrap.Modal(historyModalElement); const historyTableWrapper = document.getElementById('historyTableWrapper'); const totalValueDisplay = document.getElementById('totalValueDisplay'); const editorPrice = document.getElementById('editorPrice');

let currentEditingProduct = null;
let confirmCallback = null;

// --- FUNÇÕES QUE INTERAGEM COM O DOM ---
function formatCurrency(value) { return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function showToast(text, type = 'success') { const bC = type === 'success' ? 'linear-gradient(to right, #00b09b, #96c93d)' : 'linear-gradient(to right, #ff5f6d, #ffc371)'; Toastify({ text: text, duration: 3000, close: true, gravity: "top", position: "right", background: bC, stopOnFocus: true, }).showToast(); }

async function showHistoryModal() {
  try {
    // 1. Mostra um feedback de carregamento
    historyTableWrapper.innerHTML = '<p class="text-center">Carregando histórico...</p>';
    historyModal.show();

    // 2. Busca os dados do histórico na nossa nova API
    const response = await fetch('http://localhost:3000/api/historico');
    const historyData = await response.json();

    // 3. Verifica se há registros
    if (historyData.length === 0) {
      historyTableWrapper.innerHTML = '<p class="text-center text-muted">Nenhuma movimentação registrada.</p>';
      return;
    }

    // 4. Constrói a tabela HTML com os dados recebidos
    const historyRows = historyData.map(log => {
      const formattedDate = new Date(log.data_movimentacao).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      const badgeColor = log.acao === 'Criação' ? 'bg-success' : log.acao === 'Remoção' ? 'bg-danger' : 'bg-primary';
      
      return `
        <tr>
          <td>${formattedDate}</td>
          <td>${log.nome_produto}</td>
          <td><span class="badge ${badgeColor}">${log.acao}</span></td>
          <td class="text-end">${parseFloat(log.quantidade_alterada).toFixed(2).replace('.', ',')}</td>
          <td class="text-end fw-bold">${parseFloat(log.estoque_novo).toFixed(2).replace('.', ',')} ton</td>
        </tr>`;
    }).join('');
    
    historyTableWrapper.innerHTML = `
      <table class="table table-sm table-striped">
        <thead class="table-light">
          <tr>
            <th>Data e Hora</th>
            <th>Produto</th>
            <th>Ação</th>
            <th class="text-end">Alteração (ton)</th>
            <th class="text-end">Estoque Final</th>
          </tr>
        </thead>
        <tbody>
          ${historyRows}
        </tbody>
      </table>`;
      
  } catch (error) {
    console.error('Erro ao carregar histórico:', error);
    historyTableWrapper.innerHTML = '<p class="text-center text-danger">Falha ao carregar o histórico.</p>';
  }
}

function openEditor(productName) {
  if (!productName) {
    currentEditingProduct = null;
    editorModalLabel.textContent = 'Adicionar Novo Produto';
    editorName.value = '';
    editorPrice.value = '';
    editorValue.value = '0';
    editorName.readOnly = false;
    editorAction.style.display = 'none';
    editorValue.parentElement.style.display = 'block';
  } else {
    editorModalLabel.textContent = `Editar Produto: ${productName}`;
    const product = stockManager.estoque.find(p => p.nome === productName);
    currentEditingProduct = product;
    editorName.value = product.nome;
    editorPrice.value = (product.price || 0).toFixed(2).replace('.', ',');
    editorValue.value = (product.quantidade || 0).toFixed(2).replace('.', ',');
    editorName.readOnly = true;
    editorAction.style.display = 'none';
    editorValue.parentElement.style.display = 'block';
  }
  editorModal.show();
}

async function handleSave() {
  const nome = editorName.value.trim();
  const priceStr = editorPrice.value.replace(',', '.');
  const valueStr = editorValue.value.replace(',', '.');

  if (!nome) { return showToast('Por favor, digite o nome do produto.', 'error'); }
  const preco = parseFloat(priceStr);
  if (priceStr.trim() === '' || isNaN(preco) || preco < 0) { return showToast('Por favor, insira um preço válido.', 'error'); }
  const quantidade = parseFloat(valueStr);
  if (valueStr.trim() === '' || isNaN(quantidade) || quantidade < 0) { return showToast('Por favor, insira uma quantidade válida.', 'error'); }

  if (!currentEditingProduct) {
    const novoProduto = { nome, preco, quantidade };
    try {
      const response = await fetch('http://localhost:3000/api/produtos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(novoProduto) });
      if (!response.ok) throw new Error('Falha ao criar o produto.');
      showToast('Produto adicionado com sucesso!');
    } catch (error) {
      console.error('Erro ao adicionar produto:', error);
      showToast('Não foi possível adicionar o produto.', 'error');
    }
  } else {
    const dadosAtualizados = { ...currentEditingProduct, nome: nome, preco: preco, quantidade: quantidade, estoque_minimo: currentEditingProduct.estoqueMinimo };
    try {
      const response = await fetch(`http://localhost:3000/api/produtos/${currentEditingProduct.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dadosAtualizados) });
      if (!response.ok) throw new Error('Falha ao atualizar o produto.');
      showToast('Produto atualizado com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      showToast('Não foi possível atualizar o produto.', 'error');
    }
  }
  await stockManager.load();
  render();
  editorModal.hide();
}

function render() { const productsToRender = stockManager.getFilteredProducts(searchInput.value, filterSelect.value); const tableHtml = `<table class="table table-hover table-fixed"><thead class="table-light"><tr><th class="sortable" data-sort-by="nome">Produto <span class="sort-icon"></span></th><th class="sortable text-center" data-sort-by="price">Preço/Ton <span class="sort-icon"></span></th><th class="sortable text-center" data-sort-by="quantidade">Estoque <span class="sort-icon"></span></th><th class="text-center">Valor Total</th><th class="text-center d-hide-sm">Mínimo</th><th class="text-center">Status</th><th class="text-end">Ações</th></tr></thead><tbody>${ productsToRender.length > 0 ? productsToRender.map(p => { const productValue = (p.quantidade || 0) * (p.price || 0); return ` <tr class="${(p.quantidade || 0) < (p.estoqueMinimo || 0) ? 'low-stock' : ''}"><td><strong>${p.nome}</strong></td><td class="text-center">${formatCurrency(p.price)}</td><td class="text-center">${(p.quantidade || 0).toFixed(2).replace('.', ',')} ton</td><td class="text-center fw-bold">${formatCurrency(productValue)}</td><td class="text-center d-hide-sm">${(p.estoqueMinimo || 0).toFixed(2).replace('.', ',')} ton</td><td class="text-center">${(p.quantidade || 0) < (p.estoqueMinimo || 0) ? '<span class="badge bg-danger">Baixo</span>' : '<span class="badge bg-success">OK</span>'}</td><td class="text-end"><button class="btn btn-primary btn-sm btn-edit" data-nome="${p.nome}" data-id="${p.id}">Editar</button><button class="btn btn-outline-danger btn-sm btn-delete" data-nome="${p.nome}" data-id="${p.id}">Remover</button></td></tr>` }).join('') : '<tr><td colspan="7" class="text-center p-4">Nenhum produto encontrado.</td></tr>'}</tbody></table>`; tableWrapper.innerHTML = tableHtml; totalDisplay.textContent = `${stockManager.getTotalQuantity().toFixed(2).replace('.', ',')} ton`; totalValueDisplay.textContent = formatCurrency(stockManager.getTotalStockValue()); document.querySelectorAll('.sort-icon').forEach(icon => icon.textContent = ''); const activeHeader = document.querySelector(`[data-sort-by="${stockManager.sortColumn}"]`); if (activeHeader) { const iconSpan = activeHeader.querySelector('.sort-icon'); iconSpan.textContent = stockManager.sortDirection === 'asc' ? ' ▲' : ' ▼'; } }
function showConfirmationModal(title, body, onConfirm) { confirmationModalLabel.textContent = title; confirmationModalBody.innerHTML = body; confirmCallback = onConfirm; confirmationModal.show(); }
function generatePdfReport() { const { jsPDF } = window.jspdf; const doc = new jsPDF(); const products = stockManager.getFilteredProducts(); const head = [['Produto', 'Preço/Ton', 'Estoque (ton)', 'Valor Total']]; const body = products.map(p => [ p.nome, formatCurrency(p.price), (p.quantidade || 0).toFixed(2).replace('.', ','), formatCurrency((p.quantidade || 0) * (p.price || 0)) ]); doc.setFontSize(18); doc.text('Relatório de Estoque de Agregados', 14, 22); doc.setFontSize(11); doc.setTextColor(100); const today = new Date().toLocaleString('pt-BR'); doc.text(`Gerado em: ${today}`, 14, 29); doc.autoTable({ head: head, body: body, startY: 35, theme: 'striped', headStyles: { fillColor: [22, 160, 133] }, didDrawPage: (data) => { doc.setFontSize(10); const pageCount = doc.internal.getNumberOfPages(); doc.text('Página ' + data.pageNumber + ' de ' + pageCount, data.settings.margin.left, doc.internal.pageSize.height - 10); } }); const finalY = doc.autoTable.previous.finalY; const totalQty = stockManager.getTotalQuantity(); const totalValue = stockManager.getTotalStockValue(); doc.setFontSize(12); doc.text('Resumo Geral do Estoque', 14, finalY + 15); doc.setFontSize(10); doc.text(`- Quantidade Total em Estoque: ${totalQty.toFixed(2).replace('.', ',')} ton`, 14, finalY + 22); doc.text(`- Valor Total do Estoque: ${formatCurrency(totalValue)}`, 14, finalY + 28); const dateStr = new Date().toISOString().split('T')[0]; doc.save(`relatorio_estoque_${dateStr}.pdf`); showToast('Relatório PDF gerado com sucesso!'); }

// --- EVENT LISTENERS (OUVINTES DE EVENTOS) ---
document.addEventListener('DOMContentLoaded', async () => {
    await stockManager.load();
    render();
    searchInput.addEventListener('input', render); 
    filterSelect.addEventListener('change', render); 
    btnAddProduct.addEventListener('click', () => openEditor(null)); 
    editorSave.addEventListener('click', handleSave); 
    btnHistory.addEventListener('click', showHistoryModal); // Este botão agora funciona!
    confirmationModalConfirm.addEventListener('click', () => { if (typeof confirmCallback === 'function') { confirmCallback(); } confirmationModal.hide(); }); 
    btnReset.addEventListener('click', () => { showConfirmationModal('Resetar Estoque', 'Tem a certeza?', () => { stockManager.reset(); render(); showToast('Estoque resetado com sucesso!'); }); }); 
    btnSetMinAll.addEventListener('click', () => { const bC = `<p>Digite o novo estoque mínimo padrão.</p><input type="number" id="promptInput" class="form-control" value="${DEFAULT_MIN}" />`; showConfirmationModal('Definir Estoque Mínimo', bC, () => { const i = document.getElementById('promptInput'); const nM = parseFloat(i.value); if (!isNaN(nM) && nM >= 0) { stockManager.setAllMinimum(nM); render(); showToast(`Estoque mínimo alterado para ${nM.toFixed(2)} ton!`); } else { showToast('Valor inválido.', 'error'); } }); }); 
    
    tableWrapper.addEventListener('click', (event) => { 
        const button = event.target.closest('button');
        if (!button) return;

        const productName = button.dataset.nome;
        const productId = parseInt(button.dataset.id, 10);

        if (button.classList.contains('btn-edit')) { 
            openEditor(productName); 
        } 
        
        if (button.classList.contains('btn-delete')) { 
            showConfirmationModal(`Remover Produto`, `Tem certeza que deseja remover <strong>"${productName}"</strong>?`, async () => { 
                await stockManager.deleteProduct(productId); 
                render(); 
                showToast(`Produto "${productName}" removido!`); 
            }); 
        } 
    }); 
    
    btnExportCsv.addEventListener('click', () => { let c = "data:text/csv;charset=utf-8,"; c += "Produto;PrecoPorTon;Quantidade;ValorTotal;EstoqueMinimo\n"; stockManager.getFilteredProducts().forEach(p => { const pr = (p.price || 0).toFixed(2).replace('.', ','), q = (p.quantidade || 0).toFixed(2).replace('.', ','), vT = ((p.quantidade || 0) * (p.price || 0)).toFixed(2).replace('.', ','), m = (p.estoqueMinimo || 0).toFixed(2).replace('.', ','); c += `"${p.nome}";"${pr}";"${q}";"${vT}";"${m}"\n`; }); const eU = encodeURI(c), l = document.createElement("a"); l.setAttribute("href", eU); const h = new Date().toISOString().split('T')[0]; l.setAttribute("download", `estoque_agregados_${h}.csv`); document.body.appendChild(l); l.click(); document.body.removeChild(l); });
    btnRelatorio.addEventListener('click', generatePdfReport);
});