require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { supabase } = require("./supabaseClient");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS – em produção, ideal limitar para o domínio do Vercel
app.use(
  cors({
    origin: "*", // ex: ['https://seu-front.vercel.app']
  })
);

app.use(express.json());

/**
 * Gera um token JWT para o usuário
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

/**
 * Middleware de autenticação via JWT (Authorization: Bearer <token>)
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Token não fornecido." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }
}

// ==================== ROTA DE SAÚDE ====================

app.get("/", (req, res) => {
  res.json({ message: "API EstoqueHub online" });
});

// ==================== ROTAS DE AUTENTICAÇÃO ====================

/**
 * POST /auth/register
 * Corpo: { name, email, password }
 * Retorna: { token, user: { name, email } }
 */
app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Nome, e-mail e senha são obrigatórios." });
    }

    if (name.length < 3) {
      return res
        .status(400)
        .json({ message: "Nome deve ter pelo menos 3 caracteres." });
    }

    // Verifica se já existe usuário com esse e-mail
    const { data: existingUser, error: existingError } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      console.error("Erro Supabase (verify user):", existingError);
      return res.status(500).json({ message: "Erro ao verificar usuário." });
    }

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Já existe um usuário com esse e-mail." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: insertedUser, error: insertError } = await supabase
      .from("users")
      .insert({
        name,
        email,
        password_hash: passwordHash,
      })
      .select("id, name, email")
      .single();

    if (insertError) {
      console.error("Erro Supabase (insert user):", insertError);
      return res.status(500).json({ message: "Erro ao criar usuário." });
    }

    const token = generateToken(insertedUser);

    return res.status(201).json({
      token,
      user: {
        name: insertedUser.name,
        email: insertedUser.email,
      },
    });
  } catch (err) {
    console.error("Erro em /auth/register:", err);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

/**
 * POST /auth/login
 * Corpo: { email, password }
 * Retorna: { token, user: { name, email } }
 */
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "E-mail e senha são obrigatórios." });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, name, email, password_hash")
      .eq("email", email)
      .maybeSingle();

    if (userError) {
      console.error("Erro Supabase (select user):", userError);
      return res.status(500).json({ message: "Erro ao buscar usuário." });
    }

    if (!user) {
      return res.status(400).json({ message: "Credenciais inválidas." });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password_hash
    );
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Credenciais inválidas." });
    }

    const token = generateToken(user);

    return res.json({
      token,
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Erro em /auth/login:", err);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// ==================== ROTAS DE PRODUTOS (PROTEGIDAS) ====================

/**
 * GET /products
 * Lista produtos do usuário logado
 */
app.get("/products", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, name, sku, quantity, min_quantity, category, created_at, updated_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro Supabase (select products):", error);
      return res.status(500).json({ message: "Erro ao buscar produtos." });
    }

    const normalized = (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      quantity: p.quantity,
      minQuantity: p.min_quantity,
      category: p.category,
      createdAt: p.created_at,
      lastUpdated: p.updated_at,
    }));

    return res.json(normalized);
  } catch (err) {
    console.error("Erro em GET /products:", err);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

/**
 * POST /products
 * Cria produto
 * Corpo: { name, sku, quantity, minQuantity, category }
 */
app.post("/products", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, sku, quantity, minQuantity, category } = req.body || {};

    if (!name || !sku) {
      return res
        .status(400)
        .json({ message: "Nome e SKU são obrigatórios." });
    }

    const qty = Number(quantity ?? 0);
    const minQty = Number(minQuantity ?? 0);

    if (qty < 0 || minQty < 0) {
      return res
        .status(400)
        .json({ message: "Quantidade e estoque mínimo não podem ser negativos." });
    }

    // Impede SKU duplicado para o mesmo usuário
    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select("id")
      .eq("user_id", userId)
      .eq("sku", sku)
      .maybeSingle();

    if (existingError) {
      console.error("Erro Supabase (verify SKU):", existingError);
      return res.status(500).json({ message: "Erro ao verificar SKU." });
    }

    if (existing) {
      return res
        .status(400)
        .json({ message: "Já existe um produto com esse SKU." });
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        user_id: userId,
        name,
        sku,
        quantity: qty,
        min_quantity: minQty,
        category: category || null,
      })
      .select(
        "id, name, sku, quantity, min_quantity, category, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("Erro Supabase (insert product):", error);
      return res.status(500).json({ message: "Erro ao criar produto." });
    }

    const product = {
      id: data.id,
      name: data.name,
      sku: data.sku,
      quantity: data.quantity,
      minQuantity: data.min_quantity,
      category: data.category,
      createdAt: data.created_at,
      lastUpdated: data.updated_at,
    };

    return res.status(201).json(product);
  } catch (err) {
    console.error("Erro em POST /products:", err);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

/**
 * PUT /products/:id
 * Atualiza produto
 */
app.put("/products/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const { name, sku, quantity, minQuantity, category } = req.body || {};

    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    if (!name || !sku) {
      return res
        .status(400)
        .json({ message: "Nome e SKU são obrigatórios." });
    }

    const qty = Number(quantity ?? 0);
    const minQty = Number(minQuantity ?? 0);

    if (qty < 0 || minQty < 0) {
      return res
        .status(400)
        .json({ message: "Quantidade e estoque mínimo não podem ser negativos." });
    }

    // Verifica SKU duplicado em outro produto do mesmo usuário
    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select("id")
      .eq("user_id", userId)
      .eq("sku", sku)
      .neq("id", id);

    if (existingError) {
      console.error("Erro Supabase (verify SKU update):", existingError);
      return res.status(500).json({ message: "Erro ao verificar SKU." });
    }

    if (existing && existing.length > 0) {
      return res
        .status(400)
        .json({ message: "Já existe outro produto com esse SKU." });
    }

    const { data, error } = await supabase
      .from("products")
      .update({
        name,
        sku,
        quantity: qty,
        min_quantity: minQty,
        category: category || null,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select(
        "id, name, sku, quantity, min_quantity, category, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("Erro Supabase (update product):", error);
      return res.status(500).json({ message: "Erro ao atualizar produto." });
    }

    const product = {
      id: data.id,
      name: data.name,
      sku: data.sku,
      quantity: data.quantity,
      minQuantity: data.min_quantity,
      category: data.category,
      createdAt: data.created_at,
      lastUpdated: data.updated_at,
    };

    return res.json(product);
  } catch (err) {
    console.error("Erro em PUT /products/:id:", err);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

/**
 * DELETE /products/:id
 * Remove produto
 */
app.delete("/products/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);

    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("Erro Supabase (delete product):", error);
      return res.status(500).json({ message: "Erro ao remover produto." });
    }

    return res.json({ message: "Produto removido com sucesso." });
  } catch (err) {
    console.error("Erro em DELETE /products/:id:", err);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
