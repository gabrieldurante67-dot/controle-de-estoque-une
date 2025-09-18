// =================================================================
// PASSO 1: IMPORTAR AS FERRAMENTAS
// =================================================================
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

// =================================================================
// PASSO 2: CONFIGURAR A CONEXão COM O BANCO DE DADOS
// =================================================================
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: '08079520', // 🚨 ATENÇÃO: Substitua pela sua senha!
  port: 5432,
});

// =================================================================
// PASSO 3: CRIAR E CONFIGURAR O SERVIDOR EXPRESS
// =================================================================
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// =================================================================
// PASSO 4: CRIAR AS ROTAS DA API (ENDPOINTS)
// =================================================================

// ROTA PARA BUSCAR TODOS OS PRODUTOS (GET)
app.get('/api/produtos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM produtos WHERE deletado_em IS NULL ORDER BY nome ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ... (Rotas POST, PUT, DELETE continuam exatamente as mesmas) ...
app.post('/api/produtos', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { nome, preco, quantidade } = req.body;
    if (!nome) { return res.status(400).json({ error: 'O nome do produto é obrigatório.' }); }
    
    const produtoSql = 'INSERT INTO produtos (nome, preco, quantidade) VALUES ($1, $2, $3) RETURNING *';
    const produtoValues = [nome, preco || 0, quantidade || 0];
    const produtoResult = await client.query(produtoSql, produtoValues);
    const novoProduto = produtoResult.rows[0];

    const historicoSql = `INSERT INTO historico_movimentacoes (produto_id, acao, quantidade_alterada, estoque_anterior, estoque_novo) VALUES ($1, $2, $3, $4, $5)`;
    const historicoValues = [novoProduto.id, 'Criação', novoProduto.quantidade, 0, novoProduto.quantidade];
    await client.query(historicoSql, historicoValues);

    await client.query('COMMIT');
    res.status(201).json(novoProduto);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao adicionar produto (com histórico):', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

app.put('/api/produtos/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { nome, quantidade, preco, estoque_minimo } = req.body;

    const produtoAntigoResult = await client.query('SELECT quantidade FROM produtos WHERE id = $1', [id]);
    if (produtoAntigoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado para atualizar.' });
    }
    const estoqueAnterior = produtoAntigoResult.rows[0].quantidade;

    const updateSql = `UPDATE produtos SET nome = $1, quantidade = $2, preco = $3, estoque_minimo = $4 WHERE id = $5 RETURNING *`;
    const values = [nome, quantidade, preco, estoque_minimo, id];
    const result = await client.query(updateSql, values);
    const produtoAtualizado = result.rows[0];
    
    const quantidadeAlterada = produtoAtualizado.quantidade - estoqueAnterior;
    const historicoSql = `INSERT INTO historico_movimentacoes (produto_id, acao, quantidade_alterada, estoque_anterior, estoque_novo) VALUES ($1, $2, $3, $4, $5)`;
    const historicoValues = [id, 'Atualização', quantidadeAlterada, estoqueAnterior, produtoAtualizado.quantidade];
    await client.query(historicoSql, historicoValues);

    await client.query('COMMIT');
    res.json(produtoAtualizado);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

app.delete('/api/produtos/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const produtoResult = await client.query('SELECT * FROM produtos WHERE id = $1 AND deletado_em IS NULL', [id]);
    if (produtoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado para deletar.' });
    }
    const produtoDeletado = produtoResult.rows[0];

    await client.query('UPDATE produtos SET deletado_em = NOW() WHERE id = $1', [id]);
    
    const historicoSql = `INSERT INTO historico_movimentacoes (produto_id, acao, quantidade_alterada, estoque_anterior, estoque_novo) VALUES ($1, $2, $3, $4, $5)`;
    const historicoValues = [id, 'Remoção', -produtoDeletado.quantidade, produtoDeletado.quantidade, 0];
    await client.query(historicoSql, historicoValues);

    await client.query('COMMIT');
    res.status(200).json({ message: 'Produto deletado com sucesso.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao deletar produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// ROTA PARA BUSCAR O HISTÓRICO (GET)
app.get('/api/historico', async (req, res) => {
    try {
      // Este comando SQL é poderoso!
      // JOIN: Combina dados das duas tabelas.
      // ON h.produto_id = p.id: A condição para a combinação.
      // p.nome AS nome_produto: Pega a coluna 'nome' da tabela 'produtos' e a renomeia para 'nome_produto' no resultado.
      const sql = `
        SELECT 
            h.id, h.acao, h.quantidade_alterada, h.estoque_anterior, h.estoque_novo, h.data_movimentacao,
            p.nome AS nome_produto
        FROM 
            historico_movimentacoes h
        JOIN 
            produtos p ON h.produto_id = p.id
        ORDER BY 
            h.data_movimentacao DESC
      `;
      const result = await pool.query(sql);
      res.json(result.rows);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
});


// =================================================================
// PASSO 5: INICIAR O SERVIDOR
// =================================================================
app.listen(PORT, () => {
  console.log(`Servidor rodando e ouvindo na porta ${PORT}.`);
});