// login.js

// Função para mostrar notificações (igual à do seu script.js)
function showToast(text, type = 'error') {
    const background = type === 'success' 
        ? 'linear-gradient(to right, #00b09b, #96c93d)' 
        : 'linear-gradient(to right, #ff5f6d, #ffc371)';
    Toastify({ text, duration: 3000, close: true, gravity: "top", position: "right", background, stopOnFocus: true }).showToast();
}

const loginForm = document.getElementById('loginForm');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Impede o recarregamento da página

    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const button = loginForm.querySelector('button');

    button.disabled = true;
    button.textContent = 'Aguarde...';

    try {
        const response = await fetch('https://controle-de-estoque-une.onrender.com/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Falha no login. Verifique suas credenciais.');
        }

        // Sucesso! Guardamos o token no navegador.
        localStorage.setItem('authToken', data.token);
        showToast('Login efetuado com sucesso!', 'success');

        // Redireciona para a página principal após um breve intervalo
        setTimeout(() => {
            window.location.href = 'index.html'; // Garanta que sua página principal se chama 'index.html'
        }, 1000);

    } catch (error) {
        console.error('Erro de login:', error);
        showToast(error.message, 'error');
        button.disabled = false;
        button.textContent = 'Entrar';
    }
});