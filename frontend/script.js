// URL do seu Backend no Render
const API_URL = "https://estoque-backend-hki0.onrender.com";

// --- INICIALIZAÇÃO ---
document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");
    if (token) {
        goToDashboard();
    } else {
        document.getElementById("screen-auth").classList.add("active");
    }
});

// --- NAVEGAÇÃO ENTRE TELAS ---
function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(screenId).classList.add("active");
}

function toggleAuth(mode) {
    if (mode === 'register') {
        document.getElementById("form-login").style.display = "none";
        document.getElementById("form-register").style.display = "block";
    } else {
        document.getElementById("form-login").style.display = "block";
        document.getElementById("form-register").style.display = "none";
    }
}

function goToDashboard() {
    showScreen("screen-dashboard");
    carregarProdutos();
}

function goToProductForm(produto = null) {
    showScreen("screen-product");
    
    // Limpar ou Preencher formulário
    if (produto) {
        document.getElementById("titulo-formulario").innerText = "Editar Produto";
        document.getElementById("prod-id").value = produto.id;
        document.getElementById("prod-nome").value = produto.nome;
        document.getElementById("prod-sku").value = produto.sku || "";
        document.getElementById("prod-qtd").value = produto.quantidade;
        document.getElementById("prod-min").value = produto.estoque_minimo;
        document.getElementById("prod-preco").value = produto.preco;
    } else {
        document.getElementById("titulo-formulario").innerText = "Novo Produto";
        document.getElementById("form-produto").reset();
        document.getElementById("prod-id").value = "";
    }
}

function logout() {
    localStorage.clear();
    location.reload();
}

// --- API: LOGIN ---
document.getElementById("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const senha = document.getElementById("login-pass").value;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, senha })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem("token", data.token);
            goToDashboard();
        } else {
            alert("Erro: " + (data.error || "Login falhou"));
        }
    } catch (err) { alert("Erro de conexão com o servidor."); }
});

// --- API: REGISTRO ---
document.getElementById("form-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("reg-nome").value;
    const email = document.getElementById("reg-email").value;
    const senha = document.getElementById("reg-pass").value;

    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, email, senha })
        });
        
        if (res.ok) {
            alert("Cadastro realizado! Faça login.");
            toggleAuth('login');
        } else {
            const data = await res.json();
            alert("Erro: " + data.error);
        }
    } catch (err) { alert("Erro de conexão."); }
});

// --- API: LISTAR PRODUTOS ---
async function carregarProdutos() {
    const token = localStorage.getItem("token");
    const tbody = document.getElementById("lista-produtos");
    tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

    try {
        const res = await fetch(`${API_URL}/produtos`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (res.status === 401) { logout(); return; }

        const produtos = await res.json();
        tbody.innerHTML = "";

        if (produtos.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5'>Nenhum produto encontrado.</td></tr>";
            return;
        }

        produtos.forEach(p => {
            const alerta = p.quantidade <= p.estoque_minimo;
            const linha = `
                <tr>
                    <td>${p.nome} <br><small style="color:#7f8c8d">${p.sku || ''}</small></td>
                    <td>${p.quantidade}</td>
                    <td>R$ ${parseFloat(p.preco).toFixed(2)}</td>
                    <td class="${alerta ? 'status-alert' : 'status-ok'}">
                        ${alerta ? 'Estoque Baixo' : 'Normal'}
                    </td>
                    <td>
                        <button onclick='goToProductForm(${JSON.stringify(p)})' style="background:#f39c12; padding:5px 10px;">Editar</button>
                        <button onclick='deletarProduto(${p.id})' style="background:#c0392b; padding:5px 10px;">X</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += linha;
        });
    } catch (err) {
        console.error(err);
        tbody.innerHTML = "<tr><td colspan='5'>Erro ao carregar dados.</td></tr>";
    }
}

// --- API: SALVAR PRODUTO (CRIAR OU EDITAR) ---
document.getElementById("form-produto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    // Coleta e CONVERSÃO DE DADOS (Importante!)
    const id = document.getElementById("prod-id").value;
    const payload = {
        nome: document.getElementById("prod-nome").value,
        sku: document.getElementById("prod-sku").value,
        quantidade: parseInt(document.getElementById("prod-qtd").value),
        estoque_minimo: parseInt(document.getElementById("prod-min").value),
        preco: parseFloat(document.getElementById("prod-preco").value)
    };

    const method = id ? "PUT" : "POST";
    const url = id ? `${API_URL}/produtos/${id}` : `${API_URL}/produtos`;

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("Produto salvo com sucesso!");
            goToDashboard();
        } else {
            const data = await res.json();
            alert("Erro: " + (data.error || "Falha ao salvar"));
        }
    } catch (err) { alert("Erro de conexão."); }
});

// --- API: DELETAR ---
async function deletarProduto(id) {
    if (!confirm("Excluir este produto?")) return;
    
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_URL}/produtos/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (res.ok) carregarProdutos();
        else alert("Erro ao excluir.");
    } catch (err) { alert("Erro de conexão."); }
}