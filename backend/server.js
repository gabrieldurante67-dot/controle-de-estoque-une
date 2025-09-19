// =================================================================
// PASSO 1: IMPORTAR AS FERRAMENTAS
// =================================================================
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // <-- NOVO: Para comparar senhas criptografadas
const jwt = require('jsonwebtoken'); // <-- NOVO: Para criar "tokens" de acesso

// =================================================================
// PASSO 2: CONFIGURAR A CONEXÃO E A SEGURANÇA
// =================================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// <-- NOVO: Chave secreta para o JWT. É essencial que isso seja uma variável de ambiente!
const JWT_SECRET = process.env.JWT_SECRET || 'coloque-uma-chave-bem-secreta-e-longa-aqui';

// =================================================================
// PASSO 3: CRIAR E CONFIGURAR O SERVIDOR EXPRESS
// =================================================================
const app = express();
const PORT = process.env.PORT || 3000; // <-- ALTERADO: Boa prática para o Render

app.use(cors());
app.use(express.json());

// =================================================================
// PASSO 4: CRIAR AS ROTAS DA API (ENDPOINTS)
// =================================================================

// <-- NOVO: ROTA DE LOGIN (POST) -->
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        if (!email || !senha) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
        }

        const userResult = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }
        const user = userResult.rows[0];

        const senhaValida = await bcrypt.compare(senha, user.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ message: 'Login bem-sucedido!', token });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// <-- NOVO: MIDDLEWARE DE AUTENTICAÇÃO -->
// Esta função é o nosso "segurança" que vai proteger as rotas.
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // Não autorizado

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Token inválido/expirado
        req.user = user;
        next();
    });
}


// --- ROTAS DE PRODUTOS (AGORA ALGUMAS ESTÃO PROTEGIDAS) ---

// ROTA PARA BUSCAR TODOS OS PRODUTOS (GET) - Deixaremos pública
app.get('/api/produtos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM produtos WHERE deletado_em IS NULL ORDER BY nome ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ROTA PARA CRIAR UM NOVO PRODUTO (POST) - AGORA PROTEGIDA
app.post('/api/produtos', authenticateToken, async (req, res) => { // <-- NOVO: `authenticateToken`
  // ... (o resto do seu código desta rota continua igual)
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

// ROTA PARA ATUALIZAR UM PRODUTO EXISTENTE (PUT) - AGORA PROTEGIDA
app.put('/api/produtos/:id', authenticateToken, async (req, res) => { // <-- NOVO: `authenticateToken`
  // ... (o resto do seu código desta rota continua igual)
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

// ROTA PARA "DELETAR" UM PRODUTO (SOFT DELETE) - AGORA PROTEGIDA
app.delete('/api/produtos/:id', authenticateToken, async (req, res) => { // <-- NOVO: `authenticateToken`
  // ... (o resto do seu código desta rota continua igual)
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
app.get('/api/historico', authenticateToken, async (req, res) => {
  try {
    const sql = `
      SELECT
        h.id,
        h.produto_id,
        h.acao,
        h.quantidade_alterada,
        h.estoque_anterior,
        h.estoque_novo,
        h.data_movimentacao,
        p.nome AS nome_produto
      FROM 
        historico_movimentacoes h
      JOIN 
        produtos p ON h.produto_id = p.id
      ORDER BY 
        h.data_movimentacao DESC`;
    
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